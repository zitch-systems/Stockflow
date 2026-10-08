-- Structural contract captured read-only from StockFlow on 8 October 2026.

-- Fictional seed rows only. No production records, identities or secrets.

create role anon; create role authenticated; create role service_role;

create schema auth; create schema extensions;

create extension if not exists "uuid-ossp";

create table auth.users(id uuid primary key default gen_random_uuid(),email text unique,raw_user_meta_data jsonb default '{}'::jsonb,raw_app_meta_data jsonb default '{}'::jsonb,invited_at timestamptz);

create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;

create function auth.role() returns text language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'authenticated')$$;

create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('sub',auth.uid(),'role',auth.role())$$;

grant usage on schema auth to anon,authenticated; grant execute on all functions in schema auth to anon,authenticated;

create type public."approval_status" as enum ('pending','approved','rejected','cancelled');

create type public."payment_status" as enum ('pending','confirmed','rejected','edit_pending');

create type public."price_change_status" as enum ('pending_owner','approved','rejected','cancelled');

create type public."rep_application_kind" as enum ('new_rep','edit_rep','deactivate_rep');

create type public."rep_application_status" as enum ('pending_owner','approved','rejected','cancelled');

create type public."sale_status" as enum ('completed','edited','cancelled','pending');

create type public."subscription_status" as enum ('trialing','active','past_due','cancelled','paused');

create type public."supplier_order_status" as enum ('draft','pending_owner','approved','rejected','submitted','received','cancelled','pending');

create type public."supplier_tx_kind" as enum ('transfer','cash_payment','refund_received','adjustment');

create type public."tenant_plan" as enum ('starter','pro','enterprise');

create type public."tenant_status" as enum ('trial','active','suspended','cancelled');

create type public."user_role" as enum ('super_admin','owner','manager','rep');

create table public."admin_notes"("id" uuid default gen_random_uuid() not null,"tenant_id" uuid,"admin_id" uuid,"note" text not null,"created_at" timestamptz default now());

create table public."approval_history"("id" uuid default gen_random_uuid() not null,"tenant_id" uuid not null,"actor_id" uuid not null,"record_type" text not null,"record_id" uuid not null,"previous_status" text,"new_status" text not null,"notes" text,"created_at" timestamptz default now() not null,"action_type" text,"item_id" uuid,"old_value" text,"new_value" text);

create table public."attachment_metadata"("id" uuid default gen_random_uuid() not null,"tenant_id" uuid not null,"uploaded_by" uuid not null,"linked_entity_type" text not null,"linked_entity_id" uuid not null,"storage_bucket" text not null,"file_path" text not null,"file_name" text,"file_size_bytes" int8,"mime_type" text,"created_at" timestamptz not null,"record_type" text not null,"record_id" uuid not null,"bucket" text not null,"storage_path" text not null,"filename" text not null,"size_bytes" int8,"deleted_at" timestamptz);

create table public."customer_credit_balances"("customer_id" uuid,"tenant_id" uuid,"customer_name" text,"phone" text,"credit_limit" numeric,"total_sales" int8,"total_billed" numeric);

create table public."customers"("id" uuid default gen_random_uuid() not null,"tenant_id" uuid not null,"name" text not null,"phone" text,"address" text,"credit_limit" numeric default 0,"created_at" timestamptz default now(),"updated_at" timestamptz default now(),"is_active" bool default true not null);

create table public."expense_categories"("id" uuid default uuid_generate_v4() not null,"tenant_id" uuid not null,"name" text not null,"is_active" bool default true not null,"created_at" timestamptz default now() not null);

create table public."expenses"("id" uuid default uuid_generate_v4() not null,"tenant_id" uuid not null,"category" text not null,"amount" numeric not null,"description" text,"logged_by" uuid not null,"created_at" timestamptz default now() not null,"supplier_id" uuid,"attachment_urls" text[] default '{}'::text[]);

create table public."impersonation_log"("id" uuid default gen_random_uuid() not null,"super_admin_id" uuid not null,"super_admin_name" text not null,"target_user_id" uuid not null,"target_user_name" text not null,"target_tenant_id" uuid,"reason" text,"created_at" timestamptz default now() not null);

create table public."inventory_adjustments"("id" uuid default gen_random_uuid() not null,"tenant_id" uuid not null,"product_id" uuid not null,"previous_stock" int4 not null,"new_stock" int4 not null,"reason" text not null,"notes" text,"adjusted_by" uuid,"created_at" timestamptz default now());

create table public."inventory_receipt_items"("id" uuid default uuid_generate_v4() not null,"receipt_id" uuid not null,"product_id" uuid not null,"quantity" int4 not null,"unit_price" numeric not null);

create table public."inventory_receipts"("id" uuid default uuid_generate_v4() not null,"tenant_id" uuid not null,"supplier_id" uuid,"invoice_number" text not null,"invoice_url" text,"total_value" numeric default 0 not null,"notes" text,"received_by" uuid not null,"received_at" timestamptz default now() not null,"created_at" timestamptz default now() not null);

create table public."invoice_counters"("tenant_id" uuid not null,"next_num" int4 default 1 not null);

create table public."payments"("id" uuid default uuid_generate_v4() not null,"tenant_id" uuid not null,"rep_id" uuid not null,"amount" numeric not null,"receipt_url" text,"status" public."payment_status" default 'pending'::payment_status not null,"confirmed_by" uuid,"confirmed_at" timestamptz,"notes" text,"created_at" timestamptz default now() not null,"has_pending_edit" bool default false not null,"pending_edit_amount" numeric,"pending_edit_receipt_url" text,"pending_edit_reason" text,"pending_edit_submitted_at" timestamptz,"edit_count" int4 default 0 not null,"last_edited_at" timestamptz,"attachment_urls" text[] default '{}'::text[],"last_paid_at" timestamptz,"rejected_by" uuid,"rejected_at" timestamptz,"updated_at" timestamptz default now());

create table public."platform_config"("key" text not null,"value" jsonb);

create table public."price_change_requests"("id" uuid default uuid_generate_v4() not null,"tenant_id" uuid not null,"product_id" uuid not null,"old_buy_price" numeric,"new_buy_price" numeric,"old_sell_price" numeric,"new_sell_price" numeric,"status" public."price_change_status" default 'pending_owner'::price_change_status not null,"submitted_by" uuid not null,"reviewed_by" uuid,"reviewed_at" timestamptz,"review_notes" text,"notes" text,"created_at" timestamptz default now() not null);

create table public."product_returns"("id" uuid default uuid_generate_v4() not null,"tenant_id" uuid not null,"rep_id" uuid not null,"product_id" uuid not null,"quantity" int4 not null,"reason" text,"photo_url" text,"status" public."approval_status" default 'pending'::approval_status not null,"reviewed_by" uuid,"reviewed_at" timestamptz,"created_at" timestamptz default now() not null,"has_pending_edit" bool default false not null,"pending_edit_quantity" int4,"pending_edit_reason" text,"pending_edit_photo_url" text,"pending_edit_submitted_at" timestamptz,"edit_count" int4 default 0 not null,"last_edited_at" timestamptz,"attachment_urls" text[] default '{}'::text[],"notes" text);

create table public."products"("id" uuid default uuid_generate_v4() not null,"tenant_id" uuid not null,"name" text not null,"category" text,"buy_price" numeric default 0 not null,"sell_price" numeric default 0 not null,"warehouse_stock" int4 default 0 not null,"cases_per_ton" int4 default 0,"emoji" text default '📦'::text,"is_active" bool default true not null,"created_at" timestamptz default now() not null,"updated_at" timestamptz default now() not null,"sku_code" text,"weight_value" numeric);

create table public."profiles"("id" uuid not null,"tenant_id" uuid,"full_name" text not null,"phone" text,"role" public."user_role" default 'rep'::user_role not null,"is_active" bool default true not null,"created_at" timestamptz default now() not null,"updated_at" timestamptz default now() not null,"last_paid_at" timestamptz,"debt_limit" numeric,"date_of_birth" date,"email_personal" text,"address" text,"nin" text,"bvn" text,"nin_verified" bool default false,"bvn_verified" bool default false,"passport_url" text,"govt_id_url" text,"date_hired" date,"branch" text,"bank_name" text,"account_number" text,"account_name" text,"guarantor_name" text,"guarantor_phone" text,"guarantor_relationship" text,"guarantor_address" text,"guarantor_id_url" text,"kyc_complete" bool default false not null,"monthly_target" numeric default 0,"commission_rate" numeric default 0);

create table public."rep_applications"("id" uuid default uuid_generate_v4() not null,"tenant_id" uuid not null,"kind" public."rep_application_kind" not null,"target_profile_id" uuid,"status" public."rep_application_status" default 'pending_owner'::rep_application_status not null,"full_name" text,"date_of_birth" date,"phone" text,"email_personal" text,"address" text,"nin" text,"bvn" text,"passport_url" text,"govt_id_url" text,"date_hired" date,"branch" text,"initial_debt_limit" numeric,"bank_name" text,"account_number" text,"account_name" text,"guarantor_name" text,"guarantor_phone" text,"guarantor_relationship" text,"guarantor_address" text,"guarantor_id_url" text,"notes" text,"submitted_by" uuid not null,"reviewed_by" uuid,"reviewed_at" timestamptz,"review_notes" text,"created_at" timestamptz default now() not null,"updated_at" timestamptz default now() not null);

create table public."rep_holdings"("id" uuid default uuid_generate_v4() not null,"tenant_id" uuid not null,"rep_id" uuid not null,"product_id" uuid not null,"quantity" int4 default 0 not null,"debt_amount" numeric default 0 not null,"updated_at" timestamptz default now() not null);

create table public."rep_price_changes"("sale_id" uuid,"tenant_id" uuid,"rep_id" uuid,"created_at" timestamptz,"customer_name" text,"product_name" text,"quantity" int4,"old_price" numeric,"new_price" numeric,"price_diff" numeric);

create table public."sale_items"("id" uuid default uuid_generate_v4() not null,"sale_id" uuid not null,"product_id" uuid not null,"quantity" int4 not null,"unit_price" numeric not null,"list_price" numeric,"price_overridden" bool default false not null,"buy_price_snapshot" numeric);

create table public."sales"("id" uuid default uuid_generate_v4() not null,"tenant_id" uuid not null,"rep_id" uuid not null,"customer_name" text not null,"total_cases" int4 default 0 not null,"total_value" numeric default 0 not null,"status" public."sale_status" default 'completed'::sale_status not null,"created_at" timestamptz default now() not null,"last_edited_at" timestamptz,"edit_count" int4 default 0 not null,"edit_reason" text,"customer_id" uuid,"updated_at" timestamptz default now(),"payment_method" text,"receipt_url" text,"notes" text);

create table public."stock_request_items"("id" uuid default uuid_generate_v4() not null,"request_id" uuid not null,"product_id" uuid not null,"quantity" int4 not null,"unit_price" numeric not null);

create table public."stock_requests"("id" uuid default uuid_generate_v4() not null,"tenant_id" uuid not null,"rep_id" uuid not null,"total_cases" int4 default 0 not null,"total_value" numeric default 0 not null,"status" public."approval_status" default 'pending'::approval_status not null,"reviewed_by" uuid,"reviewed_at" timestamptz,"notes" text,"created_at" timestamptz default now() not null,"original_request_id" uuid,"attachment_urls" text[] default '{}'::text[],"updated_at" timestamptz default now());

create table public."subscriptions"("id" uuid default uuid_generate_v4() not null,"tenant_id" uuid not null,"plan" public."tenant_plan" not null,"amount" numeric not null,"currency" text default 'NGN'::text not null,"status" public."subscription_status" default 'trialing'::subscription_status not null,"paystack_customer_code" text,"paystack_subscription_code" text,"paystack_email_token" text,"next_charge_date" timestamptz,"cancelled_at" timestamptz,"created_at" timestamptz default now() not null,"updated_at" timestamptz default now() not null);

create table public."supplier_order_items"("id" uuid default uuid_generate_v4() not null,"order_id" uuid not null,"product_id" uuid not null,"quantity" int4 not null,"unit_price" numeric not null,"supplier_order_id" uuid);

create table public."supplier_orders"("id" uuid default uuid_generate_v4() not null,"tenant_id" uuid not null,"supplier_id" uuid not null,"total_cases" int4 default 0 not null,"total_value" numeric default 0 not null,"status" public."supplier_order_status" default 'pending_owner'::supplier_order_status not null,"notes" text,"submitted_by" uuid not null,"reviewed_by" uuid,"reviewed_at" timestamptz,"review_notes" text,"created_at" timestamptz default now() not null,"updated_at" timestamptz default now() not null);

create table public."supplier_transactions"("id" uuid default uuid_generate_v4() not null,"tenant_id" uuid not null,"supplier_id" uuid not null,"kind" public."supplier_tx_kind" not null,"amount" numeric not null,"reference" text,"receipt_url" text,"notes" text,"logged_by" uuid not null,"created_at" timestamptz default now() not null,"attachment_urls" text[] default '{}'::text[]);

create table public."suppliers"("id" uuid default uuid_generate_v4() not null,"tenant_id" uuid not null,"name" text not null,"contact_name" text,"phone" text,"email" text,"notes" text,"is_active" bool default true not null,"created_at" timestamptz default now() not null,"updated_at" timestamptz default now() not null);

create table public."tenant_summary"("tenant_id" uuid,"tenant_name" text,"business_mode" text,"active_reps" int8,"managers" int8,"active_products" int8,"total_revenue" numeric,"total_collected" numeric,"total_outstanding" numeric);

