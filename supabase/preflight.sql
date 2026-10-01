-- Read-only production assessment. Run using an authorised operator connection.
-- Save results privately with the backup manifest, not in a public repository.
begin read only;
select version();
select table_name,column_name,data_type,is_nullable,column_default from information_schema.columns
 where table_schema='public' and table_name in ('profiles','tenants','products','rep_holdings','sales','sale_items','customers','stock_requests','stock_request_items','product_returns','return_items','inventory_receipts','inventory_receipt_items','payments') order by table_name,ordinal_position;
select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname in ('public','storage') order by tablename,policyname;
select table_name,grantee,privilege_type from information_schema.role_table_grants
 where table_schema='public' and grantee in ('anon','authenticated') order by table_name,grantee,privilege_type;
select p.proname,pg_get_function_identity_arguments(p.oid) signature,p.prosecdef security_definer,p.proconfig configuration,md5(p.prosrc) definition_hash
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by p.proname;
select trg.tgname,n.nspname function_schema,p.proname,pg_get_triggerdef(trg.oid) trigger_definition,md5(p.prosrc) definition_hash
 from pg_trigger trg join pg_proc p on p.oid=trg.tgfoid join pg_namespace n on n.oid=p.pronamespace
 where trg.tgrelid='auth.users'::regclass and not trg.tgisinternal;
select column_name,data_type,is_nullable from information_schema.columns
 where table_schema='auth' and table_name='users' and column_name in('id','email','invited_at','raw_user_meta_data','raw_app_meta_data');
select tenant_id,lower(trim(sku_code)) sku,count(*) duplicates from public.products
 where nullif(trim(sku_code),'') is not null group by 1,2 having count(*)>1;
select tenant_id,lower(trim(invoice_number)) invoice,count(*) duplicates from public.inventory_receipts group by 1,2 having count(*)>1;
select count(*) invalid_products from public.products where tenant_id is null or warehouse_stock is null or warehouse_stock<0 or buy_price is null or sell_price is null
 or buy_price<0 or sell_price<=0 or buy_price::text in ('NaN','Infinity','-Infinity') or sell_price::text in ('NaN','Infinity','-Infinity');
select count(*) invalid_holdings from public.rep_holdings h left join public.products p on p.id=h.product_id left join public.profiles r on r.id=h.rep_id
 where h.quantity<0 or h.debt_amount<0 or p.tenant_id is distinct from h.tenant_id or r.tenant_id is distinct from h.tenant_id;
select count(*) mismatched_sales from public.sales s left join lateral (
 select coalesce(sum(quantity),0) cases,coalesce(sum(quantity*unit_price),0) total from public.sale_items where sale_id=s.id
) i on true where s.total_cases is distinct from i.cases or s.total_value is distinct from i.total;
select count(*) cross_tenant_items from public.sale_items i join public.sales s on s.id=i.sale_id join public.products p on p.id=i.product_id where p.tenant_id<>s.tenant_id;
select count(*) missing_cost_snapshots from public.sale_items where buy_price_snapshot is null;
select status::text,count(*) from public.sales group by status::text;
select status::text,count(*) from public.product_returns group by status::text;
select id,public,file_size_limit,allowed_mime_types from storage.buckets;
select n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='r' order by c.relname;
rollback;
