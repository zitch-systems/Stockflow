import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'StockFlow',
    short_name: 'StockFlow',
    description: 'Sales and inventory management for Nigerian distributors',
    start_url: '/login',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#0F2A44',
    theme_color: '#0F2A44',
    lang: 'en',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
      { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
    ],
    shortcuts: [
      {
        name: 'Sign In',
        short_name: 'Sign In',
        url: '/login',
        icons: [{ src: '/icon-192.png', sizes: '192x192' }],
      },
    ],
    categories: ['business', 'productivity', 'finance'],
  };
}
