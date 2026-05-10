'use client';

import { usePathname } from 'next/navigation';

const links = [
  ['Home', '/'],
  ['Impact', '/impact'],
  ['Leaderboards', '/leaderboards'],
  ['Volunteer', '/volunteer'],
  ['Download', '/download'],
  ['About', '/about']
] as const;

export function SiteNav() {
  const pathname = usePathname();
  return (
    <nav className="scrollbar-none -mr-4 flex flex-1 snap-x gap-2 overflow-x-auto whitespace-nowrap pl-2 text-sm font-medium text-slate-300 sm:gap-3 sm:pl-4 md:flex-none md:overflow-visible" aria-label="Primary navigation">
      {links.map(([label, href]) => {
        const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
        return (
          <a
            key={href}
            aria-current={active ? 'page' : undefined}
            className={`snap-start rounded-full border px-3 py-1.5 hover:border-accent hover:text-accent hover:no-underline ${active ? 'border-accent bg-accent/10 text-accent' : 'border-line/70 md:border-transparent'}`}
            href={href}
          >
            {label}
          </a>
        );
      })}
    </nav>
  );
}
