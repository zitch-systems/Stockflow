// Interim containment (supabase/review/profile-containment.sql) on the captured
// live schema with fictional identities; no production connection. Each attack
// is first reproduced, then shown blocked, and every browser write the retained
// dashboards make today is shown to keep working.
import {PGlite} from '@electric-sql/pglite';
import {pg_trgm} from '@electric-sql/pglite/contrib/pg_trgm';
import {uuid_ossp} from '@electric-sql/pglite/contrib/uuid_ossp';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite({extensions:{pg_trgm,uuid_ossp}});
await db.exec(await readFile('tests/fixtures/live-schema-contract.sql','utf8'));
const tenant='10000000-0000-4000-8000-000000000001',otherTenant='10000000-0000-4000-8000-000000000002';
const owner='20000000-0000-4000-8000-000000000001',rep='20000000-0000-4000-8000-000000000002',manager='20000000-0000-4000-8000-000000000003';
const as=async(id,fn)=>{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');try{return await fn();}finally{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub','',false)");}};
const rows=async(sql,params=[])=>(await db.query(sql,params)).rows;
const signup=async(id,email,meta)=>db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3::jsonb)',[id,email,JSON.stringify(meta)]);

// Reproduce on the captured schema before the containment script.
assert.equal((await as(owner,()=>rows("update profiles set role='super_admin' where id=$1 returning id",[rep]))).length,1,'owner promotion reproduces');
await db.query("update profiles set role='rep' where id=$1",[rep]);
assert.equal((await as(rep,()=>rows('update profiles set debt_limit=99999999 where id=$1 returning id',[rep]))).length,1,'self debt-limit raise reproduces');
await db.query('update profiles set debt_limit=null where id=$1',[rep]);
assert.equal((await as(owner,()=>rows("update tenants set plan='enterprise',monthly_price=0 where id=$1 returning id",[tenant]))).length,1,'owner billing write reproduces');
await db.query("update tenants set plan='starter' where id=$1",[tenant]);
await signup('20000000-0000-4000-8000-000000000010','join-before@fixture.example',{tenant_id:tenant,role:'manager',full_name:'Metadata joiner'});
assert.deepEqual(await rows('select role::text,is_active from profiles where id=$1',['20000000-0000-4000-8000-000000000010']),[{role:'manager',is_active:true}],'public metadata joins a tenant');

await db.exec(await readFile('supabase/review/profile-containment.sql','utf8'));
let checks=0;const check=async(name,fn)=>{await fn();checks++;console.log('PASS '+name);};
const denied=/Only platform administrators|cannot change your own|Owner and administrator accounts|StockFlow provisioning|StockFlow administrators|tenant/;

