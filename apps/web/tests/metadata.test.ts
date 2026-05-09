import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import manifest from '../app/manifest';
import robots from '../app/robots';
import sitemap from '../app/sitemap';

describe('public site metadata', () => {
  const layoutSource = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8');

  it('defines polished default metadata and social previews', () => {
    expect(layoutSource).toContain('Volunteer compute for open science');
    expect(layoutSource).toContain('openGraph');
    expect(layoutSource).toContain('summary_large_image');
    expect(layoutSource).toContain('/opencause-compute-icon.svg');
    expect(layoutSource).toContain('/opencause-compute-logo.png');
  });

  it('defines web app manifest icons and theme', () => {
    const appManifest = manifest();
    expect(appManifest.name).toBe('OpenCause Compute');
    expect(appManifest.theme_color).toBe('#0b1324');
    expect(appManifest.icons?.map((icon) => icon.src)).toContain('/opencause-compute-icon.png');
  });

  it('keeps admin/coordinator surfaces out of robots and sitemap', () => {
    const robotsTxt = robots();
    expect(JSON.stringify(robotsTxt)).toContain('/admin');
    const urls = sitemap().map((entry) => entry.url);
    expect(urls.some((url) => url.includes('/admin'))).toBe(false);
    expect(urls.some((url) => url.endsWith('/download'))).toBe(true);
  });
});
