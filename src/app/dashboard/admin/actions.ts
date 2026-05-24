'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

async function assertSuperAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' as const, supabase: null, profile: null };
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, is_active')
    .eq('id', user.id)
    .single();
  if (!profile || !profile.is_active)
    return { error: 'Account inactive' as const, supabase: null, profile: null };
  if (profile.role !== 'super_admin')
    return { error: 'Super-admin only' as const, supabase: null, profile: null };
  return { error: null, supabase, profile };
}

export async function bulkExtendSubscriptionsAction(days: number): Promise<ActionResult> {
  const guard = await assertSuperAdmin();
  if (guard.error) return { ok: false, error: guard.error };
  const { supabase } = guard;

  if (!Number.isFinite(days) || days <= 0)
    return { ok: false, error: 'Days must be a positive number.' };

  const { data, error } = await supabase
    .from('tenants')
    .select('id, subscription_expires_at, status')
    .in('status', ['active', 'trial']);
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0)
    return { ok: false, error: 'No active or trial tenants to extend.' };

  const now = Date.now();
  let extended = 0;
  for (const t of data) {
    const base = t.subscription_expires_at
      ? Math.max(new Date(t.subscription_expires_at).getTime(), now)
      : now;
    const next = new Date(base + days * 86_400_000).toISOString();
    const { error: upErr } = await supabase
      .from('tenants')
      .update({ subscription_expires_at: next })
      .eq('id', t.id);
    if (!upErr) extended += 1;
  }
  revalidatePath('/dashboard/admin');
  return { ok: true, message: `Extended ${extended} tenant${extended === 1 ? '' : 's'} by ${days} day${days === 1 ? '' : 's'}` };
}

export async function setTenantStatusAction(
  tenantId: string,
  status: 'active' | 'suspended',
  reason?: string,
): Promise<ActionResult> {
  const guard = await assertSuperAdmin();
  if (guard.error) return { ok: false, error: guard.error };
  const { supabase } = guard;

  const patch: Record<string, unknown> = { status };
  if (status === 'suspended') {
    patch.suspended_at = new Date().toISOString();
    patch.suspension_reason = reason || 'Suspended by admin';
  } else {
    patch.suspended_at = null;
    patch.suspension_reason = null;
  }

  const { error } = await supabase.from('tenants').update(patch).eq('id', tenantId);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/dashboard/admin');
  return {
    ok: true,
    message: status === 'suspended' ? 'Tenant suspended' : 'Tenant reactivated',
  };
}
