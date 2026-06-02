-- ============================================================================
-- StockFlow — C1/C2 backend hardening, ALL migrations in dependency order.
--
-- WHAT THIS IS
--   A single paste-ready concatenation of 01→04 for the Supabase SQL editor of
--   the StockFlow project (fjmkenowgfxepwpyjcss). Generated from the reviewed
--   templates in this folder; the individual files remain the source of truth.
--
-- BEFORE YOU RUN
--   1. Confirm you are in the StockFlow project (Project URL ends in
--      fjmkenowgfxepwpyjcss.supabase.co).
--   2. These were written WITHOUT live-schema access — the column names/types
--      in the sale/payment RPCs (esp. 03 edit/cancel & 04 record_payment) are
--      best-effort guesses. Read each block against your actual tables first.
--   3. Run it as ONE transaction so a mismatch rolls back cleanly:
--        begin;  -- (paste everything below)  ... commit;
--      Supabase's SQL editor wraps statements in a transaction by default; if
--      anything errors, nothing is applied.
--
-- WHAT IS INTENTIONALLY LEFT OFF
--   Every `revoke insert/update/delete ...` is commented out. They lock tables
--   to RPC-only, but the frontend still has direct writes with no RPC yet
--   (profile create on signup/recovery, owner/manager sales, holdings assign,
--   payment confirm/edit) that the revokes would break. Uncomment each ONLY
--   after its path is migrated — see the checklists inside 01, 02 and 04. The
--   `grant execute` lines ARE active and are safe on their own.
-- ============================================================================




-- ====================================================================
-- >>> 01-profiles-rls-hardening.sql
-- ====================================================================

-- ============================================================================
-- 01 — profiles RLS hardening (fixes C2: privilege escalation)
-- ============================================================================
-- TEMPLATE — review against your real schema and test in a Supabase branch.
--
-- Goal: a user may edit ONLY their own non-privileged fields (full_name,
-- phone, and a few personal KYC fields). Nobody may self-assign role /
-- tenant_id / is_active / debt_limit. Profile *creation* is server-only.
--
-- This neutralises both the console attack
--   sb.from('profiles').update({ role:'owner' })
-- and the user_metadata-trusting recovery upsert in supabase-client.js.
-- ============================================================================

-- 1) Profiles should ideally be created only by the handle_new_user() trigger
--    (SECURITY DEFINER) or an admin provisioning function. The blunt way to
--    enforce that is to revoke client INSERT — but ⚠️ the frontend STILL creates
--    profile rows directly today, so the revoke below would BREAK:
--      • login / recovery bootstrap  supabase-client.js:79,90  (profiles.upsert)
--      • owner creates rep/manager   owner-dashboard.html:6047  (profiles.insert)
--      • super-admin provisioning    admin-dashboard.html:1781 (upsert), :2105 (insert)
--    Left commented until those paths move server-side. The field-lock trigger
--    in step 2 below ALREADY stops the main escalation (UPDATE role/tenant_id),
--    so it is safe to deploy this file without the revoke. To also close the
--    INSERT vector without breaking the app, prefer a BEFORE INSERT trigger
--    that forces role to a safe default and blocks self-assigning
--    super_admin / tenant_id — not this blanket revoke.
--
-- revoke insert on table public.profiles from authenticated, anon;

-- 2) Block changes to protected columns on any UPDATE that isn't performed by
--    a privileged actor. Implemented as a trigger because RLS WITH CHECK
--    cannot easily express "these specific columns are immutable".
create or replace function public.enforce_profile_field_locks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id   uuid := auth.uid();
  actor_role text;
begin
  -- Service role / server-side (no JWT) context: allow. SECURITY DEFINER
  -- functions and the auth trigger run with auth.uid() = null.
  if actor_id is null then
    return new;
  end if;

  select role into actor_role from public.profiles where id = actor_id;

  -- A user editing THEIR OWN row who is not an owner/manager/super_admin
  -- (i.e. a rep) may not touch any privileged column.
  if new.id = actor_id and coalesce(actor_role, 'rep') not in ('owner','manager','super_admin') then
    if new.role       is distinct from old.role
       or new.tenant_id is distinct from old.tenant_id
       or new.is_active is distinct from old.is_active
       or new.debt_limit is distinct from old.debt_limit then
      raise exception 'profiles: cannot modify privileged fields (role/tenant_id/is_active/debt_limit)';
    end if;
  end if;

  -- Nobody except a super_admin may ever change tenant_id (prevents an owner
  -- moving accounts between tenants) or grant super_admin.
  if coalesce(actor_role,'') <> 'super_admin' then
    if new.tenant_id is distinct from old.tenant_id then
      raise exception 'profiles: tenant_id is immutable';
    end if;
    if new.role = 'super_admin' and old.role is distinct from 'super_admin' then
      raise exception 'profiles: cannot self-assign super_admin';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_profile_field_locks on public.profiles;
create trigger trg_enforce_profile_field_locks
  before update on public.profiles
  for each row execute function public.enforce_profile_field_locks();

