import tar from 'tar-stream';
import { gunzipSync } from 'node:zlib';
import { fetchNcbi, ncbiDelayMs, sleep, appendNcbiParams } from './ncbi-client';

const PMC_OA_BASE = 'https://www.ncbi.nlm.nih.gov/pmc/utils/oa/oa.fcgi';
const EUTILS_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

export type PmcOaFailure = { pmcid?: string; pmid: string; reason: string };

export type PmcOaIngestDiagnostics = {
  articlesSkipped: Record<string, number>;
  sectionsSkipped: Record<string, number>;
  candidateSentencesScored: number;
  candidatePacketsCreated: number;
  rejectReasons: Record<string, number>;
};

export type PmcOaIngestReport = {
  recordsFetched: number;
  pmcRecords: number;
  documentsIngested: number;
  sources: PmcOaSource[];
  failures: PmcOaFailure[];
  skippedCount: number;
  diagnostics: PmcOaIngestDiagnostics;
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
  abstractText?: string;
  sourceCitation: string;
  sourcePublishedAt?: string;
};

export type PmcArticleCentrality = 'primary_oncology' | 'incidental_oncology' | 'non_oncology';

export type PmcOaPreviewArticle = {
  pmid: string;
  pmcid: string;
  title: string;
  centrality: PmcArticleCentrality;
  articleScore: number;
  decision: 'ingest' | 'skip';
  skipReason?: string;
  candidateCount: number;
  topCandidates: Array<{ sentence: string; context: string; sectionTitle?: string; sectionType: string; score: number; signals: string[] }>;
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
const AGGRESSIVE_SKIP_SECTION_TERMS = /\b(methods?|materials?|statistical analysis|cell culture|cell lines?|plasmids?|cloning|transfection|flow cytometry|immunoblot|western blot|qrt-pcr|rna extraction|animal husbandry|ethics|patients and samples|data availability|supplementary|protocol|software|code availability)\b/i;
const STRONG_SENTENCE_TERMS = /\b(overall survival|progression-free survival|objective response|hazard ratio|confidence interval|median survival|complete response|partial response|disease control|recurrence|local control|grade\s+[34]|adverse events?|toxicit|associated with response|predicted survival|correlated with prognosis|resistance to|sensitive to|reduced tumou?r growth|inhibited proliferation|increased apoptosis|suppressed metastasis|xenograft|organoid|cell viability|IC50|p\s*[<=>])\b/i;
const METHODS_SENTENCE_TERMS = /\b(we used|we generated|we injected|we transfected|we isolated|we cultured|cells were cultured|samples were collected|statistical analysis|software|protocol|database|ethics approval|were housed|were seeded|were plated)\b/i;
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


function increment(map: Record<string, number>, key: string): void { map[key] = (map[key] ?? 0) + 1; }

function splitSentences(text: string): string[] {
  return text.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+(?=[A-Z0-9])/).map((s) => s.trim()).filter((s) => s.length >= 60 && s.length <= 900);
}

function contextForSentence(sentences: string[], index: number): string {
  return [sentences[index - 1], sentences[index], sentences[index + 1]].filter(Boolean).join(' ');
}

export function scoreArticleCentrality(record: PmcSearchRecord, sections: PmcSectionText[]): { centrality: PmcArticleCentrality; score: number; reason?: string } {
  const title = record.title || '';
  const abstract = record.abstractText || sections.find((section) => section.type === 'abstract')?.paragraphs.join(' ') || '';
  const front = `${title} ${abstract}`;
  let score = 0;
  if (ONCOLOGY_ARTICLE_TERMS.test(title)) score += 4;
  if (ONCOLOGY_ARTICLE_TERMS.test(abstract)) score += 3;
  if (CLAIM_OPPORTUNITY_TERMS.test(front)) score += 2;
  if (STRONG_SENTENCE_TERMS.test(front)) score += 2;
  if (/\b(software|workflow|pipeline|protocol|database|benchmark|method|tool|platform)\b/i.test(title)) score -= 3;
  if (!ONCOLOGY_ARTICLE_TERMS.test(front) && isOncologyArticle(record, sections)) score += 1;
  const centrality: PmcArticleCentrality = score >= 5 ? 'primary_oncology' : score >= 2 ? 'incidental_oncology' : 'non_oncology';
  return { centrality, score, reason: centrality === 'non_oncology' ? 'low_article_oncology_centrality' : undefined };
}

