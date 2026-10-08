import type { Profile } from './domain';
export const businessFlows = [
  {id:'orders',label:'Supplier orders',icon:'inventory',description:'Review deliveries and received stock',roles:['owner','manager']},
  {id:'returns',label:'Returns',icon:'back',description:'Track returned stock and review decisions',roles:['owner','manager','rep']},
  {id:'payments',label:'Rep payments',icon:'sales',description:'Review collections and payment history',roles:['owner','manager','rep']},
  {id:'receipts',label:'Stock receipts',icon:'inventory',description:'Browse deliveries and their invoice lines',roles:['owner','manager']},
  {id:'staff',label:'Team',icon:'customers',description:'See your business’s reps and managers',roles:['owner','manager']},
  {id:'expenses',label:'Expenses',icon:'sales',description:'Review business spending',roles:['owner','manager']},
] as const;
export type BusinessFlow = typeof businessFlows[number]['id'];
export const visibleFlows=(role: Profile['role'])=>businessFlows.filter(f=>(f.roles as readonly string[]).includes(role));
// The former dashboard's Approvals entry is a work queue, not the complete
// transaction history. Keep terminal records out and never expose it to reps.
export const approvalStatuses = {
  orders: ['pending', 'pending_owner', 'approved'],
  returns: ['pending'],
  payments: ['pending', 'edit_pending'],
} as const;
export const reviewFlows=(role: Profile['role'])=>role==='owner'||role==='manager'
  ? visibleFlows(role).filter(f=>f.id in approvalStatuses) : [];
export const processSteps: Record<BusinessFlow, string> = {
  orders: 'Order → Approval → Check delivery lines → Receive into warehouse',
  returns: 'Return request → Check original stock and debt → Decision → Stock and debt update',
  payments: 'Payment submitted → Verify money received → Confirm → Debt allocation',
  receipts: 'Delivery → Invoice and item checks → Stock receipt → Receipt history',
  staff: 'Team roster → Member details',
  expenses: 'Expense recorded → Spending history → Record details',
};
export type OrderLine={product_id:string;quantity:number;unit_price:number|string};
// Match the server's canonical immutable order snapshot, retaining duplicate
// product lines rather than concealing differences in costs or quantities.
export function canonicalOrderLines(lines:OrderLine[]):OrderLine[]{
  if(!lines.length||lines.length>100)throw new Error('This order needs line reconciliation.');
  return lines.map(l=>{
    const price=Number(l.unit_price);
    if(!l.product_id||!Number.isSafeInteger(l.quantity)||l.quantity<=0||!Number.isFinite(price)||price<0||Math.abs(price*100-Math.round(price*100))>1e-6)throw new Error('This order has invalid quantities or prices.');
    return {product_id:l.product_id,quantity:l.quantity,unit_price:price};
  }).sort((a,b)=>a.product_id<b.product_id?-1:a.product_id>b.product_id?1:Number(a.unit_price)-Number(b.unit_price)||a.quantity-b.quantity);
}
export function verifiedCredit(value:string):number{
  if(!/^\d+(?:\.\d{1,2})?$/.test(value))throw new Error('Enter a verified credit amount, using no more than two decimal places.');
  const n=Number(value);if(!Number.isFinite(n)||n>100000000)throw new Error('The credit amount exceeds the supported limit.');return n;
}
