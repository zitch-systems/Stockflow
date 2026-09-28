-- ============================================================================
-- 05 — adjust_holdings / receive_inventory / set_payment_status
-- ============================================================================
-- The three RPCs the REVOKE blocks in 02/04 were waiting on. Written against
-- the live schema (verified 2026-09-27) and following the convention the
-- already-deployed confirm_payment_atomic / approve_stock_request_atomic /
-- approve_return_atomic established:
--
--   * the actor is auth.uid(), NEVER a parameter. (Those functions accept a
--     p_confirmer_id / p_reviewer_id and correctly ignore it; the parameter is
--     vestigial. Nothing here takes one.)
--   * authorize with is_manager_or_above() AND (tenant = get_my_tenant_id()
--     OR is_super_admin()).
--   * RELATIVE updates (set x = x + n), never an absolute value computed from a
--     prior read. This is the whole point: the client's read-modify-write on
--     products.warehouse_stock is not atomic, so two concurrent operations can
--     read the same figure and both write it back, losing one change.
--   * return jsonb_build_object('ok', …) and log to approval_history.
--   * EXCEPTION WHEN OTHERS rolls the whole body back (the block is a
--     subtransaction) and reports the reason, so a partial write is impossible.
--
-- Schema facts these rely on:
--   rep_holdings  UNIQUE (rep_id, product_id) — note: NOT including tenant_id.
--                 CHECK quantity >= 0 and debt_amount >= 0, so an over-decrement
--                 raises 23514 rather than going negative.
--   products      warehouse_stock integer NOT NULL, and NO non-negative CHECK
--                 (unlike rep_holdings) — so these functions clamp it
--                 themselves with GREATEST(0, …).
--   inventory_receipts        invoice_number NOT NULL, received_by NOT NULL.
--   inventory_receipt_items   receipt_id, product_id, quantity, unit_price all
--                             NOT NULL.
--   payments.status           enum payment_status: pending | confirmed |
--                             rejected | edit_pending.
--
-- The frontend calls each of these RPC-first and falls back to the legacy client
-- writes only on PostgREST PGRST202 ("does not exist"); a real rejection is
-- surfaced, never bypassed — so the deploy order never mattered either way.
--
-- STATUS: applied to fjmkenowgfxepwpyjcss on 2026-09-28, together with the
-- approval_history.record_type widening below. The one statement in this file
-- NOT applied is the products_warehouse_stock_nonneg CHECK at the foot, which is
-- left commented deliberately (see the note there).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0) approval_history.record_type is CHECK-constrained to a fixed list that has
--    no room for holdings adjustments or inventory receipts. A dry run caught
--    this: adjust_holdings and receive_inventory both failed outright on the
--    audit insert (23514), so this widening is a PREREQUISITE, not a nicety.
--
--    'stock_adjustment' is included for a separate reason. The owner dashboard's
--    warehouse-adjust audit write omits record_type AND new_status — both NOT
--    NULL — and swallows the result with .catch(function(){}), so it has NEVER
--    once succeeded. The live table confirms it: action_type is NULL in every
--    existing row, and the only record_types present are payment, stock_request
--    and product_return. That path is fixed client-side in the same change as
--    this file; it needs this value to exist.
-- ----------------------------------------------------------------------------
alter table public.approval_history drop constraint if exists approval_history_record_type_check;
alter table public.approval_history add constraint approval_history_record_type_check
  check (record_type = any (array[
    'payment', 'stock_request', 'product_return', 'price_change_request',
    'rep_application', 'supplier_order',
    'rep_holdings', 'inventory_receipt', 'stock_adjustment'
  ]));


