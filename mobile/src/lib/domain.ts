export type Product = {
  id: string;
  name: string;
  sku_code: string | null;
  buy_price: number;
  sell_price: number;
  warehouse_stock: number;
  emoji?: string;
  is_active: boolean;
  available?: number;
};
export type CartLine = { product: Product; quantity: number; price: string };
export type Profile = {
  id: string;
  tenant_id: string;
  full_name: string;
  role: "owner" | "manager" | "rep" | "super_admin";
  is_active: boolean;
  branch?: string;
};
export type Sale = {
  id: string;
  customer_name: string;
  total_cases: number;
  total_value: number;
  status: string;
  stock_source?: string;
  payment_method?: string;
  created_at: string;
  rep_id?: string;
  sale_items?: {
    product_id: string;
    quantity: number;
    unit_price: number;
    products?: { name: string };
  }[];
};
export type Customer = {
  id: string;
  name: string;
  phone: string | null;
  address?: string;
  credit_limit?: number;
};
export type Summary = {
  revenue: number;
  units: number;
  transactions: number;
  gross_profit: number | null;
  pending_sales: number;
  missing_cost_snapshots: number;
  trend: { day: string; revenue: number }[];
  top_products: { name: string; units: number; revenue: number }[];
  payment_breakdown: { method: string; amount: number }[];
};

// Financial inputs are decimal strings, converted to exact minor units before
// summing. The server recalculates all authoritative totals independently.
export function minorUnits(value: string | number): number {
  const s = String(value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s))
    throw new Error("Enter a price with at most two decimal places.");
  const [whole, fraction = ""] = s.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents > 10000000000)
    throw new Error("This price is too large.");
  return cents;
}
export function cartTotal(lines: CartLine[]): number {
  let cents = 0;
  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0)
      throw new Error("Quantity must be a positive whole number.");
    cents += minorUnits(line.price) * line.quantity;
    if (!Number.isSafeInteger(cents))
      throw new Error("This sale is too large.");
  }
  return cents / 100;
}
export function searchTerm(value: string): string {
  return value
    .trim()
    .slice(0, 100)
    .replace(/[(),%_*\\]/g, " ");
}
export function lagosRange(
  period: "today" | "week" | "month",
  now = new Date(),
) {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const start = new Date(`${date}T00:00:00+01:00`);
  if (period === "week") start.setUTCDate(start.getUTCDate() - 6);
  if (period === "month") start.setUTCDate(start.getUTCDate() - 29);
  return { from: start.toISOString(), to: now.toISOString() };
}
export function friendlyError(error: unknown): string {
  const e = error as { code?: string; message?: string; name?: string };
  if (e?.name === "PendingStorageError")
    return "StockFlow could not safely save or recover this pending operation. Keep this app’s data and try again. Do not create a replacement transaction.";
  if (e?.name === "OperationSessionError")
    return "Your signed-in account changed. Sign in to the original account to recover this operation.";
  if (e?.code === "PGRST202")
    return "StockFlow V2 is being prepared for this business. Please use your existing dashboard until the upgrade is enabled.";
  if (e?.code === "42501")
    return "Your account does not have permission for this action. Ask your business owner for help.";
  if (e?.code === "23505")
    return "This SKU or record already exists. Use a different code.";
  const message = e?.message ?? "";
  if (/stock changed|insufficient/i.test(message))
    return "Available stock has changed. Refresh, check quantities and try again.";
  if (/different operation/.test(message))
    return "A previous checkout needs to be resolved. Retry it before changing the cart.";
  if (/below cost|invalid price/.test(message))
    return "Check the selling price. It must be valid and cover the product cost.";
  if (/historical sale/i.test(message))
    return "This older sale needs a stock reconciliation. Ask your manager to review it.";
  if (
    /failed to fetch|fetch failed|network|timeout|load failed/i.test(message) ||
    error instanceof TypeError
  )
    return "We could not confirm this request. Check your connection and retry the same request.";
  return "We could not complete this action. Please try again or contact your business owner.";
}

// RFC 4180 parsing, including commas, escaped quotes and multiline fields.
export function parseProductsCsv(text: string) {
  if (text.length > 500000)
    throw new Error("Choose a CSV smaller than 500 KB.");
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (quoted) throw new Error("A quoted field is not closed. Check your CSV.");
  row.push(field);
  if (row.some((x) => x.trim())) rows.push(row);
  const headers = (rows.shift() ?? []).map((h) =>
    h
      .replace(/^\uFEFF/, "")
      .trim()
      .toLowerCase(),
  );
  for (const name of ["name", "buy_price", "sell_price"])
    if (!headers.includes(name)) throw new Error(`Missing column: ${name}`);
  if (rows.length === 0 || rows.length > 200)
    throw new Error("Import between 1 and 200 products per CSV.");
  const seen = new Set<string>();
  return rows.map((cells, i) => {
    if (cells.length !== headers.length)
      throw new Error(`Row ${i + 2}: column count does not match the header.`);
    const value = (name: string) => cells[headers.indexOf(name)]?.trim() ?? "";
    const name = value("name"),
      sku = value("sku_code"),
      stock = Number(value("opening_stock") || 0);
    if (!name || name.length > 200)
      throw new Error(`Row ${i + 2}: enter a product name.`);
    const buy = minorUnits(value("buy_price")) / 100,
      sell = minorUnits(value("sell_price")) / 100;
    if (sell <= 0 || !Number.isInteger(stock) || stock < 0 || stock > 1000000)
      throw new Error(`Row ${i + 2}: check price and opening stock.`);
    if (sku && seen.has(sku.toLowerCase()))
      throw new Error(`Row ${i + 2}: duplicate SKU ${sku}.`);
    if (sku.length > 80) throw new Error(`Row ${i + 2}: SKU is too long.`);
    if (sku) seen.add(sku.toLowerCase());
    return {
      name,
      buy_price: buy,
      sell_price: sell,
      sku_code: sku || null,
      opening_stock: stock,
    };
  });
}