-- 3) (Recommended) confirm the SELECT/UPDATE policies are tenant-scoped, e.g.:
--    create policy profiles_self_update on public.profiles
--      for update to authenticated
--      using  (id = auth.uid())
--      with check (id = auth.uid());
--    Owners/managers managing staff should go through a SECURITY DEFINER
--    function or a separate policy gated on the actor's role + matching tenant.


-- ====================================================================
-- >>> 02-server-side-sale-rpc.sql
-- ====================================================================

-- ============================================================================
-- 02 — server-side sale recording (fixes C1: client-trusted financials)
-- ============================================================================
-- TEMPLATE — review against your real schema and test in a Supabase branch.
--
-- Replaces the client-side write sequence in rep-dashboard.html doSell()
-- (insert sales + sale_items, then update rep_holdings.quantity) with ONE
-- atomic SECURITY DEFINER function. The server — not the browser — computes
-- totals, validates stock, and decrements holdings inside a single
-- transaction. Direct client writes to these tables are then revoked.
--
-- Columns used below were inferred from the frontend queries:
--   sales(id, tenant_id, rep_id, customer_name, customer_id,
--         total_cases, total_value, status, created_at)
--   sale_items(sale_id, product_id, quantity, unit_price, list_price,
--              buy_price_snapshot)
--   rep_holdings(rep_id, product_id, tenant_id, quantity, debt_amount)
--   products(id, tenant_id, name, sell_price, buy_price, is_active)
-- Adjust names/types to match your schema.
-- ============================================================================

