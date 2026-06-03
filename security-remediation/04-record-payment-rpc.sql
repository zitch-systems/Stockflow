-- ============================================================================
-- 04 — server-side payment recording (fixes C1 for the rep payment path)
-- ============================================================================
-- TEMPLATE / DOCUMENTED GUESS — review against your real schema and test in a
-- Supabase branch before deploying.
--
-- Signature INFERRED from rep-dashboard.html submitPay(), which currently does
-- a direct insert into payments. The frontend calls this RPC-first and falls
-- back to that insert only when the function is ABSENT (PGRST202 / "does not
-- exist"); a real rejection (e.g. amount <= 0) is surfaced, not bypassed.
--
-- The receipt image(s) are still uploaded to Supabase Storage from the browser
-- (unchanged); this RPC only records the payment row with the resulting URLs.
--
-- Columns used (inferred):
--   payments(id, tenant_id, rep_id, amount, receipt_url, attachment_urls,
--            status, notes, created_at)
-- ============================================================================

create or replace function public.record_payment(
  p_amount          numeric,
  p_receipt_url     text,
  p_attachment_urls jsonb,   -- array of URLs, or null
  p_note            text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
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
    (v_pay_id, v_tenant, v_rep, p_amount, p_receipt_url, p_attachment_urls,
     'pending', nullif(p_note, ''));

  return v_pay_id;
end;
$$;

grant execute on function public.record_payment(numeric, text, jsonb, text) to authenticated;

-- ⚠️  DO NOT RUN THE REVOKE BELOW YET.  ─────────────────────────────────────
-- It forces ALL payment writes through RPCs, but these paths are still direct
-- (verified in the frontend) and would break:
--   • rep edits a pending payment    rep-dashboard.html ~2190   (needs an edit_payment RPC)
--   • confirm / reject payment        manager ~3163/3215/3379; owner ~5614
--        confirm already has confirm_payment_atomic, but reject/status does not
--        — add a set_payment_status RPC first.
-- record_payment itself is wired RPC-first with a safe insert fallback, so the
-- grant above is non-breaking on its own. Uncomment only after the paths above
-- are migrated.
--
-- revoke insert, update, delete on table public.payments from authenticated, anon;
-- ───────────────────────────────────────────────────────────────────────────
