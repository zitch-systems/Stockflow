// Compose a review sheet from actual browser captures, never fabricated UI.
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
const root = resolve(new URL("..", import.meta.url).pathname);
const screens = [
  ["01", "A simple start", "auth-login.png"],
  ["02", "Your business at a glance", "android-overview.png"],
  ["03", "Stock within reach", "android-inventory.png"],
  ["04", "A focused checkout", "android-checkout.png"],
];
const cards = await Promise.all(screens.map(async ([number, title, file]) => {
  const data = (await readFile(resolve(root, "docs/android", file))).toString("base64");
  return `<article><div class="label"><b>${number}</b><h2>${title}</h2></div><div class="phone"><img src="data:image/png;base64,${data}" alt="Actual StockFlow ${title} screen"></div></article>`;
}));
const browser = await chromium.launch({ executablePath: process.env.STOCKFLOW_CHROMIUM_PATH || undefined, args: ["--no-sandbox", "--single-process", "--no-zygote", "--disable-dev-shm-usage"] });
try {
  const page = await browser.newPage({ viewport: { width: 1520, height: 1080 }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html><head><style>
    *{box-sizing:border-box}body{margin:0;background:#edf3ef;color:#153e32;font-family:Arial,sans-serif;padding:54px 52px}
    header{display:flex;justify-content:space-between;align-items:center;margin-bottom:40px}.brand{font-size:22px;font-weight:bold;letter-spacing:-.8px}.brand span{color:#148160}h1{font-size:39px;margin:13px 0 10px;letter-spacing:-1.4px}header p{font-size:15px;color:#567067;margin:0}.tag{border:1px solid #bdd7c8;padding:12px 16px;border-radius:30px;font-size:12px;font-weight:bold;letter-spacing:1px}
    main{display:grid;grid-template-columns:repeat(4,1fr);gap:26px}.label{display:flex;gap:12px;align-items:center;margin:0 0 17px}.label b{color:#208167;font-size:12px}h2{font-size:14px;font-weight:600;margin:0}.phone{border:7px solid #203e34;border-radius:27px;overflow:hidden;background:#f5f7f7;box-shadow:0 18px 24px #163e2718}.phone img{display:block;width:100%;height:auto}
    footer{display:flex;justify-content:space-between;margin-top:30px;font-size:12px;color:#5b7168}footer strong{font-weight:500;color:#153e32}
  </style></head><body><header><div><div class="brand">Stock<span>Flow</span></div><h1>Your business. In your pocket.</h1><p>Android V2 · From sign-in to stock and sales.</p></div><div class="tag">DESIGN REVIEW</div></header><main>${cards.join("")}</main><footer><strong>Actual application screenshots · Fictional demonstration data</strong><span>Preview build · Live backend and device acceptance pending</span></footer></body></html>`);
  await page.evaluate(() => Promise.all(Array.from(document.images, img => img.decode())));
  await page.screenshot({path: resolve(root, "docs/android/StockFlow-Android-Preview.png"), fullPage:true});
} finally { await browser.close(); }
