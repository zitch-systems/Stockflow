import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
process.on('uncaughtException',error=>{console.error(error.message,error.where??'',error.hint??'');process.exit(1);});

const db = new PGlite({extensions:{pg_trgm}});
await db.exec(await readFile(new URL('./fixtures/v2-schema.sql',import.meta.url),'utf8'));
const migration = (await readdir(new URL('../supabase/migrations/',import.meta.url))).find(n=>n.endsWith('_stockflow_v2_integrity.sql'));
await db.exec(await readFile(new URL(`../supabase/migrations/${migration}`,import.meta.url),'utf8'));
const owner='20000000-0000-4000-8000-000000000001',rep='20000000-0000-4000-8000-000000000002',manager='20000000-0000-4000-8000-000000000003';
const flour='30000000-0000-4000-8000-000000000001',sugar='30000000-0000-4000-8000-000000000002',other='30000000-0000-4000-8000-000000000003';
let checks=0;
const results=[];
async function as(user,fn){await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user??'']);return fn();}
async function check(name,fn){await fn();checks++;results.push({name,status:'passed'});console.log(`PASS ${name}`);}
async function scalar(sql,args=[]){return Object.values((await db.query(sql,args)).rows[0])[0];}
async function sale(key,items,method='cash',customerId=null){return scalar('select stockflow_v2_sale($1,$2,$3,$4::jsonb,$5,$6)',[key,'Test customer',customerId,JSON.stringify(items),method,null]);}
const line=(id,q=1,price=15000)=>({product_id:id,quantity:q,unit_price:price});
await check('no unauthenticated access',async()=>as(null,()=>assert.rejects(sale(randomUUID(),[line(flour)]),/access denied/)));
let sid,key=randomUUID();
await check('owner checkout creates sale, lines, movement and audit atomically',async()=>as(owner,async()=>{
  sid=await sale(key,[line(flour,2)]);
  assert.equal(await scalar('select warehouse_stock from products where id=$1',[flour]),8);
  assert.equal(await scalar('select total_value from sales where id=$1',[sid]),'30000');
  assert.equal(await scalar('select count(*) from sale_items where sale_id=$1',[sid]),1);
  assert.equal(await scalar('select count(*) from stockflow_audit where object_id=$1',[sid]),1);
}));
await check('same retry key returns original sale without a second stock deduction',async()=>{
  assert.equal(await sale(key,[line(flour,2)]),sid);assert.equal(await scalar('select warehouse_stock from products where id=$1',[flour]),8);
});
await check('request-key reuse with another body is rejected',async()=>assert.rejects(sale(key,[line(flour,3)]),/different operation/));
await check('insufficient stock rolls back every earlier cart line',async()=>{
  const before=await scalar('select count(*) from sales');
  await assert.rejects(sale(randomUUID(),[line(flour,1),line(sugar,100,9500)]),/Stock changed/);
  assert.equal(await scalar('select warehouse_stock from products where id=$1',[flour]),8);
  assert.equal(await scalar('select count(*) from sales'),before);
});
await check('tenant product ID cannot be used at checkout',async()=>assert.rejects(sale(randomUUID(),[line(other,1,2000)]),/access denied/));
await check('tenant customer ID cannot be used at checkout',async()=>assert.rejects(sale(randomUUID(),[line(flour)],'cash','40000000-0000-4000-8000-000000000001'),/access denied/));
await check('receipt namespaces accept retained paths and reject foreign or traversing objects',async()=>{
  const base='10000000-0000-4000-8000-000000000001/'+owner+'/receipt.png';
  const args=[null,'Receipt fixture',null,JSON.stringify([line(sugar,1,9500)]),'cash',null,null];
  for(const path of [base,'https://fjmkenowgfxepwpyjcss.supabase.co/storage/v1/object/public/receipts/'+base]){
    args[0]=randomUUID();args[6]=path;
    const id=await scalar('select stockflow_v2_sale($1,$2,$3,$4::jsonb,$5,$6,$7)',args);
    assert.equal(await scalar('select receipt_url from sales where id=$1',[id]),path);
    await db.query('select stockflow_v2_cancel_sale($1,$2)',[id,'Attachment namespace fixture']);
  }
  for(const path of [base.replace(owner,rep),base.replace('/receipt.png','/../receipt.png'),base.replace('receipt.png','%2e%2e'),base.replace('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002')]){
    args[0]=randomUUID();args[6]=path;
    await assert.rejects(db.query('select stockflow_v2_sale($1,$2,$3,$4::jsonb,$5,$6,$7)',args),/Receipt access denied/);
  }
});
await check('duplicate lines, fractional quantity, below-cost price and NaN are rejected',async()=>{
  for(const items of [[line(flour),line(flour)],[line(flour,1.5)],[line(flour,1,1)],[line(flour,1,'NaN')]])await assert.rejects(sale(randomUUID(),items));
});
await check('rep sells holdings, preserves dispatch debt and awaits approval',async()=>as(rep,async()=>{
  const rs=await sale(randomUUID(),[line(flour,2)],'credit');
  assert.equal(await scalar('select quantity from rep_holdings where rep_id=$1',[rep]),3);
  assert.equal(await scalar('select debt_amount from rep_holdings where rep_id=$1',[rep]),'75000');
  assert.equal(await scalar('select status from sales where id=$1',[rs]),'pending');
  await db.query('select stockflow_v2_cancel_sale($1,$2)',[rs,'Customer changed order']);
  assert.equal(await scalar('select quantity from rep_holdings where rep_id=$1',[rep]),5);
}));
await check('rep cannot adjust warehouse stock or cancel owner sale',async()=>{
  await assert.rejects(db.query('select stockflow_v2_adjust_stock($1,$2,1,8,$3)',[randomUUID(),flour,'Count correction']),/Only owners/);
  await assert.rejects(db.query('select stockflow_v2_cancel_sale($1,$2)',[sid,'Unauthorised cancellation']),/cannot be cancelled/);
});
await check('manager adjustment compares current stock and keeps retry idempotent',async()=>as(manager,async()=>{
  const k=randomUUID(),args=[k,flour,2,8,'Physical count correction'];
  assert.equal(await scalar('select stockflow_v2_adjust_stock($1,$2,$3,$4,$5)',args),10);
  assert.equal(await scalar('select stockflow_v2_adjust_stock($1,$2,$3,$4,$5)',args),10);
  await assert.rejects(db.query('select stockflow_v2_adjust_stock($1,$2,$3,$4,$5)',[randomUUID(),flour,1,8,'Stale count']),/Stock changed/);
}));
await check('warehouse cancellation restores stock once with an audit trail',async()=>as(owner,async()=>{
  await db.query('select stockflow_v2_cancel_sale($1,$2)',[sid,'Customer returned unopened stock']);
  await db.query('select stockflow_v2_cancel_sale($1,$2)',[sid,'Customer returned unopened stock']);
  assert.equal(await scalar('select warehouse_stock from products where id=$1',[flour]),12);
}));
await check('journal reconciles all warehouse and rep balances',async()=>{
  const bad=await scalar(`select count(*) from products p where p.warehouse_stock<>(select sum(quantity_delta) from stockflow_movements m where m.product_id=p.id and m.rep_id is null)`);
  assert.equal(bad,0);
  assert.equal(await scalar('select sum(quantity_delta) from stockflow_movements where rep_id=$1',[rep]),5);
});
await check('report excludes cancelled/pending sales and sums cost snapshots',async()=>{
  await sale(randomUUID(),[line(sugar,2,9500)]);
  const stats=await scalar("select stockflow_v2_dashboard(now()-interval '1 day',now()+interval '1 day')");
  assert.equal(stats.revenue,19000);assert.equal(stats.gross_profit,5000);assert.equal(stats.transactions,1);
  assert.equal(stats.trend.reduce((sum,p)=>sum+p.revenue,0),stats.revenue);
  assert.equal(stats.trend.length,3);
});
await check('bulk import is all-or-nothing with SKU uniqueness',async()=>{
  const rows=[{name:'New product',buy_price:100,sell_price:150,opening_stock:10,sku_code:'NEW'},{name:'Invalid product',buy_price:-1,sell_price:150}];
  const before=await scalar('select count(*) from products');
  await assert.rejects(db.query('select stockflow_v2_import_products($1,$2::jsonb)',[randomUUID(),JSON.stringify(rows)]));
  assert.equal(await scalar('select count(*) from products'),before);
  rows.pop();const k=randomUUID();
  const result=await scalar('select stockflow_v2_import_products($1,$2::jsonb)',[k,JSON.stringify(rows)]);
  assert.equal(result.count,1);assert.deepEqual(await scalar('select stockflow_v2_import_products($1,$2::jsonb)',[k,JSON.stringify(rows)]),result);
  await assert.rejects(db.query('select stockflow_v2_product($1,null,$2::jsonb)',[randomUUID(),JSON.stringify(rows[0])]),/duplicate key/);
});
await check('metadata edits cannot overwrite a concurrent stock deduction',async()=>{
  await assert.rejects(db.query('select stockflow_v2_product($1,$2,$3::jsonb)',[randomUUID(),flour,JSON.stringify({name:'Flour',buy_price:12000,sell_price:15000,opening_stock:999})]),/audited stock adjustment/);
});
await check('customer creation is tenant-derived, audited and idempotent',async()=>{
  const key=randomUUID(),args=[key,'New customer','08012345678','Lagos'];
  const cid=await scalar('select stockflow_v2_customer($1,$2,$3,$4)',args);
  assert.equal(await scalar('select stockflow_v2_customer($1,$2,$3,$4)',args),cid);
  assert.equal(await scalar('select tenant_id from customers where id=$1',[cid]),'10000000-0000-4000-8000-000000000001');
  assert.equal(await scalar('select count(*) from stockflow_audit where object_id=$1',[cid]),1);
  await assert.rejects(db.query('select stockflow_v2_customer($1,$2,null,null)',[randomUUID(),'']));
});
await check('inactive and suspended business sessions are rejected',async()=>{
  await db.query('update profiles set is_active=false where id=$1',[owner]);
  await assert.rejects(sale(randomUUID(),[line(flour)]),/access denied/);
  await db.query('update profiles set is_active=true where id=$1',[owner]);
  await db.query("update tenants set status='suspended' where id=$1",['10000000-0000-4000-8000-000000000001']);
  await assert.rejects(sale(randomUUID(),[line(flour)]),/access denied/);
  await db.query("update tenants set status='active' where id=$1",['10000000-0000-4000-8000-000000000001']);
});
await check('dispatch cannot oversell, exceed the request or accept another tenant product',async()=>as(owner,async()=>{
  const rid=randomUUID();await db.query('insert into stock_requests(id,tenant_id,rep_id) values($1,$2,$3)',[rid,'10000000-0000-4000-8000-000000000001',rep]);
  await db.query('insert into stock_request_items(request_id,product_id,quantity,unit_price) values($1,$2,100,15000)',[rid,flour]);
  const before=await scalar('select warehouse_stock from products where id=$1',[flour]);
  for(const items of [[line(flour,100)],[line(flour,101)],[line(other,1,2000)]]){
    const result=await scalar('select approve_stock_request_atomic($1,$2::jsonb,$3,null)',[rid,JSON.stringify(items),owner]);assert.equal(result.ok,false);
    assert.equal(await scalar('select warehouse_stock from products where id=$1',[flour]),before);assert.equal(await scalar('select status from stock_requests where id=$1',[rid]),'pending');
  }
  const body=JSON.stringify([line(flour,2)]),args=[rid,body,owner];
  assert.equal((await scalar('select approve_stock_request_atomic($1,$2::jsonb,$3,null)',args)).ok,true);
  assert.equal((await scalar('select approve_stock_request_atomic($1,$2::jsonb,$3,null)',args)).already_processed,true);
  assert.equal(await scalar('select warehouse_stock from products where id=$1',[flour]),before-2);
  assert.equal(await scalar('select quantity from rep_holdings where rep_id=$1',[rep]),7);
  assert.equal(await scalar('select debt_amount from rep_holdings where rep_id=$1',[rep]),'105000');
  assert.equal(await scalar('select count(*) from approval_history where record_id=$1',[rid]),1);
}));
await check('receiving creates stock, invoice lines and audit in one transaction',async()=>as(owner,async()=>{
  const before=await scalar('select warehouse_stock from products where id=$1',[flour]);
  const body=JSON.stringify([line(flour,2,12000),line(sugar,1,7000)]);
  const args=[' INV-2026-001 ',null,null,'Delivery received','2026-09-30T09:00:00Z',body];
  const result=await scalar('select receive_inventory($1,$2,$3,$4,$5,$6::jsonb)',args);
  assert.equal(result.ok,true);assert.equal(result.total_value,31000);assert.equal(result.lines,2);
  assert.equal(await scalar('select warehouse_stock from products where id=$1',[flour]),before+2);
  assert.equal(await scalar('select count(*) from inventory_receipt_items where receipt_id=$1',[result.receipt_id]),2);
  assert.equal(await scalar('select count(*) from stockflow_audit where object_id=$1',[result.receipt_id]),1);
  const replay=await scalar('select receive_inventory($1,$2,$3,$4,$5,$6::jsonb)',['inv-2026-001',...args.slice(1)]);
  assert.equal(replay.receipt_id,result.receipt_id);assert.equal(replay.already_processed,true);
  assert.equal(await scalar('select warehouse_stock from products where id=$1',[flour]),before+2);
}));
await check('receiving rejects invoice reuse with different details or a historical receipt',async()=>{
  const before=await scalar('select warehouse_stock from products where id=$1',[flour]);
  for(const invoice of ['INV-2026-001','HISTORICAL-INVOICE']){
    if(invoice==='HISTORICAL-INVOICE') await db.query('insert into inventory_receipts(tenant_id,invoice_number,total_value) values($1,$2,0)',['10000000-0000-4000-8000-000000000001',invoice]);
    const result=await scalar('select receive_inventory($1,null,null,null,$2,$3::jsonb)',[invoice,'2026-09-30T09:00:00Z',JSON.stringify([line(flour,3,12000)])]);
    assert.equal(result.ok,false);
  }
  assert.equal(await scalar('select warehouse_stock from products where id=$1',[flour]),before);
});
await check('bad receiving cart rolls back earlier stock writes and receipt records',async()=>{
  const before=await scalar('select warehouse_stock from products where id=$1',[flour]), count=await scalar('select count(*) from inventory_receipts');
  for(const items of [[line(flour,1,12000),line(other,1,1000)],[line(flour,1.5,12000)],[line(flour,1,'NaN')],[line(flour),line(flour)]]){
    const result=await scalar('select receive_inventory($1,null,null,null,$2,$3::jsonb)',[randomUUID(),'2026-09-30T09:00:00Z',JSON.stringify(items)]);
    assert.equal(result.ok,false);
  }
  assert.equal(await scalar('select warehouse_stock from products where id=$1',[flour]),before);
  assert.equal(await scalar('select count(*) from inventory_receipts'),count);
});
await check('receiving rejects foreign supplier, foreign attachment and representative access',async()=>{
  const supplier=randomUUID();await db.query('insert into suppliers(id,tenant_id,name) values($1,$2,$3)',[supplier,'10000000-0000-4000-8000-000000000002','Private supplier']);
  const body=JSON.stringify([line(flour,1,12000)]),date='2026-09-30T09:00:00Z';
  for(const args of [[randomUUID(),supplier,null,null,date,body],[randomUUID(),null,'https://untrusted.example/invoice.pdf',null,date,body]])assert.equal((await scalar('select receive_inventory($1,$2,$3,$4,$5,$6::jsonb)',args)).ok,false);
  await as(rep,async()=>assert.equal((await scalar('select receive_inventory($1,null,null,null,$2,$3::jsonb)',[randomUUID(),date,body])).ok,false));
});
await check('RLS hides other tenant movements and audit; reps only read their own movement',async()=>{
  await as(rep,async()=>{await db.exec('set role authenticated');
    assert.equal(await scalar('select count(*) from stockflow_movements where rep_id is null'),0);
    assert.equal(await scalar('select count(*) from stockflow_audit'),0);await db.exec('reset role');
  });
  await as('20000000-0000-4000-8000-000000000004',async()=>{await db.exec('set role authenticated');
    assert.equal(await scalar("select count(*) from stockflow_movements where tenant_id='10000000-0000-4000-8000-000000000001'"),0);
    await assert.rejects(db.query("insert into stockflow_movements(tenant_id,product_id,quantity_before,quantity_after,reason) values($1,$2,0,999,'Tampering')",['10000000-0000-4000-8000-000000000002',other]),/permission denied/);await db.exec('reset role');
  });
});
await check('public signup cannot choose an existing tenant or staff/admin role',async()=>{
  const before=await scalar('select count(*) from tenants');
  for(const role of ['manager','rep','super_admin','owner']){
    const id=randomUUID();
    await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3::jsonb)',[id,`${id}@signup.example`,JSON.stringify({tenant_id:'10000000-0000-4000-8000-000000000001',role,full_name:'Untrusted signup'})]);
    assert.equal(await scalar('select count(*) from profiles where id=$1',[id]),0);
  }
  assert.equal(await scalar('select count(*) from tenants'),before);
});
await check('business signup always creates its own tenant and owner with default categories',async()=>{
  const id=randomUUID();
  await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3::jsonb)',[id,`${id}@signup.example`,JSON.stringify({tenant_id:'10000000-0000-4000-8000-000000000001',role:'super_admin',business_name:'New isolated business',business_mode:'invalid',full_name:'New owner'})]);
  const p=(await db.query('select * from profiles where id=$1',[id])).rows[0];
  assert.equal(p.role,'owner');assert.notEqual(p.tenant_id,'10000000-0000-4000-8000-000000000001');
  assert.equal(await scalar('select business_mode from tenants where id=$1',[p.tenant_id]),'owner_rep');
  assert.equal(await scalar('select count(*) from expense_categories where tenant_id=$1',[p.tenant_id]),7);
  const before=await scalar('select count(*) from tenants');
  await assert.rejects(db.query('insert into auth.users(email,raw_user_meta_data) values($1,$2::jsonb)',['invalid@signup.example',JSON.stringify({business_name:'x'.repeat(201)})]),/Check business/);
  assert.equal(await scalar('select count(*) from tenants'),before);
});
const inviteKey=randomUUID(),inviteEmail='new.staff@invite.example';
const beginInvite=(k=inviteKey,email=inviteEmail,role='manager')=>scalar('select stockflow_v2_begin_staff_invite($1,$2,$3,$4,$5)',[k,email,'Invited manager','08012345678',role]);
await check('only an active owner can reserve a least-privilege staff invitation',async()=>{
  for(const actor of [rep,manager,null])await as(actor,async()=>assert.rejects(beginInvite(),/Only an owner|access denied/));
  await as(owner,async()=>{
    await assert.rejects(beginInvite(randomUUID(),inviteEmail,'owner'),/manager or rep/);
    await assert.rejects(beginInvite(randomUUID(),'malformed','manager'),/valid email/);
    const first=await beginInvite();assert.equal(first.pending,true);assert.equal(first.request_id,inviteKey);
    assert.deepEqual(await beginInvite(),first);
    await assert.rejects(beginInvite(inviteKey,inviteEmail,'rep'),/different operation/);
  });
});
await check('one staff email reservation cannot be raced or claimed by another business',async()=>{
  await as('20000000-0000-4000-8000-000000000004',async()=>assert.rejects(beginInvite(randomUUID(),inviteEmail.toUpperCase()),/stockflow_staff_email_request_uq/));
  assert.equal(await scalar("select count(*) from stockflow_private.operations where operation='staff invite' and payload->>'email'=$1",[inviteEmail]),1);
});
await check('browser roles cannot call service-only staff provisioning functions',async()=>{
  for(const role of ['anon','authenticated']){
    await db.exec(`set role ${role}`);
    try{
      await assert.rejects(db.query('select stockflow_v2_staff_invite_state($1,$2)',[owner,inviteKey]),/permission denied/);
      await assert.rejects(db.query('select stockflow_v2_finish_staff_invite($1,$2,$3)',[owner,inviteKey,randomUUID()]),/permission denied/);
    }finally{await db.exec('reset role');}
  }
});
await check('a verified Auth invitation creates the approved profile and audit exactly once',async()=>{
  const id=randomUUID();
  await db.query('insert into auth.users(id,email,invited_at,raw_user_meta_data) values($1,$2,now(),$3::jsonb)',[id,inviteEmail,JSON.stringify({stockflow_request_id:inviteKey,stockflow_invited_by:owner,role:'super_admin',tenant_id:'10000000-0000-4000-8000-000000000002'})]);
  assert.equal(await scalar('select count(*) from profiles where id=$1',[id]),0);
  await db.exec('set role service_role');let result;
  try{
    const state=await scalar('select stockflow_v2_staff_invite_state($1,$2)',[owner,inviteKey]);
    assert.equal(state.user_id,id);assert.equal(state.payload.role,'manager');
    result=await scalar('select stockflow_v2_finish_staff_invite($1,$2,$3)',[owner,inviteKey,id]);
    assert.equal(result.ok,true);assert.equal(result.invitation_requested,true);
    assert.deepEqual(await scalar('select stockflow_v2_finish_staff_invite($1,$2,$3)',[owner,inviteKey,id]),result);
  }finally{await db.exec('reset role');}
  const p=(await db.query('select tenant_id,role from profiles where id=$1',[id])).rows[0];
  assert.deepEqual(p,{tenant_id:'10000000-0000-4000-8000-000000000001',role:'manager'});
  assert.equal(await scalar("select count(*) from stockflow_audit where object_id=$1 and action='staff_invited'",[id]),1);
});
await check('an existing public account cannot be taken over through edited invite metadata',async()=>{
  const key=randomUUID(),id=randomUUID(),email='existing@invite.example';
  await as(owner,()=>beginInvite(key,email,'rep'));
  await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3::jsonb)',[id,email,JSON.stringify({stockflow_request_id:key,stockflow_invited_by:owner})]);
  await assert.rejects(db.query('select stockflow_v2_finish_staff_invite($1,$2,$3)',[owner,key,id]),/already has an account/);
  assert.equal(await scalar('select count(*) from profiles where id=$1',[id]),0);
});
await check('even a matching invitation cannot reassign an existing foreign-tenant profile',async()=>{
  const key=randomUUID(),id=randomUUID(),email='foreign.staff@invite.example',tenantB='10000000-0000-4000-8000-000000000002';
  await as(owner,()=>beginInvite(key,email,'rep'));
  await db.query('insert into auth.users(id,email,invited_at,raw_user_meta_data) values($1,$2,now(),$3::jsonb)',[id,email,JSON.stringify({stockflow_request_id:key,stockflow_invited_by:owner})]);
  await db.query("insert into profiles(id,tenant_id,role,full_name) values($1,$2,'rep','Existing foreign staff')",[id,tenantB]);
  await assert.rejects(db.query('select stockflow_v2_finish_staff_invite($1,$2,$3)',[owner,key,id]),/cannot be reassigned/);
  assert.equal(await scalar('select tenant_id from profiles where id=$1',[id]),tenantB);
  assert.equal(await scalar("select count(*) from stockflow_audit where object_id=$1 and action='staff_invited'",[id]),0);
});
await db.close();
await writeFile(new URL('../docs/v2/database-results.json',import.meta.url),JSON.stringify({scope:'Isolated inferred PostgreSQL fixture; not production Supabase/Auth, live policies or concurrent independent sessions',checks:results},null,2)+'\n');
console.log(`\n${checks} database integrity checks passed on an isolated PostgreSQL contract fixture. Live production schema and live API concurrency tests remain required.`);
