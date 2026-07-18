import type { Metadata, Viewport } from 'next';
import { DM_Sans, Sora } from 'next/font/google';
import './globals.css';

const sora = Sora({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-sora',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-dm-sans',
});

export const metadata: Metadata = {
  title: 'StockFlow',
  description:
    'Sales and inventory management for Nigerian distributors — track stock, credit sales, payments and reps from your phone.',
  applicationName: 'StockFlow',
  icons: { icon: '/favicon.ico', apple: '/icon-192.png' },
};

export const viewport: Viewport = {
  themeColor: '#1A3C5E',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

// Same storage key as the web app so the preference survives a future shared
// origin. Runs synchronously before first paint to avoid a theme flash.
const themeInit = `(function(){try{var t=localStorage.getItem('sf_theme')||(window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

// Webview CSP (static export has no server to send headers). Mirrors the
// Netlify CSP minus CDNs/Google Fonts: next/font self-hosts fonts and all JS
// is bundled, so only Supabase needs network access. Production only — dev
// HMR needs eval.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https://*.supabase.co https://*.supabase.in",
  "connect-src 'self' https://*.supabase.co https://*.supabase.in wss://*.supabase.co wss://*.supabase.in",
  "worker-src 'self' blob:",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ');

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" className={`${sora.variable} ${dmSans.variable}`} suppressHydrationWarning>
      <body>
        {process.env.NODE_ENV === 'production' && (
          <meta httpEquiv="Content-Security-Policy" content={csp} />
        )}
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        {children}
      </body>
    </html>
  );
}
