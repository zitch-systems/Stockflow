import type { Metadata, Viewport } from 'next';
import { DM_Sans, Sora } from 'next/font/google';
import Script from 'next/script';
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';
import './globals.css';

const dmSans = DM_Sans({
  variable: '--font-dm-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
});

const sora = Sora({
  variable: '--font-sora',
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
});

export const metadata: Metadata = {
  title: 'StockFlow',
  description: 'Sales and inventory management for Nigerian distributors.',
  appleWebApp: {
    capable: true,
    title: 'StockFlow',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#1A3C5E',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      data-theme="light"
      suppressHydrationWarning
      className={`${dmSans.variable} ${sora.variable}`}
      style={{ scrollBehavior: 'smooth' }}
    >
      <head>
        <Script id="theme-init" strategy="beforeInteractive">{`
          try {
            var t = localStorage.getItem('sf_theme')
              || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
            document.documentElement.setAttribute('data-theme', t);
          } catch (e) {}
        `}</Script>
      </head>
      <body className="flex min-h-screen flex-col">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
