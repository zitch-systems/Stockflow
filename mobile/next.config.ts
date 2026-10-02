import type { NextConfig } from "next";
import path from "node:path";

// Static export: Capacitor ships the `out/` directory inside the native app,
// so there is no Node server at runtime. Security headers therefore cannot be
// set here (headers() needs a server) — a CSP <meta> tag in the root layout
// covers the webview instead.
const nextConfig: NextConfig = {
  output: "export",
  basePath: process.env.STOCKFLOW_WEB_BASE_PATH ?? "",
  // Keep web and native outputs separate. For a static export a custom
  // distDir is also the export directory (native keeps the default out/).
  distDir: process.env.STOCKFLOW_WEB_BASE_PATH ? ".next-web" : ".next",
  turbopack: { root: path.resolve(process.cwd()) },
  // folder/index.html output resolves cleanly from Capacitor's local server
  trailingSlash: true,
  // next/image optimization needs a server; plain <img>/static assets only
  images: { unoptimized: true },
};

export default nextConfig;
