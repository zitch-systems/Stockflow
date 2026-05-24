'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

async function assertManagerOrOwner() {
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
  if (!profile || !profile.is_active) {
    return { error: 'Account inactive' as const, supabase: null, profile: null };
  }
  if (profile.role !== 'manager' && profile.role !== 'owner') {
    return { error: 'Only managers can do this' as const, supabase: null, profile: null };
  }
  return { error: null, supabase, profile };
}

export async function confirmPaymentAction(
  paymentId: string,
  note?: string,
): Promise<ActionResult> {
  const guard = await assertManagerOrOwner();
  if (guard.error) return { ok: false, error: guard.error };
  const { supabase, profile } = guard;

  // Try the atomic RPC first (matches legacy behavior — locks rows, reduces debt
  // in the same transaction). Fall back to a direct UPDATE if the RPC isn't
  // installed on this project.
  try {
    const rpc = await supabase.rpc('confirm_payment_atomic', {
      p_payment_id: paymentId,
      p_confirmer_id: profile.id,
      p_note: note || null,
    });
    if (!rpc.error && rpc.data?.ok) {
      revalidatePath('/dashboard/manager');
      revalidatePath('/dashboard/owner');
      return { ok: true, message: 'Payment confirmed' };
    }
  } catch {
    // fall through to manual path
  }

  // Fallback: direct UPDATE. Guarded by status='pending' so concurrent
  // confirmations can't double-apply.
  const { data, error } = await supabase
    .from('payments')
    .update({
      status: 'confirmed',
      confirmed_by: profile.id,
      confirmed_at: new Date().toISOString(),
    })
    .eq('id', paymentId)
    .eq('status', 'pending')
    .eq('tenant_id', profile.tenant_id ?? '')
    .select('id, amount, rep_id');

  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0)
    return { ok: false, error: 'Payment was already resolved.' };

  // Best-effort debt reduction on rep_holdings (FIFO by updated_at).
  const payment = data[0];
  try {
    const { data: holdings } = await supabase
      .from('rep_holdings')
      .select('id, debt_amount')
      .eq('rep_id', payment.rep_id)
      .eq('tenant_id', profile.tenant_id ?? '')
      .gt('debt_amount', 0)
      .order('updated_at', { ascending: true });
    let remaining = Number(payment.amount ?? 0);
    for (const h of holdings ?? []) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, Number(h.debt_amount));
      await supabase
        .from('rep_holdings')
        .update({ debt_amount: Math.max(0, Number(h.debt_amount) - take) })
        .eq('id', h.id);
      remaining -= take;
    }
  } catch {
    // Non-fatal — payment is confirmed regardless.
  }

  revalidatePath('/dashboard/manager');
  revalidatePath('/dashboard/owner');
  return { ok: true, message: 'Payment confirmed' };
}

export async function bulkConfirmPaymentsAction(
  paymentIds: string[],
): Promise<{ ok: true; confirmed: number; failed: number; total: number } | { ok: false; error: string }> {
  const guard = await assertManagerOrOwner();
  if (guard.error) return { ok: false, error: guard.error };
  if (paymentIds.length === 0)
    return { ok: false, error: 'Select at least one payment.' };

  let confirmed = 0;
  let failed = 0;
  for (const id of paymentIds) {
    const res = await confirmPaymentAction(id);
    if (res.ok) confirmed += 1;
    else failed += 1;
  }
  revalidatePath('/dashboard/manager');
  revalidatePath('/dashboard/owner');
  return { ok: true, confirmed, failed, total: paymentIds.length };
}

export async function rejectPaymentAction(
  paymentId: string,
  reason?: string,
): Promise<ActionResult> {
  const guard = await assertManagerOrOwner();
  if (guard.error) return { ok: false, error: guard.error };
  const { supabase, profile } = guard;

  // Try the atomic RPC first.
  try {
    const rpc = await supabase.rpc('reject_payment_atomic', {
      p_payment_id: paymentId,
      p_rejecter_id: profile.id,
      p_reason: reason || 'Rejected by manager',
    });
    if (!rpc.error) {
      revalidatePath('/dashboard/manager');
      revalidatePath('/dashboard/owner');
      return { ok: true, message: 'Payment rejected' };
    }
  } catch {
    // fall through
  }

  const { error } = await supabase
    .from('payments')
    .update({
      status: 'rejected',
      rejected_by: profile.id,
      rejected_at: new Date().toISOString(),
      rejection_reason: reason || 'Rejected by manager',
    })
    .eq('id', paymentId)
    .eq('status', 'pending')
    .eq('tenant_id', profile.tenant_id ?? '');

  if (error) return { ok: false, error: error.message };
  revalidatePath('/dashboard/manager');
  revalidatePath('/dashboard/owner');
  return { ok: true, message: 'Payment rejected' };
}

