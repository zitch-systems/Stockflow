import {describe,it,expect} from 'vitest';
import {approvalStatuses,canonicalOrderLines,reviewFlows,verifiedCredit,visibleFlows} from './workflows';
describe('business workflow boundaries',()=>{
 it('limits rep navigation to their returns and payments',()=>{expect(visibleFlows('rep').map(f=>f.id)).toEqual(['returns','payments']);expect(visibleFlows('super_admin')).toEqual([]);});
 it('keeps approvals restricted to reviewers and excludes terminal transactions',()=>{
  for(const role of ['owner','manager'] as const)expect(reviewFlows(role).map(f=>f.id)).toEqual(['orders','returns','payments']);
  for(const role of ['rep','super_admin'] as const)expect(reviewFlows(role)).toEqual([]);
  expect(approvalStatuses.orders).toContain('approved');
  for(const statuses of Object.values(approvalStatuses))for(const terminal of ['received','confirmed','rejected','cancelled'])expect(statuses).not.toContain(terminal);
 });
 it('preserves duplicate order lines and sorts the immutable snapshot',()=>{const lines=[{product_id:'b',quantity:2,unit_price:3},{product_id:'a',quantity:2,unit_price:'4.00'},{product_id:'a',quantity:1,unit_price:4}];expect(canonicalOrderLines(lines)).toEqual([{product_id:'a',quantity:1,unit_price:4},{product_id:'a',quantity:2,unit_price:4},{product_id:'b',quantity:2,unit_price:3}]);expect(lines[0].product_id).toBe('b');});
 it('rejects missing or malformed delivery evidence',()=>{for(const lines of [[],[{product_id:'a',quantity:0,unit_price:1}],[{product_id:'a',quantity:1,unit_price:'NaN'}],[{product_id:'a',quantity:1,unit_price:1.001}]])expect(()=>canonicalOrderLines(lines)).toThrow();});
 it('requires explicit finite original credit rather than a guessed product price',()=>{expect(verifiedCredit('0')).toBe(0);expect(verifiedCredit('100.25')).toBe(100.25);for(const input of ['', '-1','NaN','Infinity','1.001','100000001'])expect(()=>verifiedCredit(input)).toThrow();});
});
