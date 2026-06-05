-- Migration 08 — drop_duplicate_indexes
-- Drop redundant duplicate indexes (identified by identical key/opclass/predicate),
-- keeping one per group. The rep_holdings unique constraint index is preserved.

-- approval_history
DROP INDEX IF EXISTS public.idx_ah_tenant;
DROP INDEX IF EXISTS public.idx_approval_hist_tenant;
DROP INDEX IF EXISTS public.idx_approval_history_tenant;
DROP INDEX IF EXISTS public.idx_approval_hist_actor;
DROP INDEX IF EXISTS public.idx_ah_date;
DROP INDEX IF EXISTS public.idx_approval_hist_date;
DROP INDEX IF EXISTS public.idx_approval_history_created;
-- attachment_metadata
DROP INDEX IF EXISTS public.idx_att_tenant;
-- expenses
DROP INDEX IF EXISTS public.idx_expenses_tenant;
DROP INDEX IF EXISTS public.expenses_tenant_created_idx;
-- inventory_receipt_items
DROP INDEX IF EXISTS public.idx_inv_receipt_items_receipt;
DROP INDEX IF EXISTS public.inv_rec_items_receipt_idx;
DROP INDEX IF EXISTS public.idx_inv_receipt_items_product;
-- inventory_receipts
DROP INDEX IF EXISTS public.idx_inv_receipts_tenant;
DROP INDEX IF EXISTS public.inv_rec_tenant_idx;
DROP INDEX IF EXISTS public.idx_inv_receipts_supplier;
DROP INDEX IF EXISTS public.idx_inv_receipts_date;
-- payments
DROP INDEX IF EXISTS public.idx_payments_tenant_id;
DROP INDEX IF EXISTS public.payments_tenant_id_idx;
DROP INDEX IF EXISTS public.payments_status_idx;
DROP INDEX IF EXISTS public.idx_payments_rep_id;
DROP INDEX IF EXISTS public.payments_rep_idx;
DROP INDEX IF EXISTS public.idx_payments_created_at;
-- price_change_requests
DROP INDEX IF EXISTS public.pcr_tenant_idx;
-- product_returns
DROP INDEX IF EXISTS public.returns_tenant_id_idx;
-- products
DROP INDEX IF EXISTS public.products_tenant_id_idx;
DROP INDEX IF EXISTS public.products_active_idx;
-- profiles
DROP INDEX IF EXISTS public.profiles_tenant_id_idx;
DROP INDEX IF EXISTS public.profiles_role_idx;
-- rep_applications
DROP INDEX IF EXISTS public.rep_apps_tenant_idx;
DROP INDEX IF EXISTS public.rep_apps_status_idx;
-- rep_holdings (keep unique rep_holdings_rep_id_product_id_key; drop the plain dup)
DROP INDEX IF EXISTS public.rep_holdings_tenant_id_idx;
DROP INDEX IF EXISTS public.idx_rep_holdings_rep_id;
DROP INDEX IF EXISTS public.rep_holdings_rep_id_idx;
DROP INDEX IF EXISTS public.idx_rep_holdings_rep_product;
-- sales
DROP INDEX IF EXISTS public.sales_tenant_id_idx;
DROP INDEX IF EXISTS public.sales_tenant_created_idx;
DROP INDEX IF EXISTS public.sales_rep_id_idx;
-- stock_request_items
DROP INDEX IF EXISTS public.stock_request_items_request_idx;
-- stock_requests
DROP INDEX IF EXISTS public.stock_requests_tenant_id_idx;
DROP INDEX IF EXISTS public.stock_requests_status_idx;
-- supplier_order_items
DROP INDEX IF EXISTS public.sup_ord_items_order_idx;
-- supplier_orders
DROP INDEX IF EXISTS public.sup_ord_tenant_idx;
-- suppliers
DROP INDEX IF EXISTS public.suppliers_tenant_idx;
