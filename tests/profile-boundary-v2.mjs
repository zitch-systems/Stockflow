// Captured live schema, fictional identities, no production connection.
import {PGlite} from '@electric-sql/pglite';
import {pg_trgm} from '@electric-sql/pglite/contrib/pg_trgm';
import {uuid_ossp} from '@electric-sql/pglite/contrib/uuid_ossp';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite({extensions:{pg_trgm,uuid_ossp}});
await db.exec(await readFile('tests/fixtures/live-schema-contract.sql','utf8'));
const owner='20000000-0000-4000-8000-000000000001',rep='20000000-0000-4000-8000-000000000002',foreign='20000000-0000-4000-8000-000000000004';
const actor=id=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
// Reproduce the effective privilege escalation on fictional records. SELECT
// correctly hides foreign rows from owners, but an owner can promote another
// same-tenant account to super_admin; that account then sees every tenant.
await actor(owner);await db.exec('set role authenticated');
assert.equal((await db.query("update profiles set role='super_admin' where id=$1 returning id",[rep])).rows.length,1);
await db.exec('reset role');await actor(rep);await db.exec('set role authenticated');
assert.equal((await db.query("update profiles set full_name='Foreign tamper fixture' where id=$1 returning id",[foreign])).rows.length,1);
await db.exec('reset role');await actor(null);
await db.query("update profiles set role='rep' where id=$1",[rep]);
await db.exec(await readFile('supabase/review/profile-boundary.sql','utf8'));
let checks=0;const check=async(name,fn)=>{await fn();checks++;console.log('PASS '+name);};
await check('owner cannot update another tenant profile',async()=>{await actor(owner);await db.exec('set role authenticated');assert.equal((await db.query("update profiles set full_name='Blocked tamper' where id=$1 returning id",[foreign])).rows.length,0);await db.exec('reset role');});
await check('owner cannot update another staff member through direct API',async()=>{await actor(owner);await db.exec('set role authenticated');assert.equal((await db.query("update profiles set full_name='Blocked staff change' where id=$1 returning id",[rep])).rows.length,0);await db.exec('reset role');});
await check('active user can update their own contact fields',async()=>{await actor(rep);await db.exec('set role authenticated');assert.equal((await db.query("update profiles set full_name='Safe fixture contact',phone='08000000000' where id=$1 returning id",[rep])).rows.length,1);await db.exec('reset role');});
await check('self role/tenant/activation/debt edits are denied',async()=>{await actor(rep);await db.exec('set role authenticated');for(const change of ["role='owner'","tenant_id='10000000-0000-4000-8000-000000000002'","is_active=false","debt_limit=999999"]){await assert.rejects(db.query(`update profiles set ${change} where id=$1`,[rep]),/permission denied/);}await db.exec('reset role');});
await check('direct insertion deletion and truncate are denied',async()=>{await actor(owner);await db.exec('set role authenticated');await assert.rejects(db.exec("insert into profiles(id,tenant_id,full_name,role) values(gen_random_uuid(),'10000000-0000-4000-8000-000000000001','Injected','super_admin')"),/permission denied/);await assert.rejects(db.query('delete from profiles where id=$1',[rep]),/permission denied/);await assert.rejects(db.exec('truncate profiles'),/permission denied/);await db.exec('reset role');});
await check('anonymous profile read is denied',async()=>{await db.exec('set role anon');await assert.rejects(db.exec('select * from profiles'),/permission denied/);await db.exec('reset role');});
await check('owner business contact edit is scoped and billing fields cannot be changed',async()=>{
 await actor(owner);await db.exec('set role authenticated');
 assert.equal((await db.query("update tenants set name='Verified fixture business' where id='10000000-0000-4000-8000-000000000001' returning id")).rows.length,1);
 assert.equal((await db.query("update tenants set name='Blocked foreign name' where id='10000000-0000-4000-8000-000000000002' returning id")).rows.length,0);
 for(const change of ["status='active'","plan='enterprise'","monthly_price=0","subscription_expires_at=now()+interval '100 years'"]){await assert.rejects(db.exec(`update tenants set ${change}`),/permission denied/);}
 await db.exec('reset role');
});
await check('rep cannot change business name or create a tenant',async()=>{
 await actor(rep);await db.exec('set role authenticated');
 assert.equal((await db.exec("update tenants set name='Blocked rep tamper' returning id"))[0].rows.length,0);
 await assert.rejects(db.exec("insert into tenants(name) values('Injected')"),/permission denied/);
 await db.exec('reset role');
});
await check('captured signup handler reproduces metadata-based tenant attachment on fictional identity',async()=>{
 await actor(null);const id='20000000-0000-4000-8000-000000000005';
 await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,'spoof-before@fixture.example',$2::jsonb)",[id,JSON.stringify({tenant_id:'10000000-0000-4000-8000-000000000001',role:'manager',full_name:'Metadata fixture'})]);
 const p=(await db.query('select role,is_active,tenant_id from profiles where id=$1',[id])).rows[0];assert.equal(p.role,'manager');assert.equal(p.is_active,true);assert.equal(p.tenant_id,'10000000-0000-4000-8000-000000000001');
 await db.query('delete from auth.users where id=$1',[id]);
});
await check('V2 signup replacement rejects existing-tenant authority from public metadata',async()=>{
 await db.exec(await readFile('supabase/migrations/20261001092411_stockflow_v2_integrity.sql','utf8'));
 const id='20000000-0000-4000-8000-000000000006';
 await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,'spoof-after@fixture.example',$2::jsonb)",[id,JSON.stringify({tenant_id:'10000000-0000-4000-8000-000000000001',role:'manager',full_name:'Metadata fixture'})]);
 assert.equal((await db.query('select * from profiles where id=$1',[id])).rows.length,0);
});
await db.close();console.log(`${checks} profile boundary checks passed; reviewed production policy exploit reproduced only on fictional records.`);
