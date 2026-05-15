import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('desktop static first-run UI', () => {
  const html = readFileSync(new URL('../static/index.html', import.meta.url), 'utf8');

  it('presents first-run runtime and model setup without prototype wording', () => {
    expect(html).toContain('First-run setup');
    expect(html).toContain('Install model');
    expect(html).toContain('Test selected model');
    expect(html).toContain('Local Ollama model');
    expect(html).toContain('High-end / advanced');
    expect(html).not.toContain('prototype button');
  });

  it('warns before installing advanced models', () => {
    expect(html).toContain('Install model');
    expect(html).toContain('It may require a powerful PC, lots of memory, and a long download. Continue?');
    expect(html).toContain('Model download canceled.');
    expect(html.indexOf('Model download canceled.')).toBeLessThan(html.indexOf('Starting model download'));
  });

  it('exposes public volunteer controls for pause, resources, startup, version, and local data removal', () => {
    expect(html).toContain('Start worker');
    expect(html).toContain('Pause');
    expect(html).toContain('Max CPU percent');
    expect(html).toContain('Start OpenCause Compute when I sign in to Windows');
    expect(html).not.toContain('Start minimized');
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
    expect(html).toContain('Low-end / lower-resource');
    expect(html).toContain('Balanced / recommended');
    expect(html).toContain('High-end / advanced');
    expect(html).toContain('Test selected model');
    expect(html).not.toContain('— candidate');
    expect(html).toContain('Uninstall model');
    expect(html).toContain('removeModel');
    expect(html).toContain('testModelReadiness');
    expect(html).toContain('startModelDownload');
    expect(html).toContain('modelDownloadStatus');
    expect(html).toContain('Test this model before saving it for worker processing.');
    expect(html).toContain('Use it anyway for experimental testing?');
    expect(html).toContain('Discard unsaved changes');
    expect(html).toContain('Stay');
    expect(html).toContain('Discard changes and leave');
    expect(html).toContain('You have unsaved model/resource changes.');
    expect(html).toContain("activeTab !== 'settings' && !settingsDirty");
    expect(html).toContain('populateSettingsFormFromState');
    expect(html).not.toContain('Save model/resource changes before leaving this tab?');
    expect(html).not.toContain('refreshAfterSave: false');
    expect(html).toContain("finalStatus?.status === 'succeeded'");
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

  it('prioritizes controls and keeps the activity timeline secondary', () => {
    expect(html.indexOf('dashboard-status-pill')).toBeLessThan(html.indexOf('activity-summary'));
    expect(html.indexOf('id="start"')).toBeLessThan(html.indexOf('activity-summary'));
    expect(html.indexOf('preflight-summary')).toBe(-1);
    expect(html.indexOf('Session stats')).toBe(-1);
    expect(html.indexOf('activity-timeline')).toBeGreaterThan(html.indexOf('dashboard-average-seconds'));
    expect(html).toContain('Recent activity');
    expect(html).toContain('function formatLocalTime');
    expect(html).toContain('Intl.DateTimeFormat');
  });

  it('preserves an in-progress model dropdown choice while editing settings', () => {
    expect(html).toContain('preserveUserChoice');
    expect(html).toContain("settingsDirty && (activeTab === 'settings' || document.activeElement === modelSelect)");
    expect(html).toContain('This model is not downloaded yet. Download it before applying it to the worker.');
  });

  it('offers a manual update check in Advanced', () => {
    expect(html).toContain('Check for updates');
    expect(html).toContain('checkForUpdates');
    expect(html).toContain('Open download page');
  });

  it('uses resource presets with custom override and keeps the coordinator locked', () => {
    expect(html).toContain('Locked to the official coordinator in beta builds.');
    expect(html).toContain('Budget — lighter CPU');
    expect(html).toContain('High — more context and longer output');
    expect(html).toContain('Ultra — largest context');
    expect(html).toContain('Context window');
    expect(html).toContain('Max response tokens');
    expect(html).toContain('resourcePresets');
    expect(html).toContain("qualityMode.value = 'custom'");
  });

});
