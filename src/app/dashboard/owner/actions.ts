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
