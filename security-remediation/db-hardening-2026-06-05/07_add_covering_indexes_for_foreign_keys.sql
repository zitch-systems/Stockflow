-- Migration 07 — add_covering_indexes_for_foreign_keys
-- Covering indexes for 23 foreign keys flagged unindexed by the performance advisor.

CREATE INDEX IF NOT EXISTS idx_admin_notes_tenant_id             ON public.admin_notes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_expenses_logged_by               ON public.expenses(logged_by);
CREATE INDEX IF NOT EXISTS idx_expenses_supplier_id             ON public.expenses(supplier_id);
CREATE INDEX IF NOT EXISTS idx_impersonation_log_target_tenant  ON public.impersonation_log(target_tenant_id);
CREATE INDEX IF NOT EXISTS idx_impersonation_log_target_user    ON public.impersonation_log(target_user_id);
CREATE INDEX IF NOT EXISTS idx_inv_adj_adjusted_by              ON public.inventory_adjustments(adjusted_by);
CREATE INDEX IF NOT EXISTS idx_inv_adj_product_id               ON public.inventory_adjustments(product_id);
CREATE INDEX IF NOT EXISTS idx_inv_adj_tenant_id                ON public.inventory_adjustments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_receipts_received_by   ON public.inventory_receipts(received_by);
CREATE INDEX IF NOT EXISTS idx_payments_confirmed_by            ON public.payments(confirmed_by);
CREATE INDEX IF NOT EXISTS idx_payments_rejected_by            ON public.payments(rejected_by);
CREATE INDEX IF NOT EXISTS idx_pcr_product_id                   ON public.price_change_requests(product_id);
CREATE INDEX IF NOT EXISTS idx_pcr_reviewed_by                  ON public.price_change_requests(reviewed_by);
CREATE INDEX IF NOT EXISTS idx_pcr_submitted_by                 ON public.price_change_requests(submitted_by);
CREATE INDEX IF NOT EXISTS idx_product_returns_product_id       ON public.product_returns(product_id);
CREATE INDEX IF NOT EXISTS idx_product_returns_reviewed_by      ON public.product_returns(reviewed_by);
CREATE INDEX IF NOT EXISTS idx_rep_applications_reviewed_by     ON public.rep_applications(reviewed_by);
CREATE INDEX IF NOT EXISTS idx_rep_applications_submitted_by    ON public.rep_applications(submitted_by);
CREATE INDEX IF NOT EXISTS idx_sale_items_product_id            ON public.sale_items(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_requests_reviewed_by       ON public.stock_requests(reviewed_by);
CREATE INDEX IF NOT EXISTS idx_supplier_orders_reviewed_by      ON public.supplier_orders(reviewed_by);
CREATE INDEX IF NOT EXISTS idx_supplier_orders_submitted_by     ON public.supplier_orders(submitted_by);
CREATE INDEX IF NOT EXISTS idx_supplier_transactions_logged_by  ON public.supplier_transactions(logged_by);
