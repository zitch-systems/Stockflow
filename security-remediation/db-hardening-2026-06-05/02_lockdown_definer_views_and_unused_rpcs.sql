-- Migration 02 — lockdown_definer_views_and_unused_rpcs
-- C3: make the 5 reporting views honour the querying user's RLS (per-tenant)
--     and remove anon access.
-- C2: drop the orphaned, unauthenticated privilege-escalation function.
-- H3: stop anon from mutating the realtime publication.

ALTER VIEW public.tenant_summary            SET (security_invoker = on);
ALTER VIEW public.customer_credit_balances  SET (security_invoker = on);
ALTER VIEW public.v_daily_rep_payments      SET (security_invoker = on);
ALTER VIEW public.v_daily_rep_stock_picked  SET (security_invoker = on);
ALTER VIEW public.rep_price_changes         SET (security_invoker = on);

REVOKE ALL ON public.tenant_summary            FROM anon;
REVOKE ALL ON public.customer_credit_balances  FROM anon;
REVOKE ALL ON public.v_daily_rep_payments      FROM anon;
REVOKE ALL ON public.v_daily_rep_stock_picked  FROM anon;
REVOKE ALL ON public.rep_price_changes         FROM anon;

-- C2: not referenced by the front-end
DROP FUNCTION IF EXISTS public.repair_staff_profile(text, uuid, text);

-- H3
REVOKE EXECUTE ON FUNCTION public.add_table_to_realtime(text) FROM anon, authenticated;

-- Tidy: tenant-scoped but unused by the client; drop anon RPC exposure
REVOKE EXECUTE ON FUNCTION public.get_rep_debt_summary()            FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_customer_sales(uuid, integer) FROM anon;
