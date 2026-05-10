import { describe, expect, it } from 'vitest';
import { parsePubMedSearchCount, parsePubMedXml } from '../lib/ingestion/pubmed';

const SAMPLE_XML = `
<PubmedArticleSet>
  <PubmedArticle>
    <MedlineCitation>
      <PMID>12345678</PMID>
      <Article>
        <ArticleTitle>EGFR response in NSCLC</ArticleTitle>
        <Abstract>
          <AbstractText>EGFR-mutated NSCLC showed response to treatment.</AbstractText>
        </Abstract>
        <Journal>
          <Title>Journal of Demo Oncology</Title>
          <JournalIssue><PubDate><Year>2025</Year></PubDate></JournalIssue>
        </Journal>
      </Article>
    </MedlineCitation>
    <PubmedData>
      <ArticleIdList>
        <ArticleId IdType="pubmed">12345678</ArticleId>
        <ArticleId IdType="pmc">PMC9999999</ArticleId>
      </ArticleIdList>
    </PubmedData>
  </PubmedArticle>
</PubmedArticleSet>
`;

describe('pubmed ingestion parser', () => {
  it('parses count-only search responses', () => {
    expect(parsePubMedSearchCount({ esearchresult: { count: '12345' } })).toBe(12345);
    expect(parsePubMedSearchCount({ esearchresult: { count: 17 } })).toBe(17);
  });

  it('parses pmid, abstract, and citation data', () => {
    const records = parsePubMedXml(SAMPLE_XML);
    expect(records).toHaveLength(1);
    expect(records[0]?.pmid).toBe('12345678');
    expect(records[0]?.pmcid).toBe('PMC9999999');
    expect(records[0]?.abstractText).toContain('EGFR-mutated NSCLC');
    expect(records[0]?.sourceCitation).toContain('Journal of Demo Oncology');
    expect(records[0]?.sourceUrl).toContain('pmc.ncbi.nlm.nih.gov');
  });
});
