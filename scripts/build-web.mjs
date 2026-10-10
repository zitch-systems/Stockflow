// Reproducible static deploy: publish only public application assets.
import { execFileSync } from "node:child_process";
import {
  readdir,
  cp,
  mkdir,
  rm,
  copyFile,
  readFile,
  writeFile,
} from "node:fs/promises";
import { resolve } from "node:path";
const root = resolve(new URL("..", import.meta.url).pathname),
  out = resolve(root, "dist");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
execFileSync("npm", ["run", "build"], {
  cwd: resolve(root, "mobile"),
  stdio: "inherit",
  env: {
    ...process.env,
    STOCKFLOW_WEB_BASE_PATH: "/workspace",
    NEXT_PUBLIC_WEB_BASE_PATH: "/workspace",
  },
});
for (const file of await readdir(root)) {
  if (file === "stockflow-test-v3.html") continue;
  if (
    /\.(html|css|js|png|ico|svg|webmanifest)$/.test(file) ||
    ["manifest.json", "robots.txt", "sitemap.xml", "_headers"].includes(file)
  )
    await copyFile(resolve(root, file), resolve(out, file));
}
await cp(resolve(root, "assets"), resolve(out, "assets"), { recursive: true });
// With output: export, Next uses a custom distDir as the export directory too.
// Never copy the native out/ tree into the prefixed website deployment.
await cp(resolve(root, "mobile/.next-web"), resolve(out, "workspace"), {
  recursive: true,
});
// Main business entry points use the shared Next.js workspace. Retain the
// older dashboards explicitly for unported administration; no HTML dashboard
// is silently presented as the V2 application.
const entries = {
  'login.html': '/workspace/login/',
  'signup.html': '/workspace/register/',
  'owner-dashboard.html': '/workspace/home/',
  'manager-dashboard.html': '/workspace/home/',
  'rep-dashboard.html': '/workspace/home/',
};
for (const [file, target] of Object.entries(entries)) {
  const legacy = file.endsWith('-dashboard.html') ? `/${file.replace('.html', '-legacy.html')}` : null;
  // The compatibility query keeps new APK links working before the web bundle
  // is deployed; the old site ignores it and opens its existing dashboard.
  // Auth aliases forward their query and fragment: Supabase email links carry
  // the confirmation result there, and the workspace login reports it.
  const redirect = legacy
    ? `<script>location.replace(new URLSearchParams(location.search).get('legacy')==='1'?'${legacy}':'${target}')</script>`
    : `<script>location.replace('${target}'+location.search+location.hash)</script><noscript><meta http-equiv="refresh" content="0;url=${target}"></noscript>`;
  await writeFile(resolve(out, file), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${redirect}<meta name="robots" content="noindex"><title>Opening StockFlow</title></head><body><p>Opening your StockFlow workspace. <a href="${target}">Continue</a></p>${legacy ? `<p>For retained administration: <a href="${legacy}">Open legacy dashboard</a></p>` : ''}</body></html>`);
}
// The retained dashboards keep their own browser session (supabase-client.js,
// localStorage), separate from the workspace's tab-scoped session. Their sign-in
// and role redirects must stay among the retained pages: pointing them at the
// workspace aliases above loops a signed-out owner or platform admin back to
// /workspace/home/ and leaves the retained administration unreachable.
const toLegacy = (text) => text
  // Navigations only: email links (`origin + '/login.html'`) keep landing on
  // the workspace login, which reports the confirmation result.
  .replace(/(?<!origin \+ )(['"])(\/?)login\.html/g, '$1$2login-legacy.html')
  .replace(/\b(owner|manager|rep)-dashboard\.html/g, '$1-dashboard-legacy.html');
const legacyIsland = {
  'login-legacy.html': 'login.html',
  'owner-dashboard-legacy.html': 'owner-dashboard.html',
  'manager-dashboard-legacy.html': 'manager-dashboard.html',
  'rep-dashboard-legacy.html': 'rep-dashboard.html',
  'admin-dashboard.html': 'admin-dashboard.html',
  'supabase-client.js': 'supabase-client.js',
};
for (const [published, source] of Object.entries(legacyIsland)) {
  const original = await readFile(resolve(root, source), 'utf8');
  let text = toLegacy(original);
  // The retained sign-in page routes through supabase-client.js, so it has no
  // redirects of its own; every other island file must have been retargeted.
  if (published === 'login-legacy.html')
    text = text.replace('<meta name="robots" content="index, follow">', '<meta name="robots" content="noindex">');
  else if (text === original)
    throw new Error(`${published}: no retained redirects were rewritten`);
  await writeFile(resolve(out, published), text);
}
// Public landing remains canonical at /.
const landing = await readFile(resolve(root, "landing.html"), "utf8");
await writeFile(resolve(out, "index.html"), landing);
console.log(
  "Built public site and /workspace. Database migrations are NOT executed by this build.",
);