function scoreCandidateSentence(sentence: string, context: string, section: PmcSectionText, record: PmcSearchRecord): { score: number; signals: string[]; rejectReason?: string } {
  const text = `${record.title} ${section.title ?? ''} ${sentence}`;
  const signals: string[] = [];
  let score = 0;
  if (ONCOLOGY_ARTICLE_TERMS.test(text)) { score += 2; signals.push('oncology_term'); }
  if (STRONG_SENTENCE_TERMS.test(sentence)) { score += 3; signals.push('strong_evidence_sentence'); }
  if (CLAIM_OPPORTUNITY_TERMS.test(sentence)) { score += 1; signals.push('claim_opportunity'); }
  if (CLAIM_BEARING_SECTION_TYPES.has(section.type)) { score += 1; signals.push(`section:${section.type}`); }
  if (/\b(p\s*[<=>]|hazard ratio|confidence interval|ORR|PFS|OS|IC50|AUC)\b/i.test(sentence)) { score += 1; signals.push('quantitative_signal'); }
  if (METHODS_SENTENCE_TERMS.test(sentence) && !STRONG_SENTENCE_TERMS.test(sentence)) { score -= 4; signals.push('method_action_penalty'); }
  if (!ONCOLOGY_ARTICLE_TERMS.test(context)) return { score, signals, rejectReason: 'no_oncology_context' };
  if (score < 3) return { score, signals, rejectReason: 'low_candidate_score' };
  return { score, signals };
}

function candidatePacketsForSection(section: PmcSectionText, record: PmcSearchRecord, diagnostics: PmcOaIngestDiagnostics, maxPerSection = 2) {
  if (AGGRESSIVE_SKIP_SECTION_TERMS.test(section.title ?? '') || section.type === 'methods' || section.type === 'supplement') {
    increment(diagnostics.sectionsSkipped, section.title ?? section.type);
    return [];
  }
  const sentences = splitSentences(section.paragraphs.join(' '));
  return sentences.map((sentence, index) => {
    const context = contextForSentence(sentences, index);
    const scored = scoreCandidateSentence(sentence, context, section, record);
    diagnostics.candidateSentencesScored += 1;
    if (scored.rejectReason) increment(diagnostics.rejectReasons, scored.rejectReason);
    return { sentence, context, section, score: scored.score, signals: scored.signals, rejectReason: scored.rejectReason, index };
  }).filter((candidate) => !candidate.rejectReason).sort((a, b) => b.score - a.score).slice(0, maxPerSection);
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
  const ids = json.esearchresult?.idlist ?? [];
  if (!ids.length) return [];
  const summaryParams = appendNcbiParams(new URLSearchParams({ db: 'pmc', id: ids.join(','), retmode: 'json' }), options);
  const summaryResponse = await fetchNcbi(`${EUTILS_BASE}/esummary.fcgi?${summaryParams.toString()}`, options);
  const summaries = summaryResponse.ok ? ((await summaryResponse.json()) as any).result ?? {} : {};
  return ids.map((id) => {
    const pmcid = id.startsWith('PMC') ? id : `PMC${id}`;
    const summary = summaries[id] ?? {};
    return {
      pmid: summary.articleids?.find?.((entry: any) => entry.idtype === 'pmid')?.value ?? id,
      pmcid,
      title: decodeXmlEntities(summary.title ?? `PMC article ${id}`),
      abstractText: decodeXmlEntities(summary.abstract ?? ''),
      sourceCitation: `${summary.fulljournalname ?? 'PMC'}${summary.pubdate ? ` (${summary.pubdate})` : ''}; PMCID:${pmcid}`,
      sourcePublishedAt: summary.pubdate
    };
  });
}

