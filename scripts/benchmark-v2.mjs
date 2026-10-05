import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
// Query measurements on a synthetic WASM PostgreSQL snapshot, NOT capacity
// certification for a production Supabase instance or concurrent sessions.
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
const db = new PGlite({ extensions: { pg_trgm } });
await db.exec(
  await readFile(
    new URL("../tests/fixtures/v2-schema.sql", import.meta.url),
    "utf8",
  ),
);
const migration = (
  await readdir(new URL("../supabase/migrations/", import.meta.url))
).find((n) => n.endsWith("_stockflow_v2_integrity.sql"));
await db.exec(
  await readFile(
    new URL("../supabase/migrations/" + migration, import.meta.url),
    "utf8",
  ),
);
const owner = "20000000-0000-4000-8000-000000000001",
  tenant = "10000000-0000-4000-8000-000000000001",
  count = 100000;
console.log("Preparing synthetic query snapshot: 100,000 products and sales.");
await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
await db.query(
  `insert into products(id,tenant_id,name,sku_code,buy_price,sell_price,warehouse_stock)
 select md5('bench-product-'||g)::uuid,$1,'Benchmark product '||lpad(g::text,6,'0'),'BENCH-'||g,100,150,10 from generate_series(1,$2) g`,
  [tenant, count],
);
await db.query(
  `insert into sales(id,tenant_id,rep_id,customer_name,total_cases,total_value,status,stock_source,payment_method,created_at)
 select md5('bench-sale-'||g)::uuid,$1,$2,'Benchmark customer',1,150,'completed','warehouse','cash',now()-((g%30)::text||' days')::interval from generate_series(1,$3) g`,
  [tenant, owner, count],
);
await db.query(
  `insert into sale_items(sale_id,product_id,quantity,unit_price,buy_price_snapshot,list_price)
 select md5('bench-sale-'||g)::uuid,md5('bench-product-'||g)::uuid,1,150,100,150 from generate_series(1,$1) g`,
  [count],
);
await db.exec("analyze products;analyze sales;analyze sale_items;");
const queries = [
  [
    "product browse first 20",
    "select id,name from products where tenant_id=$1 and is_active order by name,id limit 20",
    [tenant],
  ],
  [
    "substring product search",
    "select id,name from products where tenant_id=$1 and is_active and (name ilike '%09999%' or sku_code ilike '%09999%') order by name,id limit 20",
    [tenant],
  ],
  [
    "sales first 20",
    "select id,total_value from sales where tenant_id=$1 order by created_at desc,id limit 20",
    [tenant],
  ],
  [
    "30-day dashboard",
    "select stockflow_v2_dashboard(now()-interval '30 days',now()+interval '1 second')",
    [],
  ],
];
const results = [];
for (const [name, sql, args] of queries) {
  const plan = (await db.query("explain (analyze,format json) " + sql, args))
    .rows[0]["QUERY PLAN"];
  const times = [];
  for (let i = 0; i < 3; i++) {
    const start = performance.now();
    await db.query(sql, args);
    times.push(Math.round((performance.now() - start) * 100) / 100);
  }
  results.push({ name, elapsed_ms: times, explain: plan });
  console.log(name + ": " + times.join(", ") + " ms");
}
await writeFile(
  new URL("../docs/v2/performance-results.json", import.meta.url),
  JSON.stringify(
    {
      date: new Date().toISOString(),
      scope:
        "PGlite synthetic query snapshot; includes journal trigger overhead on setup. Not real Supabase latency/load/concurrency.",
      products: count,
      sales: count,
      results,
    },
    null,
    2,
  ) + "\n",
);
await db.close();
