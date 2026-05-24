'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

async function assertTenantedUser() {
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
  if (!profile.tenant_id)
    return { error: 'No tenant on profile' as const, supabase: null, profile: null };
  return { error: null, supabase, profile };
}

export type CustomerInput = {
  name: string;
  phone?: string;
  address?: string;
  notes?: string;
};

function validate(input: CustomerInput): string | null {
  if (!input.name?.trim()) return 'Customer name is required.';
  return null;
}

export async function createCustomerAction(
  input: CustomerInput,
): Promise<ActionResult> {
  const guard = await assertTenantedUser();
  if (guard.error) return { ok: false, error: guard.error };
  const err = validate(input);
  if (err) return { ok: false, error: err };

  const { error } = await guard.supabase.from('customers').insert({
    tenant_id: guard.profile.tenant_id,
    name: input.name.trim(),
    phone: input.phone?.trim() || null,
    address: input.address?.trim() || null,
    notes: input.notes?.trim() || null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath('/dashboard/rep');
  revalidatePath('/dashboard/manager');
  revalidatePath('/dashboard/owner');
  return { ok: true, message: 'Customer added' };
}

export async function updateCustomerAction(
  id: string,
  input: CustomerInput,
): Promise<ActionResult> {
  const guard = await assertTenantedUser();
  if (guard.error) return { ok: false, error: guard.error };
  const err = validate(input);
  if (err) return { ok: false, error: err };

  const { error } = await guard.supabase
    .from('customers')
    .update({
      name: input.name.trim(),
      phone: input.phone?.trim() || null,
      address: input.address?.trim() || null,
      notes: input.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('tenant_id', guard.profile.tenant_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/dashboard/rep');
  revalidatePath('/dashboard/manager');
  revalidatePath('/dashboard/owner');
  return { ok: true, message: 'Customer updated' };
}

export async function deleteCustomerAction(id: string): Promise<ActionResult> {
  const guard = await assertTenantedUser();
  if (guard.error) return { ok: false, error: guard.error };

  const { error } = await guard.supabase
    .from('customers')
    .delete()
    .eq('id', id)
    .eq('tenant_id', guard.profile.tenant_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/dashboard/rep');
  revalidatePath('/dashboard/manager');
  revalidatePath('/dashboard/owner');
  return { ok: true, message: 'Customer deleted' };
}
