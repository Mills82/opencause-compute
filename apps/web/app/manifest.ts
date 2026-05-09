import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'OpenCause Compute',
    short_name: 'OpenCause',
    description: 'Volunteer compute for AI-assisted open science.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0b1324',
    theme_color: '#0b1324',
    categories: ['science', 'education', 'productivity'],
    icons: [
      {
        src: '/opencause-compute-icon.png',
        sizes: '483x485',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/opencause-compute-icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any'
      }
    ]
  };
}
