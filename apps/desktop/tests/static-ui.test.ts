import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('desktop static first-run UI', () => {
  const html = readFileSync(new URL('../static/index.html', import.meta.url), 'utf8');

  it('presents first-run runtime and model setup without prototype wording', () => {
    expect(html).toContain('First-run setup');
    expect(html).toContain('Download selected model');
    expect(html).toContain('Approved local model');
    expect(html).not.toContain('prototype button');
  });

  it('warns that large or experimental models require opt-in', () => {
    expect(html).toContain('Advanced model requires explicit opt-in');
  });
});
