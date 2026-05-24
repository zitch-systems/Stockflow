'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

async function assertOwner() {
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
  if (profile.role !== 'owner')
    return { error: 'Only the owner can do this' as const, supabase: null, profile: null };
  return { error: null, supabase, profile };
}

export async function resolveApprovalAction(
  approvalId: string,
  decision: 'approved' | 'rejected',
  notes?: string,
): Promise<ActionResult> {
  const guard = await assertOwner();
  if (guard.error) return { ok: false, error: guard.error };
  const { supabase, profile } = guard;

  const { data, error } = await supabase
    .from('approvals')
    .update({
      status: decision,
      reviewed_by: profile.id,
      reviewed_at: new Date().toISOString(),
      review_notes: notes || null,
    })
    .eq('id', approvalId)
    .eq('status', 'pending')
    .eq('tenant_id', profile.tenant_id ?? '')
    .select('id');

  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0)
    return { ok: false, error: 'This request was already resolved.' };

  revalidatePath('/dashboard/owner');
  return {
    ok: true,
    message: decision === 'approved' ? 'Approved' : 'Rejected',
  };
}

export type PLPayload = {
  from: string;
  to: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  expenses: number;
  netProfit: number;
  cash: number;
  saleCount: number;
};

export type PLResult = { ok: true; data: PLPayload } | { ok: false; error: string };

export async function computeCustomPL(input: {
  from: string;
  to: string;
}): Promise<PLResult> {
  const guard = await assertOwner();
  if (guard.error) return { ok: false, error: guard.error };
  const { supabase, profile } = guard;

  // Validate the range.
  const fromDate = new Date(input.from);
  const toDate = new Date(input.to);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()))
    return { ok: false, error: 'Invalid date.' };
  if (fromDate >= toDate) return { ok: false, error: '"From" must be before "To".' };
  const days = (toDate.getTime() - fromDate.getTime()) / 86_400_000;
  if (days > 366) return { ok: false, error: 'Range cannot exceed 366 days.' };

  const fromIso = fromDate.toISOString();
  const toIso = toDate.toISOString();

  const [salesRes, expensesRes, paymentsRes] = await Promise.all([
    supabase
      .from('sales')
      .select(
        'id, total_value, status, created_at, sale_items(quantity, buy_price_snapshot)',
      )
      .eq('tenant_id', profile.tenant_id ?? '')
      .gte('created_at', fromIso)
      .lt('created_at', toIso)
      .limit(5000),
    supabase
      .from('expenses')
      .select('amount, created_at')
      .eq('tenant_id', profile.tenant_id ?? '')
      .gte('created_at', fromIso)
      .lt('created_at', toIso)
      .limit(5000),
    supabase
      .from('payments')
      .select('amount, status, confirmed_at')
      .eq('tenant_id', profile.tenant_id ?? '')
      .eq('status', 'confirmed')
      .not('confirmed_at', 'is', null)
      .gte('confirmed_at', fromIso)
      .lt('confirmed_at', toIso)
      .limit(5000),
  ]);

  const sales = (salesRes.data ?? []) as Array<{
    total_value: number | null;
    status: string;
    sale_items: { quantity: number | null; buy_price_snapshot: number | null }[];
  }>;
  const validSales = sales.filter((s) => s.status !== 'cancelled');

  const revenue = validSales.reduce(
    (s, r) => s + Number(r.total_value ?? 0),
    0,
  );
  const cogs = validSales.reduce(
    (sum, s) =>
      sum +
      (s.sale_items ?? []).reduce(
        (ss, it) =>
          ss + Number(it.buy_price_snapshot ?? 0) * Number(it.quantity ?? 0),
        0,
      ),
    0,
  );
  const expenses = (expensesRes.data ?? []).reduce(
    (s, e) => s + Number((e as { amount: number | null }).amount ?? 0),
    0,
  );
  const cash = (paymentsRes.data ?? []).reduce(
    (s, p) => s + Number((p as { amount: number | null }).amount ?? 0),
    0,
  );

  return {
    ok: true,
    data: {
      from: fromIso,
      to: toIso,
      revenue,
      cogs,
      grossProfit: revenue - cogs,
      expenses,
      netProfit: revenue - cogs - expenses,
      cash,
      saleCount: validSales.length,
    },
  };
}
