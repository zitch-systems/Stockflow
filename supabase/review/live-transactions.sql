-- Actual-schema review, 8 October 2026. Requires the V2 layer first.
-- Test on an isolated restore before creating/applying a forward migration.
-- No historical stock/debt/payment values are backfilled or corrected.
begin;
create table stockflow_private.return_reservations (
 return_id uuid primary key references public.product_returns(id),tenant_id uuid not null references public.tenants(id),
 quantity integer not null check(quantity>0),decision jsonb,result jsonb
);
create table stockflow_private.payment_effects (
 payment_id uuid primary key references public.payments(id),tenant_id uuid not null references public.tenants(id),
 amount numeric not null,applied numeric not null,overpayment numeric not null,
 allocations jsonb not null,revision integer not null default 1
);
create table stockflow_private.order_receipts (
 order_id uuid primary key references public.supplier_orders(id),tenant_id uuid not null references public.tenants(id),
 payload jsonb not null,result jsonb not null
);
revoke all on stockflow_private.return_reservations,stockflow_private.payment_effects,stockflow_private.order_receipts from public,anon,authenticated;

create function public.stockflow_v2_submit_return(p_request_id uuid,p_product_id uuid,p_quantity integer,p_reason text,p_photo_url text)
returns uuid language plpgsql security definer set search_path='' as $$
declare p public.profiles; h public.rep_holdings; prev jsonb; rid uuid:=gen_random_uuid();
begin
 p:=stockflow_private.access();
 if p.role::text<>'rep' then raise exception using errcode='42501',message='Only reps can submit holding returns'; end if;
 prev:=stockflow_private.claim(p_request_id,'return submission',jsonb_build_array(p_product_id,p_quantity,p_reason,p_photo_url));
 if prev is not null then return (prev->>'id')::uuid; end if;
 if p_quantity is null or p_quantity not between 1 and 1000000 or length(trim(coalesce(p_reason,'')))<3 then raise exception 'Enter a whole return quantity and reason'; end if;
 if p_photo_url is null or not stockflow_private.attachment_path(p_photo_url,'returns',p.tenant_id,p.id) then raise exception 'Return photo access denied'; end if;
 perform 1 from public.products where id=p_product_id and tenant_id=p.tenant_id for update;
 if not found then raise exception using errcode='42501',message='Product access denied'; end if;
 select * into h from public.rep_holdings where rep_id=p.id and product_id=p_product_id and tenant_id=p.tenant_id for update;
 if not found or h.quantity<p_quantity then raise exception 'Stock changed. Refresh and check available quantity'; end if;
 insert into public.product_returns(id,tenant_id,rep_id,product_id,quantity,reason,photo_url,status) values(rid,p.tenant_id,p.id,p_product_id,p_quantity,p_reason,p_photo_url,'pending');
 update public.rep_holdings set quantity=quantity-p_quantity,updated_at=now() where id=h.id;
 insert into stockflow_private.return_reservations(return_id,tenant_id,quantity) values(rid,p.tenant_id,p_quantity);
 insert into public.stockflow_audit(tenant_id,actor_id,action,object_id,after_state,reason) values(p.tenant_id,p.id,'return_reserved',rid,jsonb_build_object('quantity',p_quantity),p_reason);
 perform stockflow_private.finish(p_request_id,jsonb_build_object('id',rid));return rid;
end $$;

