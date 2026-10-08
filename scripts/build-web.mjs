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
  if (file.endsWith('-dashboard.html'))
    await copyFile(resolve(root, file), resolve(out, file.replace('.html', '-legacy.html')));
  await writeFile(resolve(out, file), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=${target}"><meta name="robots" content="noindex"><title>Opening StockFlow</title></head><body><p>Opening your StockFlow workspace. <a href="${target}">Continue</a></p></body></html>`);
}
// Public landing remains canonical at /.
const landing = await readFile(resolve(root, "landing.html"), "utf8");
await writeFile(resolve(out, "index.html"), landing);
console.log(
  "Built public site and /workspace. Database migrations are NOT executed by this build.",
);