-- ----------------------------------------------------------------------------
-- adjust_holdings — move a rep's stock and/or debt by a RELATIVE delta.
--
-- Used for the stock-request fulfil path and for manual corrections. Creates
-- the holdings row if the rep does not have one for that product yet.
--
-- Over-decrementing quantity is an ERROR, not a clamp: if a manager tries to
-- take away 10 cases and the rep holds 5, silently settling on 0 loses the
-- discrepancy, which is exactly the class of silent failure this whole exercise
-- is about. Debt is clamped at 0, because an overpayment legitimately lands
-- there and a negative debt is meaningless.
-- ----------------------------------------------------------------------------
create or replace function public.adjust_holdings(
  p_rep_id     uuid,
  p_product_id uuid,
  p_qty_delta  integer,
  p_debt_delta numeric,
  p_reason     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor    uuid := auth.uid();
  v_tenant   uuid;
  v_rep_tn   uuid;
  v_existing record;
  v_qty      integer := coalesce(p_qty_delta, 0);
  v_debt     numeric := coalesce(p_debt_delta, 0);
  v_new_qty  integer;
  v_new_debt numeric;
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'error', 'Not authenticated');
  end if;

  v_tenant := get_my_tenant_id();

  -- The rep must exist and belong to the caller's tenant. Checking this against
  -- profiles (not the holdings row) also blocks creating a holdings row for a
  -- rep in someone else's tenant.
  select tenant_id into v_rep_tn from public.profiles where id = p_rep_id;
  if v_rep_tn is null then
    return jsonb_build_object('ok', false, 'error', 'Unknown rep');
  end if;

  if not (is_manager_or_above() and (v_rep_tn = v_tenant or is_super_admin())) then
    return jsonb_build_object('ok', false, 'error', 'Not authorized');
  end if;

  -- The product must belong to the same tenant (blocks cross-tenant writes).
  perform 1 from public.products where id = p_product_id and tenant_id = v_rep_tn;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Product not in this tenant');
  end if;

  if v_qty = 0 and v_debt = 0 then
    return jsonb_build_object('ok', false, 'error', 'Nothing to adjust');
  end if;

  select * into v_existing from public.rep_holdings
   where rep_id = p_rep_id and product_id = p_product_id
   for update;

  if found then
    if v_existing.quantity + v_qty < 0 then
      return jsonb_build_object('ok', false, 'error',
        format('Rep holds %s, cannot remove %s', v_existing.quantity, abs(v_qty)));
    end if;
    update public.rep_holdings
       set quantity    = quantity + v_qty,
           debt_amount = greatest(0, debt_amount + v_debt),
           updated_at  = now()
     where id = v_existing.id
     returning quantity, debt_amount into v_new_qty, v_new_debt;
  else
    if v_qty < 0 then
      return jsonb_build_object('ok', false, 'error',
        'Rep holds none of this product, cannot remove stock');
    end if;
    insert into public.rep_holdings (tenant_id, rep_id, product_id, quantity, debt_amount)
    values (v_rep_tn, p_rep_id, p_product_id, v_qty, greatest(0, v_debt))
    returning quantity, debt_amount into v_new_qty, v_new_debt;
  end if;

  insert into public.approval_history
    (tenant_id, actor_id, record_type, record_id, new_status, notes, action_type, item_id, old_value, new_value)
  values
    (v_rep_tn, v_actor, 'rep_holdings', p_rep_id, 'adjusted',
     nullif(p_reason, ''), 'holdings_adjustment', p_product_id,
     jsonb_build_object('qty_delta', v_qty, 'debt_delta', v_debt)::text,
     jsonb_build_object('quantity', v_new_qty, 'debt_amount', v_new_debt)::text);

  return jsonb_build_object('ok', true, 'quantity', v_new_qty, 'debt_amount', v_new_debt);
exception when others then
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
$$;


