import { appendNcbiParams, fetchNcbi, ncbiDelayMs, sleep } from './ncbi-client';

const EUTILS_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

export type PubMedSourceRecord = {
  pmid: string;
  pmcid?: string;
  title: string;
  abstractText: string;
  sourceCitation: string;
  sourceUrl: string;
  sourcePublishedAt?: string;
};

export type PubMedIngestOptions = {
  query: string;
  retmax: number;
  retstart?: number;
  email?: string;
  apiKey?: string;
  requestDelayMs?: number;
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

function extractTag(xml: string, tag: string): string | undefined {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  return regex.exec(xml)?.[1]?.trim();
}

function extractAllTags(xml: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'gi');
  const out: string[] = [];
  let match = regex.exec(xml);
  while (match) {
    out.push(match[1]?.trim() ?? '');
    match = regex.exec(xml);
  }
  return out;
}

function extractArticleId(articleXml: string, idType: 'pubmed' | 'pmc' | 'doi'): string | undefined {
  const regex = new RegExp(`<ArticleId[^>]*IdType=["']${idType}["'][^>]*>([\\s\\S]*?)</ArticleId>`, 'i');
  return regex.exec(articleXml)?.[1]?.trim();
}

export function parsePubMedXml(xml: string): PubMedSourceRecord[] {
  const articleMatches = xml.match(/<PubmedArticle[\s\S]*?<\/PubmedArticle>/gi) ?? [];
  const records: PubMedSourceRecord[] = [];

  for (const articleXml of articleMatches) {
    const pmid = extractArticleId(articleXml, 'pubmed') ?? extractTag(articleXml, 'PMID');
    const title = decodeXmlEntities(extractTag(articleXml, 'ArticleTitle') ?? 'Untitled PubMed record');
    const abstractParts = extractAllTags(articleXml, 'AbstractText').map((part) => decodeXmlEntities(part));
    const abstractText = abstractParts.join(' ').trim();

    if (!pmid || !abstractText) {
      continue;
    }

    const journal = decodeXmlEntities(extractTag(articleXml, 'Title') ?? 'PubMed');
    const year = extractTag(articleXml, 'Year');
    const pmcid = extractArticleId(articleXml, 'pmc');
    const citation = year ? `${journal} (${year})` : journal;
    const sourceUrl = pmcid
      ? `https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/`
      : `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;

    records.push({
      pmid,
      pmcid,
      title,
      abstractText,
      sourceCitation: citation,
      sourceUrl,
      sourcePublishedAt: year
    });
  }

  return records;
}

function buildSearchParams(options: PubMedIngestOptions): URLSearchParams {
  return appendNcbiParams(
    new URLSearchParams({
      db: 'pubmed',
      term: options.query,
      retmode: 'json',
      retmax: String(options.retmax),
      retstart: String(options.retstart ?? 0),
      sort: 'relevance'
    }),
    options
  );
}

export async function fetchPubMedRecords(options: PubMedIngestOptions): Promise<PubMedSourceRecord[]> {
  const delayMs = ncbiDelayMs(options);

  const searchUrl = `${EUTILS_BASE}/esearch.fcgi?${buildSearchParams(options).toString()}`;
  const searchResponse = await fetchNcbi(searchUrl, options);
  if (!searchResponse.ok) {
    throw new Error(`pubmed_esearch_failed:${searchResponse.status}`);
  }

  const searchJson = (await searchResponse.json()) as {
    esearchresult?: { idlist?: string[] };
  };

  const pmids = searchJson.esearchresult?.idlist ?? [];
  if (pmids.length === 0) {
    return [];
  }

  await sleep(delayMs);

  const fetchParams = appendNcbiParams(
    new URLSearchParams({
      db: 'pubmed',
      id: pmids.join(','),
      rettype: 'abstract',
      retmode: 'xml'
    }),
    options
  );

  const fetchUrl = `${EUTILS_BASE}/efetch.fcgi?${fetchParams.toString()}`;
  const fetchResponse = await fetchNcbi(fetchUrl, options);
  if (!fetchResponse.ok) {
    throw new Error(`pubmed_efetch_failed:${fetchResponse.status}`);
  }

  const xml = await fetchResponse.text();
  return parsePubMedXml(xml);
}
