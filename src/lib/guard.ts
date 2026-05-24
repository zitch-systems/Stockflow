import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { dashboardForRole } from '@/lib/roles';
import type { Profile, Role } from '@/lib/types';

export async function requireAuth(allowedRoles: Role[]): Promise<Profile> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, tenant_id, full_name, role, phone, is_active')
    .eq('id', user.id)
    .single();

  if (error || !profile) redirect('/login?err=profile_missing');
  if (!profile.is_active) {
    await supabase.auth.signOut();
    redirect('/login');
  }
  if (!allowedRoles.includes(profile.role as Role)) {
    redirect(dashboardForRole(profile.role as Role));
  }
  return { ...(profile as Profile), email: user.email ?? undefined };
}