-- ----------------------------------------------------------------------------
-- receive_inventory — the receipt header, its line items and the warehouse
-- stock increase, in ONE transaction.
--
-- This removes the "stock rose with no audit record" case structurally rather
-- than by warning about it. The client path bumps stock even when the header
-- insert failed (an RLS denial, a bad supplier_id, anything) — here, either all
-- three land or none do.
--
-- p_items: [{ "product_id": "...", "quantity": 5, "unit_price": 1200 }, …]
-- total_value is computed server-side from the items; the client does not get
-- to state it.
-- ----------------------------------------------------------------------------
create or replace function public.receive_inventory(
  p_invoice_number text,
  p_supplier_id    uuid,
  p_invoice_url    text,
  p_notes          text,
  p_received_at    timestamptz,
  p_items          jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor      uuid := auth.uid();
  v_tenant     uuid;
  v_receipt_id uuid := gen_random_uuid();
  v_item       record;
  v_total      numeric := 0;
  v_count      integer := 0;
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'error', 'Not authenticated');
  end if;

  v_tenant := get_my_tenant_id();
  if not (is_manager_or_above() and (v_tenant is not null or is_super_admin())) then
    return jsonb_build_object('ok', false, 'error', 'Not authorized');
  end if;

  if coalesce(trim(p_invoice_number), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Invoice number is required');
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    return jsonb_build_object('ok', false, 'error', 'No items to receive');
  end if;

  if p_supplier_id is not null then
    perform 1 from public.suppliers where id = p_supplier_id and tenant_id = v_tenant;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'Supplier not in this tenant');
    end if;
  end if;

  -- Double-submit guard. There is no unique index on (tenant_id, invoice_number),
  -- so nothing stopped the same delivery being received twice — and each receive
  -- raises warehouse stock again. A dry run confirmed the duplicate went through
  -- and created a second receipt. Refuse it; re-receiving a genuine second
  -- delivery on the same invoice needs a distinct number.
  perform 1 from public.inventory_receipts
   where tenant_id = v_tenant and lower(trim(invoice_number)) = lower(trim(p_invoice_number));
  if found then
    return jsonb_build_object('ok', false, 'error',
      format('Invoice %s has already been received', trim(p_invoice_number)));
  end if;

  -- Validate every line and total it up BEFORE writing anything, so a bad line
  -- cannot leave a half-written receipt.
  for v_item in
    select * from jsonb_to_recordset(p_items) as x(product_id uuid, quantity integer, unit_price numeric)
  loop
    if v_item.product_id is null or coalesce(v_item.quantity, 0) <= 0 then
      return jsonb_build_object('ok', false, 'error', 'Every line needs a product and a positive quantity');
    end if;
    if v_item.unit_price is null or v_item.unit_price < 0 then
      return jsonb_build_object('ok', false, 'error', 'Every line needs a unit price');
    end if;
    perform 1 from public.products where id = v_item.product_id and tenant_id = v_tenant;
    if not found then
      return jsonb_build_object('ok', false, 'error',
        format('Product %s is not in this tenant', v_item.product_id));
    end if;
    v_total := v_total + v_item.quantity * v_item.unit_price;
    v_count := v_count + 1;
  end loop;

  insert into public.inventory_receipts
    (id, tenant_id, supplier_id, invoice_number, invoice_url, total_value, notes, received_by, received_at)
  values
    (v_receipt_id, v_tenant, p_supplier_id, trim(p_invoice_number), nullif(p_invoice_url, ''),
     v_total, nullif(p_notes, ''), v_actor, coalesce(p_received_at, now()));

  insert into public.inventory_receipt_items (receipt_id, product_id, quantity, unit_price)
  select v_receipt_id,
         (it->>'product_id')::uuid,
         (it->>'quantity')::integer,
         (it->>'unit_price')::numeric
  from jsonb_array_elements(p_items) as it;

  -- Relative increase, aggregated so a product listed twice is handled once.
  update public.products p
     set warehouse_stock = p.warehouse_stock + agg.qty,
         updated_at      = now()
    from (select (it->>'product_id')::uuid as pid,
                 sum((it->>'quantity')::integer) as qty
            from jsonb_array_elements(p_items) as it
           group by 1) agg
   where p.id = agg.pid and p.tenant_id = v_tenant;

  insert into public.approval_history
    (tenant_id, actor_id, record_type, record_id, new_status, notes, action_type)
  values
    (v_tenant, v_actor, 'inventory_receipt', v_receipt_id, 'received',
     nullif(p_notes, ''), 'inventory_received');

  return jsonb_build_object('ok', true, 'receipt_id', v_receipt_id,
                            'total_value', v_total, 'lines', v_count);
exception when others then
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
$$;


