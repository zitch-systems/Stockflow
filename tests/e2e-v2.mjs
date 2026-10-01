import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
// Browser -> Supabase client -> isolated PostgreSQL -> rendered receipt/report.
// The Auth/PostgREST adapter below is ONLY a fixture, not production Auth QA.
// Every external browser request is intercepted or blocked. No production writes.
import { PGlite } from "@electric-sql/pglite";
import { createServer } from "node:http";
import { readFile, readdir, mkdir, writeFile, stat } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = resolve(new URL("..", import.meta.url).pathname),
  web = resolve(root, "mobile/out"),
  assets = resolve(root, "assets/v2");
const db = new PGlite({ extensions: { pg_trgm } });
await db.exec(
  await readFile(resolve(root, "tests/fixtures/v2-schema.sql"), "utf8"),
);
const migration = (await readdir(resolve(root, "supabase/migrations"))).find(
  (n) => n.endsWith("_stockflow_v2_integrity.sql"),
);
await db.exec(
  await readFile(resolve(root, "supabase/migrations", migration), "utf8"),
);
const tenant = "10000000-0000-4000-8000-000000000001",
  owner = "20000000-0000-4000-8000-000000000001",
  rep = "20000000-0000-4000-8000-000000000002",
  manager = "20000000-0000-4000-8000-000000000003",
  flour = "30000000-0000-4000-8000-000000000001";
await db.query(
  "update tenants set name='Adebayo Distribution',business_name='Adebayo Distribution' where id=$1",
  [tenant],
);
await db.query("update profiles set full_name='Tomi Adebayo' where id=$1", [
  owner,
]);
await db.query("update products set warehouse_stock=400 where tenant_id=$1", [
  tenant,
]);
const examples = [
  ["Golden Penny Pasta", 9500, 11500, 96, "PASTA"],
  ["Vegetable Oil 5L", 28000, 33500, 36, "OIL5"],
  ["Long Grain Rice 50kg", 58000, 66500, 72, "RICE50"],
  ["Tomato Paste", 4500, 6000, 2, "TOMATO"],
  ["Semolina 10kg", 14200, 17500, 3, "SEMO10"],
  ["Table Salt", 3000, 4200, 0, "SALT"],
];
for (const [name, buy, sell, qty, sku] of examples)
  await db.query(
    "insert into products(tenant_id,name,buy_price,sell_price,warehouse_stock,sku_code) values($1,$2,$3,$4,$5,$6)",
    [tenant, name, buy, sell, qty, sku],
  );
const customerNames = [
  "Bola Stores",
  "Oluwaseun Supermart",
  "Mama T Kitchen",
  "First Choice Groceries",
];
for (const name of customerNames)
  await db.query(
    "insert into customers(tenant_id,name,phone,address) values($1,$2,'08012345678','Lagos')",
    [tenant, name],
  );
for (let i = 0; i < 16; i++) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    owner,
  ]);
  const r = await db.query(
    "select stockflow_v2_sale($1,$2,null,$3::jsonb,$4,null) id",
    [
      randomUUID(),
      customerNames[i % 4],
      JSON.stringify([
        { product_id: flour, quantity: 1 + (i % 4), unit_price: 15000 },
      ]),
      ["cash", "transfer", "pos"][i % 3],
    ],
  );
  await db.query(
    "update sales set created_at=now()-($1::text||' days')::interval where id=$2",
    [String(16 - i), r.rows[0].id],
  );
}
await mkdir(assets, { recursive: true });
let checks = 0,
  dropNextSale = false,
  rejectNextRetry = false;
const mime = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
  ".csv": "text/csv",
};
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    let file = resolve(web, "." + pathname);
    if (!file.startsWith(web + "/")) throw Error("Invalid path");
    if ((await stat(file)).isDirectory()) file = resolve(file, "index.html");
    const content = await readFile(file);
    res.writeHead(200, {
      "Content-Type": mime[extname(file)] ?? "application/octet-stream",
    });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
