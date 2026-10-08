-- Review patch, NOT a production migration or deployment instruction.
-- Applies only after the V2 contract exists. Reconcile signatures, constraints,
-- grants and historical rows on a verified isolated restore before rollout.
-- Preserve the merged migration/history; do not re-run it on an existing system.
begin;

create or replace function public.stockflow_v2_cancel_sale(p_sale_id uuid,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.profiles; s public.sales; it record; line_cases bigint; line_total numeric;
begin
  p := stockflow_private.access();
  if length(trim(coalesce(p_reason,''))) < 3 then raise exception 'A cancellation reason is required'; end if;
  select * into s from public.sales where id=p_sale_id and tenant_id=p.tenant_id for update;
  if not found or (p.role::text='rep' and (s.rep_id<>p.id or s.status::text not in ('pending','edited','cancelled'))) then raise exception using errcode='42501',message='Sale cannot be cancelled by this account'; end if;
  if s.status::text='cancelled' then return; end if;
  if s.stock_source is null then raise exception 'Historical sale needs a manager reconciliation before cancellation'; end if;
  -- Refuse inconsistent retained/tampered lines before restoring any stock.
  -- Reconcile these records on an isolated restore; never invent missing lines.
  perform 1 from public.sale_items where sale_id=s.id order by product_id,id for update;
  select sum(quantity),sum(quantity*unit_price) into line_cases,line_total
    from public.sale_items where sale_id=s.id;
  if line_cases is null or line_cases is distinct from s.total_cases::bigint
    or line_total is distinct from s.total_value or exists (
      select 1 from public.sale_items where sale_id=s.id and
        (quantity is null or quantity<=0 or unit_price is null or
         unit_price::text in ('NaN','Infinity','-Infinity') or unit_price<0)
    ) then raise exception 'Sale lines need reconciliation before cancellation'; end if;
  -- Match checkout/dispatch's product-before-holdings lock order.
  perform 1 from public.products where id in
    (select product_id from public.sale_items where sale_id=s.id) order by id for update;
  if exists(select 1 from public.sale_items i left join public.products pr on pr.id=i.product_id
    where i.sale_id=s.id and (pr.id is null or pr.tenant_id is distinct from p.tenant_id)) then
    raise exception 'Sale product access denied; cancellation rolled back';
  end if;
  perform pg_catalog.set_config('stockflow.reason','Sale cancelled: ' || p_reason,true);
  for it in select product_id,sum(quantity)::integer qty from public.sale_items where sale_id=s.id group by product_id order by product_id loop
    if s.stock_source='warehouse' then
      update public.products set warehouse_stock=warehouse_stock+it.qty,updated_at=now() where id=it.product_id and tenant_id=p.tenant_id;
    else
      update public.rep_holdings set quantity=quantity+it.qty,updated_at=now() where product_id=it.product_id and rep_id=s.rep_id and tenant_id=p.tenant_id;
    end if;
    if not found then raise exception 'Stock record missing; cancellation rolled back'; end if;
  end loop;
  update public.sales set status='cancelled' where id=s.id;
  insert into public.stockflow_audit(tenant_id,actor_id,action,object_id,before_state,after_state,reason)
    values(p.tenant_id,p.id,'sale_cancelled',s.id,jsonb_build_object('status',s.status),jsonb_build_object('status','cancelled','payment_refunded',false),p_reason);
end $$;

create or replace function public.approve_stock_request_atomic(p_request_id uuid,p_items jsonb,p_reviewer_id uuid,p_notes text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.profiles; req public.stock_requests; prod public.products; it record; requested numeric; price numeric;
begin
  p:=stockflow_private.access();
  if p.role::text not in ('owner','manager') then raise exception 'Only owners and managers can approve dispatch'; end if;
  select * into req from public.stock_requests where id=p_request_id and tenant_id=p.tenant_id for update;
  if not found then raise exception 'Request access denied'; end if;
  if req.status::text='approved' and req.v2_approved_items=p_items then return jsonb_build_object('ok',true,'already_processed',true); end if;
  if req.status::text not in ('pending','pending_manager') then raise exception 'This request has already been processed'; end if;
  if not exists(select 1 from public.profiles where id=req.rep_id and tenant_id=p.tenant_id and is_active and role::text='rep') then raise exception 'Rep access denied'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 100 then raise exception 'Select 1 to 100 requested products'; end if;
  if exists(select 1 from jsonb_array_elements(p_items) x group by x->>'product_id' having count(*)>1) then raise exception 'Duplicate product lines'; end if;
  perform 1 from public.stock_request_items where request_id=req.id order by product_id for update;
  perform pg_catalog.set_config('stockflow.reason','Approved dispatch '||req.id::text,true);
  for it in select * from jsonb_to_recordset(p_items) x(product_id uuid,quantity numeric,unit_price numeric) order by product_id loop
    if it.quantity is null or it.quantity<>trunc(it.quantity) or it.quantity not between 1 and 1000000 then raise exception 'Enter a positive whole quantity'; end if;
    select sum(quantity),max(unit_price) into requested,price from public.stock_request_items where request_id=req.id and product_id=it.product_id;
    if requested is null or it.quantity>requested then raise exception 'Approval exceeds the requested quantity'; end if;
    select * into prod from public.products where id=it.product_id and tenant_id=p.tenant_id and is_active for update;
    if not found then raise exception 'Product access denied'; end if;
    -- The unique conflict target alone does not establish tenant ownership.
    -- A damaged historical holding must not be increased by a definer RPC.
    perform 1 from public.rep_holdings where rep_id=req.rep_id and product_id=prod.id for update;
    if exists(select 1 from public.rep_holdings where rep_id=req.rep_id and product_id=prod.id
      and tenant_id is distinct from p.tenant_id) then raise exception 'Holding tenant needs reconciliation'; end if;
    price:=coalesce(price,prod.sell_price);
    if price::text in ('NaN','Infinity','-Infinity') or price<prod.buy_price or price>100000000 or price<>round(price,2) then raise exception 'Check the requested dispatch price'; end if;
    if it.unit_price is not null and it.unit_price<>price then raise exception 'The request price changed. Refresh before approving'; end if;
    if prod.warehouse_stock<it.quantity then raise exception 'Stock changed. Refresh and check available quantity'; end if;
    update public.products set warehouse_stock=warehouse_stock-it.quantity::integer,updated_at=now() where id=prod.id;
    insert into public.rep_holdings(tenant_id,rep_id,product_id,quantity,debt_amount) values(p.tenant_id,req.rep_id,prod.id,it.quantity::integer,it.quantity*price)
      on conflict(rep_id,product_id) do update set quantity=public.rep_holdings.quantity+excluded.quantity,
      debt_amount=public.rep_holdings.debt_amount+excluded.debt_amount,updated_at=now();
  end loop;
  update public.stock_requests set status='approved',reviewed_by=p.id,reviewed_at=now(),v2_approved_items=p_items where id=req.id;
  insert into public.approval_history(tenant_id,actor_id,record_type,record_id,previous_status,new_status,notes)
    values(p.tenant_id,p.id,'stock_request',req.id,req.status::text,'approved',p_notes);
  insert into public.stockflow_audit(tenant_id,actor_id,action,object_id,after_state,reason)
    values(p.tenant_id,p.id,'dispatch.approved',req.id,p_items,coalesce(nullif(trim(p_notes),''),'Manager approved requested goods and stored request prices'));
  return jsonb_build_object('ok',true);
exception when sqlstate 'P0001' then return jsonb_build_object('ok',false,'error',sqlerrm);
  when others then return jsonb_build_object('ok',false,'error','Could not approve this request. Refresh and check your access and stock.');
end $$;

commit;
