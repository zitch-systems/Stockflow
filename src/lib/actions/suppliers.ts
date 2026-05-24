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
  if (!profile || !profile.is_active)
    return { error: 'Account inactive' as const, supabase: null, profile: null };
  if (profile.role !== 'owner' && profile.role !== 'manager')
    return { error: 'Only owners or managers can manage suppliers' as const, supabase: null, profile: null };
  if (!profile.tenant_id)
    return { error: 'No tenant on profile' as const, supabase: null, profile: null };
  return { error: null, supabase, profile };
}

export type SupplierInput = {
  name: string;
  phone?: string;
  contactName?: string;
  notes?: string;
};

function validate(input: SupplierInput): string | null {
  if (!input.name?.trim()) return 'Supplier name is required.';
  return null;
}

export async function createSupplierAction(
  input: SupplierInput,
): Promise<ActionResult> {
  const guard = await assertManagerOrOwner();
  if (guard.error) return { ok: false, error: guard.error };
  const err = validate(input);
  if (err) return { ok: false, error: err };

  const { error } = await guard.supabase.from('suppliers').insert({
    tenant_id: guard.profile.tenant_id,
    name: input.name.trim(),
    phone: input.phone?.trim() || null,
    contact_name: input.contactName?.trim() || null,
    notes: input.notes?.trim() || null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath('/dashboard/manager');
  revalidatePath('/dashboard/owner');
  return { ok: true, message: 'Supplier added' };
}

export async function updateSupplierAction(
  id: string,
  input: SupplierInput,
): Promise<ActionResult> {
  const guard = await assertManagerOrOwner();
  if (guard.error) return { ok: false, error: guard.error };
  const err = validate(input);
  if (err) return { ok: false, error: err };

  const { error } = await guard.supabase
    .from('suppliers')
    .update({
      name: input.name.trim(),
      phone: input.phone?.trim() || null,
      contact_name: input.contactName?.trim() || null,
      notes: input.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('tenant_id', guard.profile.tenant_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/dashboard/manager');
  revalidatePath('/dashboard/owner');
  return { ok: true, message: 'Supplier updated' };
}

export async function deleteSupplierAction(id: string): Promise<ActionResult> {
  const guard = await assertManagerOrOwner();
  if (guard.error) return { ok: false, error: guard.error };

  const { error } = await guard.supabase
    .from('suppliers')
    .delete()
    .eq('id', id)
    .eq('tenant_id', guard.profile.tenant_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/dashboard/manager');
  revalidatePath('/dashboard/owner');
  return { ok: true, message: 'Supplier deleted' };
}
