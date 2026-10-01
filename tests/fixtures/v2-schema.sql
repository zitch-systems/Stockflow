-- Isolated executable contract fixture, inferred from repository SQL and queries.
-- This is NOT a production schema dump. Production compatibility is a gate.
create role anon;
create role authenticated;
create role service_role;
create schema auth;
create table auth.users(id uuid primary key default gen_random_uuid(),email text unique,raw_user_meta_data jsonb default '{}'::jsonb,raw_app_meta_data jsonb default '{}'::jsonb,invited_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
create table tenants(id uuid primary key default gen_random_uuid(),name text,business_name text,status text default 'active',plan text,business_mode text,contact_email text,contact_phone text,trial_ends_at timestamptz);
create table expense_categories(id uuid primary key default gen_random_uuid(),tenant_id uuid references tenants,name text,is_active boolean,unique(tenant_id,name));
create table profiles(id uuid primary key,tenant_id uuid references tenants,role text,is_active boolean default true,full_name text,phone text,branch text);
create table products(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references tenants,
  name text not null,buy_price numeric not null,sell_price numeric not null,warehouse_stock integer not null default 0 check(warehouse_stock>=0),
  sku_code text,is_active boolean not null default true,emoji text,weight_value numeric,updated_at timestamptz default now());
create table rep_holdings(id uuid primary key default gen_random_uuid(),tenant_id uuid references tenants,rep_id uuid references profiles,
  product_id uuid references products,quantity integer not null check(quantity>=0),debt_amount numeric not null default 0 check(debt_amount>=0),
  updated_at timestamptz default now(),unique(rep_id,product_id));
create table customers(id uuid primary key default gen_random_uuid(),tenant_id uuid references tenants,name text,phone text,address text,credit_limit numeric default 0);
create table sales(id uuid primary key default gen_random_uuid(),tenant_id uuid references tenants,rep_id uuid references profiles,
  customer_name text not null,customer_id uuid references customers,total_cases integer check(total_cases>0),total_value numeric,
  status text,created_at timestamptz default now(),payment_method text,notes text,receipt_url text);
create table sale_items(id uuid primary key default gen_random_uuid(),sale_id uuid references sales,product_id uuid references products,
  quantity integer not null,unit_price numeric,list_price numeric,buy_price_snapshot numeric);
create table stock_requests(id uuid primary key default gen_random_uuid(),tenant_id uuid references tenants,rep_id uuid references profiles,
  status text default 'pending',reviewed_by uuid references profiles,reviewed_at timestamptz);
create table stock_request_items(id uuid primary key default gen_random_uuid(),request_id uuid references stock_requests,product_id uuid references products,quantity integer,unit_price numeric);
create table approval_history(id uuid primary key default gen_random_uuid(),tenant_id uuid references tenants,actor_id uuid references profiles,
  record_type text,record_id uuid,previous_status text,new_status text,notes text);
create table suppliers(id uuid primary key default gen_random_uuid(),tenant_id uuid references tenants,name text);
create table inventory_receipts(id uuid primary key default gen_random_uuid(),tenant_id uuid references tenants,supplier_id uuid references suppliers,
  invoice_number text not null,invoice_url text,total_value numeric,notes text,received_by uuid references profiles,received_at timestamptz);
create table inventory_receipt_items(id uuid primary key default gen_random_uuid(),receipt_id uuid references inventory_receipts,product_id uuid references products,
  quantity integer,unit_price numeric);
alter table profiles enable row level security;
create policy profile_self on profiles for select to authenticated using(id=auth.uid());
alter table tenants enable row level security;
create policy tenant_read on tenants for select to authenticated using(exists(select 1 from profiles p where p.id=auth.uid() and p.tenant_id=tenants.id));
grant select on profiles,tenants to authenticated;
alter table products enable row level security;
alter table customers enable row level security;
alter table sales enable row level security;
alter table sale_items enable row level security;
alter table rep_holdings enable row level security;
create policy product_read on products for select to authenticated using(exists(select 1 from profiles p where p.id=auth.uid() and p.is_active and p.tenant_id=products.tenant_id));
create policy customer_read on customers for select to authenticated using(exists(select 1 from profiles p where p.id=auth.uid() and p.is_active and p.tenant_id=customers.tenant_id));
create policy sales_read on sales for select to authenticated using(exists(select 1 from profiles p where p.id=auth.uid() and p.is_active and p.tenant_id=sales.tenant_id and (p.role in('owner','manager') or sales.rep_id=p.id)));
create policy items_read on sale_items for select to authenticated using(exists(select 1 from sales s where s.id=sale_items.sale_id));
create policy holdings_read on rep_holdings for select to authenticated using(exists(select 1 from profiles p where p.id=auth.uid() and p.is_active and p.tenant_id=rep_holdings.tenant_id and (p.role in('owner','manager') or rep_holdings.rep_id=p.id)));
grant select on products,customers,sales,sale_items,rep_holdings to authenticated;

insert into tenants(id,name) values('10000000-0000-4000-8000-000000000001','Test business A'),('10000000-0000-4000-8000-000000000002','Test business B');
insert into profiles(id,tenant_id,role,full_name) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','owner','Test Owner'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','rep','Test Rep'),
 ('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','manager','Test Manager'),
 ('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000002','owner','Other Owner');
insert into products(id,tenant_id,name,buy_price,sell_price,warehouse_stock,sku_code) values
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Flour 50kg',12000,15000,10,'FLOUR50'),
 ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','Sugar',7000,9500,5,'SUGAR'),
 ('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','Private product',1000,2000,20,'OTHER');
insert into rep_holdings(tenant_id,rep_id,product_id,quantity,debt_amount) values
 ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001',5,75000);
insert into customers(id,tenant_id,name) values('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','Other customer');