export async function previewPmcOaFullText(options: {
  query: string;
  retmax: number;
  retstart?: number;
  email?: string;
  apiKey?: string;
  perRecordDelayMs?: number;
  maxPacketsPerArticle?: number;
  maxPacketsPerSection?: number;
}): Promise<{ recordsFetched: number; pmcRecords: number; articles: PmcOaPreviewArticle[]; diagnostics: PmcOaIngestDiagnostics; sources: PmcOaSource[]; failures: PmcOaFailure[] }> {
  const records = await fetchPmcSearchRecords({ query: options.query, retmax: options.retmax, retstart: options.retstart, email: options.email, apiKey: options.apiKey });
  const pmcRecords = records.filter((record) => Boolean(record.pmcid));
  const diagnostics: PmcOaIngestDiagnostics = { articlesSkipped: {}, sectionsSkipped: {}, candidateSentencesScored: 0, candidatePacketsCreated: 0, rejectReasons: {} };
  const articles: PmcOaPreviewArticle[] = [];
  const sources: PmcOaSource[] = [];
  const failures: PmcOaFailure[] = [];
  const delayMs = options.perRecordDelayMs ?? ncbiDelayMs(options);
  const maxPacketsPerArticle = options.maxPacketsPerArticle ?? 5;
  const maxPacketsPerSection = options.maxPacketsPerSection ?? 2;

  for (const record of pmcRecords) {
    const pmcid = record.pmcid;
    try {
      const sections = await fetchPmcOaFullText(pmcid, options);
      const centrality = scoreArticleCentrality(record, sections);
      if (centrality.centrality === 'non_oncology') {
        increment(diagnostics.articlesSkipped, centrality.reason ?? 'non_oncology');
        articles.push({ pmid: record.pmid, pmcid, title: record.title, centrality: centrality.centrality, articleScore: centrality.score, decision: 'skip', skipReason: centrality.reason, candidateCount: 0, topCandidates: [] });
        await sleep(delayMs);
        continue;
      }
      const candidates = sections.flatMap((section) => candidatePacketsForSection(section, record, diagnostics, maxPacketsPerSection)).sort((a, b) => b.score - a.score).slice(0, maxPacketsPerArticle);
      if (!candidates.length) increment(diagnostics.articlesSkipped, 'no_candidate_sentences');
      articles.push({ pmid: record.pmid, pmcid, title: record.title, centrality: centrality.centrality, articleScore: centrality.score, decision: candidates.length ? 'ingest' : 'skip', skipReason: candidates.length ? undefined : 'no_candidate_sentences', candidateCount: candidates.length, topCandidates: candidates.map((candidate) => ({ sentence: candidate.sentence, context: candidate.context, sectionTitle: candidate.section.title, sectionType: candidate.section.type, score: candidate.score, signals: candidate.signals })) });
      candidates.forEach((candidate, index) => {
        diagnostics.candidatePacketsCreated += 1;
        sources.push({ title: `${record.title} (${candidate.section.title ?? candidate.section.type} candidate ${index + 1}/${candidates.length}; score ${candidate.score})`, sectionTitle: candidate.section.title, sectionType: candidate.section.type, paragraphIndex: candidate.index, sourceText: candidate.context, sourceCitation: record.sourceCitation, sourceUrl: `https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/`, sourcePublishedAt: record.sourcePublishedAt });
      });
    } catch (error) { failures.push({ pmid: record.pmid, pmcid, reason: error instanceof Error ? error.message : 'pmc_oa_unknown_error' }); }
    await sleep(delayMs);
  }
  return { recordsFetched: records.length, pmcRecords: pmcRecords.length, articles, diagnostics, sources, failures };
}

export async function ingestPmcOaFullTextWithReport(options: {
  query: string;
  retmax: number;
  retstart?: number;
  email?: string;
  apiKey?: string;
  perRecordDelayMs?: number;
}): Promise<PmcOaIngestReport> {
  const preview = await previewPmcOaFullText(options);
  return { recordsFetched: preview.recordsFetched, pmcRecords: preview.pmcRecords, documentsIngested: preview.articles.filter((article) => article.decision === 'ingest').length, sources: preview.sources, failures: preview.failures, skippedCount: preview.recordsFetched - preview.pmcRecords + preview.articles.filter((article) => article.decision === 'skip').length, diagnostics: preview.diagnostics };
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
