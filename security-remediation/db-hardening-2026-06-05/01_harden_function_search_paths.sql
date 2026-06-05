-- Migration 01 — harden_function_search_paths
-- Pin search_path on SECURITY DEFINER / trigger functions to close
-- search_path-injection (Supabase lint 0011_function_search_path_mutable).

ALTER FUNCTION public.is_super_admin()                       SET search_path = public;
ALTER FUNCTION public.is_owner_or_above()                    SET search_path = public;
ALTER FUNCTION public.is_manager_or_above()                  SET search_path = public;
ALTER FUNCTION public.enforce_sale_edit_window()             SET search_path = public;
ALTER FUNCTION public.update_last_paid_at()                  SET search_path = public;
ALTER FUNCTION public.protect_payment_status()               SET search_path = public;
ALTER FUNCTION public.sale_items_track_override()            SET search_path = public;
ALTER FUNCTION public.set_updated_at()                       SET search_path = public;
ALTER FUNCTION public.protect_profile_sensitive_fields()     SET search_path = public;
ALTER FUNCTION public.payments_block_unauth_status_change()  SET search_path = public;
ALTER FUNCTION public.trg_record_price_change()              SET search_path = public;
ALTER FUNCTION public.add_table_to_realtime(text)            SET search_path = public;