create or replace function public.record_sale(
  p_customer_name text,
  p_customer_id   uuid,
  p_items         jsonb   -- [{ "product_id": "...", "quantity": 5, "unit_price": 1200 }]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rep        uuid := auth.uid();
  v_tenant     uuid;
  v_sale_id    uuid := gen_random_uuid();
  v_total_val  numeric := 0;
  v_total_qty  integer := 0;
  it           jsonb;
  v_pid        uuid;
  v_qty        integer;
  v_req_price  numeric;     -- price requested by the rep (override)
  v_sell       numeric;     -- server list price
  v_buy        numeric;     -- server cost basis (for margin snapshot)
  v_have       integer;
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

    -- Server-trusted prices (never trust client list/cost prices).
    select sell_price, buy_price into v_sell, v_buy
    from public.products
    where id = v_pid and tenant_id = v_tenant and is_active = true;
    if v_sell is null then
      raise exception 'unknown or inactive product %', v_pid;
    end if;

    -- Price-override policy: allow the rep's price but never below cost.
    -- Tighten/loosen to match your business rules (e.g. require approval
    -- for discounts beyond a threshold).
    v_req_price := coalesce(v_req_price, v_sell);
    if v_req_price < v_buy then
      raise exception 'price % below cost % for product %', v_req_price, v_buy, v_pid;
    end if;

    -- Atomically check & decrement the rep's holdings (row lock).
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

    insert into public.sale_items
      (sale_id, product_id, quantity, unit_price, list_price, buy_price_snapshot)
    values
      (v_sale_id, v_pid, v_qty, v_req_price, v_sell, v_buy);

    v_total_val := v_total_val + v_req_price * v_qty;
    v_total_qty := v_total_qty + v_qty;
  end loop;

  insert into public.sales
    (id, tenant_id, rep_id, customer_name, customer_id, total_cases, total_value, status)
  values
    (v_sale_id, v_tenant, v_rep, p_customer_name, p_customer_id, v_total_qty, v_total_val, 'pending');

  return v_sale_id;
end;
$$;

grant execute on function public.record_sale(text, uuid, jsonb) to authenticated;

-- ⚠️  DO NOT RUN THE REVOKES BELOW YET.  ───────────────────────────────────
-- They lock down ALL direct client writes to these tables, but only the rep
-- doSell / saveEditSale / cancelSale paths have RPCs today. Running them now
-- BREAKS these still-direct write paths (verified in the frontend):
--   • owner sells          owner-dashboard.html  ~4449/4452, ~5134/5141  (needs an owner record_sale path)
--   • manager sale + items manager-dashboard.html ~1486/1506/1511        (needs a manager record_sale path)
--   • holdings assign/adj  manager ~3014/3021/3205/3387; owner ~5637     (needs adjust_holdings RPC)
-- Uncomment ONLY after every path above is migrated to an RPC. Until then the
-- frontend already prefers record_sale/edit_sale/cancel_sale and falls back to
-- the (hardened) direct writes, so leaving these grants without the revokes is
-- safe and non-breaking.
--
-- revoke insert, update, delete on table public.sales        from authenticated, anon;
-- revoke insert, update, delete on table public.sale_items   from authenticated, anon;
-- revoke insert, update, delete on table public.rep_holdings from authenticated, anon;
-- ───────────────────────────────────────────────────────────────────────────

-- ----------------------------------------------------------------------------
-- Matching frontend change (rep-dashboard.html doSell): replace the
-- insert sales / insert sale_items / loop-update rep_holdings block with:
--
--   const { data: saleId, error } = await window.sb.rpc('record_sale', {
--     p_customer_name: cust,
--     p_customer_id:   custId,
--     p_items: lineItems.map(li => ({
--       product_id: li.product_id, quantity: li.quantity, unit_price: li.unit_price
--     }))
--   });
--   if (error) return window.toast('Could not record sale: ' + error.message, 'err');
--
-- Apply the same server-side pattern to: payments (confirm/record),
-- stock_requests, product_returns, and the edit-sale path.
-- ----------------------------------------------------------------------------


-- ====================================================================
-- >>> 03-edit-cancel-sale-rpc.sql
-- ====================================================================

-- ============================================================================
-- 03 — server-side sale EDIT and CANCEL (extends 02; fixes C1 for the edit/
--      cancel paths)
-- ============================================================================
-- TEMPLATE / DOCUMENTED GUESS — review against your real schema and test in a
-- Supabase branch before deploying.
--
-- Signatures here were INFERRED from the frontend (they are not yet confirmed
-- against a deployed DB). The frontend (rep-dashboard.html saveEditSale /
-- cancelSale) calls these RPC-first and falls back to the legacy client writes
-- only when the function is ABSENT (PostgREST PGRST202 / "does not exist"), so:
--   * deploy these as-is  -> the atomic path activates automatically
--   * change the names/params -> update the matching window.sb.rpc(...) calls
--   * don't deploy at all -> the hardened client fallback keeps working
--
-- Columns used (same inference as 02):
--   sales(id, tenant_id, rep_id, customer_name, customer_id, total_cases,
--         total_value, status, edit_count, last_edited_at, edit_reason)
--   sale_items(sale_id, product_id, quantity, unit_price, list_price,
--              buy_price_snapshot)
--   rep_holdings(rep_id, product_id, tenant_id, quantity)
--   products(id, tenant_id, sell_price, buy_price, is_active)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- edit_sale: re-price from server values, restore the OLD lines to holdings,
-- validate + decrement the NEW lines, swap sale_items, bump edit metadata.
-- Mirrors record_sale's price/stock policy. Only the owning rep may edit, and
-- only while the sale is still pending/edited (never confirmed or cancelled).
-- ----------------------------------------------------------------------------
create or replace function public.edit_sale(
  p_sale_id       uuid,
  p_customer_name text,
  p_items         jsonb,   -- [{ "product_id": "...", "quantity": 5, "unit_price": 1200 }]
  p_reason        text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
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
begin
  if v_rep is null then raise exception 'not authenticated'; end if;

  -- Lock the sale row; verify ownership + editable status.
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

  -- 1) Restore the existing lines back into the rep's holdings.
  for old_it in
    select product_id, quantity from public.sale_items where sale_id = p_sale_id
  loop
    update public.rep_holdings
    set quantity = quantity + old_it.quantity
    where rep_id = v_rep and product_id = old_it.product_id and tenant_id = v_tenant;
  end loop;

  -- 2) Remove the old lines.
  delete from public.sale_items where sale_id = p_sale_id;

  -- 3) Validate + apply the new lines (server-trusted prices, row-locked stock).
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

    insert into public.sale_items
      (sale_id, product_id, quantity, unit_price, list_price, buy_price_snapshot)
    values
      (p_sale_id, v_pid, v_qty, v_req_price, v_sell, v_buy);

    v_total_val := v_total_val + v_req_price * v_qty;
    v_total_qty := v_total_qty + v_qty;
  end loop;

  -- 4) Update the sale header + edit metadata.
  update public.sales set
    customer_name  = p_customer_name,
    total_cases    = v_total_qty,
    total_value    = v_total_val,
    status         = 'edited',
    edit_count     = coalesce(edit_count, 0) + 1,
    last_edited_at = now(),
    edit_reason    = nullif(p_reason, '')
  where id = p_sale_id and rep_id = v_rep;

  return p_sale_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- cancel_sale: flip to 'cancelled' and restore holdings, atomically and
-- idempotently (a second call on an already-cancelled sale is a no-op).
-- ----------------------------------------------------------------------------
create or replace function public.cancel_sale(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
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
  if v_status = 'cancelled' then return; end if;  -- idempotent

  for old_it in
    select product_id, quantity from public.sale_items where sale_id = p_sale_id
  loop
    update public.rep_holdings
    set quantity = quantity + old_it.quantity
    where rep_id = v_rep and product_id = old_it.product_id and tenant_id = v_tenant;
  end loop;

  update public.sales set status = 'cancelled' where id = p_sale_id and rep_id = v_rep;
end;
$$;

grant execute on function public.edit_sale(uuid, text, jsonb, text) to authenticated;
grant execute on function public.cancel_sale(uuid)                  to authenticated;
-- (The REVOKEs that lock these tables live in 02 — and are intentionally left
--  commented there until every owner/manager write path is migrated. See 02.)


-- ====================================================================
-- >>> 04-record-payment-rpc.sql
-- ====================================================================

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
