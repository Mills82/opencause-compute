import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { requireProductionEnv } from '../lib/runtime-config';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://opencause.appassist.ai';
const siteName = 'OpenCause Compute';
const description =
  'Volunteer compute for AI-assisted open science. Help process open literature into citation-backed candidate research facts.';

const links = [
  ['Home', '/'],
  ['Impact', '/impact'],
  ['Leaderboards', '/leaderboards'],
  ['Volunteer', '/volunteer'],
  ['Download', '/download'],
  ['About', '/about']
] as const;

const footerLinks = [
  ['Privacy', '/privacy'],
  ['Terms', '/terms'],
  ['Security', '/security'],
  ['Science disclaimer', '/science-disclaimer'],
  ['Responsible disclosure', '/responsible-disclosure']
] as const;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: siteName,
  title: {
    default: `${siteName} — Volunteer compute for open science`,
    template: `%s — ${siteName}`
  },
  description,
  keywords: [
    'OpenCause Compute',
    'volunteer compute',
    'open science',
    'AI-assisted research',
    'literature extraction',
    'Cancer Knowledge Miner'
  ],
  authors: [{ name: 'AppAssist' }],
  creator: 'AppAssist',
  publisher: 'AppAssist',
  category: 'science',
  alternates: { canonical: '/' },
  icons: {
    icon: [
      { url: '/opencause-compute-icon.svg', type: 'image/svg+xml' },
      { url: '/opencause-compute-icon.png', type: 'image/png', sizes: '483x485' }
    ],
    shortcut: ['/opencause-compute-icon.png'],
    apple: [{ url: '/opencause-compute-icon.png', sizes: '483x485', type: 'image/png' }]
  },
  openGraph: {
    type: 'website',
    url: '/',
    siteName,
    title: `${siteName} — Volunteer compute for open science`,
    description,
    images: [
      {
        url: '/opencause-compute-logo.png',
        width: 1349,
        height: 485,
        alt: 'OpenCause Compute'
      }
    ],
    locale: 'en_US'
  },
  twitter: {
    card: 'summary_large_image',
    title: `${siteName} — Volunteer compute for open science`,
    description,
    images: ['/opencause-compute-logo.png']
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1
    }
  }
};

export const viewport: Viewport = {
  themeColor: '#0b1324',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1
};

export default function RootLayout({ children }: { children: ReactNode }) {
  requireProductionEnv();

  return (
    <html lang="en">
      <body>
        <div className="min-h-screen bg-ink text-white">
          <header className="sticky top-0 z-30 border-b border-line bg-panel/90 backdrop-blur supports-[backdrop-filter]:bg-panel/70">
            <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6 md:justify-between">
              <a className="flex min-w-0 shrink-0 items-center gap-3" href="/" aria-label="OpenCause Compute home">
                <img src="/opencause-compute-logo.svg" alt="OpenCause Compute" className="h-10 w-auto max-w-[190px] sm:h-12 sm:max-w-[260px]" />
              </a>
              <nav className="scrollbar-none -mr-4 flex flex-1 snap-x gap-2 overflow-x-auto whitespace-nowrap pl-2 text-sm font-medium text-slate-300 sm:gap-3 sm:pl-4 md:flex-none md:overflow-visible" aria-label="Primary navigation">
                {links.map(([label, href]) => (
                  <a key={href} className="snap-start rounded-full border border-line/70 px-3 py-1.5 hover:border-accent hover:text-accent hover:no-underline md:border-transparent" href={href}>
                    {label}
                  </a>
                ))}
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-6xl px-4 py-7 sm:px-6 sm:py-8">{children}</main>
          <footer className="border-t border-line/70">
            <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 text-sm text-slate-300 sm:px-6 md:flex-row md:items-center md:justify-between">
              <p>© {new Date().getFullYear()} AppAssist. Candidate research evidence, not medical advice.</p>
              <nav className="flex flex-wrap gap-x-4 gap-y-2" aria-label="Footer navigation">
                {footerLinks.map(([label, href]) => (
                  <a key={href} className="hover:text-accent" href={href}>
                    {label}
                  </a>
                ))}
              </nav>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
