'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

export type SaleLine = {
  product_id: string;
  quantity: number;
  unit_price: number;
};

type SaleInput = {
  customerName: string;
  customerId?: string | null;
  paymentMode: 'cash' | 'credit';
  lines: SaleLine[];
};

async function assertRep() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' as const, supabase: null, profile: null };
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, tenant_id, role, is_active')
    .eq('id', user.id)
    .single();
  if (!profile || !profile.is_active)
    return { error: 'Account inactive' as const, supabase: null, profile: null };
  if (profile.role !== 'rep')
    return { error: 'Only sales reps can record sales' as const, supabase: null, profile: null };
  if (!profile.tenant_id)
    return { error: 'Your account is missing a tenant' as const, supabase: null, profile: null };
  return { error: null, supabase, profile };
}

export async function recordSaleAction(input: SaleInput): Promise<ActionResult> {
  const guard = await assertRep();
  if (guard.error) return { ok: false, error: guard.error };
  const { supabase, profile } = guard;

  const customer = input.customerName.trim();
  if (!customer) return { ok: false, error: 'Enter a customer name.' };
  const lines = input.lines.filter((l) => l.quantity > 0);
  if (lines.length === 0)
    return { ok: false, error: 'Add at least one product with a quantity.' };

  // Validate every product is still in stock for this rep.
  const productIds = lines.map((l) => l.product_id);
  const { data: holdings } = await supabase
    .from('rep_holdings')
    .select('product_id, quantity')
    .eq('rep_id', profile.id)
    .eq('tenant_id', profile.tenant_id)
    .in('product_id', productIds);
  const holdingByProduct = new Map(
    (holdings ?? []).map((h) => [h.product_id, Number(h.quantity ?? 0)]),
  );

  // Fetch buy_price snapshots once.
  const { data: products } = await supabase
    .from('products')
    .select('id, name, buy_price, sell_price')
    .in('id', productIds)
    .eq('tenant_id', profile.tenant_id);
  const productById = new Map((products ?? []).map((p) => [p.id, p]));

  for (const l of lines) {
    const onHand = holdingByProduct.get(l.product_id) ?? 0;
    if (l.quantity > onHand) {
      const p = productById.get(l.product_id);
      return {
        ok: false,
        error: `Not enough ${p?.name ?? 'stock'}: you have ${onHand}, tried to sell ${l.quantity}.`,
      };
    }
    if (l.unit_price < 0) return { ok: false, error: 'Price cannot be negative.' };
  }

  const totalCases = lines.reduce((s, l) => s + l.quantity, 0);
  const totalValue = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);
  const saleId = crypto.randomUUID();
  const status = input.paymentMode === 'cash' ? 'paid' : 'pending';

  const { error: saleErr } = await supabase.from('sales').insert({
    id: saleId,
    tenant_id: profile.tenant_id,
    rep_id: profile.id,
    customer_name: customer,
    ...(input.customerId ? { customer_id: input.customerId } : {}),
    total_cases: totalCases,
    total_value: totalValue,
    status,
  });
  if (saleErr) return { ok: false, error: `Could not record sale: ${saleErr.message}` };

  const itemRows = lines.map((l) => {
    const p = productById.get(l.product_id);
    return {
      sale_id: saleId,
      product_id: l.product_id,
      quantity: l.quantity,
      unit_price: l.unit_price,
      list_price: p?.sell_price ?? l.unit_price,
      buy_price_snapshot: p?.buy_price ?? null,
    };
  });
  const { error: itemsErr } = await supabase.from('sale_items').insert(itemRows);
  if (itemsErr) {
    // Roll back the parent sale to avoid a half-recorded transaction.
    await supabase.from('sales').delete().eq('id', saleId);
    return { ok: false, error: `Could not save sale items: ${itemsErr.message}` };
  }

  // Decrement rep_holdings (best-effort; concurrent updates handled by holdings being per-rep).
  for (const l of lines) {
    const onHand = holdingByProduct.get(l.product_id) ?? 0;
    await supabase
      .from('rep_holdings')
      .update({ quantity: Math.max(0, onHand - l.quantity) })
      .eq('rep_id', profile.id)
      .eq('tenant_id', profile.tenant_id)
      .eq('product_id', l.product_id);
  }

  revalidatePath('/dashboard/rep');
  revalidatePath('/dashboard/manager');
  revalidatePath('/dashboard/owner');
  return {
    ok: true,
    message: input.paymentMode === 'cash' ? 'Cash sale recorded' : 'Credit sale recorded — pending payment',
  };
}

