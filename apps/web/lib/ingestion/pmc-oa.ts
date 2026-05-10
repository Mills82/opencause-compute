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

export function stripXmlToText(xml: string): string {
  const body = xml.match(/<body[\s\S]*?<\/body>/i)?.[0] ?? xml;
  const paragraphMatches = [...body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((entry) =>
    decodeXmlEntities(entry[1].replace(/<[^>]+>/g, ' '))
  );

  const paragraphs = paragraphMatches
    .map((text) => text.trim())
    .filter((text) => text.length > 10);

  if (paragraphs.length > 0) {
    return paragraphs.join('\n\n');
  }

  return decodeXmlEntities(body.replace(/<[^>]+>/g, ' '));
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

async function fetchPmcOaFullText(pmcid: string, options: { email?: string; apiKey?: string } = {}): Promise<string> {
  const href = await fetchPmcOaArchiveHref(pmcid, options);
  const response = await fetchNcbi(href, options);
  if (!response.ok) {
    throw new Error(`pmc_oa_archive_fetch_failed:${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const xml = await extractNxmlFromTgz(Buffer.from(arrayBuffer));
  return stripXmlToText(xml);
}

async function fetchPmcSearchRecords(options: { query: string; retmax: number; email?: string; apiKey?: string }): Promise<PmcSearchRecord[]> {
  const params = appendNcbiParams(new URLSearchParams({ db: 'pmc', term: options.query, retmode: 'json', retmax: String(options.retmax), sort: 'relevance' }), options);
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
  email?: string;
  apiKey?: string;
  perRecordDelayMs?: number;
}): Promise<PmcOaIngestReport> {
  const records = await fetchPmcSearchRecords({ query: options.query, retmax: options.retmax, email: options.email, apiKey: options.apiKey });
  const pmcRecords = records.filter((record) => Boolean(record.pmcid));
  const out: PmcOaSource[] = [];
  const failures: PmcOaFailure[] = [];
  let documentsIngested = 0;
  const delayMs = options.perRecordDelayMs ?? ncbiDelayMs(options);

  for (const record of pmcRecords) {
    const pmcid = record.pmcid;
    if (!pmcid) continue;

    try {
      const fullText = await fetchPmcOaFullText(pmcid, options);
      const chunks = chunkArticleText(fullText, 3500);
      if (chunks.length > 0) documentsIngested += 1;

      for (let index = 0; index < chunks.length; index += 1) {
        const chunk = chunks[index];
        if (!chunk) continue;
        const chunkNum = index + 1;
        out.push({
          title: `${record.title} (chunk ${chunkNum}/${chunks.length})`,
          sourceText: chunk,
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
  email?: string;
  apiKey?: string;
  perRecordDelayMs?: number;
}): Promise<PmcOaSource[]> {
  return (await ingestPmcOaFullTextWithReport(options)).sources;
}
