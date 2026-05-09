import type { ReactNode } from 'react';
import './globals.css';

import { requireProductionEnv } from '../lib/runtime-config';

const links = [
  ['Home', '/'],
  ['About', '/about'],
  ['Science disclaimer', '/science-disclaimer'],
  ['Volunteer', '/volunteer'],
  ['Download', '/download'],
  ['Readiness', '/readiness'],
  ['Admin', '/admin']
] as const;

const footerLinks = [
  ['Privacy', '/privacy'],
  ['Terms', '/terms'],
  ['Security', '/security'],
  ['Science disclaimer', '/science-disclaimer'],
  ['Responsible disclosure', '/responsible-disclosure']
] as const;

export default function RootLayout({ children }: { children: ReactNode }) {
  requireProductionEnv();

  return (
    <html lang="en">
      <body>
        <div className="min-h-screen bg-gradient-to-b from-slate-900 to-ink">
          <header className="border-b border-line/70">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
              <div>
                <h1 className="text-xl font-semibold tracking-wide">OpenCause Compute</h1>
                <p className="text-sm text-slate-300">Donate your idle computer to AI-powered open science.</p>
              </div>
              <nav className="flex gap-4 text-sm">
                {links.map(([label, href]) => (
                  <a key={href} href={href}>
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
                <a key={href} href={href}>
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