-- ----------------------------------------------------------------------------
-- set_payment_status — every payment transition other than confirm, with the
-- debt effect REVERSED when moving out of 'confirmed'.
--
-- This is the fix for a real money bug: rejecting an already-confirmed payment
-- used to leave the debt reduction (applied at confirm time) in place while the
-- payment read as rejected, so the rep's debt quietly lost that amount. Here,
-- leaving 'confirmed' adds the amount back.
--
-- Confirming stays with confirm_payment_atomic; this function refuses it so
-- there is exactly one code path that reduces debt.
-- ----------------------------------------------------------------------------
create or replace function public.set_payment_status(
  p_payment_id uuid,
  p_status     text,
  p_note       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor     uuid := auth.uid();
  v_pay       record;
  v_new       text := lower(coalesce(p_status, ''));
  v_holding   record;
  v_remaining numeric;
  v_restored  numeric := 0;
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'error', 'Not authenticated');
  end if;

  if v_new not in ('pending', 'rejected', 'edit_pending') then
    return jsonb_build_object('ok', false, 'error',
      'Status must be pending, rejected or edit_pending (use confirm_payment_atomic to confirm)');
  end if;

  select * into v_pay from public.payments where id = p_payment_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Payment not found');
  end if;

  if not (is_manager_or_above() and (v_pay.tenant_id = get_my_tenant_id() or is_super_admin())) then
    return jsonb_build_object('ok', false, 'error', 'Not authorized');
  end if;

  if v_pay.status::text = v_new then
    return jsonb_build_object('ok', true, 'unchanged', true);   -- idempotent
  end if;

  -- Leaving 'confirmed' must undo the debt reduction that confirming applied.
  -- Debt is fungible per rep, so restoring the total across that rep's holdings
  -- (oldest first, mirroring how confirm_payment_atomic consumed it) puts the
  -- rep's overall debt back where it was.
  if v_pay.status::text = 'confirmed' then
    v_remaining := v_pay.amount;
    for v_holding in
      select id from public.rep_holdings
       where rep_id = v_pay.rep_id
       order by updated_at asc
       for update
    loop
      exit when v_remaining <= 0;
      update public.rep_holdings
         set debt_amount = debt_amount + v_remaining,
             updated_at  = now()
       where id = v_holding.id;
      v_restored  := v_remaining;
      v_remaining := 0;
    end loop;

    if v_remaining > 0 then
      -- The rep has no holdings rows at all, so there is nowhere to put the
      -- debt back. Refuse rather than silently dropping it.
      return jsonb_build_object('ok', false, 'error',
        'Cannot un-confirm: this rep has no holdings to restore the debt to');
    end if;
  end if;

  update public.payments
     set status      = v_new::payment_status,
         rejected_by = case when v_new = 'rejected' then v_actor else rejected_by end,
         rejected_at = case when v_new = 'rejected' then now()   else rejected_at end,
         confirmed_by = case when v_pay.status::text = 'confirmed' then null else confirmed_by end,
         confirmed_at = case when v_pay.status::text = 'confirmed' then null else confirmed_at end,
         notes       = coalesce(nullif(p_note, ''), notes),
         updated_at  = now()
   where id = p_payment_id;

  insert into public.approval_history
    (tenant_id, actor_id, record_type, record_id, previous_status, new_status, notes)
  values
    (v_pay.tenant_id, v_actor, 'payment', p_payment_id,
     v_pay.status::text, v_new, nullif(p_note, ''));

  return jsonb_build_object('ok', true, 'previous_status', v_pay.status::text,
                            'status', v_new, 'debt_restored', v_restored);
exception when others then
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
$$;


grant execute on function public.adjust_holdings(uuid, uuid, integer, numeric, text)              to authenticated;
grant execute on function public.receive_inventory(text, uuid, text, text, timestamptz, jsonb)    to authenticated;
grant execute on function public.set_payment_status(uuid, text, text)                             to authenticated;

-- ----------------------------------------------------------------------------
-- Missing DB-level guard, independent of the RPCs above.
--
-- products.warehouse_stock has NO non-negative CHECK, unlike
-- rep_holdings.quantity and .debt_amount. The Math.max(0, …) guards in the
-- dashboards are client-side only, so warehouse stock can be driven negative
-- from the console. Adding the constraint is the real fix — but it will FAIL if
-- any existing row is already negative, so check first:
--
--   select id, name, warehouse_stock from public.products where warehouse_stock < 0;
--
-- Fix or zero those rows, then:
--
-- alter table public.products
--   add constraint products_warehouse_stock_nonneg check (warehouse_stock >= 0);
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- The REVOKEs in 02/04 are STILL not ready to run, even with this file applied.
-- These paths remain direct client writes:
--   • owner sells            owner-dashboard.html  slSell, and the owner_rep sell path
--   • manager sells          manager-dashboard.html mgSell
--   • warehouse adjust/quick-add   owner slWhAdjustSubmit / slWhQuickAdd / orWhQuickAdd
--   • supplier order receive owner-dashboard.html
--   • product returns restock      manager + owner approve paths
-- Regenerate the current list with:
--   grep -n "from('\(products\|rep_holdings\|sales\|sale_items\|payments\)')" \
--     rep-dashboard.html manager-dashboard.html owner-dashboard.html
-- ----------------------------------------------------------------------------