export async function approveStockRequestAction(
  requestId: string,
  notes?: string,
): Promise<ActionResult> {
  const guard = await assertManagerOrOwner();
  if (guard.error) return { ok: false, error: guard.error };
  const { supabase, profile } = guard;

  // Atomic RPC first; falls back to manual orchestration.
  try {
    const { data: req } = await supabase
      .from('stock_requests')
      .select(
        'id, rep_id, status, stock_request_items(product_id, quantity, unit_price)',
      )
      .eq('id', requestId)
      .eq('tenant_id', profile.tenant_id ?? '')
      .single();
    if (!req) return { ok: false, error: 'Request not found.' };
    if (req.status !== 'pending')
      return { ok: false, error: 'This request was already resolved.' };

    const items = ((req as { stock_request_items?: Array<{ product_id: string; quantity: number; unit_price: number | null }> }).stock_request_items ?? [])
      .filter((i) => Number(i.quantity ?? 0) > 0)
      .map((i) => ({
        product_id: i.product_id,
        quantity: Number(i.quantity ?? 0),
        unit_price: Number(i.unit_price ?? 0),
      }));

    try {
      const rpc = await supabase.rpc('approve_stock_request_atomic', {
        p_request_id: requestId,
        p_items: items,
        p_approver_id: profile.id,
        p_notes: notes || null,
      });
      if (!rpc.error) {
        revalidatePath('/dashboard/manager');
        revalidatePath('/dashboard/rep');
        return { ok: true, message: 'Stock request approved' };
      }
    } catch {
      /* fall through */
    }

    // Fallback: manual flip + holdings upsert + warehouse decrement.
    const { data: updRows, error: upErr } = await supabase
      .from('stock_requests')
      .update({
        status: 'approved',
        reviewed_by: profile.id,
        reviewed_at: new Date().toISOString(),
        notes: notes || null,
      })
      .eq('id', requestId)
      .eq('status', 'pending')
      .eq('tenant_id', profile.tenant_id ?? '')
      .select('id');
    if (upErr) return { ok: false, error: upErr.message };
    if (!updRows || updRows.length === 0)
      return { ok: false, error: 'Request was already resolved.' };

    // Decrement warehouse stock + upsert into rep_holdings for each item.
    for (const it of items) {
      const { data: prod } = await supabase
        .from('products')
        .select('stock_quantity')
        .eq('id', it.product_id)
        .eq('tenant_id', profile.tenant_id ?? '')
        .single();
      const onHand = Number(prod?.stock_quantity ?? 0);
      const dispatch = Math.min(it.quantity, onHand);
      await supabase
        .from('products')
        .update({ stock_quantity: Math.max(0, onHand - dispatch) })
        .eq('id', it.product_id);

      const { data: existing } = await supabase
        .from('rep_holdings')
        .select('id, quantity')
        .eq('rep_id', req.rep_id)
        .eq('product_id', it.product_id)
        .eq('tenant_id', profile.tenant_id ?? '')
        .maybeSingle();
      if (existing) {
        await supabase
          .from('rep_holdings')
          .update({
            quantity: Number(existing.quantity ?? 0) + dispatch,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
      } else {
        await supabase.from('rep_holdings').insert({
          rep_id: req.rep_id,
          product_id: it.product_id,
          tenant_id: profile.tenant_id,
          quantity: dispatch,
          debt_amount: 0,
        });
      }
    }

    revalidatePath('/dashboard/manager');
    revalidatePath('/dashboard/rep');
    return { ok: true, message: 'Stock request approved' };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function rejectStockRequestAction(
  requestId: string,
  reason?: string,
): Promise<ActionResult> {
  const guard = await assertManagerOrOwner();
  if (guard.error) return { ok: false, error: guard.error };
  const { supabase, profile } = guard;

  const { data, error } = await supabase
    .from('stock_requests')
    .update({
      status: 'rejected',
      reviewed_by: profile.id,
      reviewed_at: new Date().toISOString(),
      notes: reason || null,
    })
    .eq('id', requestId)
    .eq('status', 'pending')
    .eq('tenant_id', profile.tenant_id ?? '')
    .select('id');

  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0)
    return { ok: false, error: 'Request was already resolved.' };

  revalidatePath('/dashboard/manager');
  revalidatePath('/dashboard/rep');
  return { ok: true, message: 'Stock request rejected' };
}

export async function addExpenseAction(input: {
  category: string;
  amount: number;
  description: string;
  supplierId?: string | null;
}): Promise<ActionResult> {
  const guard = await assertManagerOrOwner();
  if (guard.error) return { ok: false, error: guard.error };
  const { supabase, profile } = guard;

  const category = input.category.trim();
  const description = input.description.trim();
  const amount = Number(input.amount);
  if (!category) return { ok: false, error: 'Pick a category.' };
  if (!description) return { ok: false, error: 'Add a short description.' };
  if (!Number.isFinite(amount) || amount <= 0)
    return { ok: false, error: 'Enter a positive amount.' };

  const { error } = await supabase.from('expenses').insert({
    tenant_id: profile.tenant_id,
    category,
    amount,
    description,
    supplier_id: input.supplierId || null,
    logged_by: profile.id,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath('/dashboard/manager');
  revalidatePath('/dashboard/owner');
  return { ok: true, message: `Logged ${category} expense` };
}
