import { describe, expect, it } from 'vitest';
import { chunkArticleText, extractPmcSections, parseOaTgzHref, scoreArticleCentrality, stripXmlToText } from '../lib/ingestion/pmc-oa';

describe('pmc oa ingestion helpers', () => {
  it('parses tgz link from oa response', () => {
    const xml = '<record><link format="tgz" href="ftp://ftp.ncbi.nlm.nih.gov/pub/pmc/oa_package/12/34/PMC12345.tar.gz"/></record>';
    expect(parseOaTgzHref(xml)).toBe(
      'https://ftp.ncbi.nlm.nih.gov/pub/pmc/oa_package/12/34/PMC12345.tar.gz'
    );
  });

  it('extracts readable section text from nxml body', () => {
    const xml = '<article><body><sec><title>Results</title><p>First sentence with cancer response signal.</p><p>Second paragraph with biomarker context that is long enough to pass the paragraph filter threshold.</p></sec><sec><title>References</title><p>Boilerplate reference content should be skipped.</p></sec></body></article>';
    const sections = extractPmcSections(xml);
    const text = stripXmlToText(xml);
    expect(sections[0]?.title).toBe('Results');
    expect(sections[0]?.type).toBe('results');
    expect(text).toContain('First sentence');
    expect(text).toContain('Second paragraph');
    expect(text).not.toContain('Boilerplate reference');
  });

  it('scores primary oncology articles above incidental/non-oncology articles', () => {
    const sections = [{ type: 'abstract' as const, paragraphs: ['Patients with lung cancer had improved progression-free survival and overall survival after immunotherapy treatment.'] }];
    const primary = scoreArticleCentrality({ pmid: '1', pmcid: 'PMC1', title: 'Immunotherapy improves survival in lung cancer', sourceCitation: 'x' }, sections);
    const incidental = scoreArticleCentrality({ pmid: '2', pmcid: 'PMC2', title: 'A general bioinformatics software pipeline', sourceCitation: 'x' }, sections);
    expect(primary.centrality).toBe('primary_oncology');
    expect(primary.score).toBeGreaterThan(incidental.score);
  });

  it('chunks long text for packetization', () => {
    const long = Array.from({ length: 20 }, (_, i) => `Paragraph ${i} ` + 'x'.repeat(250)).join('\n\n');
    const chunks = chunkArticleText(long, 1000);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 1000)).toBe(true);
  });
});
