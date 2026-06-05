-- Migration 05 — tighten_rls_and_cleanup
-- M1/M2/M3, a stock_requests rep-status tightening, duplicate-trigger cleanup,
-- and removal of RPC exposure on trigger/utility functions.

-- M1: blanket ALL policy let reps delete/update customers and nullified the subscription gate.
DROP POLICY IF EXISTS tenant_customers ON public.customers;  -- broad ALL (any tenant member)
DROP POLICY IF EXISTS customers_insert  ON public.customers;  -- ungated duplicate that bypassed tenant_is_active
-- remaining: customers_select / customers_insert_active / customers_update / customers_delete(owner+manager)

-- M2: remove legacy supplier_order_items policies that trusted auth.jwt()->>'tenant_id'
DROP POLICY IF EXISTS "Owners can insert supplier_order_items" ON public.supplier_order_items;
DROP POLICY IF EXISTS "Owners can read supplier_order_items"   ON public.supplier_order_items;

-- Reps could flip their own stock_request to 'approved' via direct PostgREST update.
DROP POLICY IF EXISTS stock_requests_update ON public.stock_requests;
CREATE POLICY stock_requests_update ON public.stock_requests
  FOR UPDATE TO authenticated
  USING (
    ((rep_id = auth.uid()) AND (tenant_id = get_my_tenant_id())
       AND (status = ANY (ARRAY['pending'::approval_status, 'cancelled'::approval_status])))
    OR ((get_my_role() = ANY (ARRAY['manager','owner','super_admin']))
       AND ((tenant_id = get_my_tenant_id()) OR (get_my_role() = 'super_admin')))
  )
  WITH CHECK (
    ((rep_id = auth.uid()) AND (tenant_id = get_my_tenant_id())
       AND (status = ANY (ARRAY['pending'::approval_status, 'cancelled'::approval_status])))
    OR (get_my_role() = ANY (ARRAY['manager','owner','super_admin']))
  );

-- M3: admin-only tables had RLS on but no policy (unreachable). Grant super_admin access.
CREATE POLICY admin_notes_super_admin ON public.admin_notes
  FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
CREATE POLICY platform_config_super_admin ON public.platform_config
  FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

-- Cleanup: duplicate triggers (each fired twice)
DROP TRIGGER IF EXISTS protect_profiles_trg     ON public.profiles;  -- dup of protect_profile_sensitive_fields
DROP TRIGGER IF EXISTS set_profiles_updated_at  ON public.profiles;  -- dup of profiles_updated_at
DROP TRIGGER IF EXISTS set_products_updated_at  ON public.products;  -- dup of products_updated_at

-- Cleanup: trigger/utility functions should not be RPC-callable (they run via triggers regardless).
-- NOTE: is_*/get_my_*/tenant_is_active are intentionally left executable — RLS policies depend on them.
REVOKE EXECUTE ON FUNCTION public.enforce_sale_edit_window()             FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.update_last_paid_at()                  FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.protect_payment_status()              FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.sale_items_track_override()           FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.set_updated_at()                      FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.protect_profile_sensitive_fields()    FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.payments_block_unauth_status_change()  FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.trg_record_price_change()             FROM anon, authenticated, public;