export type RequestLine = { product_id: string; quantity: number };

export async function requestStockAction(input: {
  lines: RequestLine[];
  notes?: string;
}): Promise<ActionResult> {
  const guard = await assertRep();
  if (guard.error) return { ok: false, error: guard.error };
  const { supabase, profile } = guard;

  const lines = input.lines.filter((l) => l.quantity > 0);
  if (lines.length === 0)
    return { ok: false, error: 'Add at least one product with a quantity.' };

  // Snapshot list_price from products so manager sees what the rep would charge.
  const productIds = lines.map((l) => l.product_id);
  const { data: products } = await supabase
    .from('products')
    .select('id, sell_price')
    .in('id', productIds)
    .eq('tenant_id', profile.tenant_id);
  const priceById = new Map(
    (products ?? []).map((p) => [p.id, Number(p.sell_price ?? 0)]),
  );

  const totalCases = lines.reduce((s, l) => s + l.quantity, 0);
  const totalValue = lines.reduce(
    (s, l) => s + l.quantity * (priceById.get(l.product_id) ?? 0),
    0,
  );

  const requestId = crypto.randomUUID();
  const { error: reqErr } = await supabase.from('stock_requests').insert({
    id: requestId,
    tenant_id: profile.tenant_id,
    rep_id: profile.id,
    total_cases: totalCases,
    total_value: totalValue,
    status: 'pending',
    notes: input.notes?.trim() || null,
  });
  if (reqErr) return { ok: false, error: `Could not request stock: ${reqErr.message}` };

  const itemRows = lines.map((l) => ({
    request_id: requestId,
    product_id: l.product_id,
    quantity: l.quantity,
    unit_price: priceById.get(l.product_id) ?? 0,
  }));
  const { error: itemsErr } = await supabase.from('stock_request_items').insert(itemRows);
  if (itemsErr) {
    await supabase.from('stock_requests').delete().eq('id', requestId);
    return { ok: false, error: `Could not save request items: ${itemsErr.message}` };
  }

  revalidatePath('/dashboard/rep');
  revalidatePath('/dashboard/manager');
  return { ok: true, message: 'Stock request sent to your manager' };
}

export async function submitReturnAction(input: {
  productId: string;
  quantity: number;
  reason: string;
}): Promise<ActionResult> {
  const guard = await assertRep();
  if (guard.error) return { ok: false, error: guard.error };
  const { supabase, profile } = guard;

  const qty = Number(input.quantity);
  const reason = input.reason.trim();
  if (!input.productId) return { ok: false, error: 'Pick a product.' };
  if (!Number.isFinite(qty) || qty <= 0)
    return { ok: false, error: 'Quantity must be positive.' };
  if (!reason) return { ok: false, error: 'Reason is required.' };

  // Don't allow returning more than the rep holds.
  const { data: holding } = await supabase
    .from('rep_holdings')
    .select('quantity')
    .eq('rep_id', profile.id)
    .eq('tenant_id', profile.tenant_id)
    .eq('product_id', input.productId)
    .maybeSingle();
  const onHand = Number(holding?.quantity ?? 0);
  if (qty > onHand)
    return {
      ok: false,
      error: `You only have ${onHand} of this product on hand.`,
    };

  const { error } = await supabase.from('product_returns').insert({
    tenant_id: profile.tenant_id,
    rep_id: profile.id,
    product_id: input.productId,
    quantity: qty,
    reason,
    status: 'pending',
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath('/dashboard/rep');
  revalidatePath('/dashboard/manager');
  return { ok: true, message: 'Return submitted — awaiting manager approval' };
}
