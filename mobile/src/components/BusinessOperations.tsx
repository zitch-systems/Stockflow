"use client";
import { useEffect, useRef, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { friendlyError, type Profile } from '@/lib/domain';
import { formatNaira } from '@/lib/format';
import { operation, pendingIntent } from '@/lib/operations';
import { businessFlows, canonicalOrderLines, verifiedCredit, visibleFlows, type BusinessFlow, type OrderLine } from '@/lib/workflows';
import { Button, Dialog, Empty, Icon, Loading, Pagination } from './ui';

type Row={id:string;status?:string;created_at?:string;name?:string;full_name?:string;role?:string;is_active?:boolean;quantity?:number;amount?:number;total_value?:number;total_cases?:number;reason?:string;notes?:string;description?:string;category?:string;rep_id?:string;product_id?:string;supplier_id?:string;invoice_number?:string;photo_url?:string;has_pending_edit?:boolean;pending_edit_amount?:number};
type Action={rpc:string;parameters:Record<string,unknown>;label:string};
const sources={orders:['supplier_orders','id,status,supplier_id,total_cases,total_value,notes,created_at'],returns:['product_returns','id,status,rep_id,product_id,quantity,reason,photo_url,has_pending_edit,created_at'],payments:['payments','id,status,rep_id,amount,notes,has_pending_edit,pending_edit_amount,created_at'],receipts:['inventory_receipts','id,invoice_number,supplier_id,total_value,notes,created_at'],staff:['profiles','id,full_name,role,is_active,created_at'],expenses:['expenses','id,amount,description,category,created_at']} as const;
const flowRpc={orders:['stockflow_v2_receive_order'],returns:['stockflow_v2_submit_return','stockflow_v2_decide_return'],payments:['stockflow_v2_confirm_payment','stockflow_v2_reverse_payment'],receipts:[],staff:[],expenses:[]} as const;
const date=(value?:string)=>value?new Date(value).toLocaleString('en-NG',{timeZone:'Africa/Lagos',dateStyle:'medium',timeStyle:'short'}):'';

export default function BusinessOperations({profile,backendReady,refresh,onBusyChange,initialFlow}:{initialFlow:BusinessFlow|null;profile:Profile;backendReady:boolean|null;refresh:number;onBusyChange:(busy:boolean)=>void}){
 const flows=visibleFlows(profile.role);
 const [flow,setFlow]=useState<BusinessFlow>(flows.some(f=>f.id===initialFlow)?initialFlow!:flows[0]?.id??'returns');
 const [rows,setRows]=useState<Row[]>([]),[names,setNames]=useState<Record<string,string>>({}),[page,setPage]=useState(0),[next,setNext]=useState(false),[status,setStatus]=useState('all');
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[revision,setRevision]=useState(0),[busy,setBusy]=useState(false);
 const [detail,setDetail]=useState<Row|null>(null),[lines,setLines]=useState<OrderLine[]>([]),[detailLoading,setDetailLoading]=useState(false),[detailError,setDetailError]=useState('');
 const [note,setNote]=useState(''),[credit,setCredit]=useState(''),[restock,setRestock]=useState(false),[action,setAction]=useState<Action|null>(null);
 const active=useRef(false), detailRequest=useRef(0);
 useEffect(()=>{onBusyChange(busy);return()=>onBusyChange(false);},[busy,onBusyChange]);
 useEffect(()=>{
  const controller=new AbortController();let ignore=false;
  (async()=>{setLoading(true);setError('');try{
   const sb=getSupabase(),[table,columns]=sources[flow];
   let q=sb.from(table).select(columns).eq('tenant_id',profile.tenant_id).order('created_at',{ascending:false}).order('id');
   if(profile.role==='rep')q=q.eq('rep_id',profile.id);
   if(status!=='all'&&['orders','returns','payments'].includes(flow))q=q.eq('status',status);
   const result=await q.range(page*20,page*20+20).abortSignal(controller.signal);if(result.error)throw result.error;
   // Names are scoped independently: no nested unscoped profile/supplier lookups.
   const ids=[...new Set((result.data as unknown as Row[]).flatMap(r=>[r.rep_id,r.product_id,r.supplier_id]).filter((id):id is string=>!!id))];
   const labels:Record<string,string>={};
   if(ids.length){await Promise.all(([ ['profiles','full_name'],['products','name'],['suppliers','name']] as const).map(async ([table,col])=>{
    const lookup=await sb.from(table).select(`id,${col}`).eq('tenant_id',profile.tenant_id).in('id',ids).abortSignal(controller.signal);
    // Lack of permission to see a name must not expose a different tenant or
    // conceal the underlying record. Use the record ID as the fallback.
    if(!lookup.error)for(const item of lookup.data as unknown as Record<string,string>[])labels[item.id]=item[col];
   }));}
   if(!ignore){setRows(result.data.slice(0,20) as unknown as Row[]);setNext(result.data.length>20);setNames(labels);}
  }catch(e){if(!ignore){setRows([]);setError(friendlyError(e));}}finally{if(!ignore)setLoading(false);}})();
  return()=>{ignore=true;controller.abort();};
 },[profile.id,profile.tenant_id,profile.role,flow,page,status,refresh,revision]);
 const recoveries=(flowRpc[flow] as readonly string[]).flatMap(rpc=>{const parameters=pendingIntent(profile.id,rpc,profile.tenant_id);return parameters?[{rpc,parameters,label:'Retry original request'}]:[];});
 function changeFlow(id:BusinessFlow){if(busy)return;setFlow(id);setPage(0);setStatus('all');detailRequest.current++;setDetail(null);setAction(null);setNotice('');}
 async function open(row:Row){
  const request=++detailRequest.current;
  setDetail(row);setDetailError('');setLines([]);setNote('');setCredit('');setRestock(false);setAction(null);
  if(!['orders','receipts'].includes(flow))return;
  setDetailLoading(true);
  try{
   const sb=getSupabase();
   // First verify the header through the current tenant. Item tables inherit
   // their tenant through the parent and are never queried by arbitrary input.
   const header=await sb.from(sources[flow][0]).select('id').eq('tenant_id',profile.tenant_id).eq('id',row.id).single();if(header.error)throw header.error;
   const result=await sb.from(flow==='orders'?'supplier_order_items':'inventory_receipt_items').select('product_id,quantity,unit_price').eq(flow==='orders'?'order_id':'receipt_id',row.id);if(result.error)throw result.error;
   const delivery=canonicalOrderLines(result.data as OrderLine[]);
   const lookup=await sb.from('products').select('id,name').eq('tenant_id',profile.tenant_id).in('id',[...new Set(delivery.map(l=>l.product_id))]);
   if(request!==detailRequest.current)return;
   if(!lookup.error)setNames(previous=>({...previous,...Object.fromEntries(lookup.data.map(p=>[p.id,p.name]))}));
   setLines(delivery);
  }catch(e){if(request===detailRequest.current)setDetailError(friendlyError(e));}finally{if(request===detailRequest.current)setDetailLoading(false);}
 }
 async function execute(selected:Action){
  if(active.current||!backendReady||!navigator.onLine)return;
  active.current=true;setBusy(true);setError('');setDetailError('');
  try{await operation(profile.id,selected.rpc,selected.parameters,profile.tenant_id);setAction(null);setDetail(null);setNotice('Confirmed. Your business records have been refreshed.');setRevision(n=>n+1);}
  catch(e){const message=friendlyError(e);setError(message);setDetailError(message);setRevision(n=>n+1);}
  finally{active.current=false;setBusy(false);}
 }
 function prepare(rpc:string,parameters:Record<string,unknown>,label:string){
  try{if(note.trim().length<3)throw new Error('Enter a review note of at least three characters.');if(recoveries.length)throw new Error('Recover the original unconfirmed request before starting another.');setDetailError('');setAction({rpc,parameters,label});}catch(e){setDetailError(e instanceof Error?e.message:'Check the review details.');}
 }
 const selected=businessFlows.find(f=>f.id===flow)!;
 const reviewAllowed=profile.role==='owner'||profile.role==='manager';
 return <>
  <div className="sf-page-heading"><div><span className="sf-eyebrow">BUSINESS OPERATIONS</span><h1>{selected.label}</h1><p>{selected.description}</p></div></div>
  <div className="sf-flow-tabs" role="navigation" aria-label="Business operations">{flows.map(f=><button key={f.id} disabled={busy} aria-current={flow===f.id?'page':undefined} className={flow===f.id?'active':''} onClick={()=>changeFlow(f.id)}><Icon name={f.icon}/>{f.label}</button>)}</div>
  {notice&&<p className="sf-notice" role="status">{notice}</p>}
  {recoveries.map(a=><section key={a.rpc} className="sf-card sf-recovery"><h2>Unconfirmed request</h2><p>Retry the saved request to confirm its outcome. Its original details and identity are preserved.</p><Button disabled={busy||!backendReady} onClick={()=>execute(a)}>{busy?'Confirming…':'Retry original request'}</Button></section>)}
  {['orders','returns','payments'].includes(flow)&&<label className="sf-flow-filter">Status<select aria-label="Operation status" value={status} disabled={busy} onChange={e=>{setStatus(e.target.value);setPage(0);}}><option value="all">All statuses</option>{(flow==='orders'?['pending','pending_owner','approved','received','rejected','cancelled']:flow==='returns'?['pending','approved','rejected','cancelled']:['pending','confirmed','rejected','edit_pending']).map(s=><option key={s} value={s}>{s.replaceAll('_',' ')}</option>)}</select></label>}
  {['staff','expenses','receipts'].includes(flow)&&<p className="sf-muted">Existing records are available here. Changes to these records are awaiting a verified server workflow.</p>}
  {error?<div className="sf-error" role="alert">{error}<Button variant="ghost" onClick={()=>setRevision(n=>n+1)}>Retry loading</Button></div>:loading?<Loading/>:rows.length?<div className="sf-flow-records">{rows.map(row=><button key={row.id} className="sf-card sf-flow-record" disabled={busy} onClick={()=>open(row)}><div><strong>{row.full_name||row.invoice_number||names[row.product_id??'']||names[row.supplier_id??'']||names[row.rep_id??'']||row.category||'Business record'}</strong><small>{date(row.created_at)} · {row.id.slice(0,8)}</small><span>{row.description||row.reason||row.notes||row.role||''}</span></div><div><strong>{row.amount!==undefined?formatNaira(Number(row.amount)):row.total_value!==undefined?formatNaira(Number(row.total_value)):row.quantity!==undefined?`${row.quantity} cases`:''}</strong><span className="sf-badge">{row.status?.replaceAll('_',' ')||(flow==='staff'?(row.is_active===false?'Inactive':'Active'):'Recorded')}</span><Icon name="arrow"/></div></button>)}</div>:<Empty title={`No ${selected.label.toLowerCase()} ${status==='all'?'yet':'with this status'}`} description="Records will appear here when they are available for your business."/>}
  <Pagination page={page} hasNext={next} busy={loading||busy} onChange={setPage}/>
  {detail&&<Dialog title={selected.label==='Team'?'Team member':`${selected.label} details`} onClose={()=>{if(!busy){detailRequest.current++;setDetail(null);setAction(null);}}}>
   <p className="sf-muted">{detail.id} · {date(detail.created_at)}</p>
   <dl className="sf-flow-detail">{Object.entries(detail).filter(([k,v])=>!['id','created_at','photo_url'].includes(k)&&v!==null&&v!==undefined).map(([key,value])=><div key={key}><dt>{key.replaceAll('_',' ')}</dt><dd>{['amount','total_value','pending_edit_amount'].includes(key)?formatNaira(Number(value)):names[String(value)]||String(value).replaceAll('_',' ')}</dd></div>)}</dl>
   {detailLoading?<Loading/>:lines.length>0&&<section className="sf-card"><h2>Delivery lines</h2>{lines.map((line,i)=><p key={i}>{names[line.product_id]||line.product_id} · {line.quantity} cases × {formatNaira(Number(line.unit_price))}</p>)}<p>Receiving adds these cases to warehouse stock. It does not record a supplier payment.</p></section>}
   {detailError&&<p className="sf-error" role="alert">{detailError}</p>}
   {reviewAllowed&&['orders','returns','payments'].includes(flow)&&<>
    {!backendReady&&<p className="sf-notice">Review actions will be available after the verified transaction backend is installed.</p>}
    <fieldset disabled={busy||!backendReady||recoveries.length>0||!!action} className="sf-form">
     <label>Review note<input value={note} onChange={e=>setNote(e.target.value)} maxLength={500} placeholder="What did you verify?"/></label>
     {flow==='returns'&&detail.status==='pending'&&!detail.has_pending_edit&&<>
      <label>Verified debt credit (₦)<input inputMode="decimal" value={credit} onChange={e=>setCredit(e.target.value)} placeholder="Use original debt evidence"/></label>
      <label><input type="checkbox" checked={restock} onChange={e=>setRestock(e.target.checked)}/> Returned goods can re-enter warehouse stock</label>
      <p className="sf-muted">Use the original stock and debt evidence. Historical returns without a recorded reservation require reconciliation; current product prices are not proof of credit.</p>
      <Button onClick={()=>{try{prepare('stockflow_v2_decide_return',{p_return_id:detail.id,p_approve:true,p_restock:restock,p_credit:verifiedCredit(credit),p_note:note.trim()},'Approve return');}catch(e){setDetailError(e instanceof Error?e.message:'Check credit amount.');}}}>Review approval</Button>
      <Button variant="danger" onClick={()=>prepare('stockflow_v2_decide_return',{p_return_id:detail.id,p_approve:false,p_restock:false,p_credit:0,p_note:note.trim()},'Reject return')}>Review rejection</Button>
     </>}
     {flow==='orders'&&detail.status==='approved'&&lines.length>0&&!detailLoading&&!detailError&&<Button onClick={()=>prepare('stockflow_v2_receive_order',{p_order_id:detail.id,p_expected_items:lines,p_note:note.trim()},'Receive delivery')}>Review receiving</Button>}
     {flow==='payments'&&!detail.has_pending_edit&&detail.status==='pending'&&<><p className="sf-muted">Verify the actual bank or cash receipt before confirming payment.</p><Button onClick={()=>prepare('stockflow_v2_confirm_payment',{p_payment_id:detail.id,p_note:note.trim()},'Confirm payment')}>Review confirmation</Button></>}
     {flow==='payments'&&!detail.has_pending_edit&&detail.status==='confirmed'&&<><p className="sf-muted">A reversal restores only the recorded debt allocation. Historical payments without an allocation ledger require reconciliation.</p><Button variant="danger" onClick={()=>prepare('stockflow_v2_reverse_payment',{p_payment_id:detail.id,p_note:note.trim()},'Reverse payment')}>Review reversal</Button></>}
    </fieldset>
   </>}
   {action&&<section className="sf-card sf-recovery"><h2>{action.label}?</h2><p>{note}</p><p>Confirm only after checking the details above. Changes are submitted as one protected transaction.</p><Button disabled={busy||!backendReady} onClick={()=>execute(action)}>{busy?'Confirming…':action.label}</Button><Button variant="ghost" disabled={busy} onClick={()=>setAction(null)}>Back to review</Button></section>}
  </Dialog>}
 </>;
}
