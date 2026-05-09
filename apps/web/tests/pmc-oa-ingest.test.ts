import { describe, expect, it } from 'vitest';
import { chunkArticleText, parseOaTgzHref, stripXmlToText } from '../lib/ingestion/pmc-oa';

describe('pmc oa ingestion helpers', () => {
  it('parses tgz link from oa response', () => {
    const xml = '<record><link format="tgz" href="ftp://ftp.ncbi.nlm.nih.gov/pub/pmc/oa_package/12/34/PMC12345.tar.gz"/></record>';
    expect(parseOaTgzHref(xml)).toBe(
      'https://ftp.ncbi.nlm.nih.gov/pub/pmc/oa_package/12/34/PMC12345.tar.gz'
    );
  });

  it('extracts readable text from nxml body', () => {
    const xml = '<article><body><sec><p>First sentence with cancer response signal.</p><p>Second paragraph with biomarker context.</p></sec></body></article>';
    const text = stripXmlToText(xml);
    expect(text).toContain('First sentence');
    expect(text).toContain('Second paragraph');
  });

  it('chunks long text for packetization', () => {
    const long = Array.from({ length: 20 }, (_, i) => `Paragraph ${i} ` + 'x'.repeat(250)).join('\n\n');
    const chunks = chunkArticleText(long, 1000);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 1000)).toBe(true);
  });
});
