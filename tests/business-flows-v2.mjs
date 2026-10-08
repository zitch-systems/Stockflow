// Browser -> shared Next.js UI -> captured live schema with fictional data.
// Every external request is intercepted. No production connection or records.
import {PGlite} from '@electric-sql/pglite';
import {pg_trgm} from '@electric-sql/pglite/contrib/pg_trgm';
import {uuid_ossp} from '@electric-sql/pglite/contrib/uuid_ossp';
import {readFile,stat,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const root=resolve(new URL('..',import.meta.url).pathname),web=resolve(root,'mobile/out');
const db=new PGlite({extensions:{pg_trgm,uuid_ossp}});
for(const path of ['tests/fixtures/live-schema-contract.sql','supabase/migrations/20261001092411_stockflow_v2_integrity.sql','supabase/review/transaction-integrity.sql','supabase/review/live-transactions.sql'])await db.exec(await readFile(resolve(root,path),'utf8'));
const tenant='10000000-0000-4000-8000-000000000001',owner='20000000-0000-4000-8000-000000000001',rep='20000000-0000-4000-8000-000000000002',product='30000000-0000-4000-8000-000000000001';
const supplier=randomUUID(),order=randomUUID(),payment=randomUUID();
await db.query("insert into suppliers(id,tenant_id,name) values($1,$2,'Fixture supplier')",[supplier,tenant]);
await db.query("insert into supplier_orders(id,tenant_id,supplier_id,submitted_by,status,total_cases,total_value) values($1,$2,$3,$4,'approved',2,24000)",[order,tenant,supplier,owner]);
await db.query('insert into supplier_order_items(order_id,product_id,quantity,unit_price) values($1,$2,2,12000)',[order,product]);
await db.query('insert into payments(id,tenant_id,rep_id,amount) values($1,$2,$3,10000)',[payment,tenant,rep]);
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[rep]);
const returnId=(await db.query("select stockflow_v2_submit_return($1,$2,1,'Damaged fixture',$3) id",[randomUUID(),product,`${tenant}/${rep}/fixture.jpg`])).rows[0].id;
await db.exec(await readFile(resolve(root,'supabase/review/financial-boundary.sql'),'utf8'));
await db.exec(await readFile(resolve(root,'supabase/review/profile-boundary.sql'),'utf8'));
const server=createServer(async(req,res)=>{try{let p=resolve(web,'.'+new URL(req.url,'http://localhost').pathname);if(!p.startsWith(web+'/')&&p!==web)throw Error();if((await stat(p)).isDirectory())p=resolve(p,'index.html');res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.woff2':'font/woff2','.png':'image/png','.ico':'image/x-icon'})[extname(p)]??'application/octet-stream'});res.end(await readFile(p));}catch{res.writeHead(404);res.end('Not found');}});
await new Promise(r=>server.listen(4175,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.STOCKFLOW_CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const errors=[];context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));await context.routeWebSocket('**/*',ws=>ws.close());
let missingBackend=false,dropNext=false,mutations=0;
const functions={stockflow_v2_dashboard:['p_from','p_to'],stockflow_v2_receive_order:['p_request_id','p_order_id','p_expected_items','p_note'],stockflow_v2_decide_return:['p_request_id','p_return_id','p_approve','p_restock','p_credit','p_note'],stockflow_v2_confirm_payment:['p_request_id','p_payment_id','p_note'],stockflow_v2_reverse_payment:['p_request_id','p_payment_id','p_note']};
async function rest(tx, url) {
  const table = url.pathname.split("/").at(-1);
  if (
    ![
      "supplier_orders", "supplier_order_items", "suppliers", "product_returns", "payments", "inventory_receipts", "inventory_receipt_items", "expenses",
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

await context.route('**/*',async route=>{
 const req=route.request(),url=new URL(req.url());if(url.hostname==='127.0.0.1')return route.continue();if(url.hostname!=='fjmkenowgfxepwpyjcss.supabase.co')return route.abort();
 const headers={'Access-Control-Allow-Origin':'*','Content-Type':'application/json'};
 if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{...headers,'Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'}});
 try{
  const token=req.headers().authorization?.split(' ')[1];if(!token)throw {code:'42501',message:'Missing fixture token'};
  const actor=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString()).sub;if(![owner,rep].includes(actor))throw Error('Unknown fixture actor');
  const name=url.pathname.split('/').at(-1),body=req.method()==='POST'?req.postDataJSON():null;
  if(missingBackend&&name==='stockflow_v2_dashboard')throw {code:'PGRST202',message:'Missing V2 fixture'};
  const data=await db.transaction(async tx=>{await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[actor]);await tx.exec('set local role authenticated');if(!url.pathname.includes('/rpc/'))return rest(tx,url);const keys=functions[name];if(!keys)throw Error('Unknown fixture RPC');if(name!=='stockflow_v2_dashboard')mutations++;return (await tx.query(`select public.${name}(${keys.map((_,i)=>'$'+(i+1)).join(',')}) result`,keys.map(k=>body[k]??null))).rows[0].result;});
  if(dropNext&&name==='stockflow_v2_receive_order'){dropNext=false;return route.abort('failed');}
  const single=req.headers().accept?.includes('vnd.pgrst.object');return route.fulfill({status:200,headers,body:JSON.stringify(single?data[0]:data)});
 }catch(e){return route.fulfill({status:400,headers,body:JSON.stringify({code:e.code??'P0001',message:e.message??'Fixture rejection'})});}
});
const session=actor=>{const enc=v=>Buffer.from(JSON.stringify(v)).toString('base64url');return {access_token:`${enc({alg:'HS256'})}.${enc({sub:actor,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})}.fixture`,token_type:'bearer',refresh_token:'fixture',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,user:{id:actor,email:'fixture@stockflow.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}};};
const page=await context.newPage();page.setDefaultTimeout(12000);await page.addInitScript(s=>sessionStorage.setItem('sb-fjmkenowgfxepwpyjcss-auth-token',JSON.stringify(s)),session(owner));
let checks=0;const results=[];async function check(name,fn){await fn();checks++;results.push({name,status:'passed'});console.log('PASS '+name);}
const openOperations=async()=>{await page.goto('http://127.0.0.1:4175/home/');await page.getByRole('navigation',{name:'Business navigation'}).getByRole('button',{name:'Business operations',exact:true}).click();await page.getByRole('heading',{name:'Supplier orders',exact:true}).waitFor();};
try{
 await check('owner sees retained business workflows in the shared Next.js workspace',async()=>{await openOperations();await page.getByText('Fixture supplier',{exact:true}).waitFor();for(const name of ['Returns','Rep payments','Stock receipts','Team','Expenses'])assert.equal(await page.getByRole('navigation',{name:'Business operations'}).getByRole('button',{name,exact:true}).count(),1);});
 await check('receiving reviews immutable lines and recovers a lost response without adding stock twice',async()=>{
  const before=Number((await db.query('select warehouse_stock from products where id=$1',[product])).rows[0].warehouse_stock);
  await page.locator('.sf-flow-record').first().click();await page.getByRole('heading',{name:'Delivery lines'}).waitFor();await page.getByLabel('Review note').fill('Fixture delivery verified');await page.getByRole('button',{name:'Review receiving',exact:true}).click();dropNext=true;await page.getByRole('button',{name:'Receive delivery',exact:true}).click();await page.getByRole('heading',{name:'Unconfirmed request'}).waitFor();assert.equal(Number((await db.query('select warehouse_stock from products where id=$1',[product])).rows[0].warehouse_stock),before+2);
  await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();await page.reload();await page.getByRole('navigation',{name:'Business navigation'}).getByRole('button',{name:'Business operations',exact:true}).click();await page.getByRole('button',{name:'Retry original request',exact:true}).click();await page.getByText('Confirmed. Your business records have been refreshed.').waitFor();assert.equal(Number((await db.query('select warehouse_stock from products where id=$1',[product])).rows[0].warehouse_stock),before+2);
 });
 await check('return approval uses explicit original credit and protected reservation',async()=>{await page.getByRole('navigation',{name:'Business operations'}).getByRole('button',{name:'Returns',exact:true}).click();await page.locator('.sf-flow-record').first().click();await page.getByLabel('Review note').fill('Original debt verified');await page.getByLabel('Verified debt credit (₦)').fill('1000');await page.getByLabel('Returned goods can re-enter warehouse stock').check();await page.getByRole('button',{name:'Review approval',exact:true}).click();await page.getByRole('button',{name:'Approve return',exact:true}).click();await page.getByText('Confirmed. Your business records have been refreshed.').waitFor();assert.equal((await db.query('select status from product_returns where id=$1',[returnId])).rows[0].status,'approved');});
 await check('payment confirmation and reversal conserve the recorded debt allocation',async()=>{await page.getByRole('navigation',{name:'Business operations'}).getByRole('button',{name:'Rep payments',exact:true}).click();await page.locator('.sf-flow-record').first().click();await page.getByLabel('Review note').fill('Bank fixture verified');await page.getByRole('button',{name:'Review confirmation',exact:true}).click();await page.getByRole('button',{name:'Confirm payment',exact:true}).click();await page.getByText('Confirmed. Your business records have been refreshed.').waitFor();assert.equal((await db.query('select status from payments where id=$1',[payment])).rows[0].status,'confirmed');await page.locator('.sf-flow-record').first().click();await page.getByLabel('Review note').fill('Duplicate payment fixture');await page.getByRole('button',{name:'Review reversal',exact:true}).click();await page.getByRole('button',{name:'Reverse payment',exact:true}).click();await page.getByText('Confirmed. Your business records have been refreshed.').waitFor();assert.equal((await db.query('select debt_amount from rep_holdings where rep_id=$1',[rep])).rows[0].debt_amount,'74000');});
 await check('phone flow menu and dark theme keep content within the screen',async()=>{await page.setViewportSize({width:390,height:844});await page.getByRole('navigation',{name:'Mobile navigation'}).getByRole('button',{name:'More',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Business operations',exact:true}).click();await page.locator('.sf-flow-tabs').waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.evaluate(()=>document.documentElement.setAttribute('data-theme','dark'));await page.screenshot({path:resolve(root,'docs/android/business-flows-phone.png'),fullPage:true});});
 await check('missing production V2 backend blocks new mutation actions',async()=>{missingBackend=true;await page.setViewportSize({width:1440,height:1000});const before=mutations;await openOperations();await page.getByRole('navigation',{name:'Business operations'}).getByRole('button',{name:'Returns',exact:true}).click();await page.locator('.sf-flow-record').first().click();assert.equal(await page.getByLabel('Review note').isDisabled(),true);assert.equal(mutations,before);});
 await check('rep menu shows only their returns/payments and hides manager actions',async()=>{const repPage=await context.newPage();await repPage.addInitScript(s=>sessionStorage.setItem('sb-fjmkenowgfxepwpyjcss-auth-token',JSON.stringify(s)),session(rep));await repPage.goto('http://127.0.0.1:4175/home/');await repPage.getByRole('navigation',{name:'Business navigation'}).getByRole('button',{name:'Business operations',exact:true}).click();await repPage.getByRole('heading',{name:'Returns',exact:true}).waitFor();assert.equal(await repPage.locator('.sf-flow-tabs button').count(),2);await repPage.locator('.sf-flow-record').first().click();assert.equal(await repPage.getByLabel('Review note').count(),0);await repPage.close();});
 assert.deepEqual(errors,[]);await writeFile(resolve(root,'docs/v2/business-flow-browser-results.json'),JSON.stringify({checks:results,scope:'Captured actual schema with fictional data and intercepted Auth/PostgREST, not production or hardware certification'},null,2)+'\n');console.log(`${checks} shared business-flow browser checks passed`);
}catch(e){await page.screenshot({path:'/tmp/stockflow-business-flow-failure.png',fullPage:true});console.error((await page.locator('body').innerText()).slice(0,2500));throw e;}finally{await browser.close();server.close();await db.close();}
