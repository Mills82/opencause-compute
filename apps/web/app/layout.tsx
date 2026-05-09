import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { requireProductionEnv } from '../lib/runtime-config';

const links = [
  ['Home', '/'],
  ['About', '/about'],
  ['Volunteer', '/volunteer'],
  ['Download', '/download']
] as const;

const footerLinks = [
  ['Privacy', '/privacy'],
  ['Terms', '/terms'],
  ['Security', '/security'],
  ['Science disclaimer', '/science-disclaimer'],
  ['Responsible disclosure', '/responsible-disclosure']
] as const;

export const metadata: Metadata = {
  title: 'OpenCause Compute',
  description: 'Volunteer compute for AI-assisted open science.'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  requireProductionEnv();

  return (
    <html lang="en">
      <body>
        <div className="min-h-screen bg-ink text-white">
          <header className="border-b border-line bg-panel/70">
            <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-4 md:flex-row md:items-center md:justify-between">
              <a className="flex items-center gap-3" href="/" aria-label="OpenCause Compute home">
                <img src="/opencause-compute-logo.svg" alt="OpenCause Compute" className="h-12 w-auto max-w-[280px]" />
              </a>
              <nav className="flex flex-wrap gap-4 text-sm font-medium text-slate-300" aria-label="Primary navigation">
                {links.map(([label, href]) => (
                  <a key={href} className="hover:text-accent" href={href}>
                    {label}
                  </a>
                ))}
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
          <footer className="border-t border-line/70">
            <div className="mx-auto flex max-w-6xl flex-wrap gap-4 px-6 py-6 text-sm text-slate-300">
              {footerLinks.map(([label, href]) => (
                <a key={href} className="hover:text-accent" href={href}>
                  {label}
                </a>
              ))}
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
