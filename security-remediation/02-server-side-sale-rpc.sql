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
