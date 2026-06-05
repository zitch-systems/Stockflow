-- Migration 06 — revoke_public_execute_on_definer_rpcs
-- The earlier REVOKE ... FROM anon left the default PUBLIC grant intact, so anon
-- still inherited EXECUTE. Revoke from PUBLIC and re-grant only the needed roles.

-- Client-used by managers/owners -> authenticated only (functions self-authorize internally)
REVOKE EXECUTE ON FUNCTION public.approve_stock_request_atomic(uuid, jsonb, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.confirm_payment_atomic(uuid, uuid, text)               FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reject_payment_atomic(uuid, uuid, text)                FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.approve_return_atomic(uuid, boolean, uuid, text)        FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.approve_stock_request_atomic(uuid, jsonb, uuid, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.confirm_payment_atomic(uuid, uuid, text)               TO authenticated;
GRANT  EXECUTE ON FUNCTION public.reject_payment_atomic(uuid, uuid, text)                TO authenticated;
GRANT  EXECUTE ON FUNCTION public.approve_return_atomic(uuid, boolean, uuid, text)        TO authenticated;

-- Admin/utility: no client use -> postgres/service_role only
REVOKE EXECUTE ON FUNCTION public.add_table_to_realtime(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable()           FROM PUBLIC, anon, authenticated;

-- Tenant-scoped readers, unused by client today -> drop public, keep authenticated for future use
REVOKE EXECUTE ON FUNCTION public.get_customer_sales(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_rep_debt_summary()            FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_customer_sales(uuid, integer) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_rep_debt_summary()            TO authenticated;
