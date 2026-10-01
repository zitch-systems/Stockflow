import { staffInviteHandler } from '../supabase/functions/provision-stockflow-staff/handler.mjs';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const actor='20000000-0000-4000-8000-000000000001',tenant='10000000-0000-4000-8000-000000000001',key='a0000000-0000-4000-8000-000000000001';
const base={request_id:key,email:'new.staff@stockflow.test',full_name:'New Staff',phone:null,role:'manager',tenant_id:'foreign-tenant',actor_id:'foreign-owner'};
const checks=[];
const request=(body=base,token='owner',origin='https://stockflow.test')=>new Request('https://fixture/functions/v1/provision-stockflow-staff',{method:'POST',headers:{authorization:'Bearer '+token,origin},body:JSON.stringify(body)});
function fixture(){
  const calls=[];let recorded=null,done=false;
  const caller={auth:{getUser:async()=>({data:{user:{id:actor}},error:null})},rpc:async(name,args)=>{calls.push({name,args});assert.equal(name,'stockflow_v2_begin_staff_invite');assert.equal(Object.hasOwn(args,'p_tenant_id'),false);return {data:{ok:true},error:null};}};
  const admin={auth:{admin:{inviteUserByEmail:async(email,options)=>{calls.push({name:'email invitation',email,options});assert.equal(options.redirectTo,'https://stockflow.test/reset-password.html');assert.equal(options.data.stockflow_invited_by,actor);assert.equal(Object.hasOwn(options.data,'tenant_id'),false);recorded='new-auth-user';return {data:{user:{id:recorded}},error:null};}}},rpc:async(name,args)=>{
    calls.push({name,args});assert.equal(args.p_actor_id,actor);assert.equal(args.p_request_id,key);
    if(name==='stockflow_v2_staff_invite_state')return {data:{tenant_id:tenant,payload:base,user_id:recorded,result:done?{ok:true,user_id:recorded}:null},error:null};
    assert.equal(name,'stockflow_v2_finish_staff_invite');assert.equal(args.p_user_id,recorded);done=true;return {data:{ok:true,user_id:recorded,invitation_requested:true},error:null};
  }};
  const handler=staffInviteHandler({userClient:()=>caller,serviceClient:()=>admin,webOrigin:'https://stockflow.test'});
  return {calls,caller,admin,handler};
}
async function check(name,fn){await fn();checks.push({name,status:'passed'});console.log('PASS '+name);}
await check('unverified session cannot reach provisioning',async()=>{const f=fixture();f.caller.auth.getUser=async()=>({data:{user:null},error:{status:401}});assert.equal((await f.handler(request())).status,401);assert.equal(f.calls.length,0);});
await check('forged role and origin are rejected before Auth administration',async()=>{const f=fixture();assert.equal((await f.handler(request({...base,role:'owner'}))).status,400);assert.equal((await f.handler(request(base,'owner','https://foreign.example'))).status,403);assert.equal(f.calls.length,0);});
await check('manager or inactive owner permission failure never sends an invitation',async()=>{const f=fixture();f.caller.rpc=async()=>({error:{code:'42501'},data:null});assert.equal((await f.handler(request())).status,403);assert.equal(f.calls.length,0);});
await check('tenant and actor body values cannot select the invitation authority',async()=>{const f=fixture();const r=await f.handler(request());assert.equal(r.status,200);assert.equal((await r.json()).user_id,'new-auth-user');assert.equal(f.calls.filter(c=>c.name==='email invitation').length,1);});
await check('retry after response loss recovers the staff without sending another email',async()=>{const f=fixture();await f.handler(request());await f.handler(request());assert.equal(f.calls.filter(c=>c.name==='email invitation').length,1);});
await check('retry after invitation but before profile finish resumes the same user',async()=>{const f=fixture();const original=f.admin.rpc;let failure=true;f.admin.rpc=async(name,args)=>{if(name==='stockflow_v2_finish_staff_invite'&&failure){failure=false;return {error:{code:'NETWORK'},data:null};}return original(name,args);};assert.equal((await f.handler(request())).status,503);assert.equal((await f.handler(request())).status,200);assert.equal(f.calls.filter(c=>c.name==='email invitation').length,1);});
await check('uncertain database/Auth responses remain retryable instead of dropping the key',async()=>{for(const point of ['identity','begin','state']){const f=fixture();if(point==='identity')f.caller.auth.getUser=async()=>({data:{user:null},error:{status:0}});if(point==='begin')f.caller.rpc=async()=>({error:{code:''},data:null});if(point==='state')f.admin.rpc=async()=>({error:{code:'NETWORK'},data:null});assert.equal((await f.handler(request())).status,503);assert.equal(f.calls.filter(c=>c.name==='email invitation').length,0);}});
await writeFile(new URL('../docs/v2/staff-invite-results.json',import.meta.url),JSON.stringify({date:new Date().toISOString(),checks,scope:'Actual Edge handler with injected Auth/database clients; no email sent, no live Supabase certification'},null,2)+'\n');
console.log(`${checks.length} trusted staff invitation handler checks passed.`);
