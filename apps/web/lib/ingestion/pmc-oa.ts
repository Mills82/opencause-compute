import tar from 'tar-stream';
import { gunzipSync } from 'node:zlib';
import { fetchNcbi, ncbiDelayMs, sleep, appendNcbiParams } from './ncbi-client';

const PMC_OA_BASE = 'https://www.ncbi.nlm.nih.gov/pmc/utils/oa/oa.fcgi';
const EUTILS_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

export type PmcOaFailure = { pmcid?: string; pmid: string; reason: string };

export type PmcOaIngestReport = {
  recordsFetched: number;
  pmcRecords: number;
  documentsIngested: number;
  sources: PmcOaSource[];
  failures: PmcOaFailure[];
  skippedCount: number;
};

export type PmcOaSource = {
  title: string;
  sectionTitle?: string;
  sectionType?: string;
  paragraphIndex?: number;
  sourceText: string;
  sourceCitation: string;
  sourceUrl: string;
  sourcePublishedAt?: string;
};

type PmcSearchRecord = {
  pmid: string;
  pmcid: string;
  title: string;
  sourceCitation: string;
  sourcePublishedAt?: string;
};

function decodeXmlEntities(input: string): string {
  return input
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseOaTgzHref(oaXml: string): string | null {
  const linkRegex = /<link[^>]*format=["']tgz["'][^>]*href=["']([^"']+)["'][^>]*\/>/i;
  const match = linkRegex.exec(oaXml);
  if (!match?.[1]) {
    return null;
  }

  const href = match[1];
  if (href.startsWith('ftp://')) {
    return href.replace('ftp://', 'https://');
  }

  return href;
}

export type PmcSectionText = {
  title?: string;
  type: 'abstract' | 'introduction' | 'methods' | 'results' | 'discussion' | 'conclusion' | 'figure_table' | 'supplement' | 'unknown';
  paragraphs: string[];
};

function classifySectionTitle(title?: string): PmcSectionText['type'] {
  const normalized = (title ?? '').toLowerCase();
  if (!normalized) return 'unknown';
  if (/abstract/.test(normalized)) return 'abstract';
  if (/introduction|background/.test(normalized)) return 'introduction';
  if (/method|material|patient|cohort|statistical analysis/.test(normalized)) return 'methods';
  if (/result|finding/.test(normalized)) return 'results';
  if (/discussion/.test(normalized)) return 'discussion';
  if (/conclusion/.test(normalized)) return 'conclusion';
  if (/figure|table/.test(normalized)) return 'figure_table';
  if (/supplement/.test(normalized)) return 'supplement';
  return 'unknown';
}

function shouldSkipSection(title?: string): boolean {
  const normalized = (title ?? '').toLowerCase();
  return /reference|acknowledg|funding|author contribution|conflict|competing interest|ethics|availability|supplementary material|abbreviation|publisher/.test(normalized);
}

function cleanParagraph(input: string): string {
  return decodeXmlEntities(input.replace(/<xref[\s\S]*?<\/xref>/gi, ' ').replace(/<[^>]+>/g, ' '));
}

export function extractPmcSections(xml: string): PmcSectionText[] {
  const body = xml.match(/<body[\s\S]*?<\/body>/i)?.[0] ?? xml;
  const sections = [...body.matchAll(/<sec\b[^>]*>([\s\S]*?)<\/sec>/gi)].map((entry) => entry[1]);
  const rawSections = sections.length ? sections : [body];
  const out: PmcSectionText[] = [];
  for (const sectionXml of rawSections) {
    const title = cleanParagraph(sectionXml.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').trim() || undefined;
    if (shouldSkipSection(title)) continue;
    const paragraphs = [...sectionXml.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
      .map((entry) => cleanParagraph(entry[1]).trim())
      .filter((text) => text.length > 40)
      .filter((text) => !/^(copyright|©|creative commons|author information|data availability)/i.test(text));
    if (paragraphs.length) out.push({ title, type: classifySectionTitle(title), paragraphs });
  }
  if (out.length) return out;
  const fallback = cleanParagraph(body).trim();
  return fallback ? [{ type: 'unknown', paragraphs: [fallback] }] : [];
}

export function stripXmlToText(xml: string): string {
  return extractPmcSections(xml).flatMap((section) => section.paragraphs).join('\n\n');
}

export function chunkArticleText(text: string, maxChars = 3500): string[] {
  const paragraphs = text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = '';

  for (const paragraph of paragraphs) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (next.length <= maxChars) {
      current = next;
      continue;
    }

    if (current) {
      chunks.push(current);
    }

    if (paragraph.length <= maxChars) {
      current = paragraph;
      continue;
    }

    for (let i = 0; i < paragraph.length; i += maxChars) {
      chunks.push(paragraph.slice(i, i + maxChars));
    }
    current = '';
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}


const ONCOLOGY_ARTICLE_TERMS = /\b(cancer|tumou?r|oncolog|carcinoma|sarcoma|melanoma|leukemia|leukaemia|lymphoma|glioma|glioblastoma|neoplasm|malignan|metasta|chemotherapy|radiotherapy|immunotherapy|checkpoint inhibitor|egfr|alk|brca|pd-?l1|her2|kras|braf|nsclc|tnbc|hcc|crc)\b/i;
const CLAIM_BEARING_SECTION_TYPES = new Set<PmcSectionText['type']>(['abstract', 'results', 'discussion', 'conclusion', 'figure_table']);
const CLAIM_OPPORTUNITY_TERMS = /\b(response|resistan|survival|prognos|risk|progression|diagnos|associated|correlat|predict|biomarker|mutation|variant|expression|therapy|treatment|drug|inhibitor|immunotherapy|chemotherapy|radiotherapy|toxicit|local\s+control|recurrence|metasta|overall survival|progression-free survival|objective response|response rate|pfs|os|orr|adverse events?|disease control|hazard ratio|clinical trial|phase\s+(?:i|ii|iii|iv|1|2|3|4))\b/i;

function isOncologyArticle(record: PmcSearchRecord, sections: PmcSectionText[]): boolean {
  const articleText = [record.title, record.sourceCitation, ...sections.flatMap((section) => section.paragraphs.slice(0, 2))].join(' ');
  return ONCOLOGY_ARTICLE_TERMS.test(articleText);
}

function isClaimBearingOncologyChunk(section: PmcSectionText, chunk: string, record: PmcSearchRecord): boolean {
  const context = `${record.title} ${section.title ?? ''} ${chunk}`;
  if (!ONCOLOGY_ARTICLE_TERMS.test(context)) return false;
  if (!CLAIM_BEARING_SECTION_TYPES.has(section.type) && !CLAIM_OPPORTUNITY_TERMS.test(chunk)) return false;
  if (/^(?:references|acknowledg|funding|author contribution|conflict|competing interest|ethics|availability|supplementary material|abbreviation|statistical analysis)$/i.test(section.title ?? '')) return false;
  return CLAIM_OPPORTUNITY_TERMS.test(context);
}

async function extractNxmlFromTgz(buffer: Buffer): Promise<string> {
  const extract = tar.extract();
  const xmlChunks: Buffer[] = [];

  return await new Promise<string>((resolve, reject) => {
    extract.on('entry', (header, stream, next) => {
      if (header.name.endsWith('.nxml') || header.name.endsWith('.xml')) {
        const chunks: Buffer[] = [];
        stream.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        stream.on('end', () => {
          xmlChunks.push(Buffer.concat(chunks));
          next();
        });
        stream.on('error', reject);
      } else {
        stream.resume();
        stream.on('end', next);
      }
    });

    extract.on('finish', () => {
      if (!xmlChunks[0]) {
        reject(new Error('pmc_oa_xml_not_found'));
        return;
      }
      resolve(xmlChunks[0].toString('utf8'));
    });

    extract.on('error', reject);

    try {
      const decompressed = gunzipSync(buffer);
      extract.end(decompressed);
    } catch (error) {
      reject(error);
    }
  });
}

async function fetchPmcOaArchiveHref(pmcid: string, options: { email?: string; apiKey?: string } = {}): Promise<string> {
  const params = new URLSearchParams({ id: pmcid });
  if (options.email) params.set('email', options.email);
  if (options.apiKey) params.set('api_key', options.apiKey);
  const response = await fetchNcbi(`${PMC_OA_BASE}?${params.toString()}`, options);
  if (!response.ok) {
    throw new Error(`pmc_oa_lookup_failed:${response.status}`);
  }
  const xml = await response.text();
  const href = parseOaTgzHref(xml);
  if (!href) {
    throw new Error('pmc_oa_tgz_href_missing');
  }
  return href;
}

async function fetchPmcOaFullText(pmcid: string, options: { email?: string; apiKey?: string } = {}): Promise<PmcSectionText[]> {
  const params = appendNcbiParams(new URLSearchParams({ db: 'pmc', id: pmcid.replace(/^PMC/i, ''), retmode: 'xml' }), options);
  const efetchResponse = await fetchNcbi(`${EUTILS_BASE}/efetch.fcgi?${params.toString()}`, options);
  if (efetchResponse.ok) {
    return extractPmcSections(await efetchResponse.text());
  }

  const href = await fetchPmcOaArchiveHref(pmcid, options);
  const response = await fetchNcbi(href, options);
  if (!response.ok) {
    throw new Error(`pmc_oa_archive_fetch_failed:${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const xml = await extractNxmlFromTgz(Buffer.from(arrayBuffer));
  return extractPmcSections(xml);
}

async function fetchPmcSearchRecords(options: { query: string; retmax: number; retstart?: number; email?: string; apiKey?: string }): Promise<PmcSearchRecord[]> {
  const params = appendNcbiParams(new URLSearchParams({ db: 'pmc', term: options.query, retmode: 'json', retmax: String(options.retmax), retstart: String(options.retstart ?? 0) }), options);
  const response = await fetchNcbi(`${EUTILS_BASE}/esearch.fcgi?${params.toString()}`, options);
  if (!response.ok) throw new Error(`pmc_esearch_failed:${response.status}`);
  const json = (await response.json()) as { esearchresult?: { idlist?: string[] } };
  return (json.esearchresult?.idlist ?? []).map((id) => ({
    pmid: id,
    pmcid: id.startsWith('PMC') ? id : `PMC${id}`,
    title: `PMC article ${id}`,
    sourceCitation: `PMC:${id.startsWith('PMC') ? id : `PMC${id}`}`
  }));
}

export async function ingestPmcOaFullTextWithReport(options: {
  query: string;
  retmax: number;
  retstart?: number;
  email?: string;
  apiKey?: string;
  perRecordDelayMs?: number;
}): Promise<PmcOaIngestReport> {
  const records = await fetchPmcSearchRecords({ query: options.query, retmax: options.retmax, retstart: options.retstart, email: options.email, apiKey: options.apiKey });
  const pmcRecords = records.filter((record) => Boolean(record.pmcid));
  const out: PmcOaSource[] = [];
  const failures: PmcOaFailure[] = [];
  let documentsIngested = 0;
  const delayMs = options.perRecordDelayMs ?? ncbiDelayMs(options);

  for (const record of pmcRecords) {
    const pmcid = record.pmcid;
    if (!pmcid) continue;

    try {
      const sections = await fetchPmcOaFullText(pmcid, options);
      if (!isOncologyArticle(record, sections)) {
        failures.push({ pmid: record.pmid, pmcid, reason: 'skipped_non_oncology_article' });
        await sleep(delayMs);
        continue;
      }
      const sectionChunks = sections.flatMap((section) => {
        const chunks = chunkArticleText(section.paragraphs.join('\n\n'), 3500);
        return chunks.map((chunk, index) => ({ section, chunk, index })).filter((item) => isClaimBearingOncologyChunk(item.section, item.chunk, record));
      });
      if (sectionChunks.length > 0) documentsIngested += 1;

      for (let index = 0; index < sectionChunks.length; index += 1) {
        const item = sectionChunks[index];
        if (!item?.chunk) continue;
        const chunkNum = index + 1;
        out.push({
          title: `${record.title} (${item.section.title ?? item.section.type} chunk ${chunkNum}/${sectionChunks.length})`,
          sectionTitle: item.section.title,
          sectionType: item.section.type,
          paragraphIndex: item.index,
          sourceText: item.chunk,
          sourceCitation: `${record.sourceCitation}; PMCID:${pmcid}`,
          sourceUrl: `https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/`,
          sourcePublishedAt: record.sourcePublishedAt
        });
      }
    } catch (error) {
      failures.push({ pmid: record.pmid, pmcid, reason: error instanceof Error ? error.message : 'pmc_oa_unknown_error' });
    }

    await sleep(delayMs);
  }

  return {
    recordsFetched: records.length,
    pmcRecords: pmcRecords.length,
    documentsIngested,
    sources: out,
    failures,
    skippedCount: records.length - pmcRecords.length
  };
}

export async function ingestPmcOaFullText(options: {
  query: string;
  retmax: number;
  retstart?: number;
  email?: string;
  apiKey?: string;
  perRecordDelayMs?: number;
}): Promise<PmcOaSource[]> {
  return (await ingestPmcOaFullTextWithReport(options)).sources;
}