create table public."tenants"("id" uuid default uuid_generate_v4() not null,"name" text not null,"plan" public."tenant_plan" default 'starter'::tenant_plan not null,"status" public."tenant_status" default 'trial'::tenant_status not null,"trial_ends_at" timestamptz default (now() + '14 days'::interval),"contact_email" text,"contact_phone" text,"created_at" timestamptz default now() not null,"updated_at" timestamptz default now() not null,"business_name" text,"logo_url" text,"suspension_reason" text,"suspended_at" timestamptz,"business_mode" text default 'owner_rep'::text not null,"monthly_price" numeric default 0,"billing_cycle" text default 'monthly'::text,"max_reps" int4,"subscription_expires_at" timestamptz,"is_active" bool default true,"subscription_ends_at" timestamptz);

create table public."v_daily_rep_payments"("id" uuid,"tenant_id" uuid,"rep_id" uuid,"rep_name" text,"amount" numeric,"status" public."payment_status","payment_date" date,"created_at" timestamptz,"confirmed_at" timestamptz,"confirmed_by" uuid,"confirmed_by_name" text,"receipt_url" text,"notes" text,"has_pending_edit" bool,"pending_edit_amount" numeric,"attachment_urls" text[]);

create table public."v_daily_rep_stock_picked"("request_id" uuid,"tenant_id" uuid,"rep_id" uuid,"rep_name" text,"picked_date" date,"product_id" uuid,"product_name" text,"quantity" int4,"unit_price" numeric,"total_value" numeric,"status" public."approval_status","reviewed_by" uuid,"reviewed_by_name" text);

alter table public."admin_notes" add constraint "admin_notes_pkey" PRIMARY KEY (id);

alter table public."approval_history" add constraint "approval_history_pkey" PRIMARY KEY (id);

alter table public."approval_history" add constraint "approval_history_record_type_check" CHECK ((record_type = ANY (ARRAY['payment'::text, 'stock_request'::text, 'product_return'::text, 'price_change_request'::text, 'rep_application'::text, 'supplier_order'::text, 'rep_holdings'::text, 'inventory_receipt'::text, 'stock_adjustment'::text])));

alter table public."attachment_metadata" add constraint "attachment_metadata_pkey" PRIMARY KEY (id);

alter table public."customers" add constraint "customers_pkey" PRIMARY KEY (id);

alter table public."expense_categories" add constraint "expense_categories_pkey" PRIMARY KEY (id);

alter table public."expense_categories" add constraint "expense_categories_tenant_id_name_key" UNIQUE (tenant_id, name);

alter table public."expenses" add constraint "expenses_amount_check" CHECK ((amount > (0)::numeric));

alter table public."expenses" add constraint "expenses_amount_positive" CHECK ((amount > (0)::numeric));

alter table public."expenses" add constraint "expenses_pkey" PRIMARY KEY (id);

alter table public."impersonation_log" add constraint "impersonation_log_pkey" PRIMARY KEY (id);

alter table public."inventory_adjustments" add constraint "inventory_adjustments_pkey" PRIMARY KEY (id);

alter table public."inventory_receipt_items" add constraint "inventory_receipt_items_pkey" PRIMARY KEY (id);

alter table public."inventory_receipt_items" add constraint "inventory_receipt_items_quantity_check" CHECK ((quantity > 0));

alter table public."inventory_receipts" add constraint "inventory_receipts_pkey" PRIMARY KEY (id);

alter table public."invoice_counters" add constraint "invoice_counters_pkey" PRIMARY KEY (tenant_id);

alter table public."payments" add constraint "payments_amount_check" CHECK ((amount > (0)::numeric));

alter table public."payments" add constraint "payments_amount_positive" CHECK ((amount > (0)::numeric));

alter table public."payments" add constraint "payments_pkey" PRIMARY KEY (id);

alter table public."platform_config" add constraint "platform_config_pkey" PRIMARY KEY (key);

alter table public."price_change_requests" add constraint "price_change_requests_pkey" PRIMARY KEY (id);

alter table public."product_returns" add constraint "product_returns_pkey" PRIMARY KEY (id);

alter table public."product_returns" add constraint "product_returns_quantity_check" CHECK ((quantity > 0));

alter table public."products" add constraint "products_pkey" PRIMARY KEY (id);

alter table public."products" add constraint "products_prices_positive" CHECK (((buy_price > (0)::numeric) AND (sell_price > (0)::numeric)));

alter table public."products" add constraint "products_warehouse_stock_nonneg" CHECK ((warehouse_stock >= 0));

alter table public."profiles" add constraint "profiles_pkey" PRIMARY KEY (id);

alter table public."profiles" add constraint "tenant_required_for_non_super_admin" CHECK (((role = 'super_admin'::user_role) OR (tenant_id IS NOT NULL)));

alter table public."rep_applications" add constraint "rep_applications_pkey" PRIMARY KEY (id);

alter table public."rep_holdings" add constraint "rep_holdings_debt_nonneg" CHECK ((debt_amount >= (0)::numeric));

alter table public."rep_holdings" add constraint "rep_holdings_pkey" PRIMARY KEY (id);

alter table public."rep_holdings" add constraint "rep_holdings_quantity_nonneg" CHECK ((quantity >= 0));

alter table public."rep_holdings" add constraint "rep_holdings_rep_id_product_id_key" UNIQUE (rep_id, product_id);

alter table public."sale_items" add constraint "sale_items_pkey" PRIMARY KEY (id);

alter table public."sale_items" add constraint "sale_items_quantity_check" CHECK ((quantity > 0));

alter table public."sales" add constraint "sales_pkey" PRIMARY KEY (id);

alter table public."sales" add constraint "sales_total_cases_positive" CHECK ((total_cases > 0));

alter table public."sales" add constraint "sales_total_value_positive" CHECK ((total_value >= (0)::numeric));

alter table public."stock_request_items" add constraint "stock_request_items_pkey" PRIMARY KEY (id);

alter table public."stock_request_items" add constraint "stock_request_items_quantity_check" CHECK ((quantity > 0));

alter table public."stock_requests" add constraint "stock_requests_pkey" PRIMARY KEY (id);

alter table public."subscriptions" add constraint "subscriptions_pkey" PRIMARY KEY (id);

alter table public."subscriptions" add constraint "subscriptions_tenant_id_key" UNIQUE (tenant_id);

alter table public."supplier_order_items" add constraint "supplier_order_items_pkey" PRIMARY KEY (id);

alter table public."supplier_order_items" add constraint "supplier_order_items_quantity_check" CHECK ((quantity > 0));

alter table public."supplier_orders" add constraint "supplier_orders_pkey" PRIMARY KEY (id);

alter table public."supplier_transactions" add constraint "supplier_transactions_amount_check" CHECK ((amount > (0)::numeric));

alter table public."supplier_transactions" add constraint "supplier_transactions_pkey" PRIMARY KEY (id);

alter table public."suppliers" add constraint "suppliers_pkey" PRIMARY KEY (id);

alter table public."suppliers" add constraint "suppliers_tenant_id_name_key" UNIQUE (tenant_id, name);

alter table public."tenants" add constraint "tenants_business_mode_check" CHECK ((business_mode = ANY (ARRAY['solo'::text, 'owner_rep'::text, 'owner_manager_rep'::text])));

alter table public."tenants" add constraint "tenants_pkey" PRIMARY KEY (id);

alter table public."admin_notes" add constraint "admin_notes_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

alter table public."approval_history" add constraint "approval_history_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES profiles(id) ON DELETE RESTRICT;

alter table public."approval_history" add constraint "approval_history_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

alter table public."attachment_metadata" add constraint "attachment_metadata_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

alter table public."attachment_metadata" add constraint "attachment_metadata_uploader_id_fkey" FOREIGN KEY (uploaded_by) REFERENCES profiles(id) ON DELETE SET NULL;

alter table public."customers" add constraint "customers_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

alter table public."expense_categories" add constraint "expense_categories_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

alter table public."expenses" add constraint "expenses_logged_by_fkey" FOREIGN KEY (logged_by) REFERENCES profiles(id) ON DELETE RESTRICT;

alter table public."expenses" add constraint "expenses_supplier_id_fkey" FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;

alter table public."expenses" add constraint "expenses_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

alter table public."impersonation_log" add constraint "impersonation_log_super_admin_id_fkey" FOREIGN KEY (super_admin_id) REFERENCES profiles(id) ON DELETE RESTRICT;

alter table public."impersonation_log" add constraint "impersonation_log_target_tenant_id_fkey" FOREIGN KEY (target_tenant_id) REFERENCES tenants(id) ON DELETE SET NULL;

alter table public."impersonation_log" add constraint "impersonation_log_target_user_id_fkey" FOREIGN KEY (target_user_id) REFERENCES profiles(id) ON DELETE RESTRICT;

alter table public."inventory_adjustments" add constraint "inventory_adjustments_adjusted_by_fkey" FOREIGN KEY (adjusted_by) REFERENCES profiles(id);

alter table public."inventory_adjustments" add constraint "inventory_adjustments_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

alter table public."inventory_adjustments" add constraint "inventory_adjustments_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

alter table public."inventory_receipt_items" add constraint "inventory_receipt_items_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;

alter table public."inventory_receipt_items" add constraint "inventory_receipt_items_receipt_id_fkey" FOREIGN KEY (receipt_id) REFERENCES inventory_receipts(id) ON DELETE CASCADE;

alter table public."inventory_receipts" add constraint "inventory_receipts_received_by_fkey" FOREIGN KEY (received_by) REFERENCES profiles(id) ON DELETE RESTRICT;

alter table public."inventory_receipts" add constraint "inventory_receipts_supplier_id_fkey" FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;

alter table public."inventory_receipts" add constraint "inventory_receipts_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

alter table public."invoice_counters" add constraint "invoice_counters_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

alter table public."payments" add constraint "payments_confirmed_by_fkey" FOREIGN KEY (confirmed_by) REFERENCES profiles(id) ON DELETE SET NULL;

alter table public."payments" add constraint "payments_rejected_by_fkey" FOREIGN KEY (rejected_by) REFERENCES profiles(id);

