import type { NextConfig } from 'next';

// Static export: Capacitor ships the `out/` directory inside the native app,
// so there is no Node server at runtime. Security headers therefore cannot be
// set here (headers() needs a server) — a CSP <meta> tag in the root layout
// covers the webview instead.
const nextConfig: NextConfig = {
  output: 'export',
  // folder/index.html output resolves cleanly from Capacitor's local server
  trailingSlash: true,
  // next/image optimization needs a server; plain <img>/static assets only
  images: { unoptimized: true },
};

export default nextConfig;
