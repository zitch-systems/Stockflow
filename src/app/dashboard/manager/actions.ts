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
