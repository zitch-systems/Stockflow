'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' as const, supabase: null, user: null };
  return { error: null, supabase, user };
}

export async function updateProfileAction(input: {
  fullName: string;
  phone?: string;
}): Promise<ActionResult> {
  const guard = await getCurrentUser();
  if (guard.error) return { ok: false, error: guard.error };
  const { supabase, user } = guard;

  const fullName = input.fullName.trim();
  if (!fullName) return { ok: false, error: 'Name is required.' };

  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: fullName,
      phone: input.phone?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/dashboard/admin');
  revalidatePath('/dashboard/rep');
  revalidatePath('/dashboard/manager');
  revalidatePath('/dashboard/owner');
  return { ok: true, message: 'Profile updated' };
}

export async function changePasswordAction(input: {
  password: string;
  confirm: string;
}): Promise<ActionResult> {
  const guard = await getCurrentUser();
  if (guard.error) return { ok: false, error: guard.error };
  const { supabase } = guard;

  if (input.password.length < 8)
    return { ok: false, error: 'Password must be at least 8 characters.' };
  if (input.password !== input.confirm)
    return { ok: false, error: 'Passwords do not match.' };

  const { error } = await supabase.auth.updateUser({ password: input.password });
  if (error) return { ok: false, error: error.message };
  return { ok: true, message: 'Password changed' };
}