await new Promise((r) => server.listen(4173, "127.0.0.1", r));
const browser = await chromium.launch({
  executablePath: process.env.STOCKFLOW_CHROMIUM_PATH || undefined,
  args: [
    "--no-sandbox",
    "--single-process",
    "--no-zygote",
    "--disable-dev-shm-usage",
  ],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  colorScheme: "light",
});
const errors = [];
context.on("page", (p) => p.on("pageerror", (e) => errors.push(e.message)));
await context.routeWebSocket("**/*", (ws) => ws.close());
const functions = {
  stockflow_v2_dashboard: ["p_from", "p_to"],
  stockflow_v2_sale: [
    "p_request_id",
    "p_customer_name",
    "p_customer_id",
    "p_items",
    "p_payment_method",
    "p_notes",
    "p_receipt_url",
  ],
  stockflow_v2_product: ["p_request_id", "p_product_id", "p_data"],
  stockflow_v2_customer: ["p_request_id", "p_name", "p_phone", "p_address"],
  stockflow_v2_adjust_stock: [
    "p_request_id",
    "p_product_id",
    "p_delta",
    "p_expected",
    "p_reason",
  ],
  stockflow_v2_cancel_sale: ["p_sale_id", "p_reason"],
  stockflow_v2_import_products: ["p_request_id", "p_rows"],
};
const users = { "owner@stockflow.test": owner, "rep@stockflow.test": rep, "manager@stockflow.test": manager };
const encode = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function authResponse(email) {
  const uid = users[email],
    expiry = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token: `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: uid, role: "authenticated", exp: expiry, iss: "fixture" })}.fixture`,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: expiry,
    refresh_token: "fixture-only-refresh-token",
    user: {
      id: uid,
      aud: "authenticated",
      role: "authenticated",
      email,
      created_at: new Date().toISOString(),
      app_metadata: { provider: "email" },
      user_metadata: {},
    },
  };
}
async function rpc(tx, name, body) {
  const keys = functions[name];
  if (!keys) throw { code: "PGRST202", message: "Function unavailable" };
  const args = keys.map((k) => body[k] ?? null);
  return (
    await tx.query(
      `select public.${name}(${args.map((_, i) => "$" + (i + 1)).join(",")}) result`,
      args,
    )
  ).rows[0].result;
}
async function rest(tx, url) {
  const table = url.pathname.split("/").at(-1);
  if (
    ![
      "products",
      "profiles",
      "tenants",
      "customers",
      "sales",
      "sale_items",
      "rep_holdings",
      "stockflow_movements",
    ].includes(table)
  )
    throw Error("Unknown table");
  const values = [],
    where = [],
    bind = (v) => {
      values.push(v);
      return "$" + values.length;
    };
  for (const [column, value] of url.searchParams) {
    if (["select", "order", "limit", "offset"].includes(column)) continue;
    if (column === "or") {
      const parts = value.slice(1, -1).split(",");
      where.push(
        "(" +
          parts
            .map((v) => {
              const m = /^([a-z_]+)\.ilike\.(.*)$/.exec(v);
              if (!m) throw Error("Invalid OR");
              return `${m[1]} ilike ${bind(m[2])}`;
            })
            .join(" or ") +
          ")",
      );
      continue;
    }
    if (!/^[a-z_]+$/.test(column)) throw Error("Invalid column");
    const m = /^(eq|lt|gte|lte|ilike|in|is)\.(.*)$/.exec(value);
    if (!m) throw Error("Invalid filter");
    if (m[1] === "is" && m[2] === "null") {
      where.push(`${column} is null`);
      continue;
    }
    if (m[1] === "in") {
      const parts = m[2].slice(1, -1).split(",");
      where.push(`${column} in (${parts.map(bind).join(",")})`);
    } else
      where.push(
        `${column} ${{ eq: "=", lt: "<", gte: ">=", lte: "<=", ilike: "ilike" }[m[1]]} ${bind(m[2])}`,
      );
  }
  const order = (url.searchParams.get("order") ?? "")
    .split(",")
    .filter(Boolean)
    .map((v) => {
      const [col, dir] = v.split(".");
      if (!/^[a-z_]+$/.test(col) || !["asc", "desc"].includes(dir))
        throw Error("Invalid order");
      return `${col} ${dir}`;
    })
    .join(",");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 200), 201),
    offset = Number(url.searchParams.get("offset") ?? 0);
  const rows = (
    await tx.query(
      `select * from public.${table}${where.length ? " where " + where.join(" and ") : ""}${order ? " order by " + order : ""} limit ${bind(limit)} offset ${bind(offset)}`,
      values,
    )
  ).rows;
  if (
    table === "sales" &&
    url.searchParams.get("select")?.includes("sale_items(")
  )
    for (const row of rows)
      row.sale_items = (
        await tx.query(
          "select i.*,jsonb_build_object('name',p.name) products from public.sale_items i join public.products p on p.id=i.product_id where sale_id=$1",
          [row.id],
        )
      ).rows;
  return rows;
}
await context.route("**/*", async (route) => {
  const request = route.request(),
    url = new URL(request.url());
  if (url.hostname === "127.0.0.1") return route.continue();
  if (!url.hostname.endsWith(".supabase.co")) return route.abort();
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };
  if (request.method() === "OPTIONS")
    return route.fulfill({ status: 204, headers });
  if (url.pathname === "/auth/v1/token") {
    const body = request.postDataJSON();
    if (!users[body.email] || body.password !== "fixture-only-password")
      return route.fulfill({
        status: 400,
        headers,
        body: JSON.stringify({
          error_code: "invalid_credentials",
          msg: "Invalid login credentials",
        }),
      });
    return route.fulfill({
      status: 200,
      headers,
      body: JSON.stringify(authResponse(body.email)),
    });
  }
  if (url.pathname === "/auth/v1/logout")
    return route.fulfill({ status: 204, headers });
  try {
    const token = request.headers()["authorization"]?.split(" ")[1];
    if (!token) throw { code: "42501", message: "Not authenticated" };
    const uid = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString(),
    ).sub;
    if (!Object.values(users).includes(uid))
      throw { code: "42501", message: "Not a fixture user" };
    const name = url.pathname.split("/").at(-1),
      body = request.method() === "POST" ? request.postDataJSON() : null;
    if (name === "stockflow_v2_sale" && rejectNextRetry) {
      rejectNextRetry = false;
      throw { code: "42501", message: "Session reauthentication required" };
    }
    const data = await db.transaction(async (tx) => {
      await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
        uid,
      ]);
      await tx.exec("set local role authenticated");
      return url.pathname.includes("/rpc/")
        ? rpc(tx, name, body)
        : rest(tx, url);
    });
    if (name === "stockflow_v2_sale" && dropNextSale) {
      dropNextSale = false;
      return route.abort("failed");
    }
    const single = request.headers()["accept"]?.includes("vnd.pgrst.object");
    if (single && (!Array.isArray(data) || data.length !== 1))
      return route.fulfill({
        status: 406,
        headers,
        body: JSON.stringify({ code: "PGRST116", message: "No single row" }),
      });
    return route.fulfill({
      status: 200,
      headers,
      body: JSON.stringify(single ? data[0] : (data ?? null)),
    });
  } catch (e) {
    return route.fulfill({
      status: 400,
      headers,
      body: JSON.stringify({
        code: e.code ?? "P0001",
        message: e.message ?? "Fixture query failed",
      }),
    });
  }
});
async function check(name, fn) {
  await fn();
  checks++;
  console.log("PASS " + name);
}
const page = await context.newPage();
await page.clock.install();
page.setDefaultTimeout(12000);
async function login() {
  await page.goto("http://127.0.0.1:4173/login/");
  await page.getByLabel("Email address").fill("owner@stockflow.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("fixture-only-password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.getByRole("heading", { name: "Good to see you, Tomi." }).waitFor();
  await page.getByText("₦600,000", { exact: true }).first().waitFor();
}
try {
  await check(
    "mobile/web login reaches an authoritative business dashboard (fixture Auth)",
    login,
  );
  await page.screenshot({ path: resolve(assets, "dashboard.png") });
  await check("first product and opening stock", async () => {
    await page
      .getByRole("button", { name: "Inventory", exact: true })
      .first()
      .click();
    await page
      .getByRole("button", { name: "Add product", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Product name").fill("Test Rice");
    await dialog.getByLabel("Cost per case").fill("1000");
    await dialog.getByLabel("Selling price").fill("1500");
    await dialog.getByLabel("Opening stock").fill("8");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    await page.getByRole("row").filter({ hasText: "Test Rice" }).waitFor();
  });
  await page.screenshot({ path: resolve(assets, "inventory.png") });
  await check("customer creation and customer-linked checkout", async () => {
    await page
      .getByRole("button", { name: "Customers", exact: true })
      .first()
      .click();
    await page
      .getByRole("button", { name: "Add customer", exact: true })
      .click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel("Customer name").fill("Ada Stores");
    await dialog.getByLabel("Phone", { exact: true }).fill("08033333333");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    await page
      .getByRole("article")
      .filter({ hasText: "Ada Stores" })
      .getByRole("button", { name: "Make a sale", exact: true })
      .click();
    await page.getByRole("button", { name: /available.*Test Rice/ }).click();
    await page.getByLabel("Quantity for Test Rice").fill("2");
    await page.screenshot({ path: resolve(assets, "pos.png") });
    await page
      .getByRole("button", { name: "Complete sale", exact: true })
      .evaluate((el) => {
        el.click();
        el.click();
      });
    await page.getByRole("dialog", { name: "Sale receipt" }).waitFor();
    await page.getByText("₦3,000", { exact: true }).first().waitFor();
    const s = (
      await db.query("select * from sales where customer_name='Ada Stores'")
    ).rows;
    assert.equal(s.length, 1);
    assert.ok(s[0].customer_id);
    const stock = (
      await db.query(
        "select warehouse_stock from products where name='Test Rice'",
      )
    ).rows[0].warehouse_stock;
    assert.equal(stock, 6);
    await page.getByRole("button", { name: "Close", exact: true }).click();
  });
  await check(
    "lost commit response, refresh and intervening access error still recover exactly one sale",
    async () => {
      await page.getByRole("button", { name: /available.*Test Rice/ }).click();
      await page.getByLabel("Customer", { exact: true }).fill("Timeout retry");
      dropNextSale = true;
      await page
        .getByRole("button", { name: "Complete sale", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Retry unconfirmed checkout" })
        .waitFor();
      await page.reload();
      rejectNextRetry = true;
      await page.getByRole("button", { name: "Retry unconfirmed checkout" }).click();
      await page.getByRole("alert").filter({hasText:"Your account does not have permission"}).waitFor();
      await page.getByRole("button", { name: "Retry unconfirmed checkout" }).waitFor();
      await page
        .getByRole("button", { name: "Retry unconfirmed checkout" })
        .click();
      await page.getByRole("dialog", { name: "Sale receipt" }).waitFor();
      assert.equal(
        (
          await db.query(
            "select count(*) n from sales where customer_name='Timeout retry'",
          )
        ).rows[0].n,
        1,
      );
      assert.equal(
        (
          await db.query(
            "select warehouse_stock from products where name='Test Rice'",
          )
        ).rows[0].warehouse_stock,
        5,
      );
      await page.getByRole("button", { name: "Close", exact: true }).click();
    },
  );
  await check(
    "offline checkout is disabled and reconnection is recoverable",
    async () => {
      await context.setOffline(true);
      await page.evaluate(() => window.dispatchEvent(new Event("offline")));
      assert.equal(
        await page
          .getByRole("button", { name: "Complete sale", exact: true })
          .isDisabled(),
        true,
      );
      await context.setOffline(false);
      await page.evaluate(() => window.dispatchEvent(new Event("online")));
    },
  );
  await check(
    "cancellation restores warehouse stock with a reason",
    async () => {
      await page
        .getByRole("button", { name: "Sales", exact: true })
        .first()
        .click();
      const row = page
        .locator(".sf-sale-actions")
        .filter({ hasText: "Ada Stores" });
      await row.getByRole("button", { name: "Cancel", exact: true }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel("Reason").fill("Unopened goods returned");
      await dialog
        .getByRole("button", { name: "Cancel sale", exact: true })
        .click();
      await dialog.waitFor({ state: "hidden" });
      assert.equal(
        (
          await db.query(
            "select warehouse_stock from products where name='Test Rice'",
          )
        ).rows[0].warehouse_stock,
        7,
      );
    },
  );
  await check(
    "a refreshed dashboard reconciles the sale and cancellation",
    async () => {
      await page.getByRole("button", { name: "Overview", exact: true }).click();
      await page.getByText("₦601,500", { exact: true }).first().waitFor();
    },
  );
  await check("product detail displays the actual stock movement journal", async () => {
    await page.getByRole("button", { name: "Inventory", exact: true }).first().click();
    await page.getByRole("button", { name: "Test Rice", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Test Rice" });
    await dialog.locator('.sf-movement').first().waitFor();
    assert.ok(await dialog.locator('.sf-movement').count() >= 4);
    assert.match(await dialog.innerText(), /Sale cancelled/);
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
  });
  await check("customer purchase history uses the linked customer record", async () => {
    await page.getByRole("button", { name: "Customers", exact: true }).first().click();
    const customer = page.locator('.sf-customer').filter({hasText:'Ada Stores'});
    await customer.getByRole("button", { name: "Purchase history" }).click();
    await page.getByText('Sales linked to Ada Stores').waitFor();
    await page.locator('.sf-sale-actions').filter({hasText:'Ada Stores'}).waitFor();
    assert.equal(await page.locator('.sf-sale-actions').filter({hasText:'Timeout retry'}).count(),0);
    await page.getByRole("button", { name: "Clear filter" }).click();
  });
  await check("SKU search finds the product without extra navigation", async () => {
    await page.getByRole("button", { name: "Make a sale", exact: true }).first().click();
    const search=page.getByPlaceholder('Search products or SKU');
    await search.fill('FLOUR50');
    await page.waitForFunction(()=>document.querySelectorAll('.sf-product-tile').length===1);
    await page.getByRole('button',{name:/available.*Flour 50kg/}).waitFor();
    assert.equal(await page.locator('.sf-product-tile').count(),1);
    await search.fill('');
  });
  await check(
    "phone navigation and cart are usable without horizontal overflow",
    async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole("button", { name: "Overview", exact: true }).last().click();
      await page.getByRole("heading", { name: "Good to see you, Tomi." }).waitFor();
      await page.getByText("₦601,500", { exact: true }).first().waitFor();
      await page.screenshot({ path: resolve(assets, "mobile-dashboard.png") });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await page.getByRole("button", { name: "Sell", exact: true }).click();
      await page.getByRole("button", { name: /available.*Test Rice/ }).click();
      await page.locator(".sf-cart").scrollIntoViewIfNeeded();
      await page.screenshot({ path: resolve(assets, "mobile-pos.png") });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
    },
  );
  await check("hostile customer text remains text and cannot execute SQL or HTML", async () => {
    await page.getByRole('button',{name:'Customers',exact:true}).last().click();
    await page.getByRole('button',{name:'Add customer',exact:true}).click();
    const dialog=page.getByRole('dialog');
    const hostile=`<img src=x onerror="globalThis.__stockflowXss=1"> O'Reilly'); DROP TABLE products;--`;
    await dialog.getByLabel('Customer name').fill(hostile);
    await dialog.getByRole('button',{name:'Save',exact:true}).click();
    await dialog.waitFor({state:'hidden'});
    await page.getByRole('heading',{name:hostile,exact:true}).waitFor();
    assert.equal(await page.locator('img[src="x"]').count(),0);
    assert.equal(await page.evaluate(()=>globalThis.__stockflowXss),undefined);
    assert.equal((await db.query('select count(*) n from products')).rows[0].n,10);
  });
  await check("idle lock requires reauthentication and rechecks the business profile", async () => {
    await page.clock.fastForward(320000);
    await page.getByRole('heading',{name:'Welcome back, Tomi',exact:true}).waitFor();
    await page.getByLabel('Password',{exact:true}).fill('fixture-only-password');
    await page.getByRole('button',{name:'Unlock',exact:true}).click();
    await page.getByRole('button',{name:'Account',exact:true}).last().waitFor();
    assert.equal(await page.getByRole('heading',{name:'Welcome back, Tomi',exact:true}).count(),0);
  });
  await check("sign-out clears access to the workspace", async () => {
    await page
      .getByRole("button", { name: "Account", exact: true })
      .last()
      .click();
    await page
      .getByRole("button", { name: "Sign out on this device", exact: true })
      .click();
    await page.waitForURL(/\/login\/?$/);
    await page.goto("http://127.0.0.1:4173/home/");
    await page.waitForURL(/\/login\/?$/);
  });
  await check("rep phone sale uses allocated stock and pending credit without changing dispatch debt", async () => {
    await page.getByLabel("Email address").fill("rep@stockflow.test");
    await page.getByLabel("Password", { exact: true }).fill("fixture-only-password");
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.getByRole("heading", { name: "Good to see you, Test." }).waitFor();
    await page.getByRole("button", { name: "Inventory", exact: true }).last().click();
    assert.equal(await page.getByRole("button", { name: "Add product", exact: true }).count(),0);
    const before=(await db.query('select quantity,debt_amount from rep_holdings where rep_id=$1 and product_id=$2',[rep,flour])).rows[0];
    const warehouse=(await db.query('select warehouse_stock from products where id=$1',[flour])).rows[0].warehouse_stock;
    await page.getByRole("button", { name: "Sell", exact: true }).click();
    await page.getByRole("button", { name: /available.*Flour 50kg/ }).click();
    await page.getByLabel("Customer", { exact: true }).fill("Rep phone fixture");
    assert.equal(await page.getByLabel(/Payment method/).isDisabled(),true);
    await page.getByRole("button", { name: "Complete sale", exact: true }).click();
    await page.getByRole("dialog", { name: "Sale receipt" }).waitFor();
    const sale=(await db.query("select status,stock_source,rep_id from sales where customer_name='Rep phone fixture'")).rows[0];
    assert.deepEqual(sale,{status:'pending',stock_source:'rep',rep_id:rep});
    const after=(await db.query('select quantity,debt_amount from rep_holdings where rep_id=$1 and product_id=$2',[rep,flour])).rows[0];
    assert.equal(after.quantity,before.quantity-1);assert.equal(after.debt_amount,before.debt_amount);
    assert.equal((await db.query('select warehouse_stock from products where id=$1',[flour])).rows[0].warehouse_stock,warehouse);
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("button", { name: "Account", exact: true }).last().click();
    await page.getByRole("button", { name: "Sign out on this device", exact: true }).click();
    await page.waitForURL(/\/login\/?$/);
  });
  await check("manager can see the rep sale while recognised revenue remains unchanged", async () => {
    await page.getByLabel("Email address").fill("manager@stockflow.test");
    await page.getByLabel("Password", { exact: true }).fill("fixture-only-password");
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.getByRole("heading", { name: "Good to see you, Test." }).waitFor();
    await page.getByText("₦601,500", { exact: true }).first().waitFor();
    await page.getByRole("button", { name: "Sales", exact: true }).last().click();
    await page.locator('.sf-sale-actions').filter({hasText:'Rep phone fixture'}).waitFor();
  });
  assert.deepEqual(errors, []);
  await writeFile(
    resolve(root, "docs/v2/browser-results.json"),
    JSON.stringify(
      {
        date: new Date().toISOString(),
        checks,
        scope:
          "Isolated PostgreSQL contract fixture, intercepted Auth/PostgREST; no live or native-device certification",
        pageErrors: errors,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `${checks} browser workflow checks passed. Screenshots are actual V2 UI with explicitly fictional fixture data.`,
  );
} catch (e) {
  await page.screenshot({
    path: "/tmp/stockflow-ui-failure.png",
    fullPage: true,
  });
  console.error((await page.locator("body").innerText()).slice(0, 1800));
  throw e;
} finally {
  await browser.close();
  server.close();
  await db.close();
}
