-- StockFlow V2 additive integrity layer. Validate against a restored copy of
-- production before applying. No historical rows are deleted or rewritten.
begin;

create schema if not exists stockflow_private;
revoke all on schema stockflow_private from public, anon, authenticated;

create table stockflow_private.operations (
  tenant_id uuid not null references public.tenants(id),
  actor_id uuid not null references public.profiles(id),
  request_id uuid not null,
  operation text not null,
  payload jsonb not null,
  result jsonb,
  created_at timestamptz not null default now(),
  primary key (tenant_id, actor_id, request_id)
);

create table public.stockflow_audit (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  actor_id uuid references public.profiles(id),
  action text not null,
  object_id uuid not null,
  before_state jsonb,
  after_state jsonb,
  reason text not null,
  created_at timestamptz not null default now()
);
create table public.stockflow_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  product_id uuid not null references public.products(id),
  rep_id uuid references public.profiles(id),
  actor_id uuid references public.profiles(id),
  quantity_before integer not null,
  quantity_after integer not null check (quantity_after >= 0),
  quantity_delta integer generated always as (quantity_after - quantity_before) stored,
  reason text not null,
  request_id uuid,
  created_at timestamptz not null default now()
);

-- Fail safely on existing duplicate SKUs: remediation must preserve their IDs.
create unique index stockflow_product_sku_tenant_uq
  on public.products(tenant_id, lower(trim(sku_code)))
  where nullif(trim(sku_code), '') is not null;
create index stockflow_sales_tenant_date on public.sales(tenant_id, created_at desc, id);
create index stockflow_sales_rep_date on public.sales(tenant_id, rep_id, created_at desc, id);
create index stockflow_products_browse on public.products(tenant_id,name,id) where is_active;
create index stockflow_customers_browse on public.customers(tenant_id,name,id);
create index stockflow_sale_items_receipt on public.sale_items(sale_id);
-- Use the installed extension's schema without relocating an existing one.
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
do $$ declare opclass text; begin
  select pg_catalog.quote_ident(n.nspname)||'.gin_trgm_ops' into opclass from pg_catalog.pg_opclass o
    join pg_catalog.pg_namespace n on n.oid=o.opcnamespace join pg_catalog.pg_am a on a.oid=o.opcmethod
    where o.opcname='gin_trgm_ops' and a.amname='gin' limit 1;
  execute pg_catalog.format('create index stockflow_products_name_search on public.products using gin(name %s) where is_active',opclass);
  execute pg_catalog.format('create index stockflow_products_sku_search on public.products using gin(sku_code %s) where is_active',opclass);
end $$;
create index stockflow_movements_product on public.stockflow_movements(tenant_id, product_id, created_at desc, id);
create index stockflow_audit_tenant_date on public.stockflow_audit(tenant_id, created_at desc, id);
alter table public.sales add column if not exists stock_source text
  check (stock_source in ('warehouse', 'rep'));

-- Never authorise from raw_user_meta_data. All callers are derived from Auth.
create function stockflow_private.access()
returns public.profiles language plpgsql security definer set search_path = '' as $$
declare p public.profiles; t public.tenants;
begin
  select * into p from public.profiles where id = auth.uid() and is_active;
  if p.id is null or p.tenant_id is null or p.role::text not in ('owner','manager','rep') then
    raise exception using errcode = '42501', message = 'Business access denied';
  end if;
  select * into t from public.tenants where id = p.tenant_id;
  if t.id is null or t.status::text = 'suspended' then
    raise exception using errcode = '42501', message = 'Business access denied';
  end if;
  return p;
end $$;