create function public.stockflow_v2_decide_return(p_request_id uuid,p_return_id uuid,p_approve boolean,p_restock boolean,p_credit numeric,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.profiles;r public.product_returns;state stockflow_private.return_reservations;h public.rep_holdings;body jsonb;prev jsonb;v_result jsonb;
begin
 p:=stockflow_private.access();if p.role::text not in ('owner','manager') then raise exception using errcode='42501',message='Manager access required'; end if;
 body:=jsonb_build_array(p_return_id,p_approve,p_restock,p_credit,p_note);
 prev:=stockflow_private.claim(p_request_id,'return decision',body);if prev is not null then return prev;end if;
 if p_approve is null or p_restock is null or p_credit is null or p_credit::text in ('NaN','Infinity','-Infinity') or p_credit<0 or p_credit<>round(p_credit,2) or length(trim(coalesce(p_note,'')))<3 then raise exception 'Enter a verified credit and decision reason';end if;
 if not p_approve and (p_restock or p_credit<>0) then raise exception 'Rejected returns cannot restock or credit debt';end if;
 select * into r from public.product_returns where id=p_return_id and tenant_id=p.tenant_id for update;
 if not found then raise exception using errcode='42501',message='Return access denied';end if;
 select * into state from stockflow_private.return_reservations where return_id=r.id and tenant_id=p.tenant_id for update;
 if not found then raise exception 'Historical return needs reservation and debt reconciliation';end if;
 if state.result is not null then
  if state.decision<>body then raise exception 'Return was already decided with other details';end if;
  perform stockflow_private.finish(p_request_id,state.result);return state.result;
 end if;
 if r.status::text<>'pending' or r.has_pending_edit or r.quantity<>state.quantity then raise exception 'Return changed; reconcile before deciding';end if;
 perform 1 from public.products where id=r.product_id and tenant_id=p.tenant_id for update;
 if not found then raise exception using errcode='42501',message='Product access denied';end if;
 select * into h from public.rep_holdings where rep_id=r.rep_id and product_id=r.product_id and tenant_id=p.tenant_id for update;
 if not found then raise exception 'Holding missing; reconcile before deciding';end if;
 if h.debt_amount is null or h.debt_amount::text in ('NaN','Infinity','-Infinity') or h.debt_amount<0 then raise exception 'Holding debt needs reconciliation';end if;
 if p_credit>h.debt_amount then raise exception 'Verified credit exceeds the outstanding product debt';end if;
 if p_approve then
  -- Credit is explicitly verified by the reviewer, never inferred from a new list price.
  update public.rep_holdings set debt_amount=debt_amount-p_credit,updated_at=now() where id=h.id;
  if p_restock then update public.products set warehouse_stock=warehouse_stock+r.quantity,updated_at=now() where id=r.product_id;end if;
 else update public.rep_holdings set quantity=quantity+r.quantity,updated_at=now() where id=h.id;end if;
 update public.product_returns set status=(case when p_approve then 'approved' else 'rejected' end)::public.approval_status,reviewed_by=p.id,reviewed_at=now() where id=r.id;
 insert into public.approval_history(tenant_id,actor_id,record_type,record_id,previous_status,new_status,notes) values(p.tenant_id,p.id,'product_return',r.id,'pending',case when p_approve then 'approved' else 'rejected' end,p_note);
 v_result:=jsonb_build_object('ok',true,'id',r.id,'approved',p_approve,'restocked',p_restock,'credit',p_credit);
 update stockflow_private.return_reservations set decision=body,result=v_result where return_id=r.id;
 insert into public.stockflow_audit(tenant_id,actor_id,action,object_id,before_state,after_state,reason) values(p.tenant_id,p.id,'return_decided',r.id,to_jsonb(r),v_result,p_note);
 perform stockflow_private.finish(p_request_id,v_result);return v_result;
end $$;

create function public.stockflow_v2_receive_order(p_request_id uuid,p_order_id uuid,p_expected_items jsonb,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.profiles;o public.supplier_orders;prev jsonb;stored stockflow_private.order_receipts;body jsonb;items jsonb;it record;cases bigint;total numeric;result jsonb;
begin
 p:=stockflow_private.access();if p.role::text not in('owner','manager') then raise exception using errcode='42501',message='Manager access required';end if;
 body:=jsonb_build_array(p_order_id,p_expected_items,p_note);prev:=stockflow_private.claim(p_request_id,'purchase order receipt',body);if prev is not null then return prev;end if;
 select * into o from public.supplier_orders where id=p_order_id and tenant_id=p.tenant_id for update;
 if not found then raise exception using errcode='42501',message='Order access denied';end if;
 select * into stored from stockflow_private.order_receipts where order_id=o.id;
 if found then
  if stored.payload<>body then raise exception 'Order already received with other details';end if;
  perform stockflow_private.finish(p_request_id,stored.result);return stored.result;
 end if;
 -- Owner's solo pending order may be received directly. Managers require approval.
 if o.status::text<>'approved' and not(p.role::text='owner' and o.status::text='pending' and exists(select 1 from public.tenants where id=p.tenant_id and business_mode='solo')) then raise exception 'Only an approved order can be received';end if;
 if not exists(select 1 from public.suppliers where id=o.supplier_id and tenant_id=p.tenant_id) then raise exception 'Supplier access denied';end if;
 perform 1 from public.supplier_order_items where order_id=o.id or supplier_order_id=o.id order by product_id,id for update;
 if exists(select 1 from public.supplier_order_items where (order_id=o.id or supplier_order_id=o.id) and (order_id<>o.id or (supplier_order_id is not null and supplier_order_id<>o.id))) then raise exception 'Order item references need reconciliation';end if;
 select jsonb_agg(jsonb_build_object('product_id',product_id,'quantity',quantity,'unit_price',unit_price) order by product_id,unit_price,quantity),sum(quantity),sum(quantity*unit_price) into items,cases,total from public.supplier_order_items where order_id=o.id;
 if items is null or jsonb_array_length(items) not between 1 and 100 or items is distinct from p_expected_items or cases is distinct from o.total_cases::bigint or total is distinct from o.total_value then raise exception 'Order lines or totals changed. Refresh and review';end if;
 if exists(select 1 from public.supplier_order_items where order_id=o.id and (quantity<=0 or unit_price::text in ('NaN','Infinity','-Infinity') or unit_price<0 or unit_price<>round(unit_price,2))) then raise exception 'Order has invalid quantity or cost';end if;
 perform 1 from public.products where id in(select product_id from public.supplier_order_items where order_id=o.id) order by id for update;
 if exists(select 1 from public.supplier_order_items i left join public.products pr on pr.id=i.product_id where i.order_id=o.id and (pr.id is null or pr.tenant_id is distinct from p.tenant_id or not pr.is_active)) then raise exception 'Product access denied';end if;
 for it in select product_id,sum(quantity)::integer qty from public.supplier_order_items where order_id=o.id group by product_id order by product_id loop
  update public.products set warehouse_stock=warehouse_stock+it.qty,updated_at=now() where id=it.product_id and tenant_id=p.tenant_id;
 end loop;
 update public.supplier_orders set status='received',reviewed_by=p.id,reviewed_at=now() where id=o.id;
 result:=jsonb_build_object('ok',true,'order_id',o.id,'quantity',cases,'value',total);
 -- Receipt does not assert a cash payment or invent a supplier transfer.
 insert into stockflow_private.order_receipts(order_id,tenant_id,payload,result) values(o.id,p.tenant_id,body,result);
 insert into public.approval_history(tenant_id,actor_id,record_type,record_id,previous_status,new_status,notes) values(p.tenant_id,p.id,'supplier_order',o.id,o.status::text,'received',p_note);
 insert into public.stockflow_audit(tenant_id,actor_id,action,object_id,before_state,after_state,reason) values(p.tenant_id,p.id,'order_received',o.id,to_jsonb(o),result,coalesce(nullif(trim(p_note),''),'Received approved order'));
 perform stockflow_private.finish(p_request_id,result);return result;
end $$;

create function public.stockflow_v2_confirm_payment(p_request_id uuid,p_payment_id uuid,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.profiles;pay public.payments;h record;remaining numeric;take numeric;alloc jsonb:='[]';prev jsonb;effect stockflow_private.payment_effects;result jsonb;
begin
 p:=stockflow_private.access();if p.role::text not in('owner','manager') then raise exception using errcode='42501',message='Manager access required';end if;
 prev:=stockflow_private.claim(p_request_id,'payment confirmation',jsonb_build_array(p_payment_id,p_note));if prev is not null then return prev;end if;
 select * into pay from public.payments where id=p_payment_id and tenant_id=p.tenant_id for update;
 if not found then raise exception using errcode='42501',message='Payment access denied';end if;
 select * into effect from stockflow_private.payment_effects where payment_id=pay.id;
 if pay.status::text='confirmed' then
  if not found then raise exception 'Historical payment needs allocation reconciliation';end if;
  result:=jsonb_build_object('ok',true,'amount_applied',effect.applied,'overpayment',effect.overpayment);perform stockflow_private.finish(p_request_id,result);return result;
 end if;
 if pay.status::text<>'pending' or pay.has_pending_edit then raise exception 'Payment changed. Refresh before confirming';end if;
 if pay.amount::text in ('NaN','Infinity','-Infinity') or pay.amount<=0 or pay.amount>100000000 or pay.amount<>round(pay.amount,2) then raise exception 'Invalid payment amount';end if;
 if not exists(select 1 from public.profiles where id=pay.rep_id and tenant_id=p.tenant_id and is_active and role::text='rep') then raise exception 'Rep access denied';end if;
 -- All debt operations lock holding IDs in one stable order.
 remaining:=pay.amount;
 for h in select * from public.rep_holdings where rep_id=pay.rep_id and tenant_id=p.tenant_id order by id for update loop
  if h.debt_amount is null or h.debt_amount::text in ('NaN','Infinity','-Infinity') or h.debt_amount<0 then raise exception 'Holding debt needs reconciliation';end if;
  take:=least(remaining,h.debt_amount);
  if take>0 then update public.rep_holdings set debt_amount=debt_amount-take,updated_at=now() where id=h.id;alloc:=alloc||jsonb_build_object('holding_id',h.id,'amount',take);remaining:=remaining-take;end if;
 end loop;
 insert into stockflow_private.payment_effects(payment_id,tenant_id,amount,applied,overpayment,allocations) values(pay.id,p.tenant_id,pay.amount,pay.amount-remaining,remaining,alloc);
 update public.payments set status='confirmed',confirmed_by=p.id,confirmed_at=now(),notes=p_note where id=pay.id;
 result:=jsonb_build_object('ok',true,'amount_applied',pay.amount-remaining,'overpayment',remaining);
 insert into public.approval_history(tenant_id,actor_id,record_type,record_id,previous_status,new_status,notes) values(p.tenant_id,p.id,'payment',pay.id,'pending','confirmed',p_note);
 insert into public.stockflow_audit(tenant_id,actor_id,action,object_id,before_state,after_state,reason) values(p.tenant_id,p.id,'payment_confirmed',pay.id,to_jsonb(pay),result||jsonb_build_object('allocations',alloc),coalesce(nullif(trim(p_note),''),'Verified payment'));
 perform stockflow_private.finish(p_request_id,result);return result;
end $$;

create function public.stockflow_v2_reverse_payment(p_request_id uuid,p_payment_id uuid,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.profiles;pay public.payments;effect stockflow_private.payment_effects;prev jsonb;it record;result jsonb;
begin
 p:=stockflow_private.access();if p.role::text not in('owner','manager') then raise exception using errcode='42501',message='Manager access required';end if;
 prev:=stockflow_private.claim(p_request_id,'payment reversal',jsonb_build_array(p_payment_id,p_note));if prev is not null then return prev;end if;
 if length(trim(coalesce(p_note,'')))<3 then raise exception 'A reversal reason is required';end if;
 select * into pay from public.payments where id=p_payment_id and tenant_id=p.tenant_id for update;
 if not found then raise exception using errcode='42501',message='Payment access denied';end if;
 select * into effect from stockflow_private.payment_effects where payment_id=pay.id and tenant_id=p.tenant_id for update;
 if not found then raise exception 'Historical payment needs allocation reconciliation';end if;
 if pay.status::text<>'confirmed' or pay.amount<>effect.amount or pay.has_pending_edit then raise exception 'Payment changed or already reversed';end if;
 perform 1 from public.rep_holdings where id in(select (x->>'holding_id')::uuid from jsonb_array_elements(effect.allocations)x) order by id for update;
 if exists(select 1 from public.rep_holdings where id in(select (x->>'holding_id')::uuid from jsonb_array_elements(effect.allocations)x) and (debt_amount is null or debt_amount::text in ('NaN','Infinity','-Infinity') or debt_amount<0)) then raise exception 'Holding debt needs reconciliation';end if;
 for it in select * from jsonb_to_recordset(effect.allocations)x(holding_id uuid,amount numeric) order by holding_id loop
  update public.rep_holdings set debt_amount=debt_amount+it.amount,updated_at=now() where id=it.holding_id and tenant_id=p.tenant_id and rep_id=pay.rep_id;
  if not found then raise exception 'Original holding missing. Reconcile payment';end if;
 end loop;
 update public.payments set status='rejected',rejected_by=p.id,rejected_at=now(),confirmed_by=null,confirmed_at=null,notes=p_note where id=pay.id;
 result:=jsonb_build_object('ok',true,'debt_restored',effect.applied,'overpayment_reversed',effect.overpayment);
 insert into public.approval_history(tenant_id,actor_id,record_type,record_id,previous_status,new_status,notes) values(p.tenant_id,p.id,'payment',pay.id,'confirmed','rejected',p_note);
 insert into public.stockflow_audit(tenant_id,actor_id,action,object_id,before_state,after_state,reason) values(p.tenant_id,p.id,'payment_reversed',pay.id,to_jsonb(pay),result,p_note);
 perform stockflow_private.finish(p_request_id,result);return result;
end $$;

create function public.stockflow_v2_review_price(p_request_id uuid,p_price_id uuid,p_approve boolean,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.profiles;r public.price_change_requests;prod public.products;prev jsonb;buy numeric;sell numeric;result jsonb;
begin
 p:=stockflow_private.access();if p.role::text<>'owner' then raise exception using errcode='42501',message='Owner access required';end if;
 prev:=stockflow_private.claim(p_request_id,'price review',jsonb_build_array(p_price_id,p_approve,p_note));if prev is not null then return prev;end if;
 if p_approve is null then raise exception 'Choose an approval decision';end if;
 select * into r from public.price_change_requests where id=p_price_id and tenant_id=p.tenant_id for update;
 if not found then raise exception using errcode='42501',message='Price request access denied';end if;
 if r.status::text<>'pending_owner' then raise exception 'Price request already processed';end if;
 select * into prod from public.products where id=r.product_id and tenant_id=p.tenant_id for update;
 if not found then raise exception using errcode='42501',message='Product access denied';end if;
 if p_approve then
  if (r.new_buy_price is not null and r.old_buy_price is distinct from prod.buy_price) or (r.new_sell_price is not null and r.old_sell_price is distinct from prod.sell_price) then raise exception 'Product price changed. Review a new request';end if;
  buy:=coalesce(r.new_buy_price,prod.buy_price);sell:=coalesce(r.new_sell_price,prod.sell_price);
  if buy::text in ('NaN','Infinity','-Infinity') or sell::text in ('NaN','Infinity','-Infinity') or buy<=0 or sell<buy or buy>100000000 or sell>100000000 or buy<>round(buy,2) or sell<>round(sell,2) then raise exception 'Invalid product prices';end if;
  update public.products set buy_price=buy,sell_price=sell,updated_at=now() where id=prod.id;
 end if;
 update public.price_change_requests set status=(case when p_approve then 'approved' else 'rejected' end)::public.price_change_status,reviewed_by=p.id,reviewed_at=now(),review_notes=p_note where id=r.id;
 result:=jsonb_build_object('ok',true,'approved',p_approve,'id',r.id);
 insert into public.approval_history(tenant_id,actor_id,record_type,record_id,previous_status,new_status,notes) values(p.tenant_id,p.id,'price_change_request',r.id,'pending_owner',case when p_approve then 'approved' else 'rejected' end,p_note);
 insert into public.stockflow_audit(tenant_id,actor_id,action,object_id,before_state,after_state,reason) values(p.tenant_id,p.id,'price_review',r.id,to_jsonb(prod),result,coalesce(nullif(trim(p_note),''),'Owner reviewed price request'));
 perform stockflow_private.finish(p_request_id,result);return result;
end $$;
create function public.stockflow_v2_edit_confirmed_payment(p_request_id uuid,p_payment_id uuid,p_expected_revision integer,p_amount numeric,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.profiles;pay public.payments;effect stockflow_private.payment_effects;prev jsonb;h record;it record;remaining numeric;take numeric;alloc jsonb:='[]';v_result jsonb;
begin
 p:=stockflow_private.access();if p.role::text not in('owner','manager') then raise exception using errcode='42501',message='Manager access required';end if;
 prev:=stockflow_private.claim(p_request_id,'confirmed payment edit',jsonb_build_array(p_payment_id,p_expected_revision,p_amount,p_note));if prev is not null then return prev;end if;
 if p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount<=0 or p_amount>100000000 or p_amount<>round(p_amount,2) or length(trim(coalesce(p_note,'')))<3 then raise exception 'Enter a verified amount and edit reason';end if;
 select * into pay from public.payments where id=p_payment_id and tenant_id=p.tenant_id for update;
 if not found then raise exception using errcode='42501',message='Payment access denied';end if;
 select * into effect from stockflow_private.payment_effects where payment_id=pay.id and tenant_id=p.tenant_id for update;
 if not found then raise exception 'Historical payment needs allocation reconciliation';end if;
 if pay.status::text<>'confirmed' or pay.has_pending_edit or pay.amount<>effect.amount or p_expected_revision is distinct from effect.revision then raise exception 'Payment changed. Refresh and review its allocation';end if;
 if exists(select 1 from public.rep_holdings where rep_id=pay.rep_id and tenant_id=p.tenant_id and (debt_amount is null or debt_amount::text in ('NaN','Infinity','-Infinity') or debt_amount<0)) then raise exception 'Holding debt needs reconciliation';end if;
 -- Lock the complete original/current allocation set in the same order as confirm.
 perform 1 from public.rep_holdings where rep_id=pay.rep_id and tenant_id=p.tenant_id order by id for update;
 for it in select * from jsonb_to_recordset(effect.allocations)x(holding_id uuid,amount numeric) order by holding_id loop
  update public.rep_holdings set debt_amount=debt_amount+it.amount,updated_at=now() where id=it.holding_id and tenant_id=p.tenant_id and rep_id=pay.rep_id;
  if not found then raise exception 'Original holding missing. Reconcile payment';end if;
 end loop;
 remaining:=p_amount;
 for h in select * from public.rep_holdings where rep_id=pay.rep_id and tenant_id=p.tenant_id order by id loop
  if h.debt_amount is null or h.debt_amount::text in ('NaN','Infinity','-Infinity') or h.debt_amount<0 then raise exception 'Holding debt needs reconciliation';end if;
  take:=least(remaining,h.debt_amount);
  if take>0 then update public.rep_holdings set debt_amount=debt_amount-take,updated_at=now() where id=h.id;alloc:=alloc||jsonb_build_object('holding_id',h.id,'amount',take);remaining:=remaining-take;end if;
 end loop;
 update public.payments set amount=p_amount,notes=p_note,edit_count=edit_count+1,last_edited_at=now() where id=pay.id;
 update stockflow_private.payment_effects set amount=p_amount,applied=p_amount-remaining,overpayment=remaining,allocations=alloc,revision=revision+1 where payment_id=pay.id;
 v_result:=jsonb_build_object('ok',true,'revision',effect.revision+1,'amount_applied',p_amount-remaining,'overpayment',remaining);
 insert into public.approval_history(tenant_id,actor_id,record_type,record_id,previous_status,new_status,notes) values(p.tenant_id,p.id,'payment',pay.id,'confirmed','confirmed',p_note);
 insert into public.stockflow_audit(tenant_id,actor_id,action,object_id,before_state,after_state,reason) values(p.tenant_id,p.id,'confirmed_payment_edited',pay.id,jsonb_build_object('payment',to_jsonb(pay),'effect',to_jsonb(effect)),v_result||jsonb_build_object('amount',p_amount,'allocations',alloc),p_note);
 perform stockflow_private.finish(p_request_id,v_result);return v_result;
end $$;
revoke all on function public.stockflow_v2_edit_confirmed_payment(uuid,uuid,integer,numeric,text) from public,anon;
grant execute on function public.stockflow_v2_edit_confirmed_payment(uuid,uuid,integer,numeric,text) to authenticated;

revoke all on function public.stockflow_v2_submit_return(uuid,uuid,integer,text,text),public.stockflow_v2_decide_return(uuid,uuid,boolean,boolean,numeric,text),public.stockflow_v2_receive_order(uuid,uuid,jsonb,text),public.stockflow_v2_confirm_payment(uuid,uuid,text),public.stockflow_v2_reverse_payment(uuid,uuid,text),public.stockflow_v2_review_price(uuid,uuid,boolean,text) from public,anon;
grant execute on function public.stockflow_v2_submit_return(uuid,uuid,integer,text,text),public.stockflow_v2_decide_return(uuid,uuid,boolean,boolean,numeric,text),public.stockflow_v2_receive_order(uuid,uuid,jsonb,text),public.stockflow_v2_confirm_payment(uuid,uuid,text),public.stockflow_v2_reverse_payment(uuid,uuid,text),public.stockflow_v2_review_price(uuid,uuid,boolean,text) to authenticated;
commit;
