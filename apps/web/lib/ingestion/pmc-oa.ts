import tar from 'tar-stream';
import { gunzipSync } from 'node:zlib';
import { fetchPubMedRecords } from './pubmed';

const PMC_OA_BASE = 'https://www.ncbi.nlm.nih.gov/pmc/utils/oa/oa.fcgi';

export type PmcOaFailure = { pmcid?: string; pmid: string; reason: string };

export type PmcOaIngestReport = {
  recordsFetched: number;
  pmcRecords: number;
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

async function fetchPmcOaArchiveHref(pmcid: string): Promise<string> {
  const response = await fetch(`${PMC_OA_BASE}?id=${encodeURIComponent(pmcid)}`);
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

async function fetchPmcOaFullText(pmcid: string): Promise<string> {
  const href = await fetchPmcOaArchiveHref(pmcid);
  const response = await fetch(href);
  if (!response.ok) {
    throw new Error(`pmc_oa_archive_fetch_failed:${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const xml = await extractNxmlFromTgz(Buffer.from(arrayBuffer));
  return stripXmlToText(xml);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function ingestPmcOaFullTextWithReport(options: {
  query: string;
  retmax: number;
  email?: string;
  apiKey?: string;
  perRecordDelayMs?: number;
}): Promise<PmcOaIngestReport> {
  const records = await fetchPubMedRecords({
    query: options.query,
    retmax: options.retmax,
    email: options.email,
    apiKey: options.apiKey
  });

  const pmcRecords = records.filter((record) => Boolean(record.pmcid));
  const out: PmcOaSource[] = [];
  const failures: PmcOaFailure[] = [];
  const delayMs = options.perRecordDelayMs ?? 400;

  for (const record of pmcRecords) {
    const pmcid = record.pmcid;
    if (!pmcid) continue;

    try {
      const fullText = await fetchPmcOaFullText(pmcid);
      const chunks = chunkArticleText(fullText, 3500);

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