await check('owner cannot change any role, including promotion to super_admin or owner',async()=>{
 for(const role of ['super_admin','owner','manager'])await assert.rejects(as(owner,()=>rows(`update profiles set role='${role}' where id=$1`,[rep])),denied);
 assert.equal((await rows('select role::text from profiles where id=$1',[rep]))[0].role,'rep');
});
await check('staff cannot raise their own access, limits or verification',async()=>{
 for(const change of ['debt_limit=99999999','is_active=false','nin_verified=true','kyc_complete=true','commission_rate=0.5'])
  await assert.rejects(as(rep,()=>rows(`update profiles set ${change} where id=$1`,[rep])),denied);
 await assert.rejects(as(manager,()=>rows('update profiles set debt_limit=1 where id=$1',[manager])),denied);
});
await check('owner cannot change another owner account in the same business',async()=>{
 const second='20000000-0000-4000-8000-000000000011';
 await db.query("insert into auth.users(id,email) values($1,'second-owner@fixture.example')",[second]);
 await db.query("insert into profiles(id,tenant_id,role,full_name) values($1,$2,'owner','Second owner')",[second,tenant]);
 await assert.rejects(as(owner,()=>rows('update profiles set is_active=false where id=$1',[second])),denied);
});
await check('browser sessions cannot create profiles',async()=>{
 const spare='20000000-0000-4000-8000-000000000012';
 await db.query("insert into auth.users(id,email) values($1,'spare@fixture.example')",[spare]);
 await assert.rejects(as(owner,()=>rows("insert into profiles(id,tenant_id,role,full_name) values($1,$2,'rep','Injected')",[spare,tenant])),denied);
});
await check('owner keeps managing staff: KYC, debt limit, deactivate and reactivate',async()=>{
 assert.equal((await as(owner,()=>rows("update profiles set address='1 Fixture Road',bank_name='Fixture Bank',nin_verified=true,debt_limit=50000 where id=$1 returning id",[rep]))).length,1);
 assert.equal((await as(owner,()=>rows('update profiles set is_active=false where id=$1 returning id',[rep]))).length,1);
 assert.equal((await as(owner,()=>rows('update profiles set is_active=true where id=$1 returning id',[rep]))).length,1);
 assert.equal((await as(owner,()=>rows('update profiles set debt_limit=75000 where id=$1 returning id',[manager]))).length,1);
});
await check('everyone keeps editing their own name and phone',async()=>{
 for(const id of [owner,manager,rep])assert.equal((await as(id,()=>rows("update profiles set full_name='Fixture person',phone='08000000000' where id=$1 returning id",[id]))).length,1);
});
await check('owner keeps editing business name, contact, logo and mode but not billing or status',async()=>{
 assert.equal((await as(owner,()=>rows("update tenants set name='Fixture Ltd',business_name='Fixture Ltd',contact_email='a@fixture.example',contact_phone='0800',logo_url=null,business_mode='solo' where id=$1 returning id",[tenant]))).length,1);
 for(const change of ["plan='enterprise'","monthly_price=1","trial_ends_at=now()+interval '10 years'","subscription_expires_at=now()+interval '10 years'","max_reps=999","suspension_reason='Self-cleared'","status='suspended'","is_active=false"])
  await assert.rejects(as(owner,()=>rows(`update tenants set ${change} where id=$1`,[tenant])),denied,change);
});
await check('platform administrator keeps role and billing administration',async()=>{
 const admin='20000000-0000-4000-8000-000000000013';
 await db.query("insert into auth.users(id,email) values($1,'admin@fixture.example')",[admin]);
 await db.query("insert into profiles(id,tenant_id,role,full_name) values($1,null,'super_admin','Platform fixture')",[admin]);
 assert.equal((await as(admin,()=>rows("update profiles set role='manager' where id=$1 returning id",[rep]))).length,1);
 assert.equal((await as(admin,()=>rows("update tenants set plan='pro',monthly_price=15000 where id=$1 returning id",[otherTenant]))).length,1);
 await db.query("update profiles set role='rep' where id=$1",[rep]);
});
await check('service and provisioning context is unaffected',async()=>{
 await db.query("update profiles set role='manager',debt_limit=1 where id=$1",[rep]);
 await db.query("update profiles set role='rep',debt_limit=null where id=$1",[rep]);
 await db.query("update tenants set status='active' where id=$1",[tenant]);
});
await check('a deactivated account loses role and tenant data with its old JWT',async()=>{
 await db.query('update profiles set is_active=false where id=$1',[rep]);
 const r=await as(rep,async()=>({authority:(await rows('select get_my_role() role,get_my_tenant_id() tenant'))[0],products:(await rows('select id from products')).length}));
 assert.deepEqual(r,{authority:{role:null,tenant:null},products:0});
 await db.query('update profiles set is_active=true where id=$1',[rep]);
 assert.ok((await as(rep,()=>rows('select id from products'))).length>0,'reactivated rep regains access');
});
await check('public signup naming an existing business lands inactive with no tenant data',async()=>{
 const id='20000000-0000-4000-8000-000000000014';
 await signup(id,'join-after@fixture.example',{tenant_id:tenant,role:'manager',full_name:'Metadata joiner'});
 assert.equal((await rows('select is_active from profiles where id=$1',[id]))[0].is_active,false);
 assert.equal((await as(id,()=>rows('select id from products'))).length,0);
 assert.equal((await as(id,()=>rows('select id from profiles where tenant_id=$1',[tenant]))).length,0);
 assert.equal((await as(id,()=>rows('update profiles set is_active=true where id=$1 returning id',[id]).catch(()=>[]))).length,0,'cannot self-activate');
 assert.equal((await as(owner,()=>rows('update profiles set is_active=true where id=$1 returning id',[id]))).length,1,'owner can activate a genuine new staff member');
});
await check('new-business signup still creates an active owner, tenant and categories',async()=>{
 const id='20000000-0000-4000-8000-000000000015';
 await signup(id,'business@fixture.example',{business_name:'Independent fixture business',tenant_id:tenant,role:'super_admin',full_name:'New owner'});
 const p=(await rows('select role::text,is_active,tenant_id from profiles where id=$1',[id]))[0];
 assert.equal(p.role,'owner');assert.equal(p.is_active,true);assert.notEqual(p.tenant_id,tenant);
 assert.equal((await rows('select count(*)::int n from expense_categories where tenant_id=$1',[p.tenant_id]))[0].n,7);
});
await db.close();console.log(`${checks} interim containment checks passed; attacks reproduced and blocked only on fictional records.`);
