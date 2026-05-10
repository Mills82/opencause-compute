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

  it('exposes public volunteer controls for pause, resources, startup, version, and local data removal', () => {
    expect(html).toContain('Start worker');
    expect(html).toContain('Pause');
    expect(html).toContain('Max CPU percent');
    expect(html).toContain('Start OpenCause Compute when I sign in to Windows');
    expect(html).toContain('Start minimized');
    expect(html).toContain('Automatically resume/start worker when the app opens');
    expect(html).toContain('App version:');
    expect(html).toContain('Remove local worker data');
  });

  it('shows a clear error when the packaged desktop bridge fails to load', () => {
    expect(html).toContain('Desktop bridge failed to load');
    expect(html).toContain('Desktop state check failed');
  });

  it('guides first-run users through Ollama installation and worker registration', () => {
    expect(html).toContain('Install Ollama first');
    expect(html).toContain('ollama.com/download');
    expect(html).toContain('Waiting for Ollama installation');
    expect(html).toContain('Register worker');
    expect(html).toContain('Setup progress');
    expect(html).toContain('Save and start worker');
  });

  it('keeps advanced troubleshooting available and reports model download status', () => {
    expect(html).toContain('Show setup checklist and technical details');
    expect(html).toContain('Show diagnostics');
    expect(html).toContain('download-status');
    expect(html).toContain('startModelDownload');
    expect(html).toContain('modelDownloadStatus');
  });

  it('offers actionable worker activity troubleshooting', () => {
    expect(html).toContain('activity-summary');
    expect(html).toContain('Adjust model/resources');
    expect(html).toContain('Retry one packet now');
    expect(html).toContain('Review idle settings');
  });

  it('uses dashboard labels and disables duplicate start actions after setup', () => {
    expect(html).toContain('id="model-step-title"');
    expect(html).toContain('id="settings-step-title"');
    expect(html).toContain("Worker running");
    expect(html).toContain("Settings saved; worker running");
  });

});
