// Execute retained action functions with rejected/uncertain RPC responses.
// These checks protect against secondary writes; they do not certify live UI.
import { parse } from 'acorn';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
const results=[];
async function action(file,name){
  const text=await readFile(new URL('../'+file,import.meta.url),'utf8');
  const scripts=file.endsWith('.js')?[text]:[...text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
  let source;
  for(const script of scripts){
    const tree=parse(script,{ecmaVersion:'latest',sourceType:'script'});
    function walk(node){
      if(!node||typeof node!=='object')return;
      if(node.type==='AssignmentExpression'&&node.left.type==='MemberExpression'&&node.left.object.name==='window'&&node.left.property.name===name)source=script.slice(node.right.start,node.right.end);
      if(node.type==='FunctionDeclaration'&&node.id.name===name)source=script.slice(node.start,node.end);
      for(const [key,value] of Object.entries(node))if(!['start','end','loc'].includes(key)){
        if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);
      }
    }
    walk(tree);
  }
  assert.ok(source,`${file}:${name} action not found`);
  return source;
}
const targets=[
  ['rep-dashboard.html','saveEditSale'],['rep-dashboard.html','cancelSale'],
  ['manager-dashboard.html','confirmPayment'],['manager-dashboard.html','quickRejectPayment'],
  ['manager-dashboard.html','_submitReceiveInv'],
  ['owner-dashboard.html','ownerConfirmPayment'],['owner-dashboard.html','_doSubmitReceiveInv'],
  ['owner-dashboard.html','slWhAdjustSubmit'],['owner-dashboard.html','slWhQuickAdd'],
];
for(const [file,name] of targets){
  const source=await action(file,name);
  for(const mode of name==='cancelSale'?['rejected','network']:['rejected','network','no-result']){
    let writes=0,calls=0;const messages=[];
    const button={disabled:false,textContent:'Save',innerHTML:''};
    const values={editCust:'Customer',editSaleReason:'Correction',cpNote:'Verified',invSupplier:'supplier',invNumber:'INV1',invNotes:'Delivery',invDateReceived:'2026-09-30',slWhAdjNew:'2',slWhAdjCur:'3',slWhAdjReason:'Physical count',slWhAdjNote:'Checked'};
    const nodes=new Map();
    const get=(id)=>{if(!nodes.has(id))nodes.set(id,{value:values[id]??'',textContent:id.startsWith('epq_')?'1':'',files:[]});return nodes.get(id);};
    const sale={id:'sale',status:'pending',sale_items:[{product_id:'product',quantity:1}]};
    const row={dataset:{pid:'product',list:'150'},querySelector:()=>({value:'150'})};
    const product={id:'product',name:'Test stock',warehouse_stock:3};
    const window={currentProfile:{id:'rep',tenant_id:'tenant'},PRODUCTS:[product],location:{href:''},toast:(...x)=>messages.push(x),stockflowTransactionMessage:()=> 'Could not confirm this action.',sb:{
      from:()=>{writes++;throw Error('Separate database writes are forbidden after RPC failure');},
      rpc:async()=>{calls++;if(mode==='network')throw new TypeError('Failed to fetch');return {data:null,error:mode==='rejected'?{code:'42501',message:'Business access denied'}:null};}
    }};
    window.stockflowOperation=async()=>{const r=await window.sb.rpc();if(r.error||r.data===null)throw r.error??new Error('Result unconfirmed');return r.data;};
    const env={window,document:{getElementById:get,querySelector:()=>button,querySelectorAll:()=>[row]},console:{warn(){},error(){}},confirm:()=>true,prompt:()=> 'Customer changed order',
      editingSaleId:'sale',MY_SALES:[sale],HOLDING:[{id:'product',inHand:3,buyPrice:100}],_sfCancelInFlight:new Set(),currentPayId:'payment',PENDING_PAYMENTS:[{id:'payment',rep_id:'rep',amount:150}],
      _ownerCurrentPayId:'payment',_ownerConfirmBusy:false,g:get,sfCheckFile:()=>true,invRowState:{product:{qty:1,price:100}},_invRowState:{product:{qty:1,price:100}},
      PRODUCTS:[product],_slWhAdjProd:'product',_slWhAdjustBusy:false,
    };
    const fn=vm.runInNewContext('('+source+')',env);
    await fn(name==='cancelSale'?'sale':name==='slWhQuickAdd'?'product':'payment',10);
    assert.equal(calls,1,`${name} did not exercise its RPC`);
    assert.equal(writes,0,`${name} made fallback writes after ${mode}`);
    assert.ok(messages.length>0,`${name} did not explain the unconfirmed action`);
    results.push({action:name,response:mode,status:'passed'});
  }
}
for(const error of [{code:'PGRST116',message:'No row'},{code:'NETWORK',message:'Failed to fetch'}]){
  let writes=0,signouts=0;
  const query={select:()=>query,eq:()=>query,single:async()=>({data:null,error}),upsert:()=>{writes++;throw Error('Metadata cannot provision a profile');}};
  const window={location:{href:''},sb:{from:()=>query,auth:{getSession:async()=>({data:{session:{user:{id:'user',user_metadata:{role:'owner',tenant_id:'foreign-business'}}}}}),signOut:async()=>{signouts++;}}}};
  const fn=vm.runInNewContext('('+await action('supabase-client.js','requireAuth')+')',{window});
  assert.equal(await fn(['owner']),null);assert.equal(writes,0);
  assert.equal(window.location.href,error.code==='PGRST116'?'login.html?err=profile_missing':'login.html?err=profile_unavailable');
  assert.equal(signouts,error.code==='PGRST116'?1:0);
  results.push({action:'requireAuth',response:error.code,status:'passed'});
}
const safeCsv=vm.runInNewContext('('+await action('stockflow-transactions.js','stockflowSafeCsv')+')',{});
for(const [name,input,expected] of [
  ['formula cells','=SUM(1),+HYPERLINK,-command,@SUM',`"'=SUM(1)","'+HYPERLINK","'-command","'@SUM"`],
  ['numeric and currency values','-1200.25,1500,0','"-1200.25","1500","0"'],
  ['quoted names and newlines','\uFEFF"Ada, Stores","Line\nTwo","A ""quoted"" name"\n','\uFEFF"Ada, Stores","Line\nTwo","A ""quoted"" name"\r\n'],
  ['whitespace formula bypass','"  =SUM(1)","\t=SUM(2)"',`"'  =SUM(1)","'\t=SUM(2)"`],
]){
  assert.equal(safeCsv(input),expected,name);results.push({action:'CSV export',response:name,status:'passed'});
}
function intentFixture(){
  const values=new Map(),calls=[];
  const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  const window={currentProfile:{id:'owner'},sb:{rpc:async(name,args)=>{calls.push(args);return {data:'original-sale',error:null};}}};
  const env={window,sessionStorage:storage,crypto:{randomUUID:()=>crypto.randomUUID()}};
  return {window,env,storage,calls};
}
const opSource=await action('stockflow-transactions.js','stockflowOperation');
for(const code of ['NETWORK','PGRST000','503']){
  const f=intentFixture();let attempt=0;
  f.window.sb.rpc=async(name,args)=>{f.calls.push(args);return ++attempt===1?{data:null,error:{code}}:{data:'original-sale',error:null};};
  const operation=vm.runInNewContext('('+opSource+')',f.env);
  await assert.rejects(operation('stockflow_v2_sale',{p_items:[{quantity:1}]}));
  await operation('stockflow_v2_sale',{p_items:[{quantity:1}]});
  assert.equal(f.calls[0].p_request_id,f.calls[1].p_request_id);
  results.push({action:'retained operation recovery',response:code,status:'passed'});
}
{
  const f=intentFixture();let attempt=0;
  f.window.sb.rpc=async(name,args)=>{f.calls.push(args);return ++attempt<3?{data:null,error:{code:attempt===1?'NETWORK':'42501'}}:{data:'original-sale',error:null};};
  const operation=vm.runInNewContext('('+opSource+')',f.env);
  const body={p_items:[{quantity:1}]};
  await assert.rejects(operation('stockflow_v2_sale',body));await assert.rejects(operation('stockflow_v2_sale',body));
  assert.equal(await operation('stockflow_v2_sale',body),'original-sale');
  assert.equal(new Set(f.calls.map(c=>c.p_request_id)).size,1);
  results.push({action:'retained operation recovery',response:'access failure after uncertainty',status:'passed'});
}
{
  const f=intentFixture();let attempt=0;
  f.window.sb.rpc=async(name,args)=>{f.calls.push(args);return ++attempt===1?{data:null,error:{code:'P0001'}}:{data:'corrected-sale',error:null};};
  const operation=vm.runInNewContext('('+opSource+')',f.env);
  await assert.rejects(operation('stockflow_v2_sale',{p_items:[{quantity:100}]}));
  await operation('stockflow_v2_sale',{p_items:[{quantity:1}]});
  assert.notEqual(f.calls[0].p_request_id,f.calls[1].p_request_id);
  results.push({action:'retained operation correction',response:'definitive first rejection',status:'passed'});
}
{
  const f=intentFixture();let attempt=0;const bodies=[];
  f.window.sb.auth={getSession:async()=>({data:{session:{access_token:'fixture-only'}}})};
  f.window.sb.supabaseUrl='https://fixture';f.window.sb.supabaseKey='public-fixture';
  Object.assign(f.env,{AbortController,setTimeout,clearTimeout,fetch:async(url,request)=>{
    bodies.push(JSON.parse(request.body));if(++attempt===1)throw TypeError('Response lost after invitation');
    return {ok:attempt>2,status:attempt===2?401:200,json:async()=>attempt===2?{error:'Sign in again'}:{ok:true,user_id:'existing-invite-user'}};
  }});
  const invite=vm.runInNewContext('('+await action('stockflow-transactions.js','stockflowInviteStaff')+')',f.env);
  const body={email:'staff@fixture.example',full_name:'Staff',role:'rep'};
  await assert.rejects(invite(body));await assert.rejects(invite(body));
  assert.equal((await invite(body)).user_id,'existing-invite-user');
  assert.equal(new Set(bodies.map(b=>b.request_id)).size,1);
  results.push({action:'staff invitation client recovery',response:'reauthentication after uncertainty',status:'passed'});
}
await writeFile(new URL('../docs/v2/legacy-guard-results.json',import.meta.url),JSON.stringify({date:new Date().toISOString(),checks:results,scope:'Actual retained JavaScript action functions with mocked RPC failures/profile responses and adversarial CSV text; not live role-flow certification'},null,2)+'\n');
console.log(`${results.length} retained-action failure and auth-profile checks passed; no fallback database mutations.`);
