// Disposable contract fixtures only. No credentials, remote database or business data.
import {PGlite} from '@electric-sql/pglite';
import {pg_trgm} from '@electric-sql/pglite/contrib/pg_trgm';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {parse} from 'acorn';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const checks=[];
async function check(name,fn){await fn();checks.push({name,status:'passed'});console.log('PASS '+name);}
const db=new PGlite({extensions:{pg_trgm}});
await db.exec(await readFile(new URL('./fixtures/v2-schema.sql',import.meta.url),'utf8'));
const migration=(await readdir(new URL('../supabase/migrations/',import.meta.url))).find(n=>n.endsWith('_stockflow_v2_integrity.sql'));
await db.exec(await readFile(new URL('../supabase/migrations/'+migration,import.meta.url),'utf8'));
await db.exec(await readFile(new URL('../supabase/review/transaction-integrity.sql',import.meta.url),'utf8'));
const owner='20000000-0000-4000-8000-000000000001',rep='20000000-0000-4000-8000-000000000002';
const tenant='10000000-0000-4000-8000-000000000001',foreign='10000000-0000-4000-8000-000000000002';
const flour='30000000-0000-4000-8000-000000000001',sugar='30000000-0000-4000-8000-000000000002',other='30000000-0000-4000-8000-000000000003';
const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
const line=(product_id,quantity=1,unit_price=15000)=>({product_id,quantity,unit_price});
const sale=key=>scalar('select stockflow_v2_sale($1,$2,null,$3::jsonb,$4,null)',[key,'Integrity fixture',JSON.stringify([line(flour),line(sugar,1,9500)]),'cash']);
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
const snapshot=async()=>({
 products:(await db.query('select id,warehouse_stock from products order by id')).rows,
 holdings:(await db.query('select id,tenant_id,quantity,debt_amount from rep_holdings order by id')).rows,
 sales:(await db.query('select id,status from sales order by id')).rows,
 receipts:await scalar('select count(*) from inventory_receipts'),
 lines:await scalar('select count(*) from inventory_receipt_items'),
 operations:await scalar('select count(*) from stockflow_private.operations'),
 audit:await scalar('select count(*) from stockflow_audit'),journal:await scalar('select count(*) from stockflow_movements')
});
const request=async()=>{const id=randomUUID();await db.query('insert into stock_requests(id,tenant_id,rep_id) values($1,$2,$3)',[id,tenant,rep]);await db.query('insert into stock_request_items(request_id,product_id,quantity,unit_price) values($1,$2,1,15000)',[id,flour]);return id;};
await check('null dispatch body cannot approve a request without stock or debt movement',async()=>{
 const id=await request(),before=await snapshot();
 const r=await scalar('select approve_stock_request_atomic($1,null,$2,null)',[id,owner]);
 assert.equal(r.ok,false);assert.equal(await scalar('select status from stock_requests where id=$1',[id]),'pending');assert.deepEqual(await snapshot(),before);
});
await check('dispatch refuses a cross-tenant conflicting holding and permits a reconciled retry',async()=>{
 const id=await request();await db.query('update rep_holdings set tenant_id=$1 where rep_id=$2',[foreign,rep]);const before=await snapshot();
 const args=[id,JSON.stringify([line(flour)]),owner];
 assert.equal((await scalar('select approve_stock_request_atomic($1,$2::jsonb,$3,null)',args)).ok,false);assert.deepEqual(await snapshot(),before);
 await db.query('update rep_holdings set tenant_id=$1 where rep_id=$2',[tenant,rep]);
 assert.equal((await scalar('select approve_stock_request_atomic($1,$2::jsonb,$3,null)',args)).ok,true);
 const done=await snapshot();assert.equal((await scalar('select approve_stock_request_atomic($1,$2::jsonb,$3,null)',args)).already_processed,true);assert.deepEqual(await snapshot(),done);
});
for(const kind of ['missing lines','negative quantity','mismatched total','foreign product'])await check('cancellation refuses '+kind+' without stock, status or audit changes',async()=>{
 const id=await sale(randomUUID());const original=(await db.query('select * from sale_items where sale_id=$1',[id])).rows;
 if(kind==='missing lines')await db.query('delete from sale_items where sale_id=$1',[id]);
 if(kind==='negative quantity')await db.query('update sale_items set quantity=-1 where sale_id=$1 and product_id=$2',[id,sugar]);
 if(kind==='mismatched total')await db.query('update sales set total_value=1 where id=$1',[id]);
 if(kind==='foreign product')await db.query('update sale_items set product_id=$1 where sale_id=$2 and product_id=$3',[other,id,sugar]);
 const before=await snapshot();await assert.rejects(db.query('select stockflow_v2_cancel_sale($1,$2)',[id,'Integrity fixture']),/reconciliation|access denied/);assert.deepEqual(await snapshot(),before);
 // Repairs are limited to this synthetic test record.
 await db.query('delete from sale_items where sale_id=$1',[id]);
 for(const r of original)await db.query('insert into sale_items(id,sale_id,product_id,quantity,unit_price,list_price,buy_price_snapshot) values($1,$2,$3,$4,$5,$6,$7)',[r.id,id,r.product_id,r.quantity,r.unit_price,r.list_price,r.buy_price_snapshot]);
 await db.query('update sales set total_value=24500 where id=$1',[id]);
 await db.query('select stockflow_v2_cancel_sale($1,$2)',[id,'Fixture reconciliation']);const done=await snapshot();
 await db.query('select stockflow_v2_cancel_sale($1,$2)',[id,'Fixture reconciliation']);assert.deepEqual(await snapshot(),done);
});
await db.exec("create function public.fixture_fail_audit() returns trigger language plpgsql as $$begin raise exception 'Injected audit failure'; end$$;");
for(const operation of ['sale','receipt','cancellation'])await check(operation+' rolls back all writes on late audit failure and retries exactly once',async()=>{
 const key=randomUUID(),id=operation==='cancellation'?await sale(randomUUID()):null;
 const execute=()=>operation==='sale'?sale(key):operation==='receipt'?scalar('select receive_inventory($1,null,null,null,$2,$3::jsonb)',['Injected receipt','2026-10-01T09:00:00Z',JSON.stringify([line(flour,2,12000),line(sugar,1,7000)])]):db.query('select stockflow_v2_cancel_sale($1,$2)',[id,'Audit failure fixture']);
 await db.exec('create trigger fixture_audit_failure before insert on stockflow_audit for each row execute function public.fixture_fail_audit();');
 const before=await snapshot();
 if(operation==='receipt')assert.equal((await execute()).ok,false);else await assert.rejects(execute(),/Injected audit failure/);
 assert.deepEqual(await snapshot(),before);
 await db.exec('drop trigger fixture_audit_failure on stockflow_audit;');
 const first=await execute(),done=await snapshot(),second=await execute();
 assert.deepEqual(await snapshot(),done);if(operation==='sale')assert.equal(first,second);if(operation==='receipt')assert.equal(first.receipt_id,second.receipt_id);
});
await check('stock journal equals every warehouse and holding balance after rollback and replay',async()=>{
 assert.equal(await scalar('select count(*) from products p where p.warehouse_stock<>(select coalesce(sum(quantity_delta),0) from stockflow_movements m where m.product_id=p.id and m.rep_id is null)'),0);
 assert.equal(await scalar('select count(*) from rep_holdings h where h.quantity<>(select coalesce(sum(quantity_delta),0) from stockflow_movements m where m.product_id=h.product_id and m.rep_id=h.rep_id)'),0);
});
await db.close();
async function action(file,name){
 const source=await readFile(new URL('../'+file,import.meta.url),'utf8');let found;
 for(const m of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){
  const script=m[1];function walk(n){if(!n||typeof n!=='object')return;
   if(n.type==='FunctionDeclaration'&&n.id.name===name)found=script.slice(n.start,n.end);
   if(n.type==='AssignmentExpression'&&n.left.type==='MemberExpression'&&n.left.object.name==='window'&&n.left.property.name===name)found=script.slice(n.right.start,n.right.end);
   for(const [k,v] of Object.entries(n))if(!['start','end'].includes(k)){if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);}
  }walk(parse(script,{ecmaVersion:'latest'}));
 }assert.ok(found,file+':'+name);return found;
}
const targets={
 'rep-dashboard.html':['submitRet','saveEditPay'],
 'manager-dashboard.html':['approveReturn','quickRejectReturn','rejectReturn','approveEdit','rejectEdit','applyPaymentToDebts','submitPlaceOrder','cancelOrder','openEditOrder'],
 'owner-dashboard.html':['slPoReceive','slPoSubmit','slPoCancel','processOrderApproval','processOrderRejection','orDecideReturnById','processPriceApproval','processPriceRejection']
};
for(const [file,names] of Object.entries(targets))for(const name of names)await check(file+':'+name+' blocks initial, retry and parallel unsafe writes',async()=>{
 let calls=0;const messages=[],window={toast:(m,type)=>messages.push({m,type}),sb:new Proxy({},{get(){calls++;throw Error('Blocked action accessed database');}}),uploadFile(){calls++;throw Error('Blocked action uploaded an object');}};
 const fn=vm.runInNewContext('('+await action(file,name)+')',{window});await fn('fixture','approved','Checked');await fn('fixture','approved','Checked');await Promise.all([fn('fixture'),fn('fixture')]);
 assert.equal(calls,0);assert.equal(messages.length,4);for(const m of messages){assert.equal(m.type,'err');assert.match(m.m,/paused.*integrity review/);}
});
await writeFile(new URL('../docs/v2/transaction-integrity-results.json',import.meta.url),JSON.stringify({checks,scope:'Synthetic PGlite SQL fixtures and actual retained action bodies; no production data, live schema or independent-session races certified'},null,2)+'\n');
console.log(checks.length+' transaction review regression checks passed.');
