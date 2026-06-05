-- Migration 04 — harden_atomic_financial_rpcs
-- C4 + H1: require manager+, enforce tenant ownership, derive the actor from
-- auth.uid() (ignore client-supplied *_id), and compute prices server-side.
-- Signatures are unchanged so the existing front-end calls keep working.

CREATE OR REPLACE FUNCTION public.approve_stock_request_atomic(p_request_id uuid, p_items jsonb, p_reviewer_id uuid, p_notes text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_req      RECORD;
  v_item     RECORD;
  v_existing RECORD;
  v_actor    uuid := auth.uid();
  v_price    numeric;
  v_qty      integer;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_req FROM public.stock_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Request not found');
  END IF;

  IF NOT (is_manager_or_above() AND (v_req.tenant_id = get_my_tenant_id() OR is_super_admin())) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authorized');
  END IF;

  IF v_req.status::text NOT IN ('pending','pending_manager') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Request already ' || v_req.status::text);
  END IF;

  UPDATE public.stock_requests
     SET status = 'approved', reviewed_by = v_actor, reviewed_at = now()
   WHERE id = p_request_id;

  FOR v_item IN
    SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id uuid, quantity integer, unit_price numeric)
  LOOP
    v_qty := GREATEST(0, COALESCE(v_item.quantity, 0));
    CONTINUE WHEN v_qty = 0;

    -- Product must belong to the request's tenant (blocks cross-tenant stock manipulation)
    PERFORM 1 FROM public.products WHERE id = v_item.product_id AND tenant_id = v_req.tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product % not in tenant %', v_item.product_id, v_req.tenant_id;
    END IF;

    -- Authoritative price: the requested item's stored price, else product sell_price. Never client-supplied.
    SELECT unit_price INTO v_price FROM public.stock_request_items
      WHERE request_id = p_request_id AND product_id = v_item.product_id
      ORDER BY unit_price DESC NULLS LAST LIMIT 1;
    IF v_price IS NULL THEN
      SELECT sell_price INTO v_price FROM public.products WHERE id = v_item.product_id;
    END IF;
    v_price := COALESCE(v_price, 0);

    UPDATE public.products
       SET warehouse_stock = GREATEST(0, warehouse_stock - v_qty)
     WHERE id = v_item.product_id;

    SELECT * INTO v_existing FROM public.rep_holdings
      WHERE rep_id = v_req.rep_id AND product_id = v_item.product_id;
    IF FOUND THEN
      UPDATE public.rep_holdings
         SET quantity = v_existing.quantity + v_qty,
             debt_amount = v_existing.debt_amount + v_qty * v_price,
             updated_at = now()
       WHERE id = v_existing.id;
    ELSE
      INSERT INTO public.rep_holdings (tenant_id, rep_id, product_id, quantity, debt_amount)
      VALUES (v_req.tenant_id, v_req.rep_id, v_item.product_id, v_qty, v_qty * v_price);
    END IF;
  END LOOP;

  INSERT INTO public.approval_history (tenant_id, actor_id, record_type, record_id, previous_status, new_status, notes)
  VALUES (v_req.tenant_id, v_actor, 'stock_request', p_request_id, 'pending', 'approved', p_notes)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$function$;

CREATE OR REPLACE FUNCTION public.confirm_payment_atomic(p_payment_id uuid, p_confirmer_id uuid, p_note text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_pay       RECORD;
  v_remaining numeric;
  v_holding   RECORD;
  v_take      numeric;
  v_actor     uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_pay FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Payment not found');
  END IF;

  IF NOT (is_manager_or_above() AND (v_pay.tenant_id = get_my_tenant_id() OR is_super_admin())) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authorized');
  END IF;

  IF v_pay.status::text <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Payment already ' || v_pay.status::text);
  END IF;

  UPDATE public.payments
     SET status = 'confirmed', confirmed_by = v_actor, confirmed_at = now(), notes = p_note, updated_at = now()
   WHERE id = p_payment_id;

  v_remaining := v_pay.amount;
  FOR v_holding IN
    SELECT id, debt_amount FROM public.rep_holdings
     WHERE rep_id = v_pay.rep_id AND debt_amount > 0
     ORDER BY updated_at ASC FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_take := LEAST(v_remaining, v_holding.debt_amount);
    UPDATE public.rep_holdings SET debt_amount = debt_amount - v_take, updated_at = now() WHERE id = v_holding.id;
    v_remaining := v_remaining - v_take;
  END LOOP;

  INSERT INTO public.approval_history (tenant_id, actor_id, record_type, record_id, previous_status, new_status, notes)
  VALUES (v_pay.tenant_id, v_actor, 'payment', p_payment_id, 'pending', 'confirmed', p_note)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'amount_applied', v_pay.amount - v_remaining, 'overpayment', v_remaining);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$function$;

CREATE OR REPLACE FUNCTION public.reject_payment_atomic(p_payment_id uuid, p_rejecter_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_pay   RECORD;
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO v_pay FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Payment not found');
  END IF;

  IF NOT (is_manager_or_above() AND (v_pay.tenant_id = get_my_tenant_id() OR is_super_admin())) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authorized');
  END IF;

  IF v_pay.status::text <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Payment already ' || v_pay.status::text);
  END IF;

  UPDATE public.payments
     SET status = 'rejected', rejected_by = v_actor, rejected_at = now(), notes = p_reason, updated_at = now()
   WHERE id = p_payment_id;

  INSERT INTO public.approval_history (tenant_id, actor_id, record_type, record_id, previous_status, new_status, notes)
  VALUES (v_pay.tenant_id, v_actor, 'payment', p_payment_id, 'pending', 'rejected', p_reason)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$function$;

CREATE OR REPLACE FUNCTION public.approve_return_atomic(p_return_id uuid, p_restock boolean, p_reviewer_id uuid, p_review_note text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_ret    record;
  v_credit numeric;
  v_actor  uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  SELECT r.*, p.sell_price INTO v_ret
  FROM public.product_returns r
  JOIN public.products p ON p.id = r.product_id
  WHERE r.id = p_return_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Return not found');
  END IF;

  IF NOT (is_manager_or_above() AND (v_ret.tenant_id = get_my_tenant_id() OR is_super_admin())) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authorized');
  END IF;

  IF v_ret.status != 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Already processed');
  END IF;

  v_credit := v_ret.quantity * v_ret.sell_price;

  UPDATE public.product_returns
     SET status = 'approved', reviewed_by = v_actor, reviewed_at = now()
   WHERE id = p_return_id;

  IF v_credit > 0 THEN
    UPDATE public.rep_holdings
       SET debt_amount = GREATEST(0, debt_amount - v_credit)
     WHERE rep_id = v_ret.rep_id AND product_id = v_ret.product_id;
  END IF;

  IF p_restock THEN
    UPDATE public.products
       SET warehouse_stock = warehouse_stock + v_ret.quantity
     WHERE id = v_ret.product_id;
  END IF;

  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$function$;

-- Defense in depth: only authenticated managers/owners ever call these.
REVOKE EXECUTE ON FUNCTION public.approve_stock_request_atomic(uuid, jsonb, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.confirm_payment_atomic(uuid, uuid, text)              FROM anon;
REVOKE EXECUTE ON FUNCTION public.reject_payment_atomic(uuid, uuid, text)               FROM anon;
REVOKE EXECUTE ON FUNCTION public.approve_return_atomic(uuid, boolean, uuid, text)       FROM anon;
