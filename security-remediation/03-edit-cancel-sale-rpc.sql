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