-- A retry with the same key must have exactly the same body. The advisory lock
-- serialises simultaneous identical requests across all devices/terminals.
create function stockflow_private.claim(p_key uuid, p_operation text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.profiles; o stockflow_private.operations;
begin
  p := stockflow_private.access();
  if p_key is null then raise exception 'A request key is required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p.tenant_id::text || p.id::text || p_key::text, 0));
  select * into o from stockflow_private.operations
    where tenant_id = p.tenant_id and actor_id = p.id and request_id = p_key;
  if found then
    if o.operation <> p_operation or o.payload <> p_payload then
      raise exception 'This request key belongs to a different operation';
    end if;
    return o.result;
  end if;
  insert into stockflow_private.operations(tenant_id, actor_id, request_id, operation, payload)
    values (p.tenant_id, p.id, p_key, p_operation, p_payload);
  perform pg_catalog.set_config('stockflow.request_id', p_key::text, true);
  perform pg_catalog.set_config('stockflow.reason', p_operation, true);
  return null;
end $$;
create function stockflow_private.finish(p_key uuid, p_result jsonb)
returns void language sql security definer set search_path = '' as $$
  update stockflow_private.operations set result = p_result
    where actor_id = auth.uid() and request_id = p_key
      and tenant_id = (select p.tenant_id from public.profiles p where p.id = auth.uid());
$$;

-- Journal every stock write, including retained legacy RPCs. A historical
-- opening balance is seeded, not presented as invented historical movements.
create function stockflow_private.journal()
returns trigger language plpgsql security definer set search_path = '' as $$
declare b integer; a integer; rep uuid; pid uuid;
begin
  if tg_table_name = 'products' then
    b := case when tg_op = 'INSERT' then 0 else old.warehouse_stock end;
    a := new.warehouse_stock; rep := null; pid := new.id;
  else
    b := case when tg_op = 'INSERT' then 0 else old.quantity end;
    a := new.quantity; rep := new.rep_id; pid := new.product_id;
  end if;
  if tg_op = 'INSERT' or a <> b then
    insert into public.stockflow_movements(tenant_id, product_id, rep_id, actor_id,
      quantity_before, quantity_after, reason, request_id)
    values (new.tenant_id, pid,
      rep, auth.uid(), b, a,
      coalesce(nullif(pg_catalog.current_setting('stockflow.reason', true), ''), 'legacy stock operation'),
      nullif(pg_catalog.current_setting('stockflow.request_id', true), '')::uuid);
  end if;
  return new;
end $$;
lock table public.products, public.rep_holdings in share row exclusive mode;
insert into public.stockflow_movements(tenant_id, product_id, quantity_before, quantity_after, reason)
  select tenant_id, id, 0, warehouse_stock, 'V2 opening balance; historical movement history unavailable' from public.products;
insert into public.stockflow_movements(tenant_id, product_id, rep_id, quantity_before, quantity_after, reason)
  select tenant_id, product_id, rep_id, 0, quantity, 'V2 opening balance; historical movement history unavailable' from public.rep_holdings;
create trigger stockflow_warehouse_journal after insert or update of warehouse_stock on public.products
  for each row execute function stockflow_private.journal();
create trigger stockflow_holdings_journal after insert or update of quantity on public.rep_holdings
  for each row execute function stockflow_private.journal();

alter table public.stockflow_movements enable row level security;
alter table public.stockflow_audit enable row level security;
create policy movement_read on public.stockflow_movements for select to authenticated using (
  exists (select 1 from public.profiles p join public.tenants t on t.id = p.tenant_id
    where p.id = (select auth.uid()) and p.is_active and t.status::text <> 'suspended'
      and p.tenant_id = stockflow_movements.tenant_id
      and (p.role::text in ('owner','manager') or stockflow_movements.rep_id = p.id))
);
create policy audit_read on public.stockflow_audit for select to authenticated using (
  exists (select 1 from public.profiles p join public.tenants t on t.id = p.tenant_id
    where p.id = (select auth.uid()) and p.is_active and t.status::text <> 'suspended'
      and p.tenant_id = stockflow_audit.tenant_id and p.role::text in ('owner','manager'))
);
revoke all on public.stockflow_movements, public.stockflow_audit from public, anon, authenticated;
grant select on public.stockflow_movements, public.stockflow_audit to authenticated;

-- Retained upload helpers return either a relative object path or a public
-- URL. Accept both representations of an actor-owned namespace, with one safe
-- filename only; this does not replace Storage RLS or private bucket ACLs.
create function stockflow_private.attachment_path(p_value text,p_bucket text,p_tenant uuid,p_actor uuid)
returns boolean language plpgsql immutable set search_path = '' as $$
declare object_path text:=p_value; prefix text:='https://fjmkenowgfxepwpyjcss.supabase.co/storage/v1/object/public/'||p_bucket||'/'; parts text[];
begin
  if p_value is null then return true; end if;
  if length(p_value)>1000 then return false; end if;
  if left(object_path,length(prefix))=prefix then object_path:=substr(object_path,length(prefix)+1); end if;
  parts:=string_to_array(object_path,'/');
  return coalesce(array_length(parts,1)=3 and parts[1]=p_tenant::text and parts[2]=p_actor::text
    and length(parts[3]) between 1 and 300 and parts[3]~'^[A-Za-z0-9_.-]+$' and parts[3] not in('.','..'),false);
end $$;

create function public.stockflow_v2_sale(p_request_id uuid, p_customer_name text,
  p_customer_id uuid, p_items jsonb, p_payment_method text, p_notes text,p_receipt_url text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare p public.profiles; prev jsonb; payload jsonb; it record; prod public.products;
  have integer; total numeric := 0; cases integer := 0; sid uuid := gen_random_uuid(); lines jsonb := '[]';
begin
  p := stockflow_private.access();
  payload := jsonb_build_array(p_customer_name, p_customer_id, p_items, p_payment_method, p_notes,p_receipt_url);
  prev := stockflow_private.claim(p_request_id, 'sale', payload);
  if prev is not null then return (prev->>'id')::uuid; end if;
  if nullif(trim(p_customer_name), '') is null or length(p_customer_name) > 200 then raise exception 'Enter a customer name'; end if;
  if length(coalesce(p_notes,''))>1000 then raise exception 'Sale note is too long'; end if;
  if not stockflow_private.attachment_path(p_receipt_url,'receipts',p.tenant_id,p.id) then
    raise exception 'Receipt access denied';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 100 then raise exception 'Select 1 to 100 products'; end if;
  if p_payment_method is null or p_payment_method not in ('cash','transfer','pos','credit') then raise exception 'Invalid payment method'; end if;
  if p.role::text <> 'rep' and p_payment_method = 'credit' then raise exception 'Warehouse credit sales need a credit ledger and are not enabled'; end if;
  if p.role::text = 'rep' and p_payment_method <> 'credit' then raise exception 'Rep sales use the existing credit workflow'; end if;
  if p_customer_id is not null and not exists (select 1 from public.customers where id = p_customer_id and tenant_id = p.tenant_id) then raise exception using errcode='42501',message='Customer access denied'; end if;
  if exists (select 1 from jsonb_array_elements(p_items) i group by i->>'product_id' having count(*) > 1) then raise exception 'Duplicate product lines'; end if;
  -- Stable lock order prevents opposite cart ordering from causing deadlocks.
  for it in select * from jsonb_to_recordset(p_items) as x(product_id uuid, quantity numeric, unit_price numeric) order by product_id loop
    if it.quantity is null or it.quantity <> trunc(it.quantity) or it.quantity not between 1 and 1000000 then raise exception 'Quantity must be a positive whole number'; end if;
    select * into prod from public.products where id = it.product_id and tenant_id = p.tenant_id and is_active for update;
    if not found then raise exception using errcode='42501',message='Product access denied'; end if;
    it.unit_price := coalesce(it.unit_price, prod.sell_price);
    if it.unit_price is null or it.unit_price::text in ('NaN','Infinity','-Infinity') or it.unit_price < prod.buy_price or it.unit_price > 100000000 or it.unit_price <> round(it.unit_price,2) then raise exception 'Invalid price or price below cost'; end if;
    if p.role::text = 'rep' then
      select quantity into have from public.rep_holdings where rep_id = p.id and product_id = prod.id and tenant_id = p.tenant_id for update;
      if have is null or have < it.quantity then raise exception 'Stock changed. Refresh and check available quantity'; end if;
      update public.rep_holdings set quantity = quantity - it.quantity::integer, updated_at = now() where rep_id=p.id and product_id=prod.id and tenant_id=p.tenant_id;
    else
      if prod.warehouse_stock < it.quantity then raise exception 'Stock changed. Refresh and check available quantity'; end if;
      update public.products set warehouse_stock = warehouse_stock - it.quantity::integer, updated_at = now() where id=prod.id;
    end if;
    total := total + it.unit_price * it.quantity; cases := cases + it.quantity::integer;
    lines := lines || jsonb_build_object('product_id',prod.id,'quantity',it.quantity,'unit_price',it.unit_price,'list_price',prod.sell_price,'buy_price_snapshot',prod.buy_price);
  end loop;
  if total <= 0 or total>9000000000000 then raise exception 'Sale total is outside supported range'; end if;
  if p.role::text = 'rep' then
    insert into public.sales(id,tenant_id,rep_id,customer_name,customer_id,total_cases,total_value,status,stock_source,notes)
      values(sid,p.tenant_id,p.id,trim(p_customer_name),p_customer_id,cases,total,'pending','rep',nullif(p_notes,''));
  else
    insert into public.sales(id,tenant_id,rep_id,customer_name,customer_id,total_cases,total_value,status,stock_source,payment_method,notes,receipt_url)
      values(sid,p.tenant_id,p.id,trim(p_customer_name),p_customer_id,cases,total,'completed','warehouse',p_payment_method,nullif(p_notes,''),p_receipt_url);
  end if;
  insert into public.sale_items(sale_id,product_id,quantity,unit_price,list_price,buy_price_snapshot)
    select sid,x.product_id,x.quantity,x.unit_price,x.list_price,x.buy_price_snapshot
    from jsonb_to_recordset(lines) x(product_id uuid, quantity integer, unit_price numeric,list_price numeric,buy_price_snapshot numeric);
  insert into public.stockflow_audit(tenant_id,actor_id,action,object_id,after_state,reason)
    values(p.tenant_id,p.id,'sale',sid,jsonb_build_object('total',total,'items',lines,'payment_method',p_payment_method),coalesce(nullif(p_notes,''),'Recorded sale'));
  perform stockflow_private.finish(p_request_id,jsonb_build_object('id',sid));
  return sid;
end $$;

create function public.stockflow_v2_adjust_stock(p_request_id uuid,p_product_id uuid,
  p_delta integer,p_expected integer,p_reason text)
returns integer language plpgsql security definer set search_path = '' as $$
declare p public.profiles; prod public.products; prev jsonb; nq integer;
begin
  p := stockflow_private.access();
  if p.role::text not in ('owner','manager') then raise exception using errcode='42501',message='Only owners and managers can adjust warehouse stock'; end if;
  prev := stockflow_private.claim(p_request_id,'stock adjustment',jsonb_build_array(p_product_id,p_delta,p_expected,p_reason));
  if prev is not null then return (prev->>'quantity')::integer; end if;
  if p_delta is null or p_delta = 0 or p_expected is null or length(trim(coalesce(p_reason,''))) < 3 then raise exception 'Enter a stock change and a reason'; end if;
  select * into prod from public.products where id=p_product_id and tenant_id=p.tenant_id for update;
  if not found then raise exception using errcode='42501',message='Product access denied'; end if;
  if prod.warehouse_stock <> p_expected then raise exception 'Stock changed. Refresh before adjusting'; end if;
  nq := prod.warehouse_stock + p_delta;
  if nq < 0 then raise exception 'Adjustment would make stock negative'; end if;
  perform pg_catalog.set_config('stockflow.reason',p_reason,true);
  update public.products set warehouse_stock=nq,updated_at=now() where id=prod.id;
  insert into public.stockflow_audit(tenant_id,actor_id,action,object_id,before_state,after_state,reason)
    values(p.tenant_id,p.id,'stock_adjustment',prod.id,jsonb_build_object('stock',prod.warehouse_stock),jsonb_build_object('stock',nq),p_reason);
  perform stockflow_private.finish(p_request_id,jsonb_build_object('quantity',nq));
  return nq;
end $$;

create function public.stockflow_v2_cancel_sale(p_sale_id uuid,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.profiles; s public.sales; it record;
begin
  p := stockflow_private.access();
  if length(trim(coalesce(p_reason,''))) < 3 then raise exception 'A cancellation reason is required'; end if;
  select * into s from public.sales where id=p_sale_id and tenant_id=p.tenant_id for update;
  if not found or (p.role::text='rep' and (s.rep_id<>p.id or s.status::text not in ('pending','edited','cancelled'))) then raise exception using errcode='42501',message='Sale cannot be cancelled by this account'; end if;
  if s.status::text='cancelled' then return; end if;
  if s.stock_source is null then raise exception 'Historical sale needs a manager reconciliation before cancellation'; end if;
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

create function public.stockflow_v2_product(p_request_id uuid,p_product_id uuid,p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare p public.profiles; prod public.products; prev jsonb; pid uuid; buy numeric; sell numeric; stock numeric;
begin
  p := stockflow_private.access();
  if p.role::text <> 'owner' then raise exception using errcode='42501',message='Only owners can create or edit products'; end if;
  prev := stockflow_private.claim(p_request_id,'product',jsonb_build_array(p_product_id,p_data));
  if prev is not null then return (prev->>'id')::uuid; end if;
  if jsonb_typeof(p_data) <> 'object' or nullif(trim(p_data->>'name'),'') is null or length(p_data->>'name') > 200 then raise exception 'Enter a product name'; end if;
  buy := (p_data->>'buy_price')::numeric; sell := (p_data->>'sell_price')::numeric;
  stock := coalesce((p_data->>'opening_stock')::numeric,0);
  if buy is null or sell is null or buy::text in ('NaN','Infinity','-Infinity') or sell::text in ('NaN','Infinity','-Infinity')
    or buy < 0 or sell <= 0 or sell<buy or buy > 100000000 or sell > 100000000 or buy <> round(buy,2) or sell <> round(sell,2)
    or stock::text in ('NaN','Infinity','-Infinity') or stock not between 0 and 1000000 or stock<>trunc(stock) then raise exception 'Enter valid prices and a whole stock quantity'; end if;
  if length(coalesce(p_data->>'sku_code','')) > 80 then raise exception 'SKU is too long'; end if;
  if length(coalesce(p_data->>'emoji',''))>20 then raise exception 'Product symbol is too long'; end if;
  if p_data ? 'weight_value' and p_data->>'weight_value' is not null and
    ((p_data->>'weight_value')::numeric::text in ('NaN','Infinity','-Infinity') or (p_data->>'weight_value')::numeric <= 0) then raise exception 'Enter a positive product weight'; end if;
  if p_product_id is null then
    pid := gen_random_uuid();
    perform pg_catalog.set_config('stockflow.reason','Opening stock at product creation',true);
    insert into public.products(id,tenant_id,name,buy_price,sell_price,warehouse_stock,sku_code,is_active,emoji,weight_value)
      values(pid,p.tenant_id,trim(p_data->>'name'),buy,sell,stock::integer,nullif(trim(p_data->>'sku_code'),''),coalesce((p_data->>'is_active')::boolean,true),coalesce(p_data->>'emoji','📦'),(p_data->>'weight_value')::numeric);
  else
    select * into prod from public.products where id=p_product_id and tenant_id=p.tenant_id for update;
    if not found then raise exception using errcode='42501',message='Product access denied'; end if;
    if p_data ? 'opening_stock' or p_data ? 'warehouse_stock' then raise exception 'Use an audited stock adjustment to change quantity'; end if;
    pid := prod.id;
    update public.products set name=trim(p_data->>'name'),buy_price=buy,sell_price=sell,
      sku_code=nullif(trim(p_data->>'sku_code'),''),updated_at=now(),
      emoji=case when p_data ? 'emoji' then p_data->>'emoji' else emoji end,
      weight_value=case when p_data ? 'weight_value' then (p_data->>'weight_value')::numeric else weight_value end,
      is_active=case when p_data ? 'is_active' then (p_data->>'is_active')::boolean else is_active end where id=pid;
  end if;
  insert into public.stockflow_audit(tenant_id,actor_id,action,object_id,before_state,after_state,reason)
    values(p.tenant_id,p.id,'product',pid,to_jsonb(prod),p_data,coalesce(nullif(p_data->>'reason',''),'Product creation or metadata update'));
  perform stockflow_private.finish(p_request_id,jsonb_build_object('id',pid));
  return pid;
end $$;

create function public.stockflow_v2_import_products(p_request_id uuid,p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.profiles; prev jsonb; row_data jsonb; ids jsonb := '[]'; pid uuid;
begin
  p := stockflow_private.access();
  if p.role::text <> 'owner' then raise exception using errcode='42501',message='Only owners can import products'; end if;
  prev := stockflow_private.claim(p_request_id,'product import',p_rows);
  if prev is not null then return prev; end if;
  if p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 200 then raise exception 'Import 1 to 200 products per batch'; end if;
  for row_data in select * from jsonb_array_elements(p_rows) loop
    pid := public.stockflow_v2_product(gen_random_uuid(),null,row_data);
    ids := ids || to_jsonb(pid);
  end loop;
  prev := jsonb_build_object('ids',ids,'count',jsonb_array_length(ids));
  perform stockflow_private.finish(p_request_id,prev);
  return prev;
end $$;

create function public.stockflow_v2_dashboard(p_from timestamptz,p_to timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.profiles; result jsonb;
begin
  p := stockflow_private.access();
  if p_from is null or p_to is null or p_to <= p_from or p_to-p_from > interval '366 days' then raise exception 'Select a period of 1 to 366 days'; end if;
  with eligible as (
    select id,total_value,total_cases,created_at,payment_method,status from public.sales where tenant_id=p.tenant_id and created_at>=p_from and created_at<p_to
      and (p.role::text<>'rep' or rep_id=p.id)
  ), booked as (select * from eligible where status::text in ('completed','confirmed','approved')),
  totals as (select coalesce(sum(total_value),0) revenue,coalesce(sum(total_cases),0) units,count(*) transactions from booked),
  product_totals as (select i.product_id,sum(i.quantity) units,sum(i.quantity*i.unit_price) revenue,
    sum(i.quantity*i.buy_price_snapshot) cogs,count(*) filter(where i.buy_price_snapshot is null) missing_costs
    from public.sale_items i join booked b on b.id=i.sale_id group by i.product_id),
  costs as (select coalesce(sum(cogs),0) cogs,coalesce(sum(missing_costs),0) missing_costs from product_totals),
  pending as (select coalesce(sum(total_value),0) pending from eligible where status::text in ('pending','edited','edit_pending')),
  daily as (select (created_at at time zone 'Africa/Lagos')::date as "day",sum(total_value) revenue from booked group by 1)
  select jsonb_build_object('revenue',t.revenue,'units',t.units,'transactions',t.transactions,
    'gross_profit',case when c.missing_costs=0 then t.revenue-c.cogs else null end,
    'missing_cost_snapshots',c.missing_costs,'pending_sales',n.pending,
    'trend',coalesce((select jsonb_agg(x order by x.day) from (
      select g.day::date as "day",coalesce(d.revenue,0) revenue
        from pg_catalog.generate_series((p_from at time zone 'Africa/Lagos')::date::timestamp,
          ((p_to-interval '1 microsecond') at time zone 'Africa/Lagos')::date::timestamp,interval '1 day') g(day)
        left join daily d on d.day=g.day::date) x),'[]'::jsonb),
    'top_products',coalesce((select jsonb_agg(x) from (
      select pr.name,i.units,i.revenue from product_totals i join public.products pr on pr.id=i.product_id
        order by i.units desc,pr.id limit 5) x),'[]'::jsonb),
    'payment_breakdown',coalesce((select jsonb_agg(x) from (
      select coalesce(payment_method,'unrecorded') method,sum(total_value) amount from booked group by 1) x),'[]'::jsonb))
    into result from totals t cross join costs c cross join pending n;
  return result;
end $$;

create function public.stockflow_v2_customer(p_request_id uuid,p_name text,p_phone text,p_address text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare p public.profiles; prior jsonb; cid uuid;
begin
  p := stockflow_private.access();
  prior := stockflow_private.claim(p_request_id,'create customer',jsonb_build_object('name',p_name,'phone',p_phone,'address',p_address));
  if prior is not null then return (prior->>'id')::uuid; end if;
  if p_name is null or length(trim(p_name)) not between 1 and 200
    or length(coalesce(p_phone,''))>30 or length(coalesce(p_address,''))>500 then
    raise exception 'Enter a customer name and valid contact details';
  end if;
  insert into public.customers(tenant_id,name,phone,address) values(p.tenant_id,trim(p_name),nullif(trim(p_phone),''),nullif(trim(p_address),'')) returning id into cid;
  insert into public.stockflow_audit(tenant_id,actor_id,action,object_id,after_state,reason)
    values(p.tenant_id,p.id,'customer.created',cid,jsonb_build_object('name',trim(p_name)),'Customer created');
  perform stockflow_private.finish(p_request_id,jsonb_build_object('id',cid));
  return cid;
end $$;

-- Default PUBLIC execute would make these public API endpoints.
alter table public.stock_requests add column if not exists v2_approved_items jsonb;
-- Retain the existing approval API and workflow, remove the stock clamp and
-- serialise warehouse/holdings updates. Approvals cannot introduce extra goods.
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
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 100 then raise exception 'Select 1 to 100 requested products'; end if;
  if exists(select 1 from jsonb_array_elements(p_items) x group by x->>'product_id' having count(*)>1) then raise exception 'Duplicate product lines'; end if;
  perform 1 from public.stock_request_items where request_id=req.id order by product_id for update;
  perform pg_catalog.set_config('stockflow.reason','Approved dispatch '||req.id::text,true);
  for it in select * from jsonb_to_recordset(p_items) x(product_id uuid,quantity numeric,unit_price numeric) order by product_id loop
    if it.quantity is null or it.quantity<>trunc(it.quantity) or it.quantity not between 1 and 1000000 then raise exception 'Enter a positive whole quantity'; end if;
    select sum(quantity),max(unit_price) into requested,price from public.stock_request_items where request_id=req.id and product_id=it.product_id;
    if requested is null or it.quantity>requested then raise exception 'Approval exceeds the requested quantity'; end if;
    select * into prod from public.products where id=it.product_id and tenant_id=p.tenant_id and is_active for update;
    if not found then raise exception 'Product access denied'; end if;
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
revoke all on function public.approve_stock_request_atomic(uuid,jsonb,uuid,text) from public,anon;
grant execute on function public.approve_stock_request_atomic(uuid,jsonb,uuid,text) to authenticated;

-- Retain the receiving signature used by both established dashboards. Invoice
-- identity is business-scoped and serialized BEFORE checking for a receipt.
-- Existing duplicates must be reconciled before this unique index can succeed.
alter table public.inventory_receipts add column if not exists v2_payload jsonb;
create unique index stockflow_receipt_invoice_tenant_uq on public.inventory_receipts(tenant_id,lower(trim(invoice_number)));
create or replace function public.receive_inventory(
  p_invoice_number text,p_supplier_id uuid,p_invoice_url text,p_notes text,p_received_at timestamptz,p_items jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.profiles; prior public.inventory_receipts; it record; prod public.products;
  normalized text; body jsonb; receipt uuid:=gen_random_uuid(); total numeric:=0; lines integer:=0;
begin
  p:=stockflow_private.access();
  if p.role::text not in ('owner','manager') then raise exception using errcode='42501',message='Receiving access denied'; end if;
  normalized:=lower(trim(p_invoice_number));
  if normalized is null or length(normalized) not between 1 and 120 then raise exception 'Enter an invoice number of at most 120 characters'; end if;
  if length(coalesce(p_notes,''))>1000 then raise exception 'Notes must be at most 1000 characters'; end if;
  if p_received_at is null or p_received_at>now()+interval '1 day' then raise exception 'Enter a valid received date'; end if;
  if not stockflow_private.attachment_path(p_invoice_url,'invoices',p.tenant_id,p.id) then raise exception 'Invoice attachment access denied'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 100 then raise exception 'Select 1 to 100 products'; end if;
  if exists(select 1 from jsonb_array_elements(p_items) x group by x->>'product_id' having count(*)>1) then raise exception 'Duplicate product lines'; end if;
  if p_supplier_id is not null and not exists(select 1 from public.suppliers where id=p_supplier_id and tenant_id=p.tenant_id) then raise exception 'Supplier access denied'; end if;
  -- Attachment URLs can change when a client reuploads after losing a response.
  -- They do not change the inventory identity or permit another stock increase.
  body:=jsonb_build_object('supplier',p_supplier_id,'notes',nullif(trim(p_notes),''),'received_at',p_received_at,
    'items',(select jsonb_agg(jsonb_build_object('product_id',x.product_id,'quantity',x.quantity,'unit_price',x.unit_price) order by x.product_id)
      from jsonb_to_recordset(p_items) x(product_id uuid,quantity numeric,unit_price numeric)));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p.tenant_id::text||'invoice:'||normalized,0));
  select * into prior from public.inventory_receipts where tenant_id=p.tenant_id and lower(trim(invoice_number))=normalized for update;
  if found then
    if prior.v2_payload is null or prior.v2_payload<>body then raise exception 'This invoice was already received with other details. Check its receipt'; end if;
    return jsonb_build_object('ok',true,'already_processed',true,'receipt_id',prior.id,'total_value',prior.total_value,'lines',jsonb_array_length(p_items));
  end if;
  perform pg_catalog.set_config('stockflow.reason','Received invoice '||trim(p_invoice_number),true);
  -- Stable lock order also composes with checkout and dispatch locks.
  for it in select * from jsonb_to_recordset(p_items) x(product_id uuid,quantity numeric,unit_price numeric) order by product_id loop
    if it.quantity is null or it.quantity<>trunc(it.quantity) or it.quantity not between 1 and 1000000 then raise exception 'Enter a positive whole quantity'; end if;
    if it.unit_price is null or it.unit_price::text in ('NaN','Infinity','-Infinity') or it.unit_price not between 0 and 100000000 or it.unit_price<>round(it.unit_price,2) then raise exception 'Enter a valid cost price'; end if;
    select * into prod from public.products where id=it.product_id and tenant_id=p.tenant_id and is_active for update;
    if not found then raise exception 'Product access denied'; end if;
    total:=total+it.quantity*it.unit_price; lines:=lines+1;
    if total>9000000000000 then raise exception 'This delivery is too large'; end if;
    update public.products set warehouse_stock=warehouse_stock+it.quantity::integer,updated_at=now() where id=prod.id;
  end loop;
  insert into public.inventory_receipts(id,tenant_id,supplier_id,invoice_number,invoice_url,total_value,notes,received_by,received_at,v2_payload)
    values(receipt,p.tenant_id,p_supplier_id,trim(p_invoice_number),p_invoice_url,total,nullif(trim(p_notes),''),p.id,p_received_at,body);
  insert into public.inventory_receipt_items(receipt_id,product_id,quantity,unit_price)
    select receipt,x.product_id,x.quantity::integer,x.unit_price from jsonb_to_recordset(p_items) x(product_id uuid,quantity numeric,unit_price numeric);
  insert into public.approval_history(tenant_id,actor_id,record_type,record_id,new_status,notes)
    values(p.tenant_id,p.id,'inventory_receipt',receipt,'received',nullif(trim(p_notes),''));
  insert into public.stockflow_audit(tenant_id,actor_id,action,object_id,after_state,reason)
    values(p.tenant_id,p.id,'inventory_received',receipt,jsonb_build_object('total_value',total,'lines',p_items),'Received invoice '||trim(p_invoice_number));
  return jsonb_build_object('ok',true,'receipt_id',receipt,'total_value',total,'lines',lines);
exception when sqlstate 'P0001' then return jsonb_build_object('ok',false,'error',sqlerrm);
  when sqlstate '42501' then return jsonb_build_object('ok',false,'error','Your account cannot receive this inventory');
  when others then return jsonb_build_object('ok',false,'error','Could not receive inventory. Check the quantities, prices and business access.');
end $$;
revoke all on function public.receive_inventory(text,uuid,text,text,timestamptz,jsonb) from public,anon;
grant execute on function public.receive_inventory(text,uuid,text,text,timestamptz,jsonb) to authenticated;

revoke all on all functions in schema stockflow_private from public, anon, authenticated;
revoke all on function public.stockflow_v2_sale(uuid,text,uuid,jsonb,text,text,text) from public, anon;
revoke all on function public.stockflow_v2_adjust_stock(uuid,uuid,integer,integer,text) from public, anon;
revoke all on function public.stockflow_v2_cancel_sale(uuid,text) from public, anon;
revoke all on function public.stockflow_v2_dashboard(timestamptz,timestamptz) from public, anon;
revoke all on function public.stockflow_v2_product(uuid,uuid,jsonb) from public, anon;
revoke all on function public.stockflow_v2_import_products(uuid,jsonb) from public, anon;
revoke all on function public.stockflow_v2_customer(uuid,text,text,text) from public, anon;
grant execute on function public.stockflow_v2_sale(uuid,text,uuid,jsonb,text,text,text),
  public.stockflow_v2_adjust_stock(uuid,uuid,integer,integer,text),
  public.stockflow_v2_cancel_sale(uuid,text),public.stockflow_v2_dashboard(timestamptz,timestamptz),
  public.stockflow_v2_product(uuid,uuid,jsonb),public.stockflow_v2_import_products(uuid,jsonb),
  public.stockflow_v2_customer(uuid,text,text,text) to authenticated;

-- Public signup can create a NEW business, never select an existing business
-- or staff role from editable metadata. Staff profiles are provisioned only by
-- the verified owner/service invitation operation below.
create or replace function public.handle_new_signup() returns trigger
language plpgsql security definer set search_path = '' as $$
declare business text:=nullif(trim(new.raw_user_meta_data->>'business_name'),'');
  name text:=coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'),''),split_part(new.email,'@',1));
  phone text:=nullif(trim(new.raw_user_meta_data->>'phone'),''); mode text:=new.raw_user_meta_data->>'business_mode'; tenant uuid;
begin
  if business is null then return new; end if;
  if length(business)>200 or length(name)>200 or length(coalesce(phone,''))>30 then raise exception 'Check business and account details'; end if;
  if mode is null or mode not in ('solo','owner_rep','owner_manager_rep') then mode:='owner_rep'; end if;
  insert into public.tenants(name,business_name,plan,status,business_mode,contact_email,contact_phone,trial_ends_at)
    values(business,business,'starter','trial',mode,new.email,phone,now()+interval '14 days') returning id into tenant;
  insert into public.profiles(id,tenant_id,full_name,phone,role,is_active) values(new.id,tenant,name,phone,'owner',true);
  insert into public.expense_categories(tenant_id,name,is_active)
    select tenant,x,true from unnest(array['Fuel','Vehicle Maintenance','Office Supplies','Salaries','Rent','Utilities','Other']) x;
  return new;
end $$;
-- Replace only the two documented identity handlers; retain unrelated Auth triggers.
do $$ declare t record; begin
  for t in select trg.tgname from pg_catalog.pg_trigger trg join pg_catalog.pg_proc f on f.oid=trg.tgfoid
    where trg.tgrelid='auth.users'::regclass and not trg.tgisinternal and f.proname in('handle_new_signup','handle_new_user') loop
    execute pg_catalog.format('drop trigger %I on auth.users',t.tgname);
  end loop;
end $$;
create trigger stockflow_v2_signup after insert on auth.users for each row execute function public.handle_new_signup();
revoke all on function public.handle_new_signup() from public,anon,authenticated;

-- One invitation identity per email, including competing owner requests. Auth
-- sends the invitation; this key coordinates recovery across that boundary.
create unique index stockflow_staff_email_request_uq on stockflow_private.operations((payload->>'email')) where operation='staff invite';
create function public.stockflow_v2_begin_staff_invite(p_request_id uuid,p_email text,p_full_name text,p_phone text,p_role text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.profiles; prior jsonb; body jsonb;
begin
  p:=stockflow_private.access();
  if p.role::text<>'owner' then raise exception using errcode='42501',message='Only an owner can invite staff'; end if;
  if p_role is null or p_role not in('manager','rep') then raise exception 'Choose a manager or rep role'; end if;
  if p_email is null or length(p_email)>254 or trim(p_email)!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter a valid email address'; end if;
  if nullif(trim(p_full_name),'') is null or length(p_full_name)>200 or length(coalesce(p_phone,''))>30 then raise exception 'Check staff contact details'; end if;
  body:=jsonb_build_object('email',lower(trim(p_email)),'full_name',trim(p_full_name),'phone',nullif(trim(p_phone),''),'role',p_role);
  prior:=stockflow_private.claim(p_request_id,'staff invite',body);
  if prior is not null then return prior; end if;
  prior:=jsonb_build_object('ok',true,'pending',true,'request_id',p_request_id);
  perform stockflow_private.finish(p_request_id,prior);
  return prior;
end $$;
revoke all on function public.stockflow_v2_begin_staff_invite(uuid,text,text,text,text) from public,anon;
grant execute on function public.stockflow_v2_begin_staff_invite(uuid,text,text,text,text) to authenticated;

-- These two functions are NOT browser APIs. Execute is granted solely to the
-- service role used by the Edge Function after verifying the owner's JWT.
create function public.stockflow_v2_staff_invite_state(p_actor_id uuid,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.profiles; o stockflow_private.operations; candidate auth.users; existing public.profiles;
begin
  select * into p from public.profiles where id=p_actor_id and is_active and role::text='owner';
  if not found or not exists(select 1 from public.tenants where id=p.tenant_id and status::text<>'suspended') then raise exception using errcode='42501',message='Owner access denied'; end if;
  select * into o from stockflow_private.operations where tenant_id=p.tenant_id and actor_id=p.id and request_id=p_request_id and operation='staff invite';
  if not found then raise exception 'Invitation request missing'; end if;
  select * into candidate from auth.users where lower(email)=o.payload->>'email';
  if found then
    if candidate.invited_at is null or candidate.raw_user_meta_data->>'stockflow_request_id' is distinct from p_request_id::text
      or candidate.raw_user_meta_data->>'stockflow_invited_by' is distinct from p.id::text then raise exception 'This address already has an account. Review existing staff'; end if;
    select * into existing from public.profiles where id=candidate.id;
    if found and (existing.tenant_id is distinct from p.tenant_id or existing.role::text is distinct from (o.payload->>'role')) then raise exception using errcode='42501',message='Existing account cannot be reassigned'; end if;
  end if;
  return jsonb_build_object('tenant_id',p.tenant_id,'actor_id',p.id,'payload',o.payload,'user_id',candidate.id,'result',o.result);
end $$;
create function public.stockflow_v2_finish_staff_invite(p_actor_id uuid,p_request_id uuid,p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare state jsonb; o stockflow_private.operations; prior public.profiles; desired public.profiles.role%type; v_result jsonb;
begin
  state:=public.stockflow_v2_staff_invite_state(p_actor_id,p_request_id);
  if (state->>'user_id')::uuid is distinct from p_user_id or p_user_id is null then raise exception 'Verified invitation account missing'; end if;
  select * into o from stockflow_private.operations where tenant_id=(state->>'tenant_id')::uuid and actor_id=p_actor_id and request_id=p_request_id for update;
  if o.result ? 'user_id' then return o.result; end if;
  desired:=o.payload->>'role';
  select * into prior from public.profiles where id=p_user_id;
  if prior.id is null then
    insert into public.profiles(id,tenant_id,full_name,phone,role,is_active)
      values(p_user_id,o.tenant_id,o.payload->>'full_name',o.payload->>'phone',desired,true);
  end if;
  insert into public.stockflow_audit(tenant_id,actor_id,action,object_id,after_state,reason)
    values(o.tenant_id,p_actor_id,'staff_invited',p_user_id,jsonb_build_object('role',desired,'email',o.payload->>'email'),'Owner-authorised email invitation');
  v_result:=jsonb_build_object('ok',true,'user_id',p_user_id,'request_id',p_request_id,'invitation_requested',true);
  update stockflow_private.operations set result=v_result where tenant_id=o.tenant_id and actor_id=o.actor_id and request_id=o.request_id;
  return v_result;
end $$;
revoke all on function public.stockflow_v2_staff_invite_state(uuid,uuid),public.stockflow_v2_finish_staff_invite(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.stockflow_v2_staff_invite_state(uuid,uuid),public.stockflow_v2_finish_staff_invite(uuid,uuid,uuid) to service_role;

-- Deliberately no blanket REVOKE on legacy business tables: retained workflows
-- must first be ported and verified. Their direct-write exposure is a release
-- blocker, not an acceptable permanent security boundary.
commit;
