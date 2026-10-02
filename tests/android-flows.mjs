import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

// Runs against the existing isolated PostgreSQL/Auth browser fixture. These are
// phone UI checks, not physical Android camera, Android lifecycle or live Auth QA.
export async function runAndroidChecks({ page, db, owner, check, root, dropMutation }) {
  const output = resolve(root, "docs/android");
  await mkdir(output, { recursive: true });
  const navigation = () => page.getByRole("navigation", { name: "Mobile navigation" });
  const go = async (name) => navigation().getByRole("button", { name, exact: true }).click();
  const more = async (name) => {
    await go("More");
    await page.getByRole("dialog", { name: "More from StockFlow" }).getByRole("button", { name, exact: true }).click();
  };
  const noOverflow = async () => {
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      "Phone content must fit without horizontal document scrolling");
  };
  const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0];
  const closeDialog = async () => page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  // The preceding regression scenario ends as a manager; change accounts through
  // the same UI the user sees so these checks do not inject an owner session.
  await more("Account");
  await page.getByRole("button", { name: "Sign out on this device", exact: true }).click();
  await page.waitForURL(/\/login\/?$/);
  await page.getByLabel("Email address").fill("owner@stockflow.test");
  await page.getByLabel("Password", { exact: true }).fill("fixture-only-password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.getByRole("heading", { name: "Good to see you, Tomi." }).waitFor();
  await page.locator(".sf-metrics").waitFor();

  await check("Android phone navigation keeps five destinations and dismisses More without leaving the screen", async () => {
    assert.equal(await navigation().getByRole("button").count(), 5);
    await go("More");
    const dialog = page.getByRole("dialog", { name: "More from StockFlow" });
    await dialog.getByRole("button", { name: "Customers", exact: true }).waitFor();
    await dialog.getByRole("button", { name: "Attention", exact: true }).waitFor();
    await dialog.getByRole("button", { name: "Account", exact: true }).waitFor();
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    await page.getByRole("heading", { name: "Good to see you, Tomi." }).waitFor();
    await noOverflow();
    await page.screenshot({ path: resolve(output, "android-overview.png") });
  });

  await check("Android inventory at 360 and 390 pixels opens actual stock history without horizontal scrolling", async () => {
    for (const width of [360, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await go("Inventory");
      await page.getByRole("button", { name: "Test Rice", exact: true }).waitFor();
      await noOverflow();
      await page.getByRole("button", { name: "Test Rice", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Test Rice" });
      await dialog.locator(".sf-movement").first().waitFor();
      assert.match(await dialog.innerText(), /Sale cancelled/);
      const box = await dialog.boundingBox();
      assert.ok(box && box.x >= 0 && box.x + box.width <= width + 1,
        "Product detail must fit within the phone viewport");
      await closeDialog();
    }
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.getByRole("heading", { name: "Every case, accounted for.", exact: true }).waitFor();
    await page.waitForFunction(() => window.scrollY === 0);
    await page.screenshot({ path: resolve(output, "android-inventory.png") });
  });

  await check("Android search distinguishes no matches from an empty business and Clear search restores products", async () => {
    const search = page.getByRole("textbox", { name: "Search products or SKU" });
    await search.fill("android-product-does-not-exist");
    await page.getByRole("heading", { name: "No matching products", exact: true }).waitFor();
    assert.equal(await page.getByRole("heading", { name: "Start with your first product", exact: true }).count(), 0);
    await page.locator(".sf-search").getByRole("button", { name: "Clear search", exact: true }).click();
    await page.getByRole("button", { name: "Test Rice", exact: true }).waitFor();
  });

  await check("Android review sale and Back to products retain quantities and the customer picker can cancel safely", async () => {
    await go("Sell");
    await page.getByRole("button", { name: /available.*Test Rice/ }).click();
    await page.getByRole("button", { name: /Review sale/ }).click();
    await page.getByLabel("Quantity for Test Rice").fill("2");
    await page.getByRole("button", { name: "Back to products", exact: true }).click();
    await page.getByRole("button", { name: /available.*Test Rice/ }).waitFor();
    await page.getByRole("button", { name: /Review sale/ }).click();
    assert.equal(await page.getByLabel("Quantity for Test Rice").inputValue(), "2");
    await page.getByRole("button", { name: "Choose customer", exact: true }).click();
    const picker = page.getByRole("dialog", { name: "Find a customer" });
    await picker.waitFor();
    await page.keyboard.press("Escape");
    await picker.waitFor({ state: "hidden" });
    assert.equal(await page.getByLabel("Quantity for Test Rice").inputValue(), "2");
    await page.getByLabel("Quantity for Test Rice").fill("1");
  });

  const customerId = await scalar("select id from customers where name='Ada Stores'");
  await check("Android POS looks up a customer by phone and preserves the linked customer record", async () => {
    await page.getByRole("button", { name: "Choose customer", exact: true }).click();
    const picker = page.getByRole("dialog", { name: "Find a customer" });
    await picker.getByRole("textbox", { name: "Search customers by name or phone", exact: true }).fill("08033333333");
    await page.waitForFunction(() => document.querySelectorAll(".sf-customer-options button").length === 1);
    await picker.getByRole("button", { name: /Ada Stores/ }).click();
    await picker.waitFor({ state: "hidden" });
    assert.equal(await page.getByLabel("Customer", { exact: true }).inputValue(), "Ada Stores");
  });

  const saleCountBefore = Number(await scalar("select count(*) from sales"));
  const riceId = await scalar("select id from products where name='Test Rice'");
  const stockBefore = Number(await scalar("select warehouse_stock from products where id=$1", [riceId]));
  await check("Android cash checkout rejects insufficient cash and calculates change only for cash", async () => {
    await page.getByLabel("Payment method", { exact: true }).selectOption("cash");
    const cash = page.getByLabel("Cash received (₦)", { exact: true });
    await cash.fill("1000");
    await page.getByRole("button", { name: "Complete sale", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Cash received is below the sale total." }).first().waitFor();
    assert.equal(Number(await scalar("select count(*) from sales")), saleCountBefore);
    assert.equal(Number(await scalar("select warehouse_stock from products where id=$1", [riceId])), stockBefore);
    await cash.fill("2000");
    const change = page.getByText("Change due", { exact: true }).locator("..");
    await change.getByText("₦500", { exact: true }).waitFor();
    await page.getByLabel("Payment method", { exact: true }).selectOption("transfer");
    assert.equal(await page.getByText("Change due", { exact: true }).count(), 0);
    await page.getByLabel("Payment method", { exact: true }).selectOption("cash");
    await cash.fill("2000");
    await noOverflow();
    await page.screenshot({ path: resolve(output, "android-checkout.png") });
  });

  await check("Android checkout freezes its submitted cart and records one linked sale, stock movement and receipt", async () => {
    let releaseRequest;
    const held = new Promise((resolveHeld) => { releaseRequest = resolveHeld; });
    let sawRequest;
    const requested = new Promise((resolveRequest) => { sawRequest = resolveRequest; });
    const pattern = "**/rest/v1/rpc/stockflow_v2_sale";
    const hold = async (route) => {
      sawRequest();
      await held;
      await route.fallback();
    };
    await page.route(pattern, hold);
    try {
      await page.getByRole("button", { name: "Complete sale", exact: true }).click();
      let requestTimeout;
      try {
        await Promise.race([
          requested,
          new Promise((_, reject) => {
            requestTimeout = setTimeout(() => reject(new Error("Checkout did not send a request")), 12000);
          }),
        ]);
      } finally {
        clearTimeout(requestTimeout);
      }
      assert.equal(await page.getByLabel("Quantity for Test Rice").isDisabled(), true);
      assert.equal(await page.getByLabel("Customer", { exact: true }).isDisabled(), true);
      assert.equal(await page.getByLabel("Payment method", { exact: true }).isDisabled(), true);
      assert.equal(await page.getByRole("button", { name: "Remove Test Rice", exact: true }).isDisabled(), true);
      releaseRequest();
      await page.getByRole("dialog", { name: "Sale receipt" }).waitFor();
    } finally {
      releaseRequest();
      await page.unroute(pattern, hold);
    }
    const sale = (await db.query(
      "select id,customer_id,total_value,total_cases,status,payment_method from sales where rep_id=$1 and customer_id=$2 order by created_at desc limit 1",
      [owner, customerId],
    )).rows[0];
    assert.ok(sale, "The phone sale must retain a real customer id");
    assert.equal(Number(await scalar("select count(*) from sales")), saleCountBefore + 1);
    assert.equal(Number(sale.total_value), 1500);
    assert.equal(Number(sale.total_cases), 1);
    assert.equal(sale.status, "completed");
    assert.equal(sale.payment_method, "cash");
    assert.equal(Number(await scalar("select warehouse_stock from products where id=$1", [riceId])), stockBefore - 1);
    const dialog = page.getByRole("dialog", { name: "Sale receipt" });
    assert.match(await dialog.innerText(), /Ada Stores/);
    assert.match(await dialog.innerText(), /Test Rice/);
    assert.match(await dialog.innerText(), /₦1,500/);
    await page.screenshot({ path: resolve(output, "android-receipt.png") });
    await closeDialog();
  });

  await check("Android More reaches customer history, alerts and account without losing navigation", async () => {
    await more("Customers");
    const search = page.getByRole("textbox", { name: "Search customers by name or phone", exact: true });
    await search.fill("Ada Stores");
    const customer = page.getByRole("article").filter({ hasText: "Ada Stores" });
    const historyLoaded = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname.endsWith("/rest/v1/sales") &&
        url.searchParams.get("customer_id") === `eq.${customerId}` && response.status() === 200;
    });
    await customer.getByRole("button", { name: "Purchase history", exact: true }).click();
    await historyLoaded;
    await page.getByText("Sales linked to Ada Stores").waitFor();
    await page.locator(".sf-loading").waitFor({ state: "hidden" });
    await page.locator(".sf-sale-actions").filter({ hasText: "Ada Stores" }).first().waitFor();
    assert.ok(await page.locator(".sf-sale-actions").filter({ hasText: "Ada Stores" }).count() >= 1);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.waitForFunction(() => window.scrollY === 0);
    await noOverflow();
    await page.screenshot({ path: resolve(output, "android-sales.png") });
    await more("Attention");
    await page.getByRole("heading", { name: "Keep your shelves ready.", exact: true }).waitFor();
    await more("Account");
    await page.getByRole("heading", { name: "Business and account", exact: true }).waitFor();
    await page.getByRole("button", { name: "Lock workspace", exact: true }).waitFor();
    await noOverflow();
    await page.screenshot({ path: resolve(output, "android-account.png") });
  });

  await check("Android unlock preserves a same-account draft with fresh stock, but discards it when the role changes", async () => {
    const originalStock = Number(await scalar("select warehouse_stock from products where id=$1", [riceId]));
    const originalRole = await scalar("select role from profiles where id=$1", [owner]);
    const lock = async () => {
      await more("Account");
      await page.getByRole("button", { name: "Lock workspace", exact: true }).click();
      await page.getByRole("heading", { name: "Welcome back, Tomi", exact: true }).waitFor();
    };
    const unlock = async () => {
      await page.getByLabel("Password", { exact: true }).fill("fixture-only-password");
      await page.getByRole("button", { name: "Unlock", exact: true }).click();
      await navigation().waitFor();
    };
    try {
      await go("Sell");
      await page.getByRole("button", { name: /available.*Test Rice/ }).click();
      await page.getByRole("button", { name: /Review sale/ }).click();
      await page.getByLabel("Quantity for Test Rice").fill("2");
      await page.getByRole("button", { name: "Choose customer", exact: true }).click();
      await page.getByRole("dialog", { name: "Find a customer" }).getByRole("button", { name: /Ada Stores/ }).click();
      await lock();
      // This is a disposable SQL fixture: emulate another terminal changing stock
      // while the phone is locked, then restore it in finally.
      await db.query("update products set warehouse_stock=1 where id=$1", [riceId]);
      await unlock();
      await go("Sell");
      await page.getByRole("button", { name: /Review sale/ }).click();
      assert.equal(await page.getByLabel("Quantity for Test Rice").inputValue(), "2");
      assert.equal(await page.getByLabel("Quantity for Test Rice").getAttribute("max"), "1");
      assert.equal(await page.getByLabel("Customer", { exact: true }).inputValue(), "Ada Stores");
      await page.getByText("Linked to customer purchase history", { exact: true }).waitFor();
      await page.getByRole("alert").filter({ hasText: "Stock has changed. Reduce or remove items that exceed availability." }).waitFor();
      assert.equal(await page.getByRole("button", { name: "Complete sale", exact: true }).isDisabled(), true);
      await lock();
      await db.query("update profiles set role='rep' where id=$1", [owner]);
      await unlock();
      await page.getByRole("heading", { name: "Good to see you, Tomi." }).waitFor();
      await go("Sell");
      assert.equal(await page.getByRole("button", { name: /Review sale/ }).count(), 0);
      assert.equal(await page.getByLabel("Quantity for Test Rice").count(), 0);
      assert.equal(await page.getByLabel("Customer", { exact: true }).inputValue(), "");
      assert.equal(await page.getByLabel("Payment method", { exact: true }).inputValue(), "credit");
      assert.equal(await page.getByLabel("Payment method", { exact: true }).isDisabled(), true);
      assert.equal(Number(await scalar("select count(*) from sales")), saleCountBefore + 1);
    } finally {
      await db.query("update products set warehouse_stock=$1 where id=$2", [originalStock, riceId]);
      await db.query("update profiles set role=$1 where id=$2", [originalRole, owner]);
    }
    // Re-read the restored owner role using the same lock and unlock UI.
    await lock();
    await unlock();
    await page.getByRole("heading", { name: "Good to see you, Tomi." }).waitFor();
  });

  await check("Android recovers a committed customer request after losing its response and reopening the form exactly once", async () => {
    assert.equal(typeof dropMutation, "function", "The fixture must supply a post-commit response-loss hook");
    const customerName = "Android recovery customer";
    const customerCountBefore = Number(await scalar("select count(*) from customers"));
    await more("Customers");
    await page.getByRole("button", { name: "Add customer", exact: true }).click();
    let dialog = page.getByRole("dialog", { name: "Add customer" });
    await dialog.getByLabel("Customer name", { exact: true }).fill(customerName);
    await dialog.getByLabel("Phone", { exact: true }).fill("08090909090");
    dropMutation("stockflow_v2_customer");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await dialog.getByRole("button", { name: "Retry original change", exact: true }).waitFor();
    assert.equal(Number(await scalar("select count(*) from customers where name=$1", [customerName])), 1);
    await closeDialog();
    await page.getByRole("button", { name: "Add customer", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "Add customer" });
    await dialog.getByRole("button", { name: "Retry original change", exact: true }).waitFor();
    assert.equal(await dialog.getByLabel("Customer name", { exact: true }).isDisabled(), true);
    await dialog.getByRole("button", { name: "Retry original change", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    assert.equal(Number(await scalar("select count(*) from customers")), customerCountBefore + 1);
    assert.equal(Number(await scalar("select count(*) from customers where name=$1", [customerName])), 1);
    const restored = (await db.query("select name,phone from customers where name=$1", [customerName])).rows[0];
    assert.deepEqual(restored, { name: customerName, phone: "08090909090" });
    await page.getByRole("heading", { name: customerName, exact: true }).waitFor();
  });
  await check("Android Next sale from a historical receipt navigates to POS without creating a transaction", async () => {
    const countBefore = Number(await scalar("select count(*) from sales"));
    await go("Sales");
    await page.locator(".sf-sale-actions").filter({ hasText: "Ada Stores" }).first().locator(".sf-sale-row").click();
    const receipt = page.getByRole("dialog", { name: "Sale receipt" });
    await receipt.waitFor();
    await receipt.getByRole("button", { name: "Next sale", exact: true }).click();
    await receipt.waitFor({ state: "hidden" });
    await page.getByRole("heading", { name: "Find it. Add it. Sell it.", exact: true }).waitFor();
    assert.equal(await navigation().getByRole("button", { name: "Sell", exact: true }).getAttribute("aria-current"), "page");
    assert.equal(Number(await scalar("select count(*) from sales")), countBefore);
  });

  await check("Android uses its bundled typography and keeps the phone layout usable in dark appearance", async () => {
    await more("Account");
    await page.evaluate(() => document.fonts.ready);
    assert.match(await page.evaluate(() => getComputedStyle(document.body).fontFamily), /DM Sans/);
    await page.locator(".sf-account-appearance").getByRole("button", {name:"Toggle dark mode"}).click();
    await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
    await go("Overview");
    await page.locator(".sf-metrics").waitFor();
    await noOverflow();
    await page.screenshot({path: resolve(output, "android-dark.png")});
    await more("Account");
    await page.locator(".sf-account-appearance").getByRole("button", {name:"Toggle dark mode"}).click();
    await page.waitForFunction(() => document.documentElement.dataset.theme === "light");
  });

}