alter table public."payments" add constraint "payments_rep_id_fkey" FOREIGN KEY (rep_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table public."payments" add constraint "payments_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

alter table public."price_change_requests" add constraint "price_change_requests_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

alter table public."price_change_requests" add constraint "price_change_requests_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES profiles(id) ON DELETE SET NULL;

alter table public."price_change_requests" add constraint "price_change_requests_submitted_by_fkey" FOREIGN KEY (submitted_by) REFERENCES profiles(id) ON DELETE RESTRICT;

alter table public."price_change_requests" add constraint "price_change_requests_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

alter table public."product_returns" add constraint "product_returns_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;

alter table public."product_returns" add constraint "product_returns_rep_id_fkey" FOREIGN KEY (rep_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table public."product_returns" add constraint "product_returns_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES profiles(id) ON DELETE SET NULL;

alter table public."product_returns" add constraint "product_returns_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

alter table public."products" add constraint "products_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

alter table public."profiles" add constraint "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public."profiles" add constraint "profiles_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

alter table public."rep_applications" add constraint "rep_applications_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES profiles(id) ON DELETE SET NULL;

alter table public."rep_applications" add constraint "rep_applications_submitted_by_fkey" FOREIGN KEY (submitted_by) REFERENCES profiles(id) ON DELETE RESTRICT;

alter table public."rep_applications" add constraint "rep_applications_target_profile_id_fkey" FOREIGN KEY (target_profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table public."rep_applications" add constraint "rep_applications_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

alter table public."rep_holdings" add constraint "rep_holdings_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

alter table public."rep_holdings" add constraint "rep_holdings_rep_id_fkey" FOREIGN KEY (rep_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table public."rep_holdings" add constraint "rep_holdings_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

alter table public."sale_items" add constraint "sale_items_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;

alter table public."sale_items" add constraint "sale_items_sale_id_fkey" FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE;

alter table public."sales" add constraint "sales_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;

alter table public."sales" add constraint "sales_rep_id_fkey" FOREIGN KEY (rep_id) REFERENCES profiles(id) ON DELETE RESTRICT;

alter table public."sales" add constraint "sales_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

alter table public."stock_request_items" add constraint "stock_request_items_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;

alter table public."stock_request_items" add constraint "stock_request_items_request_id_fkey" FOREIGN KEY (request_id) REFERENCES stock_requests(id) ON DELETE CASCADE;

alter table public."stock_requests" add constraint "stock_requests_original_request_id_fkey" FOREIGN KEY (original_request_id) REFERENCES stock_requests(id) ON DELETE SET NULL;

alter table public."stock_requests" add constraint "stock_requests_rep_id_fkey" FOREIGN KEY (rep_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table public."stock_requests" add constraint "stock_requests_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES profiles(id) ON DELETE SET NULL;

alter table public."stock_requests" add constraint "stock_requests_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

alter table public."subscriptions" add constraint "subscriptions_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

alter table public."supplier_order_items" add constraint "supplier_order_items_order_id_fkey" FOREIGN KEY (order_id) REFERENCES supplier_orders(id) ON DELETE CASCADE;

alter table public."supplier_order_items" add constraint "supplier_order_items_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;

alter table public."supplier_order_items" add constraint "supplier_order_items_supplier_order_id_fkey" FOREIGN KEY (supplier_order_id) REFERENCES supplier_orders(id) ON DELETE CASCADE;

alter table public."supplier_orders" add constraint "supplier_orders_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES profiles(id) ON DELETE SET NULL;

alter table public."supplier_orders" add constraint "supplier_orders_submitted_by_fkey" FOREIGN KEY (submitted_by) REFERENCES profiles(id) ON DELETE RESTRICT;

alter table public."supplier_orders" add constraint "supplier_orders_supplier_id_fkey" FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT;

alter table public."supplier_orders" add constraint "supplier_orders_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

alter table public."supplier_transactions" add constraint "supplier_transactions_logged_by_fkey" FOREIGN KEY (logged_by) REFERENCES profiles(id) ON DELETE RESTRICT;

alter table public."supplier_transactions" add constraint "supplier_transactions_supplier_id_fkey" FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT;

alter table public."supplier_transactions" add constraint "supplier_transactions_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

alter table public."suppliers" add constraint "suppliers_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

insert into auth.users(id,email) values ('20000000-0000-4000-8000-000000000001','owner@fixture.example'),('20000000-0000-4000-8000-000000000002','rep@fixture.example'),('20000000-0000-4000-8000-000000000003','manager@fixture.example'),('20000000-0000-4000-8000-000000000004','other@fixture.example');

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


CREATE OR REPLACE FUNCTION public.get_my_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT role::text FROM public.profiles WHERE id = auth.uid(); $function$
;

CREATE OR REPLACE FUNCTION public.get_my_tenant_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT tenant_id FROM public.profiles WHERE id = auth.uid(); $function$
;

CREATE OR REPLACE FUNCTION public.is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(get_my_role() = 'super_admin', false);
$function$
;

CREATE OR REPLACE FUNCTION public.is_manager_or_above()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(get_my_role() in ('super_admin', 'owner', 'manager'), false);
$function$
;

CREATE OR REPLACE FUNCTION public.is_owner_or_above()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(get_my_role() in ('super_admin', 'owner'), false);
$function$
;

CREATE OR REPLACE FUNCTION public.tenant_is_active(p_tenant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE t.id = p_tenant_id
      AND t.status != 'suspended'
      AND (
        -- No expiry set = unlimited
        t.subscription_expires_at IS NULL
        OR
        -- Within expiry (allow 3-day grace period)
        t.subscription_expires_at > (now() - interval '3 days')
        OR
        -- Still in trial window (14 days from creation)
        (t.status = 'trial' AND t.created_at > (now() - interval '14 days'))
        OR
        -- Super admin is always active
        get_my_role() = 'super_admin'
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.adjust_holdings(p_rep_id uuid, p_product_id uuid, p_qty_delta integer, p_debt_delta numeric, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor    uuid := auth.uid();
  v_tenant   uuid;
  v_rep_tn   uuid;
  v_existing record;
  v_qty      integer := coalesce(p_qty_delta, 0);
  v_debt     numeric := coalesce(p_debt_delta, 0);
  v_new_qty  integer;
  v_new_debt numeric;
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'error', 'Not authenticated');
  end if;

  v_tenant := get_my_tenant_id();

  select tenant_id into v_rep_tn from public.profiles where id = p_rep_id;
  if v_rep_tn is null then
    return jsonb_build_object('ok', false, 'error', 'Unknown rep');
  end if;

  if not (is_manager_or_above() and (v_rep_tn = v_tenant or is_super_admin())) then
    return jsonb_build_object('ok', false, 'error', 'Not authorized');
  end if;

  perform 1 from public.products where id = p_product_id and tenant_id = v_rep_tn;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Product not in this tenant');
  end if;

  if v_qty = 0 and v_debt = 0 then
    return jsonb_build_object('ok', false, 'error', 'Nothing to adjust');
  end if;

  select * into v_existing from public.rep_holdings
   where rep_id = p_rep_id and product_id = p_product_id
   for update;

  if found then
    if v_existing.quantity + v_qty < 0 then
      return jsonb_build_object('ok', false, 'error',
        format('Rep holds %s, cannot remove %s', v_existing.quantity, abs(v_qty)));
    end if;
    update public.rep_holdings
       set quantity    = quantity + v_qty,
           debt_amount = greatest(0, debt_amount + v_debt),
           updated_at  = now()
     where id = v_existing.id
     returning quantity, debt_amount into v_new_qty, v_new_debt;
  else
    if v_qty < 0 then
      return jsonb_build_object('ok', false, 'error',
        'Rep holds none of this product, cannot remove stock');
    end if;
    insert into public.rep_holdings (tenant_id, rep_id, product_id, quantity, debt_amount)
    values (v_rep_tn, p_rep_id, p_product_id, v_qty, greatest(0, v_debt))
    returning quantity, debt_amount into v_new_qty, v_new_debt;
  end if;

  insert into public.approval_history
    (tenant_id, actor_id, record_type, record_id, new_status, notes, action_type, item_id, old_value, new_value)
  values
    (v_rep_tn, v_actor, 'rep_holdings', p_rep_id, 'adjusted',
     nullif(p_reason, ''), 'holdings_adjustment', p_product_id,
     jsonb_build_object('qty_delta', v_qty, 'debt_delta', v_debt)::text,
     jsonb_build_object('quantity', v_new_qty, 'debt_amount', v_new_debt)::text);

  return jsonb_build_object('ok', true, 'quantity', v_new_qty, 'debt_amount', v_new_debt);
exception when others then
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.approve_return_atomic(p_return_id uuid, p_restock boolean, p_reviewer_id uuid, p_review_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ret    record;
  v_credit numeric;
  v_actor  uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  SELECT r.*, p.sell_price INTO v_ret
  FROM public.product_returns r
  JOIN public.products p ON p.id = r.product_id
  WHERE r.id = p_return_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Return not found');
  END IF;

  IF NOT (is_manager_or_above() AND (v_ret.tenant_id = get_my_tenant_id() OR is_super_admin())) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authorized');
  END IF;

  IF v_ret.status != 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Already processed');
  END IF;

  v_credit := v_ret.quantity * v_ret.sell_price;

  UPDATE public.product_returns
     SET status = 'approved', reviewed_by = v_actor, reviewed_at = now()
   WHERE id = p_return_id;

  IF v_credit > 0 THEN
    UPDATE public.rep_holdings
       SET debt_amount = GREATEST(0, debt_amount - v_credit)
     WHERE rep_id = v_ret.rep_id AND product_id = v_ret.product_id;
  END IF;

  IF p_restock THEN
    UPDATE public.products
       SET warehouse_stock = warehouse_stock + v_ret.quantity
     WHERE id = v_ret.product_id;
  END IF;

  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.approve_stock_request_atomic(p_request_id uuid, p_items jsonb, p_reviewer_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_req      RECORD;
  v_item     RECORD;
  v_existing RECORD;
  v_actor    uuid := auth.uid();
  v_price    numeric;
  v_qty      integer;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_req FROM public.stock_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Request not found');
  END IF;

  IF NOT (is_manager_or_above() AND (v_req.tenant_id = get_my_tenant_id() OR is_super_admin())) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authorized');
  END IF;

  IF v_req.status::text NOT IN ('pending','pending_manager') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Request already ' || v_req.status::text);
  END IF;

  UPDATE public.stock_requests
     SET status = 'approved', reviewed_by = v_actor, reviewed_at = now()
   WHERE id = p_request_id;

  FOR v_item IN
    SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id uuid, quantity integer, unit_price numeric)
  LOOP
    v_qty := GREATEST(0, COALESCE(v_item.quantity, 0));
    CONTINUE WHEN v_qty = 0;

    -- Product must belong to the request's tenant (blocks cross-tenant stock manipulation)
    PERFORM 1 FROM public.products WHERE id = v_item.product_id AND tenant_id = v_req.tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product % not in tenant %', v_item.product_id, v_req.tenant_id;
    END IF;

    -- Authoritative price: the requested item's stored price, else product sell_price. Never client-supplied.
    SELECT unit_price INTO v_price FROM public.stock_request_items
      WHERE request_id = p_request_id AND product_id = v_item.product_id
      ORDER BY unit_price DESC NULLS LAST LIMIT 1;
    IF v_price IS NULL THEN
      SELECT sell_price INTO v_price FROM public.products WHERE id = v_item.product_id;
    END IF;
    v_price := COALESCE(v_price, 0);

    UPDATE public.products
       SET warehouse_stock = GREATEST(0, warehouse_stock - v_qty)
     WHERE id = v_item.product_id;

    SELECT * INTO v_existing FROM public.rep_holdings
      WHERE rep_id = v_req.rep_id AND product_id = v_item.product_id;
    IF FOUND THEN
      UPDATE public.rep_holdings
         SET quantity = v_existing.quantity + v_qty,
             debt_amount = v_existing.debt_amount + v_qty * v_price,
             updated_at = now()
       WHERE id = v_existing.id;
    ELSE
      INSERT INTO public.rep_holdings (tenant_id, rep_id, product_id, quantity, debt_amount)
      VALUES (v_req.tenant_id, v_req.rep_id, v_item.product_id, v_qty, v_qty * v_price);
    END IF;
  END LOOP;

  INSERT INTO public.approval_history (tenant_id, actor_id, record_type, record_id, previous_status, new_status, notes)
  VALUES (v_req.tenant_id, v_actor, 'stock_request', p_request_id, 'pending', 'approved', p_notes)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cancel_sale(p_sale_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rep    uuid := auth.uid();
  v_tenant uuid;
  v_status text;
  old_it   record;
begin
  if v_rep is null then raise exception 'not authenticated'; end if;

  select tenant_id, status into v_tenant, v_status
  from public.sales
  where id = p_sale_id and rep_id = v_rep
  for update;
  if v_tenant is null then raise exception 'sale not found or not yours'; end if;
  if v_status = 'cancelled' then return; end if;

  for old_it in
    select product_id, quantity from public.sale_items where sale_id = p_sale_id
  loop
    update public.rep_holdings
    set quantity = quantity + old_it.quantity
    where rep_id = v_rep and product_id = old_it.product_id and tenant_id = v_tenant;
  end loop;

  update public.sales set status = 'cancelled' where id = p_sale_id and rep_id = v_rep;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.confirm_payment_atomic(p_payment_id uuid, p_confirmer_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pay       RECORD;
  v_remaining numeric;
  v_holding   RECORD;
  v_take      numeric;
  v_actor     uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_pay FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Payment not found');
  END IF;

  IF NOT (is_manager_or_above() AND (v_pay.tenant_id = get_my_tenant_id() OR is_super_admin())) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authorized');
  END IF;

  IF v_pay.status::text <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Payment already ' || v_pay.status::text);
  END IF;

  UPDATE public.payments
     SET status = 'confirmed', confirmed_by = v_actor, confirmed_at = now(), notes = p_note, updated_at = now()
   WHERE id = p_payment_id;

  v_remaining := v_pay.amount;
  FOR v_holding IN
    SELECT id, debt_amount FROM public.rep_holdings
     WHERE rep_id = v_pay.rep_id AND debt_amount > 0
     ORDER BY updated_at ASC FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_take := LEAST(v_remaining, v_holding.debt_amount);
    UPDATE public.rep_holdings SET debt_amount = debt_amount - v_take, updated_at = now() WHERE id = v_holding.id;
    v_remaining := v_remaining - v_take;
  END LOOP;

  INSERT INTO public.approval_history (tenant_id, actor_id, record_type, record_id, previous_status, new_status, notes)
  VALUES (v_pay.tenant_id, v_actor, 'payment', p_payment_id, 'pending', 'confirmed', p_note)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'amount_applied', v_pay.amount - v_remaining, 'overpayment', v_remaining);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.edit_sale(p_sale_id uuid, p_customer_name text, p_items jsonb, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rep        uuid := auth.uid();
  v_tenant     uuid;
  v_status     text;
  v_total_val  numeric := 0;
  v_total_qty  integer := 0;
  it           jsonb;
  v_pid        uuid;
  v_qty        integer;
  v_req_price  numeric;
  v_sell       numeric;
  v_buy        numeric;
  v_have       integer;
  old_it       record;
  v_lines      jsonb := '[]'::jsonb;
begin
  if v_rep is null then raise exception 'not authenticated'; end if;

  select tenant_id, status into v_tenant, v_status
  from public.sales
  where id = p_sale_id and rep_id = v_rep
  for update;
  if v_tenant is null then raise exception 'sale not found or not yours'; end if;
  if v_status not in ('pending','edited') then
    raise exception 'sale % is % and can no longer be edited', p_sale_id, v_status;
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'no line items';
  end if;

  for old_it in
    select product_id, quantity from public.sale_items where sale_id = p_sale_id
  loop
    update public.rep_holdings
    set quantity = quantity + old_it.quantity
    where rep_id = v_rep and product_id = old_it.product_id and tenant_id = v_tenant;
  end loop;

  delete from public.sale_items where sale_id = p_sale_id;

  for it in select * from jsonb_array_elements(p_items)
  loop
    v_pid       := (it->>'product_id')::uuid;
    v_qty       := (it->>'quantity')::integer;
    v_req_price := nullif(it->>'unit_price','')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'invalid quantity for product %', v_pid;
    end if;

    select sell_price, buy_price into v_sell, v_buy
    from public.products
    where id = v_pid and tenant_id = v_tenant and is_active = true;
    if v_sell is null then raise exception 'unknown or inactive product %', v_pid; end if;

    v_req_price := coalesce(v_req_price, v_sell);
    if v_req_price < v_buy then
      raise exception 'price % below cost % for product %', v_req_price, v_buy, v_pid;
    end if;

    select quantity into v_have
    from public.rep_holdings
    where rep_id = v_rep and product_id = v_pid and tenant_id = v_tenant
    for update;
    if v_have is null or v_have < v_qty then
      raise exception 'insufficient holdings for product % (have %, need %)',
        v_pid, coalesce(v_have,0), v_qty;
    end if;

    update public.rep_holdings
    set quantity = quantity - v_qty
    where rep_id = v_rep and product_id = v_pid and tenant_id = v_tenant;

    v_lines := v_lines || jsonb_build_object(
      'product_id', v_pid, 'quantity', v_qty,
      'unit_price', v_req_price, 'list_price', v_sell, 'buy_price', v_buy);

    v_total_val := v_total_val + v_req_price * v_qty;
    v_total_qty := v_total_qty + v_qty;
  end loop;

  if v_total_qty <= 0 then
    raise exception 'sale must contain at least one unit';
  end if;

  update public.sales set
    customer_name  = p_customer_name,
    total_cases    = v_total_qty,
    total_value    = v_total_val,
    status         = 'edited',
    edit_count     = coalesce(edit_count, 0) + 1,
    last_edited_at = now(),
    edit_reason    = nullif(p_reason, '')
  where id = p_sale_id and rep_id = v_rep;

  insert into public.sale_items
    (sale_id, product_id, quantity, unit_price, list_price, buy_price_snapshot)
  select p_sale_id,
         (ln->>'product_id')::uuid,
         (ln->>'quantity')::integer,
         (ln->>'unit_price')::numeric,
         (ln->>'list_price')::numeric,
         (ln->>'buy_price')::numeric
  from jsonb_array_elements(v_lines) as ln;

  return p_sale_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_sale_edit_window()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  age_hours numeric;
begin
  -- Managers and super admins bypass the window
  if is_manager_or_above() then
    return new;
  end if;

  age_hours := extract(epoch from (now() - old.created_at)) / 3600.0;
  if age_hours > 48 then
    raise exception 'Sales can only be edited within 48 hours of creation. Contact your manager for changes to older sales.';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_customer_sales(p_customer_id uuid, p_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, customer_name text, total_cases integer, total_value numeric, status text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    s.id, s.customer_name, s.total_cases, s.total_value,
    s.status, s.created_at
  FROM sales s
  WHERE s.customer_id = p_customer_id
    AND s.tenant_id   = get_my_tenant_id()
  ORDER BY s.created_at DESC
  LIMIT p_limit;
$function$
;

CREATE OR REPLACE FUNCTION public.get_rep_debt_summary()
 RETURNS TABLE(rep_id uuid, full_name text, total_debt numeric, total_stock bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    p.id,
    p.full_name,
    COALESCE(SUM(h.debt_amount), 0),
    COALESCE(SUM(h.quantity), 0)
  FROM public.profiles p
  LEFT JOIN public.rep_holdings h ON h.rep_id = p.id
  WHERE p.tenant_id = get_my_tenant_id()
    AND p.role::text = 'rep'
    AND p.is_active = true
  GROUP BY p.id, p.full_name
  ORDER BY 3 DESC;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_signup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_business_name text;
  v_full_name     text;
  v_phone         text;
  v_tenant_id     uuid;
  v_biz_mode      text;
  v_req_role      text;
  v_role          public.user_role;
BEGIN
  v_business_name := COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'business_name'), ''), '');
  v_full_name     := COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''), split_part(NEW.email, '@', 1));
  v_phone         := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'phone', '')), '');
  v_biz_mode      := COALESCE(NEW.raw_user_meta_data->>'business_mode', 'owner_rep');
  IF v_biz_mode NOT IN ('solo','owner_rep','owner_manager_rep') THEN
    v_biz_mode := 'owner_rep';
  END IF;

  -- CASE 1: self-serve signup (has business_name) -> new tenant + OWNER (role forced server-side)
  IF v_business_name <> '' THEN
    INSERT INTO public.tenants (name, business_name, plan, status, business_mode, contact_email, contact_phone, trial_ends_at)
    VALUES (v_business_name, v_business_name, 'starter', 'trial', v_biz_mode, NEW.email, v_phone, now() + interval '14 days')
    RETURNING id INTO v_tenant_id;

    INSERT INTO public.profiles (id, tenant_id, full_name, phone, role, is_active)
    VALUES (NEW.id, v_tenant_id, v_full_name, v_phone, 'owner', true)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.expense_categories (tenant_id, name, is_active) VALUES
      (v_tenant_id, 'Fuel', true),
      (v_tenant_id, 'Vehicle Maintenance', true),
      (v_tenant_id, 'Office Supplies', true),
      (v_tenant_id, 'Salaries', true),
      (v_tenant_id, 'Rent', true),
      (v_tenant_id, 'Utilities', true),
      (v_tenant_id, 'Other', true)
    ON CONFLICT DO NOTHING;

  -- CASE 2: staff self-registration (tenant_id in metadata) -> clamp role to manager/rep only
  ELSE
    v_req_role := lower(NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'role', '')), ''));
    IF v_req_role NOT IN ('manager','rep') THEN
      v_req_role := 'rep';
    END IF;
    v_role := v_req_role::public.user_role;

    INSERT INTO public.profiles (id, tenant_id, full_name, phone, role, is_active)
    VALUES (
      NEW.id,
      NULLIF(NEW.raw_user_meta_data->>'tenant_id', '')::uuid,
      v_full_name,
      v_phone,
      v_role,
      true
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'handle_new_signup error for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.payments_block_unauth_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Already covered in part by protect_payment_status() from RLS file:
  -- only managers can change status. This is belt-and-suspenders.
  -- Plus: if a rep is updating, ensure pending_edit_* is what they're touching,
  -- not the underlying amount/receipt_url directly.
  if not is_manager_or_above() then
    if old.amount <> new.amount or old.receipt_url is distinct from new.receipt_url then
      raise exception 'To change a payment after submission, use the edit flow (which requires manager re-confirmation).';
    end if;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.protect_payment_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if old.status is distinct from new.status and not is_manager_or_above() then
    raise exception 'Only managers can confirm or reject payments';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- ✅ Allow system operations (SQL editor, migrations, seed scripts)
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- ❌ Block tenant changes for normal users (only on UPDATE, not INSERT)
  IF TG_OP = 'UPDATE' AND NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'Only super admins can change a user''s tenant';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.receive_inventory(p_invoice_number text, p_supplier_id uuid, p_invoice_url text, p_notes text, p_received_at timestamp with time zone, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor      uuid := auth.uid();
  v_tenant     uuid;
  v_receipt_id uuid := gen_random_uuid();
  v_item       record;
  v_total      numeric := 0;
  v_count      integer := 0;
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'error', 'Not authenticated');
  end if;

  v_tenant := get_my_tenant_id();
  if not (is_manager_or_above() and (v_tenant is not null or is_super_admin())) then
    return jsonb_build_object('ok', false, 'error', 'Not authorized');
  end if;

  if coalesce(trim(p_invoice_number), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Invoice number is required');
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    return jsonb_build_object('ok', false, 'error', 'No items to receive');
  end if;

  if p_supplier_id is not null then
    perform 1 from public.suppliers where id = p_supplier_id and tenant_id = v_tenant;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'Supplier not in this tenant');
    end if;
  end if;

  -- Double-submit guard: the same delivery received twice raises stock twice.
  perform 1 from public.inventory_receipts
   where tenant_id = v_tenant and lower(trim(invoice_number)) = lower(trim(p_invoice_number));
  if found then
    return jsonb_build_object('ok', false, 'error',
      format('Invoice %s has already been received', trim(p_invoice_number)));
  end if;

  -- Validate and total every line BEFORE writing, so a bad line cannot leave a
  -- half-written receipt.
  for v_item in
    select * from jsonb_to_recordset(p_items) as x(product_id uuid, quantity integer, unit_price numeric)
  loop
    if v_item.product_id is null or coalesce(v_item.quantity, 0) <= 0 then
      return jsonb_build_object('ok', false, 'error', 'Every line needs a product and a positive quantity');
    end if;
    if v_item.unit_price is null or v_item.unit_price < 0 then
      return jsonb_build_object('ok', false, 'error', 'Every line needs a unit price');
    end if;
    perform 1 from public.products where id = v_item.product_id and tenant_id = v_tenant;
    if not found then
      return jsonb_build_object('ok', false, 'error',
        format('Product %s is not in this tenant', v_item.product_id));
    end if;
    v_total := v_total + v_item.quantity * v_item.unit_price;
    v_count := v_count + 1;
  end loop;

  insert into public.inventory_receipts
    (id, tenant_id, supplier_id, invoice_number, invoice_url, total_value, notes, received_by, received_at)
  values
    (v_receipt_id, v_tenant, p_supplier_id, trim(p_invoice_number), nullif(p_invoice_url, ''),
     v_total, nullif(p_notes, ''), v_actor, coalesce(p_received_at, now()));

  insert into public.inventory_receipt_items (receipt_id, product_id, quantity, unit_price)
  select v_receipt_id,
         (it->>'product_id')::uuid,
         (it->>'quantity')::integer,
         (it->>'unit_price')::numeric
  from jsonb_array_elements(p_items) as it;

  -- Relative increase, aggregated so a product listed twice is handled once.
  update public.products p
     set warehouse_stock = p.warehouse_stock + agg.qty,
         updated_at      = now()
    from (select (it->>'product_id')::uuid as pid,
                 sum((it->>'quantity')::integer) as qty
            from jsonb_array_elements(p_items) as it
           group by 1) agg
   where p.id = agg.pid and p.tenant_id = v_tenant;

  insert into public.approval_history
    (tenant_id, actor_id, record_type, record_id, new_status, notes, action_type)
  values
    (v_tenant, v_actor, 'inventory_receipt', v_receipt_id, 'received',
     nullif(p_notes, ''), 'inventory_received');

  return jsonb_build_object('ok', true, 'receipt_id', v_receipt_id,
                            'total_value', v_total, 'lines', v_count);
exception when others then
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.record_payment(p_amount numeric, p_receipt_url text, p_attachment_urls jsonb, p_note text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rep     uuid := auth.uid();
  v_tenant  uuid;
  v_pay_id  uuid := gen_random_uuid();
begin
  if v_rep is null then raise exception 'not authenticated'; end if;

  select tenant_id into v_tenant
  from public.profiles
  where id = v_rep and is_active = true;
  if v_tenant is null then raise exception 'inactive or unknown rep'; end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'payment amount must be positive';
  end if;

  insert into public.payments
    (id, tenant_id, rep_id, amount, receipt_url, attachment_urls, status, notes)
  values
    (v_pay_id, v_tenant, v_rep, p_amount, p_receipt_url,
     case
       when p_attachment_urls is null or jsonb_typeof(p_attachment_urls) <> 'array' then null
       else array(select jsonb_array_elements_text(p_attachment_urls))
     end,
     'pending', nullif(p_note, ''));

  return v_pay_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.record_sale(p_customer_name text, p_customer_id uuid, p_items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rep        uuid := auth.uid();
  v_tenant     uuid;
  v_sale_id    uuid := gen_random_uuid();
  v_total_val  numeric := 0;
  v_total_qty  integer := 0;
  it           jsonb;
  v_pid        uuid;
  v_qty        integer;
  v_req_price  numeric;
  v_sell       numeric;
  v_buy        numeric;
  v_have       integer;
  v_lines      jsonb := '[]'::jsonb;
begin
  if v_rep is null then
    raise exception 'not authenticated';
  end if;

  select tenant_id into v_tenant
  from public.profiles
  where id = v_rep and is_active = true;
  if v_tenant is null then
    raise exception 'inactive or unknown rep';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'no line items';
  end if;

  for it in select * from jsonb_array_elements(p_items)
  loop
    v_pid       := (it->>'product_id')::uuid;
    v_qty       := (it->>'quantity')::integer;
    v_req_price := nullif(it->>'unit_price','')::numeric;

    if v_qty is null or v_qty <= 0 then
      raise exception 'invalid quantity for product %', v_pid;
    end if;

    select sell_price, buy_price into v_sell, v_buy
    from public.products
    where id = v_pid and tenant_id = v_tenant and is_active = true;
    if v_sell is null then
      raise exception 'unknown or inactive product %', v_pid;
    end if;

    v_req_price := coalesce(v_req_price, v_sell);
    if v_req_price < v_buy then
      raise exception 'price % below cost % for product %', v_req_price, v_buy, v_pid;
    end if;

    select quantity into v_have
    from public.rep_holdings
    where rep_id = v_rep and product_id = v_pid and tenant_id = v_tenant
    for update;
    if v_have is null or v_have < v_qty then
      raise exception 'insufficient holdings for product % (have %, need %)',
        v_pid, coalesce(v_have,0), v_qty;
    end if;

    update public.rep_holdings
    set quantity = quantity - v_qty
    where rep_id = v_rep and product_id = v_pid and tenant_id = v_tenant;

    v_lines := v_lines || jsonb_build_object(
      'product_id', v_pid, 'quantity', v_qty,
      'unit_price', v_req_price, 'list_price', v_sell, 'buy_price', v_buy);

    v_total_val := v_total_val + v_req_price * v_qty;
    v_total_qty := v_total_qty + v_qty;
  end loop;

  if v_total_qty <= 0 then
    raise exception 'sale must contain at least one unit';
  end if;

  insert into public.sales
    (id, tenant_id, rep_id, customer_name, customer_id, total_cases, total_value, status)
  values
    (v_sale_id, v_tenant, v_rep, p_customer_name, p_customer_id, v_total_qty, v_total_val, 'pending');

  insert into public.sale_items
    (sale_id, product_id, quantity, unit_price, list_price, buy_price_snapshot)
  select v_sale_id,
         (ln->>'product_id')::uuid,
         (ln->>'quantity')::integer,
         (ln->>'unit_price')::numeric,
         (ln->>'list_price')::numeric,
         (ln->>'buy_price')::numeric
  from jsonb_array_elements(v_lines) as ln;

  return v_sale_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reject_payment_atomic(p_payment_id uuid, p_rejecter_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pay   RECORD;
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_pay FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Payment not found');
  END IF;

  IF NOT (is_manager_or_above() AND (v_pay.tenant_id = get_my_tenant_id() OR is_super_admin())) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authorized');
  END IF;

  IF v_pay.status::text <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Payment already ' || v_pay.status::text);
  END IF;

  UPDATE public.payments
     SET status = 'rejected', rejected_by = v_actor, rejected_at = now(), notes = p_reason, updated_at = now()
   WHERE id = p_payment_id;

  INSERT INTO public.approval_history (tenant_id, actor_id, record_type, record_id, previous_status, new_status, notes)
  VALUES (v_pay.tenant_id, v_actor, 'payment', p_payment_id, 'pending', 'rejected', p_reason)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sale_items_track_override()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.list_price is not null then
    new.price_overridden := (new.unit_price <> new.list_price);
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_payment_status(p_payment_id uuid, p_status text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor     uuid := auth.uid();
  v_pay       record;
  v_new       text := lower(coalesce(p_status, ''));
  v_holding   record;
  v_remaining numeric;
  v_restored  numeric := 0;
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'error', 'Not authenticated');
  end if;

  if v_new not in ('pending', 'rejected', 'edit_pending') then
    return jsonb_build_object('ok', false, 'error',
      'Status must be pending, rejected or edit_pending (use confirm_payment_atomic to confirm)');
  end if;

  select * into v_pay from public.payments where id = p_payment_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Payment not found');
  end if;

  if not (is_manager_or_above() and (v_pay.tenant_id = get_my_tenant_id() or is_super_admin())) then
    return jsonb_build_object('ok', false, 'error', 'Not authorized');
  end if;

  if v_pay.status::text = v_new then
    return jsonb_build_object('ok', true, 'unchanged', true);
  end if;

  -- Leaving 'confirmed' must undo the debt reduction confirming applied.
  if v_pay.status::text = 'confirmed' then
    v_remaining := v_pay.amount;
    for v_holding in
      select id from public.rep_holdings
       where rep_id = v_pay.rep_id
       order by updated_at asc
       for update
    loop
      exit when v_remaining <= 0;
      update public.rep_holdings
         set debt_amount = debt_amount + v_remaining,
             updated_at  = now()
       where id = v_holding.id;
      v_restored  := v_remaining;
      v_remaining := 0;
    end loop;

    if v_remaining > 0 then
      return jsonb_build_object('ok', false, 'error',
        'Cannot un-confirm: this rep has no holdings to restore the debt to');
    end if;
  end if;

  update public.payments
     set status      = v_new::payment_status,
         rejected_by = case when v_new = 'rejected' then v_actor else rejected_by end,
         rejected_at = case when v_new = 'rejected' then now()   else rejected_at end,
         confirmed_by = case when v_pay.status::text = 'confirmed' then null else confirmed_by end,
         confirmed_at = case when v_pay.status::text = 'confirmed' then null else confirmed_at end,
         notes       = coalesce(nullif(p_note, ''), notes),
         updated_at  = now()
   where id = p_payment_id;

  insert into public.approval_history
    (tenant_id, actor_id, record_type, record_id, previous_status, new_status, notes)
  values
    (v_pay.tenant_id, v_actor, 'payment', p_payment_id,
     v_pay.status::text, v_new, nullif(p_note, ''));

  return jsonb_build_object('ok', true, 'previous_status', v_pay.status::text,
                            'status', v_new, 'debt_restored', v_restored);
exception when others then
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_last_paid_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.status = 'confirmed' and (old.status is null or old.status <> 'confirmed') then
    update profiles set last_paid_at = coalesce(new.confirmed_at, now())
    where id = new.rep_id and (last_paid_at is null or last_paid_at < coalesce(new.confirmed_at, now()));
  end if;
  return new;
end;
$function$
;

CREATE TRIGGER handle_new_signup AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_signup();

CREATE TRIGGER payments_no_direct_edit_trg BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION payments_block_unauth_status_change();

CREATE TRIGGER protect_payment_status_trg BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION protect_payment_status();

CREATE TRIGGER update_last_paid_at_trg AFTER INSERT OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION update_last_paid_at();

CREATE TRIGGER products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER protect_profile_sensitive_fields BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION protect_profile_sensitive_fields();

CREATE TRIGGER rep_applications_updated_at BEFORE UPDATE ON public.rep_applications FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER rep_holdings_updated_at BEFORE UPDATE ON public.rep_holdings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER sale_items_override_trg BEFORE INSERT OR UPDATE ON public.sale_items FOR EACH ROW EXECUTE FUNCTION sale_items_track_override();

CREATE TRIGGER sale_edit_window_trg BEFORE UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION enforce_sale_edit_window();

CREATE TRIGGER subscriptions_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER supplier_orders_updated_at BEFORE UPDATE ON public.supplier_orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER tenants_updated_at BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION set_updated_at();

alter table public."products" enable row level security;

alter table public."stock_request_items" enable row level security;

alter table public."payments" enable row level security;

alter table public."stock_requests" enable row level security;

alter table public."rep_applications" enable row level security;

alter table public."subscriptions" enable row level security;

alter table public."impersonation_log" enable row level security;

alter table public."supplier_transactions" enable row level security;

alter table public."rep_holdings" enable row level security;

alter table public."sales" enable row level security;

alter table public."expenses" enable row level security;

alter table public."sale_items" enable row level security;

alter table public."inventory_receipts" enable row level security;

alter table public."price_change_requests" enable row level security;

alter table public."product_returns" enable row level security;

alter table public."attachment_metadata" enable row level security;

alter table public."invoice_counters" enable row level security;

alter table public."profiles" enable row level security;

alter table public."approval_history" enable row level security;

alter table public."expense_categories" enable row level security;

alter table public."supplier_orders" enable row level security;

alter table public."suppliers" enable row level security;

alter table public."tenants" enable row level security;

alter table public."inventory_receipt_items" enable row level security;

alter table public."inventory_adjustments" enable row level security;

alter table public."supplier_order_items" enable row level security;

alter table public."customers" enable row level security;

alter table public."admin_notes" enable row level security;

alter table public."platform_config" enable row level security;

create policy "admin_notes_super_admin" on public."admin_notes" for ALL to "authenticated" using (is_super_admin()) with check (is_super_admin());

create policy "ah_delete" on public."approval_history" for DELETE to "authenticated" using ((get_my_role() = 'super_admin'::text));

create policy "ah_insert" on public."approval_history" for INSERT to "authenticated" with check (((actor_id = auth.uid()) AND ((tenant_id = get_my_tenant_id()) OR (get_my_role() = 'super_admin'::text))));

create policy "ah_select" on public."approval_history" for SELECT to "authenticated" using (((get_my_role() = 'super_admin'::text) OR (tenant_id = get_my_tenant_id())));

create policy "att_delete" on public."attachment_metadata" for DELETE to "public" using (((tenant_id = get_my_tenant_id()) AND ((uploaded_by = auth.uid()) OR (get_my_role() = ANY (ARRAY['manager'::text, 'owner'::text])))));

create policy "att_insert" on public."attachment_metadata" for INSERT to "public" with check ((tenant_id = get_my_tenant_id()));

create policy "att_select" on public."attachment_metadata" for SELECT to "public" using ((tenant_id = get_my_tenant_id()));

create policy "att_update" on public."attachment_metadata" for UPDATE to "public" using (((tenant_id = get_my_tenant_id()) AND ((uploaded_by = auth.uid()) OR (get_my_role() = ANY (ARRAY['manager'::text, 'owner'::text])))));

create policy "customers_delete" on public."customers" for DELETE to "public" using (((tenant_id = get_my_tenant_id()) AND (get_my_role() = ANY (ARRAY['owner'::text, 'manager'::text, 'super_admin'::text]))));

create policy "customers_insert_active" on public."customers" for INSERT to "public" with check (((tenant_id = get_my_tenant_id()) AND tenant_is_active(get_my_tenant_id())));

create policy "customers_select" on public."customers" for SELECT to "public" using ((tenant_id = get_my_tenant_id()));

create policy "customers_update" on public."customers" for UPDATE to "public" using ((tenant_id = get_my_tenant_id()));

create policy "exp_cat_select" on public."expense_categories" for SELECT to "public" using ((tenant_id = get_my_tenant_id()));

create policy "exp_cat_write" on public."expense_categories" for ALL to "public" using (((tenant_id = get_my_tenant_id()) AND (get_my_role() = ANY (ARRAY['manager'::text, 'owner'::text]))));

create policy "expenses_delete" on public."expenses" for DELETE to "authenticated" using (((get_my_role() = ANY (ARRAY['owner'::text, 'super_admin'::text])) AND ((tenant_id = get_my_tenant_id()) OR (get_my_role() = 'super_admin'::text))));

create policy "expenses_insert" on public."expenses" for INSERT to "authenticated" with check (((get_my_role() = ANY (ARRAY['manager'::text, 'owner'::text, 'super_admin'::text])) AND ((tenant_id = get_my_tenant_id()) OR (get_my_role() = 'super_admin'::text))));

create policy "expenses_select" on public."expenses" for SELECT to "authenticated" using (((get_my_role() = 'super_admin'::text) OR (tenant_id = get_my_tenant_id())));

create policy "expenses_update" on public."expenses" for UPDATE to "authenticated" using (((get_my_role() = ANY (ARRAY['owner'::text, 'super_admin'::text])) AND ((tenant_id = get_my_tenant_id()) OR (get_my_role() = 'super_admin'::text)))) with check ((get_my_role() = ANY (ARRAY['owner'::text, 'super_admin'::text])));

create policy "impersonation_insert" on public."impersonation_log" for INSERT to "public" with check ((super_admin_id = auth.uid()));

create policy "impersonation_select" on public."impersonation_log" for SELECT to "public" using ((super_admin_id = auth.uid()));

create policy "tenant_adjustments" on public."inventory_adjustments" for ALL to "public" using ((tenant_id = get_my_tenant_id()));

create policy "iri_delete" on public."inventory_receipt_items" for DELETE to "authenticated" using ((get_my_role() = ANY (ARRAY['owner'::text, 'super_admin'::text])));

create policy "iri_insert" on public."inventory_receipt_items" for INSERT to "authenticated" with check (((get_my_role() = ANY (ARRAY['manager'::text, 'owner'::text, 'super_admin'::text])) AND ((get_my_role() = 'super_admin'::text) OR (receipt_id IN ( SELECT inventory_receipts.id
   FROM inventory_receipts
  WHERE (inventory_receipts.tenant_id = get_my_tenant_id()))))));

create policy "iri_select" on public."inventory_receipt_items" for SELECT to "authenticated" using (((get_my_role() = 'super_admin'::text) OR (receipt_id IN ( SELECT inventory_receipts.id
   FROM inventory_receipts
  WHERE (inventory_receipts.tenant_id = get_my_tenant_id())))));

create policy "iri_update" on public."inventory_receipt_items" for UPDATE to "authenticated" using ((get_my_role() = ANY (ARRAY['manager'::text, 'owner'::text, 'super_admin'::text])));

create policy "inv_rcpt_delete" on public."inventory_receipts" for DELETE to "authenticated" using (((get_my_role() = ANY (ARRAY['owner'::text, 'super_admin'::text])) AND ((tenant_id = get_my_tenant_id()) OR (get_my_role() = 'super_admin'::text))));

create policy "inv_rcpt_insert" on public."inventory_receipts" for INSERT to "authenticated" with check (((get_my_role() = ANY (ARRAY['manager'::text, 'owner'::text, 'super_admin'::text])) AND ((tenant_id = get_my_tenant_id()) OR (get_my_role() = 'super_admin'::text))));

create policy "inv_rcpt_select" on public."inventory_receipts" for SELECT to "authenticated" using (((get_my_role() = 'super_admin'::text) OR (tenant_id = get_my_tenant_id())));

create policy "inv_rcpt_update" on public."inventory_receipts" for UPDATE to "authenticated" using (((get_my_role() = ANY (ARRAY['manager'::text, 'owner'::text, 'super_admin'::text])) AND ((tenant_id = get_my_tenant_id()) OR (get_my_role() = 'super_admin'::text)))) with check ((get_my_role() = ANY (ARRAY['manager'::text, 'owner'::text, 'super_admin'::text])));

create policy "inv_ctr_select" on public."invoice_counters" for SELECT to "authenticated" using (((get_my_role() = 'super_admin'::text) OR (tenant_id = get_my_tenant_id())));

create policy "inv_ctr_upsert" on public."invoice_counters" for ALL to "authenticated" using (((tenant_id = get_my_tenant_id()) OR (get_my_role() = 'super_admin'::text))) with check (((tenant_id = get_my_tenant_id()) OR (get_my_role() = 'super_admin'::text)));

create policy "payments_delete" on public."payments" for DELETE to "authenticated" using ((get_my_role() = 'super_admin'::text));

create policy "payments_insert" on public."payments" for INSERT to "authenticated" with check ((((rep_id = auth.uid()) AND (tenant_id = get_my_tenant_id())) OR (get_my_role() = ANY (ARRAY['manager'::text, 'owner'::text, 'super_admin'::text]))));

create policy "payments_select" on public."payments" for SELECT to "authenticated" using (((get_my_role() = 'super_admin'::text) OR (tenant_id = get_my_tenant_id())));

create policy "payments_update" on public."payments" for UPDATE to "authenticated" using ((((rep_id = auth.uid()) AND (status = 'pending'::payment_status) AND (tenant_id = get_my_tenant_id())) OR ((get_my_role() = ANY (ARRAY['manager'::text, 'owner'::text, 'super_admin'::text])) AND ((tenant_id = get_my_tenant_id()) OR (get_my_role() = 'super_admin'::text))))) with check ((((rep_id = auth.uid()) AND (tenant_id = get_my_tenant_id())) OR (get_my_role() = ANY (ARRAY['manager'::text, 'owner'::text, 'super_admin'::text]))));

create policy "platform_config_super_admin" on public."platform_config" for ALL to "authenticated" using (is_super_admin()) with check (is_super_admin());

create policy "pcr_delete" on public."price_change_requests" for DELETE to "authenticated" using (((get_my_role() = ANY (ARRAY['owner'::text, 'super_admin'::text])) AND ((tenant_id = get_my_tenant_id()) OR (get_my_role() = 'super_admin'::text))));

create policy "pcr_insert" on public."price_change_requests" for INSERT to "authenticated" with check (((tenant_id = get_my_tenant_id()) OR (get_my_role() = 'super_admin'::text)));

create policy "pcr_select" on public."price_change_requests" for SELECT to "authenticated" using (((get_my_role() = 'super_admin'::text) OR (tenant_id = get_my_tenant_id())));

create policy "pcr_update" on public."price_change_requests" for UPDATE to "authenticated" using (((get_my_role() = ANY (ARRAY['owner'::text, 'super_admin'::text])) AND ((tenant_id = get_my_tenant_id()) OR (get_my_role() = 'super_admin'::text)))) with check ((get_my_role() = ANY (ARRAY['owner'::text, 'super_admin'::text])));

create policy "prod_ret_delete" on public."product_returns" for DELETE to "authenticated" using (((get_my_role() = ANY (ARRAY['owner'::text, 'super_admin'::text])) AND ((tenant_id = get_my_tenant_id()) OR (get_my_role() = 'super_admin'::text))));

create policy "prod_ret_insert" on public."product_returns" for INSERT to "authenticated" with check ((((rep_id = auth.uid()) AND (tenant_id = get_my_tenant_id())) OR (get_my_role() = ANY (ARRAY['manager'::text, 'owner'::text, 'super_admin'::text]))));

create policy "prod_ret_select" on public."product_returns" for SELECT to "authenticated" using (((get_my_role() = 'super_admin'::text) OR (tenant_id = get_my_tenant_id())));

create policy "prod_ret_update" on public."product_returns" for UPDATE to "authenticated" using (((get_my_role() = ANY (ARRAY['manager'::text, 'owner'::text, 'super_admin'::text])) AND ((tenant_id = get_my_tenant_id()) OR (get_my_role() = 'super_admin'::text)))) with check ((get_my_role() = ANY (ARRAY['manager'::text, 'owner'::text, 'super_admin'::text])));

create policy "products_delete" on public."products" for DELETE to "authenticated" using (((get_my_role() = ANY (ARRAY['owner'::text, 'super_admin'::text])) AND ((tenant_id = get_my_tenant_id()) OR (get_my_role() = 'super_admin'::text))));

create policy "products_insert" on public."products" for INSERT to "authenticated" with check (((get_my_role() = ANY (ARRAY['manager'::text, 'owner'::text, 'super_admin'::text])) AND ((tenant_id = get_my_tenant_id()) OR (get_my_role() = 'super_admin'::text))));

create policy "products_select" on public."products" for SELECT to "authenticated" using (((get_my_role() = 'super_admin'::text) OR (tenant_id = get_my_tenant_id())));

create policy "products_update" on public."products" for UPDATE to "authenticated" using (((get_my_role() = ANY (ARRAY['manager'::text, 'owner'::text, 'super_admin'::text])) AND ((tenant_id = get_my_tenant_id()) OR (get_my_role() = 'super_admin'::text)))) with check ((get_my_role() = ANY (ARRAY['manager'::text, 'owner'::text, 'super_admin'::text])));

create policy "profiles_delete" on public."profiles" for DELETE to "authenticated" using ((get_my_role() = 'super_admin'::text));

create policy "profiles_insert" on public."profiles" for INSERT to "authenticated" with check (((get_my_role() = ANY (ARRAY['owner'::text, 'super_admin'::text])) OR (id = auth.uid())));

create policy "profiles_select" on public."profiles" for SELECT to "authenticated" using (((get_my_role() = 'super_admin'::text) OR (tenant_id = get_my_tenant_id())));

create policy "profiles_update" on public."profiles" for UPDATE to "authenticated" using (((id = auth.uid()) OR (get_my_role() = ANY (ARRAY['owner'::text, 'super_admin'::text])))) with check ((((id = auth.uid()) AND (role = ( SELECT profiles_1.role
   FROM profiles profiles_1
  WHERE (profiles_1.id = auth.uid())))) OR (get_my_role() = 'super_admin'::text) OR ((get_my_role() = 'owner'::text) AND (id <> auth.uid()))));

create policy "rep_apps_delete" on public."rep_applications" for DELETE to "authenticated" using (((get_my_role() = ANY (ARRAY['owner'::text, 'super_admin'::text])) AND ((tenant_id = get_my_tenant_id()) OR (get_my_role() = 'super_admin'::text))));

create policy "rep_apps_insert" on public."rep_applications" for INSERT to "authenticated" with check (((get_my_role() = ANY (ARRAY['manager'::text, 'owner'::text, 'super_admin'::text])) AND ((tenant_id = get_my_tenant_id()) OR (get_my_role() = 'super_admin'::text))));

create policy "rep_apps_select" on public."rep_applications" for SELECT to "authenticated" using (((get_my_role() = 'super_admin'::text) OR (tenant_id = get_my_tenant_id())));

create policy "rep_apps_update" on public."rep_applications" for UPDATE to "authenticated" using (((get_my_role() = ANY (ARRAY['owner'::text, 'super_admin'::text])) AND ((tenant_id = get_my_tenant_id()) OR (get_my_role() = 'super_admin'::text)))) with check ((get_my_role() = ANY (ARRAY['owner'::text, 'super_admin'::text])));

create policy "rep_holdings_delete" on public."rep_holdings" for DELETE to "authenticated" using (((get_my_role() = ANY (ARRAY['owner'::text, 'super_admin'::text])) AND ((tenant_id = get_my_tenant_id()) OR (get_my_role() = 'super_admin'::text))));

create policy "rep_holdings_insert" on public."rep_holdings" for INSERT to "authenticated" with check (((get_my_role() = ANY (ARRAY['manager'::text, 'owner'::text, 'super_admin'::text])) AND ((tenant_id = get_my_tenant_id()) OR (get_my_role() = 'super_admin'::text))));

create policy "rep_holdings_select" on public."rep_holdings" for SELECT to "authenticated" using (((get_my_role() = 'super_admin'::text) OR (tenant_id = get_my_tenant_id())));

create policy "rep_holdings_update" on public."rep_holdings" for UPDATE to "authenticated" using (((get_my_role() = ANY (ARRAY['manager'::text, 'owner'::text, 'super_admin'::text])) AND ((tenant_id = get_my_tenant_id()) OR (get_my_role() = 'super_admin'::text)))) with check ((get_my_role() = ANY (ARRAY['manager'::text, 'owner'::text, 'super_admin'::text])));

create policy "sale_items_delete" on public."sale_items" for DELETE to "authenticated" using ((get_my_role() = ANY (ARRAY['manager'::text, 'owner'::text, 'super_admin'::text])));

create policy "sale_items_insert" on public."sale_items" for INSERT to "authenticated" with check (((sale_id IN ( SELECT sales.id
   FROM sales
  WHERE (sales.tenant_id = get_my_tenant_id()))) OR (get_my_role() = 'super_admin'::text)));

create policy "sale_items_select" on public."sale_items" for SELECT to "authenticated" using (((get_my_role() = 'super_admin'::text) OR (sale_id IN ( SELECT sales.id
   FROM sales
  WHERE (sales.tenant_id = get_my_tenant_id())))));

create policy "sale_items_update" on public."sale_items" for UPDATE to "authenticated" using ((get_my_role() = ANY (ARRAY['manager'::text, 'owner'::text, 'super_admin'::text])));

create policy "sales_delete" on public."sales" for DELETE to "authenticated" using (((get_my_role() = ANY (ARRAY['manager'::text, 'owner'::text, 'super_admin'::text])) AND ((tenant_id = get_my_tenant_id()) OR (get_my_role() = 'super_admin'::text))));

create policy "sales_insert" on public."sales" for INSERT to "authenticated" with check (((tenant_id = get_my_tenant_id()) OR (get_my_role() = 'super_admin'::text)));

create policy "sales_select" on public."sales" for SELECT to "authenticated" using (((get_my_role() = 'super_admin'::text) OR (tenant_id = get_my_tenant_id())));

create policy "sales_update" on public."sales" for UPDATE to "authenticated" using (((get_my_role() = ANY (ARRAY['manager'::text, 'owner'::text, 'super_admin'::text])) AND ((tenant_id = get_my_tenant_id()) OR (get_my_role() = 'super_admin'::text)))) with check ((get_my_role() = ANY (ARRAY['manager'::text, 'owner'::text, 'super_admin'::text])));

create policy "sri_delete" on public."stock_request_items" for DELETE to "authenticated" using (((get_my_role() = ANY (ARRAY['manager'::text, 'owner'::text, 'super_admin'::text])) OR (request_id IN ( SELECT stock_requests.id
   FROM stock_requests
  WHERE ((stock_requests.rep_id = auth.uid()) AND (stock_requests.status = ANY (ARRAY['pending'::approval_status, 'cancelled'::approval_status])))))));

create policy "sri_insert" on public."stock_request_items" for INSERT to "authenticated" with check (((get_my_role() = 'super_admin'::text) OR (request_id IN ( SELECT stock_requests.id
   FROM stock_requests
  WHERE (stock_requests.tenant_id = get_my_tenant_id())))));

create policy "sri_select" on public."stock_request_items" for SELECT to "authenticated" using (((get_my_role() = 'super_admin'::text) OR (request_id IN ( SELECT stock_requests.id
   FROM stock_requests
  WHERE (stock_requests.tenant_id = get_my_tenant_id())))));

create policy "sri_update" on public."stock_request_items" for UPDATE to "authenticated" using ((get_my_role() = ANY (ARRAY['manager'::text, 'owner'::text, 'super_admin'::text])));

create policy "stock_requests_delete" on public."stock_requests" for DELETE to "authenticated" using ((((rep_id = auth.uid()) AND (status = ANY (ARRAY['pending'::approval_status, 'cancelled'::approval_status])) AND (tenant_id = get_my_tenant_id())) OR (get_my_role() = ANY (ARRAY['manager'::text, 'owner'::text, 'super_admin'::text]))));

create policy "stock_requests_insert" on public."stock_requests" for INSERT to "authenticated" with check ((((rep_id = auth.uid()) AND (tenant_id = get_my_tenant_id())) OR (get_my_role() = ANY (ARRAY['manager'::text, 'owner'::text, 'super_admin'::text]))));

create policy "stock_requests_select" on public."stock_requests" for SELECT to "authenticated" using (((get_my_role() = 'super_admin'::text) OR (tenant_id = get_my_tenant_id())));

create policy "stock_requests_update" on public."stock_requests" for UPDATE to "authenticated" using ((((rep_id = auth.uid()) AND (tenant_id = get_my_tenant_id()) AND (status = ANY (ARRAY['pending'::approval_status, 'cancelled'::approval_status]))) OR ((get_my_role() = ANY (ARRAY['manager'::text, 'owner'::text, 'super_admin'::text])) AND ((tenant_id = get_my_tenant_id()) OR (get_my_role() = 'super_admin'::text))))) with check ((((rep_id = auth.uid()) AND (tenant_id = get_my_tenant_id()) AND (status = ANY (ARRAY['pending'::approval_status, 'cancelled'::approval_status]))) OR (get_my_role() = ANY (ARRAY['manager'::text, 'owner'::text, 'super_admin'::text]))));

create policy "subscriptions_select" on public."subscriptions" for SELECT to "public" using ((tenant_id = get_my_tenant_id()));

create policy "subscriptions_write" on public."subscriptions" for ALL to "public" using (((tenant_id = get_my_tenant_id()) AND (get_my_role() = 'owner'::text)));

create policy "soi_insert" on public."supplier_order_items" for INSERT to "public" with check (((COALESCE(supplier_order_id, order_id) IN ( SELECT supplier_orders.id
   FROM supplier_orders
  WHERE (supplier_orders.tenant_id = get_my_tenant_id()))) AND (get_my_role() = ANY (ARRAY['owner'::text, 'manager'::text, 'super_admin'::text]))));

create policy "soi_select" on public."supplier_order_items" for SELECT to "public" using ((COALESCE(supplier_order_id, order_id) IN ( SELECT supplier_orders.id
   FROM supplier_orders
  WHERE (supplier_orders.tenant_id = get_my_tenant_id()))));

create policy "sup_ord_items_all" on public."supplier_order_items" for ALL to "public" using ((EXISTS ( SELECT 1
   FROM supplier_orders o
  WHERE ((o.id = supplier_order_items.order_id) AND (o.tenant_id = get_my_tenant_id())))));

create policy "supp_orders_delete" on public."supplier_orders" for DELETE to "authenticated" using (((get_my_role() = ANY (ARRAY['owner'::text, 'super_admin'::text])) AND ((tenant_id = get_my_tenant_id()) OR (get_my_role() = 'super_admin'::text))));

create policy "supp_orders_insert" on public."supplier_orders" for INSERT to "authenticated" with check (((get_my_role() = ANY (ARRAY['manager'::text, 'owner'::text, 'super_admin'::text])) AND ((tenant_id = get_my_tenant_id()) OR (get_my_role() = 'super_admin'::text))));

create policy "supp_orders_select" on public."supplier_orders" for SELECT to "authenticated" using (((get_my_role() = 'super_admin'::text) OR (tenant_id = get_my_tenant_id())));

create policy "supp_orders_update" on public."supplier_orders" for UPDATE to "authenticated" using (((get_my_role() = ANY (ARRAY['manager'::text, 'owner'::text, 'super_admin'::text])) AND ((tenant_id = get_my_tenant_id()) OR (get_my_role() = 'super_admin'::text)))) with check ((get_my_role() = ANY (ARRAY['manager'::text, 'owner'::text, 'super_admin'::text])));

create policy "sup_tx_insert" on public."supplier_transactions" for INSERT to "public" with check (((tenant_id = get_my_tenant_id()) AND (logged_by = auth.uid())));

create policy "sup_tx_select" on public."supplier_transactions" for SELECT to "public" using ((tenant_id = get_my_tenant_id()));

create policy "sup_tx_write" on public."supplier_transactions" for ALL to "public" using (((tenant_id = get_my_tenant_id()) AND (get_my_role() = ANY (ARRAY['manager'::text, 'owner'::text]))));

create policy "suppliers_delete" on public."suppliers" for DELETE to "authenticated" using (((get_my_role() = ANY (ARRAY['owner'::text, 'super_admin'::text])) AND ((tenant_id = get_my_tenant_id()) OR (get_my_role() = 'super_admin'::text))));

create policy "suppliers_insert" on public."suppliers" for INSERT to "authenticated" with check (((get_my_role() = ANY (ARRAY['manager'::text, 'owner'::text, 'super_admin'::text])) AND ((tenant_id = get_my_tenant_id()) OR (get_my_role() = 'super_admin'::text))));

create policy "suppliers_select" on public."suppliers" for SELECT to "authenticated" using (((get_my_role() = 'super_admin'::text) OR (tenant_id = get_my_tenant_id())));

create policy "suppliers_update" on public."suppliers" for UPDATE to "authenticated" using (((get_my_role() = ANY (ARRAY['manager'::text, 'owner'::text, 'super_admin'::text])) AND ((tenant_id = get_my_tenant_id()) OR (get_my_role() = 'super_admin'::text)))) with check ((get_my_role() = ANY (ARRAY['manager'::text, 'owner'::text, 'super_admin'::text])));

create policy "tenants_delete" on public."tenants" for DELETE to "authenticated" using ((get_my_role() = 'super_admin'::text));

create policy "tenants_insert" on public."tenants" for INSERT to "authenticated" with check ((get_my_role() = 'super_admin'::text));

create policy "tenants_select" on public."tenants" for SELECT to "authenticated" using (((get_my_role() = 'super_admin'::text) OR (id = get_my_tenant_id())));

create policy "tenants_update" on public."tenants" for UPDATE to "authenticated" using (((get_my_role() = ANY (ARRAY['owner'::text, 'super_admin'::text])) AND ((id = get_my_tenant_id()) OR (get_my_role() = 'super_admin'::text)))) with check ((get_my_role() = ANY (ARRAY['owner'::text, 'super_admin'::text])));

grant DELETE on public."admin_notes" to "anon";

grant INSERT on public."admin_notes" to "anon";

grant REFERENCES on public."admin_notes" to "anon";

grant SELECT on public."admin_notes" to "anon";

grant TRIGGER on public."admin_notes" to "anon";

grant TRUNCATE on public."admin_notes" to "anon";

grant UPDATE on public."admin_notes" to "anon";

grant DELETE on public."admin_notes" to "authenticated";

grant INSERT on public."admin_notes" to "authenticated";

grant REFERENCES on public."admin_notes" to "authenticated";

grant SELECT on public."admin_notes" to "authenticated";

grant TRIGGER on public."admin_notes" to "authenticated";

grant TRUNCATE on public."admin_notes" to "authenticated";

grant UPDATE on public."admin_notes" to "authenticated";

grant DELETE on public."approval_history" to "anon";

grant INSERT on public."approval_history" to "anon";

grant REFERENCES on public."approval_history" to "anon";

grant SELECT on public."approval_history" to "anon";

grant TRIGGER on public."approval_history" to "anon";

grant TRUNCATE on public."approval_history" to "anon";

grant UPDATE on public."approval_history" to "anon";

grant DELETE on public."approval_history" to "authenticated";

grant INSERT on public."approval_history" to "authenticated";

grant REFERENCES on public."approval_history" to "authenticated";

grant SELECT on public."approval_history" to "authenticated";

grant TRIGGER on public."approval_history" to "authenticated";

grant TRUNCATE on public."approval_history" to "authenticated";

grant UPDATE on public."approval_history" to "authenticated";

grant DELETE on public."attachment_metadata" to "anon";

grant INSERT on public."attachment_metadata" to "anon";

grant REFERENCES on public."attachment_metadata" to "anon";

grant SELECT on public."attachment_metadata" to "anon";

grant TRIGGER on public."attachment_metadata" to "anon";

grant TRUNCATE on public."attachment_metadata" to "anon";

grant UPDATE on public."attachment_metadata" to "anon";

grant DELETE on public."attachment_metadata" to "authenticated";

grant INSERT on public."attachment_metadata" to "authenticated";

grant REFERENCES on public."attachment_metadata" to "authenticated";

grant SELECT on public."attachment_metadata" to "authenticated";

grant TRIGGER on public."attachment_metadata" to "authenticated";

grant TRUNCATE on public."attachment_metadata" to "authenticated";

grant UPDATE on public."attachment_metadata" to "authenticated";

grant DELETE on public."customer_credit_balances" to "authenticated";

grant INSERT on public."customer_credit_balances" to "authenticated";

grant REFERENCES on public."customer_credit_balances" to "authenticated";

grant SELECT on public."customer_credit_balances" to "authenticated";

grant TRIGGER on public."customer_credit_balances" to "authenticated";

grant TRUNCATE on public."customer_credit_balances" to "authenticated";

grant UPDATE on public."customer_credit_balances" to "authenticated";

grant DELETE on public."customers" to "anon";

grant INSERT on public."customers" to "anon";

grant REFERENCES on public."customers" to "anon";

grant SELECT on public."customers" to "anon";

grant TRIGGER on public."customers" to "anon";

grant TRUNCATE on public."customers" to "anon";

grant UPDATE on public."customers" to "anon";

grant DELETE on public."customers" to "authenticated";

grant INSERT on public."customers" to "authenticated";

grant REFERENCES on public."customers" to "authenticated";

grant SELECT on public."customers" to "authenticated";

grant TRIGGER on public."customers" to "authenticated";

grant TRUNCATE on public."customers" to "authenticated";

grant UPDATE on public."customers" to "authenticated";

grant DELETE on public."expense_categories" to "anon";

grant INSERT on public."expense_categories" to "anon";

grant REFERENCES on public."expense_categories" to "anon";

grant SELECT on public."expense_categories" to "anon";

grant TRIGGER on public."expense_categories" to "anon";

grant TRUNCATE on public."expense_categories" to "anon";

grant UPDATE on public."expense_categories" to "anon";

grant DELETE on public."expense_categories" to "authenticated";

grant INSERT on public."expense_categories" to "authenticated";

grant REFERENCES on public."expense_categories" to "authenticated";

grant SELECT on public."expense_categories" to "authenticated";

grant TRIGGER on public."expense_categories" to "authenticated";

grant TRUNCATE on public."expense_categories" to "authenticated";

grant UPDATE on public."expense_categories" to "authenticated";

grant DELETE on public."expenses" to "anon";

grant INSERT on public."expenses" to "anon";

grant REFERENCES on public."expenses" to "anon";

grant SELECT on public."expenses" to "anon";

grant TRIGGER on public."expenses" to "anon";

grant TRUNCATE on public."expenses" to "anon";

grant UPDATE on public."expenses" to "anon";

grant DELETE on public."expenses" to "authenticated";

grant INSERT on public."expenses" to "authenticated";

grant REFERENCES on public."expenses" to "authenticated";

grant SELECT on public."expenses" to "authenticated";

grant TRIGGER on public."expenses" to "authenticated";

grant TRUNCATE on public."expenses" to "authenticated";

grant UPDATE on public."expenses" to "authenticated";

grant DELETE on public."impersonation_log" to "anon";

grant INSERT on public."impersonation_log" to "anon";

grant REFERENCES on public."impersonation_log" to "anon";

grant SELECT on public."impersonation_log" to "anon";

grant TRIGGER on public."impersonation_log" to "anon";

grant TRUNCATE on public."impersonation_log" to "anon";

grant UPDATE on public."impersonation_log" to "anon";

grant DELETE on public."impersonation_log" to "authenticated";

grant INSERT on public."impersonation_log" to "authenticated";

grant REFERENCES on public."impersonation_log" to "authenticated";

grant SELECT on public."impersonation_log" to "authenticated";

grant TRIGGER on public."impersonation_log" to "authenticated";

grant TRUNCATE on public."impersonation_log" to "authenticated";

grant UPDATE on public."impersonation_log" to "authenticated";

grant DELETE on public."inventory_adjustments" to "anon";

grant INSERT on public."inventory_adjustments" to "anon";

grant REFERENCES on public."inventory_adjustments" to "anon";

grant SELECT on public."inventory_adjustments" to "anon";

grant TRIGGER on public."inventory_adjustments" to "anon";

grant TRUNCATE on public."inventory_adjustments" to "anon";

grant UPDATE on public."inventory_adjustments" to "anon";

grant DELETE on public."inventory_adjustments" to "authenticated";

grant INSERT on public."inventory_adjustments" to "authenticated";

grant REFERENCES on public."inventory_adjustments" to "authenticated";

grant SELECT on public."inventory_adjustments" to "authenticated";

grant TRIGGER on public."inventory_adjustments" to "authenticated";

grant TRUNCATE on public."inventory_adjustments" to "authenticated";

grant UPDATE on public."inventory_adjustments" to "authenticated";

grant DELETE on public."inventory_receipt_items" to "anon";

grant INSERT on public."inventory_receipt_items" to "anon";

grant REFERENCES on public."inventory_receipt_items" to "anon";

grant SELECT on public."inventory_receipt_items" to "anon";

grant TRIGGER on public."inventory_receipt_items" to "anon";

grant TRUNCATE on public."inventory_receipt_items" to "anon";

grant UPDATE on public."inventory_receipt_items" to "anon";

grant DELETE on public."inventory_receipt_items" to "authenticated";

grant INSERT on public."inventory_receipt_items" to "authenticated";

grant REFERENCES on public."inventory_receipt_items" to "authenticated";

grant SELECT on public."inventory_receipt_items" to "authenticated";

grant TRIGGER on public."inventory_receipt_items" to "authenticated";

grant TRUNCATE on public."inventory_receipt_items" to "authenticated";

grant UPDATE on public."inventory_receipt_items" to "authenticated";

grant DELETE on public."inventory_receipts" to "anon";

grant INSERT on public."inventory_receipts" to "anon";

grant REFERENCES on public."inventory_receipts" to "anon";

grant SELECT on public."inventory_receipts" to "anon";

grant TRIGGER on public."inventory_receipts" to "anon";

grant TRUNCATE on public."inventory_receipts" to "anon";

grant UPDATE on public."inventory_receipts" to "anon";

grant DELETE on public."inventory_receipts" to "authenticated";

grant INSERT on public."inventory_receipts" to "authenticated";

grant REFERENCES on public."inventory_receipts" to "authenticated";

grant SELECT on public."inventory_receipts" to "authenticated";

grant TRIGGER on public."inventory_receipts" to "authenticated";

grant TRUNCATE on public."inventory_receipts" to "authenticated";

grant UPDATE on public."inventory_receipts" to "authenticated";

grant DELETE on public."invoice_counters" to "anon";

grant INSERT on public."invoice_counters" to "anon";

grant REFERENCES on public."invoice_counters" to "anon";

grant SELECT on public."invoice_counters" to "anon";

grant TRIGGER on public."invoice_counters" to "anon";

grant TRUNCATE on public."invoice_counters" to "anon";

grant UPDATE on public."invoice_counters" to "anon";

grant DELETE on public."invoice_counters" to "authenticated";

grant INSERT on public."invoice_counters" to "authenticated";

grant REFERENCES on public."invoice_counters" to "authenticated";

grant SELECT on public."invoice_counters" to "authenticated";

grant TRIGGER on public."invoice_counters" to "authenticated";

grant TRUNCATE on public."invoice_counters" to "authenticated";

grant UPDATE on public."invoice_counters" to "authenticated";

grant DELETE on public."payments" to "anon";

grant INSERT on public."payments" to "anon";

grant REFERENCES on public."payments" to "anon";

grant SELECT on public."payments" to "anon";

grant TRIGGER on public."payments" to "anon";

grant TRUNCATE on public."payments" to "anon";

grant UPDATE on public."payments" to "anon";

grant DELETE on public."payments" to "authenticated";

grant INSERT on public."payments" to "authenticated";

grant REFERENCES on public."payments" to "authenticated";

grant SELECT on public."payments" to "authenticated";

grant TRIGGER on public."payments" to "authenticated";

grant TRUNCATE on public."payments" to "authenticated";

grant UPDATE on public."payments" to "authenticated";

grant DELETE on public."platform_config" to "anon";

grant INSERT on public."platform_config" to "anon";

grant REFERENCES on public."platform_config" to "anon";

grant SELECT on public."platform_config" to "anon";

grant TRIGGER on public."platform_config" to "anon";

grant TRUNCATE on public."platform_config" to "anon";

grant UPDATE on public."platform_config" to "anon";

grant DELETE on public."platform_config" to "authenticated";

grant INSERT on public."platform_config" to "authenticated";

grant REFERENCES on public."platform_config" to "authenticated";

grant SELECT on public."platform_config" to "authenticated";

grant TRIGGER on public."platform_config" to "authenticated";

grant TRUNCATE on public."platform_config" to "authenticated";

grant UPDATE on public."platform_config" to "authenticated";

grant DELETE on public."price_change_requests" to "anon";

grant INSERT on public."price_change_requests" to "anon";

grant REFERENCES on public."price_change_requests" to "anon";

grant SELECT on public."price_change_requests" to "anon";

grant TRIGGER on public."price_change_requests" to "anon";

grant TRUNCATE on public."price_change_requests" to "anon";

grant UPDATE on public."price_change_requests" to "anon";

grant DELETE on public."price_change_requests" to "authenticated";

grant INSERT on public."price_change_requests" to "authenticated";

grant REFERENCES on public."price_change_requests" to "authenticated";

grant SELECT on public."price_change_requests" to "authenticated";

grant TRIGGER on public."price_change_requests" to "authenticated";

grant TRUNCATE on public."price_change_requests" to "authenticated";

grant UPDATE on public."price_change_requests" to "authenticated";

grant DELETE on public."product_returns" to "anon";

grant INSERT on public."product_returns" to "anon";

grant REFERENCES on public."product_returns" to "anon";

grant SELECT on public."product_returns" to "anon";

grant TRIGGER on public."product_returns" to "anon";

grant TRUNCATE on public."product_returns" to "anon";

grant UPDATE on public."product_returns" to "anon";

grant DELETE on public."product_returns" to "authenticated";

grant INSERT on public."product_returns" to "authenticated";

grant REFERENCES on public."product_returns" to "authenticated";

grant SELECT on public."product_returns" to "authenticated";

grant TRIGGER on public."product_returns" to "authenticated";

grant TRUNCATE on public."product_returns" to "authenticated";

grant UPDATE on public."product_returns" to "authenticated";

grant DELETE on public."products" to "anon";

grant INSERT on public."products" to "anon";

grant REFERENCES on public."products" to "anon";

grant SELECT on public."products" to "anon";

grant TRIGGER on public."products" to "anon";

grant TRUNCATE on public."products" to "anon";

grant UPDATE on public."products" to "anon";

grant DELETE on public."products" to "authenticated";

grant INSERT on public."products" to "authenticated";

grant REFERENCES on public."products" to "authenticated";

grant SELECT on public."products" to "authenticated";

grant TRIGGER on public."products" to "authenticated";

grant TRUNCATE on public."products" to "authenticated";

grant UPDATE on public."products" to "authenticated";

grant DELETE on public."profiles" to "anon";

grant INSERT on public."profiles" to "anon";

grant REFERENCES on public."profiles" to "anon";

grant SELECT on public."profiles" to "anon";

grant TRIGGER on public."profiles" to "anon";

grant TRUNCATE on public."profiles" to "anon";

grant UPDATE on public."profiles" to "anon";

grant DELETE on public."profiles" to "authenticated";

grant INSERT on public."profiles" to "authenticated";

grant REFERENCES on public."profiles" to "authenticated";

grant SELECT on public."profiles" to "authenticated";

grant TRIGGER on public."profiles" to "authenticated";

grant TRUNCATE on public."profiles" to "authenticated";

grant UPDATE on public."profiles" to "authenticated";

grant DELETE on public."rep_applications" to "anon";

grant INSERT on public."rep_applications" to "anon";

grant REFERENCES on public."rep_applications" to "anon";

grant SELECT on public."rep_applications" to "anon";

grant TRIGGER on public."rep_applications" to "anon";

grant TRUNCATE on public."rep_applications" to "anon";

grant UPDATE on public."rep_applications" to "anon";

grant DELETE on public."rep_applications" to "authenticated";

grant INSERT on public."rep_applications" to "authenticated";

grant REFERENCES on public."rep_applications" to "authenticated";

grant SELECT on public."rep_applications" to "authenticated";

grant TRIGGER on public."rep_applications" to "authenticated";

grant TRUNCATE on public."rep_applications" to "authenticated";

grant UPDATE on public."rep_applications" to "authenticated";

grant DELETE on public."rep_holdings" to "anon";

grant INSERT on public."rep_holdings" to "anon";

grant REFERENCES on public."rep_holdings" to "anon";

grant SELECT on public."rep_holdings" to "anon";

grant TRIGGER on public."rep_holdings" to "anon";

grant TRUNCATE on public."rep_holdings" to "anon";

grant UPDATE on public."rep_holdings" to "anon";

grant DELETE on public."rep_holdings" to "authenticated";

grant INSERT on public."rep_holdings" to "authenticated";

grant REFERENCES on public."rep_holdings" to "authenticated";

grant SELECT on public."rep_holdings" to "authenticated";

grant TRIGGER on public."rep_holdings" to "authenticated";

grant TRUNCATE on public."rep_holdings" to "authenticated";

grant UPDATE on public."rep_holdings" to "authenticated";

grant DELETE on public."rep_price_changes" to "authenticated";

grant INSERT on public."rep_price_changes" to "authenticated";

grant REFERENCES on public."rep_price_changes" to "authenticated";

grant SELECT on public."rep_price_changes" to "authenticated";

grant TRIGGER on public."rep_price_changes" to "authenticated";

grant TRUNCATE on public."rep_price_changes" to "authenticated";

grant UPDATE on public."rep_price_changes" to "authenticated";

grant DELETE on public."sale_items" to "anon";

grant INSERT on public."sale_items" to "anon";

grant REFERENCES on public."sale_items" to "anon";

grant SELECT on public."sale_items" to "anon";

grant TRIGGER on public."sale_items" to "anon";

grant TRUNCATE on public."sale_items" to "anon";

grant UPDATE on public."sale_items" to "anon";

grant DELETE on public."sale_items" to "authenticated";

grant INSERT on public."sale_items" to "authenticated";

grant REFERENCES on public."sale_items" to "authenticated";

grant SELECT on public."sale_items" to "authenticated";

grant TRIGGER on public."sale_items" to "authenticated";

grant TRUNCATE on public."sale_items" to "authenticated";

grant UPDATE on public."sale_items" to "authenticated";

grant DELETE on public."sales" to "anon";

grant INSERT on public."sales" to "anon";

grant REFERENCES on public."sales" to "anon";

grant SELECT on public."sales" to "anon";

grant TRIGGER on public."sales" to "anon";

grant TRUNCATE on public."sales" to "anon";

grant UPDATE on public."sales" to "anon";

grant DELETE on public."sales" to "authenticated";

grant INSERT on public."sales" to "authenticated";

grant REFERENCES on public."sales" to "authenticated";

grant SELECT on public."sales" to "authenticated";

grant TRIGGER on public."sales" to "authenticated";

grant TRUNCATE on public."sales" to "authenticated";

grant UPDATE on public."sales" to "authenticated";

grant DELETE on public."stock_request_items" to "anon";

grant INSERT on public."stock_request_items" to "anon";

grant REFERENCES on public."stock_request_items" to "anon";

grant SELECT on public."stock_request_items" to "anon";

grant TRIGGER on public."stock_request_items" to "anon";

grant TRUNCATE on public."stock_request_items" to "anon";

grant UPDATE on public."stock_request_items" to "anon";

grant DELETE on public."stock_request_items" to "authenticated";

grant INSERT on public."stock_request_items" to "authenticated";

grant REFERENCES on public."stock_request_items" to "authenticated";

grant SELECT on public."stock_request_items" to "authenticated";

grant TRIGGER on public."stock_request_items" to "authenticated";

grant TRUNCATE on public."stock_request_items" to "authenticated";

grant UPDATE on public."stock_request_items" to "authenticated";

grant DELETE on public."stock_requests" to "anon";

grant INSERT on public."stock_requests" to "anon";

grant REFERENCES on public."stock_requests" to "anon";

grant SELECT on public."stock_requests" to "anon";

grant TRIGGER on public."stock_requests" to "anon";

grant TRUNCATE on public."stock_requests" to "anon";

grant UPDATE on public."stock_requests" to "anon";

grant DELETE on public."stock_requests" to "authenticated";

grant INSERT on public."stock_requests" to "authenticated";

grant REFERENCES on public."stock_requests" to "authenticated";

grant SELECT on public."stock_requests" to "authenticated";

grant TRIGGER on public."stock_requests" to "authenticated";

grant TRUNCATE on public."stock_requests" to "authenticated";

grant UPDATE on public."stock_requests" to "authenticated";

grant DELETE on public."subscriptions" to "anon";

grant INSERT on public."subscriptions" to "anon";

grant REFERENCES on public."subscriptions" to "anon";

grant SELECT on public."subscriptions" to "anon";

grant TRIGGER on public."subscriptions" to "anon";

grant TRUNCATE on public."subscriptions" to "anon";

grant UPDATE on public."subscriptions" to "anon";

grant DELETE on public."subscriptions" to "authenticated";

grant INSERT on public."subscriptions" to "authenticated";

grant REFERENCES on public."subscriptions" to "authenticated";

grant SELECT on public."subscriptions" to "authenticated";

grant TRIGGER on public."subscriptions" to "authenticated";

grant TRUNCATE on public."subscriptions" to "authenticated";

grant UPDATE on public."subscriptions" to "authenticated";

grant DELETE on public."supplier_order_items" to "anon";

grant INSERT on public."supplier_order_items" to "anon";

grant REFERENCES on public."supplier_order_items" to "anon";

grant SELECT on public."supplier_order_items" to "anon";

grant TRIGGER on public."supplier_order_items" to "anon";

grant TRUNCATE on public."supplier_order_items" to "anon";

grant UPDATE on public."supplier_order_items" to "anon";

grant DELETE on public."supplier_order_items" to "authenticated";

grant INSERT on public."supplier_order_items" to "authenticated";

grant REFERENCES on public."supplier_order_items" to "authenticated";

grant SELECT on public."supplier_order_items" to "authenticated";

grant TRIGGER on public."supplier_order_items" to "authenticated";

grant TRUNCATE on public."supplier_order_items" to "authenticated";

grant UPDATE on public."supplier_order_items" to "authenticated";

grant DELETE on public."supplier_orders" to "anon";

grant INSERT on public."supplier_orders" to "anon";

grant REFERENCES on public."supplier_orders" to "anon";

grant SELECT on public."supplier_orders" to "anon";

grant TRIGGER on public."supplier_orders" to "anon";

grant TRUNCATE on public."supplier_orders" to "anon";

grant UPDATE on public."supplier_orders" to "anon";

grant DELETE on public."supplier_orders" to "authenticated";

grant INSERT on public."supplier_orders" to "authenticated";

grant REFERENCES on public."supplier_orders" to "authenticated";

grant SELECT on public."supplier_orders" to "authenticated";

grant TRIGGER on public."supplier_orders" to "authenticated";

grant TRUNCATE on public."supplier_orders" to "authenticated";

grant UPDATE on public."supplier_orders" to "authenticated";

grant DELETE on public."supplier_transactions" to "anon";

grant INSERT on public."supplier_transactions" to "anon";

grant REFERENCES on public."supplier_transactions" to "anon";

grant SELECT on public."supplier_transactions" to "anon";

grant TRIGGER on public."supplier_transactions" to "anon";

grant TRUNCATE on public."supplier_transactions" to "anon";

grant UPDATE on public."supplier_transactions" to "anon";

grant DELETE on public."supplier_transactions" to "authenticated";

grant INSERT on public."supplier_transactions" to "authenticated";

grant REFERENCES on public."supplier_transactions" to "authenticated";

grant SELECT on public."supplier_transactions" to "authenticated";

grant TRIGGER on public."supplier_transactions" to "authenticated";

grant TRUNCATE on public."supplier_transactions" to "authenticated";

grant UPDATE on public."supplier_transactions" to "authenticated";

grant DELETE on public."suppliers" to "anon";

grant INSERT on public."suppliers" to "anon";

grant REFERENCES on public."suppliers" to "anon";

grant SELECT on public."suppliers" to "anon";

grant TRIGGER on public."suppliers" to "anon";

grant TRUNCATE on public."suppliers" to "anon";

grant UPDATE on public."suppliers" to "anon";

grant DELETE on public."suppliers" to "authenticated";

grant INSERT on public."suppliers" to "authenticated";

grant REFERENCES on public."suppliers" to "authenticated";

grant SELECT on public."suppliers" to "authenticated";

grant TRIGGER on public."suppliers" to "authenticated";

grant TRUNCATE on public."suppliers" to "authenticated";

grant UPDATE on public."suppliers" to "authenticated";

grant DELETE on public."tenant_summary" to "authenticated";

grant INSERT on public."tenant_summary" to "authenticated";

grant REFERENCES on public."tenant_summary" to "authenticated";

grant SELECT on public."tenant_summary" to "authenticated";

grant TRIGGER on public."tenant_summary" to "authenticated";

grant TRUNCATE on public."tenant_summary" to "authenticated";

grant UPDATE on public."tenant_summary" to "authenticated";

grant DELETE on public."tenants" to "anon";

grant INSERT on public."tenants" to "anon";

grant REFERENCES on public."tenants" to "anon";

grant SELECT on public."tenants" to "anon";

grant TRIGGER on public."tenants" to "anon";

grant TRUNCATE on public."tenants" to "anon";

grant UPDATE on public."tenants" to "anon";

grant DELETE on public."tenants" to "authenticated";

grant INSERT on public."tenants" to "authenticated";

grant REFERENCES on public."tenants" to "authenticated";

grant SELECT on public."tenants" to "authenticated";

grant TRIGGER on public."tenants" to "authenticated";

grant TRUNCATE on public."tenants" to "authenticated";

grant UPDATE on public."tenants" to "authenticated";

grant DELETE on public."v_daily_rep_payments" to "authenticated";

grant INSERT on public."v_daily_rep_payments" to "authenticated";

grant REFERENCES on public."v_daily_rep_payments" to "authenticated";

grant SELECT on public."v_daily_rep_payments" to "authenticated";

grant TRIGGER on public."v_daily_rep_payments" to "authenticated";

grant TRUNCATE on public."v_daily_rep_payments" to "authenticated";

grant UPDATE on public."v_daily_rep_payments" to "authenticated";

grant DELETE on public."v_daily_rep_stock_picked" to "authenticated";

grant INSERT on public."v_daily_rep_stock_picked" to "authenticated";

grant REFERENCES on public."v_daily_rep_stock_picked" to "authenticated";

grant SELECT on public."v_daily_rep_stock_picked" to "authenticated";

grant TRIGGER on public."v_daily_rep_stock_picked" to "authenticated";

grant TRUNCATE on public."v_daily_rep_stock_picked" to "authenticated";

grant UPDATE on public."v_daily_rep_stock_picked" to "authenticated";
