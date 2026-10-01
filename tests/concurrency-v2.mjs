// Destructive ONLY to a disposable, local CI database. Never accepts a remote URL.
import pg from 'pg';
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const connectionString = process.env.STOCKFLOW_TEST_DATABASE_URL;
if (!connectionString) throw Error('Set STOCKFLOW_TEST_DATABASE_URL to the disposable local stockflow_v2_test database.');
const url = new URL(connectionString);
if (!['localhost','127.0.0.1','[::1]'].includes(url.hostname) || url.pathname !== '/stockflow_v2_test') {
  throw Error('Concurrency tests require a LOCAL database named stockflow_v2_test. Remote/production targets are refused.');
}
const { Client } = pg;
const admin = new Client({ connectionString });
await admin.connect();
const owner='20000000-0000-4000-8000-000000000001', rep='20000000-0000-4000-8000-000000000002';
const tenant='10000000-0000-4000-8000-000000000001', flour='30000000-0000-4000-8000-000000000001', sugar='30000000-0000-4000-8000-000000000002';
const results=[];
const scalar=async(sql,args=[])=>Object.values((await admin.query(sql,args)).rows[0])[0];
const line=(product_id,quantity=1,unit_price=15000)=>({product_id,quantity,unit_price});
async function terminal(sql,args){
  const client=new Client({connectionString});
  await client.connect();
  try {
    await client.query('begin');
    await client.query("set local statement_timeout='10s'; set local lock_timeout='8s'; set local role authenticated");
    await client.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);
    const value=Object.values((await client.query(sql,args)).rows[0])[0];
    await client.query('commit');
    return value;
  } catch(error) { await client.query('rollback'); throw error; }
  finally { await client.end(); }
}
const sale=(key,items)=>terminal('select stockflow_v2_sale($1,$2,null,$3::jsonb,$4,null)',[key,'Concurrency fixture',JSON.stringify(items),'cash']);
async function check(name,fn){await fn();results.push({name,status:'passed'});console.log(`PASS ${name}`);}
try {
  // A fresh fixture is required; do not reset a populated database.
  assert.equal(Number(await scalar("select count(*) from pg_tables where schemaname='public'")),0,'Refusing a populated database');
  await admin.query(await readFile(new URL('./fixtures/v2-schema.sql',import.meta.url),'utf8'));
  const migration=(await readdir(new URL('../supabase/migrations/',import.meta.url))).find(n=>n.endsWith('_stockflow_v2_integrity.sql'));
  await admin.query(await readFile(new URL(`../supabase/migrations/${migration}`,import.meta.url),'utf8'));
  await check('two independent terminals cannot both sell the last unit',async()=>{
    await admin.query('update products set warehouse_stock=1 where id=$1',[flour]);
    const before=Number(await scalar('select count(*) from sales'));
    const attempts=await Promise.allSettled([sale(randomUUID(),[line(flour)]),sale(randomUUID(),[line(flour)])]);
    assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);
    assert.match(attempts.find(r=>r.status==='rejected').reason.message,/Stock changed/);
    assert.equal(await scalar('select warehouse_stock from products where id=$1',[flour]),0);
    assert.equal(Number(await scalar('select count(*) from sales')),before+1);
  });
  await check('concurrent retries with the same key create one sale',async()=>{
    await admin.query('update products set warehouse_stock=10 where id=$1',[flour]);
    const before=Number(await scalar('select count(*) from sales')), key=randomUUID();
    const ids=await Promise.all([sale(key,[line(flour)]),sale(key,[line(flour)])]);
    assert.equal(ids[0],ids[1]);
    assert.equal(Number(await scalar('select count(*) from sales')),before+1);
    assert.equal(await scalar('select warehouse_stock from products where id=$1',[flour]),9);
  });
  await check('opposite cart orders use stable product locks',async()=>{
    await admin.query('update products set warehouse_stock=10 where id=any($1::uuid[])',[[flour,sugar]]);
    await Promise.all([sale(randomUUID(),[line(flour),line(sugar,1,9500)]),sale(randomUUID(),[line(sugar,1,9500),line(flour)])]);
    assert.deepEqual((await admin.query('select warehouse_stock from products where id=any($1::uuid[]) order by id',[[flour,sugar]])).rows.map(r=>r.warehouse_stock),[8,8]);
  });
  await check('simultaneous cancellation restores stock only once',async()=>{
    await admin.query('update products set warehouse_stock=10 where id=$1',[flour]);
    const id=await sale(randomUUID(),[line(flour,2)]);
    await Promise.all([terminal('select stockflow_v2_cancel_sale($1,$2)',[id,'Duplicate terminal cancellation']),terminal('select stockflow_v2_cancel_sale($1,$2)',[id,'Duplicate terminal cancellation'])]);
    assert.equal(await scalar('select warehouse_stock from products where id=$1',[flour]),10);
    assert.equal(Number(await scalar("select count(*) from stockflow_audit where object_id=$1 and action='sale_cancelled'",[id])),1);
  });
  await check('competing adjustments reject the stale expected count',async()=>{
    const attempts=await Promise.allSettled([terminal('select stockflow_v2_adjust_stock($1,$2,1,10,$3)',[randomUUID(),flour,'Physical count A']),terminal('select stockflow_v2_adjust_stock($1,$2,1,10,$3)',[randomUUID(),flour,'Physical count B'])]);
    assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(await scalar('select warehouse_stock from products where id=$1',[flour]),11);
  });
  await check('competing dispatches conserve warehouse and rep inventory',async()=>{
    await admin.query('update products set warehouse_stock=1 where id=$1',[flour]);
    const before=await scalar('select quantity from rep_holdings where rep_id=$1 and product_id=$2',[rep,flour]);
    const ids=[randomUUID(),randomUUID()];
    for(const id of ids){
      await admin.query('insert into stock_requests(id,tenant_id,rep_id) values($1,$2,$3)',[id,tenant,rep]);
      await admin.query('insert into stock_request_items(request_id,product_id,quantity,unit_price) values($1,$2,1,15000)',[id,flour]);
    }
    const attempts=await Promise.all(ids.map(id=>terminal('select approve_stock_request_atomic($1,$2::jsonb,$3,null)',[id,JSON.stringify([line(flour)]),owner])));
    assert.equal(attempts.filter(r=>r.ok).length,1);
    assert.equal(await scalar('select warehouse_stock from products where id=$1',[flour]),0);
    assert.equal(await scalar('select quantity from rep_holdings where rep_id=$1 and product_id=$2',[rep,flour]),before+1);
  });
  await check('two simultaneous receiving calls record the invoice and stock once',async()=>{
    const before=await scalar('select warehouse_stock from products where id=$1',[flour]);
    const args=['Concurrent invoice',null,null,'One delivery','2026-09-30T09:00:00Z',JSON.stringify([line(flour,4,12000)])];
    const receipts=await Promise.all([terminal('select receive_inventory($1,$2,$3,$4,$5,$6::jsonb)',args),terminal('select receive_inventory($1,$2,$3,$4,$5,$6::jsonb)',args)]);
    assert.equal(receipts[0].ok,true);assert.equal(receipts[1].ok,true);assert.equal(receipts[0].receipt_id,receipts[1].receipt_id);
    assert.equal(await scalar('select warehouse_stock from products where id=$1',[flour]),before+4);
  });
  await check('opening balance plus journal movements reconciles after races',async()=>{
    const mismatches=await scalar('select count(*) from products p where p.warehouse_stock<>(select coalesce(sum(m.quantity_delta),0) from stockflow_movements m where m.product_id=p.id and m.rep_id is null)');
    assert.equal(Number(mismatches),0);
  });
  await writeFile(new URL('../docs/v2/concurrency-results.json',import.meta.url),JSON.stringify({date:new Date().toISOString(),database:'PostgreSQL, disposable local CI instance',checks:results,scope:'Two independent authenticated database connections; fixture schema, not a production dump or live tenant test'},null,2)+'\n');
  console.log(`${results.length} real PostgreSQL concurrency checks passed.`);
} finally { await admin.end(); }
