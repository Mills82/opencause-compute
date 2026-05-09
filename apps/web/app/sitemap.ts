import type { MetadataRoute } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://opencause.appassist.ai';

const publicRoutes = [
  '/',
  '/about',
  '/volunteer',
  '/download',
  '/impact',
  '/leaderboards',
  '/leaderboards/volunteers',
  '/leaderboards/teams',
  '/privacy',
  '/terms',
  '/security',
  '/science-disclaimer',
  '/responsible-disclosure'
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return publicRoutes.map((route) => ({
    url: `${siteUrl}${route}`,
    lastModified: now,
    changeFrequency: route === '/' ? 'weekly' : 'monthly',
    priority: route === '/' ? 1 : route === '/volunteer' || route === '/download' ? 0.8 : 0.6
  }));
}
