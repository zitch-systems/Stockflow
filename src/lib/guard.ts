import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { dashboardForRole } from '@/lib/roles';
import type { Profile, Role, Tenant } from '@/lib/types';

export type AuthContext = {
  profile: Profile;
  tenant: Tenant | null;
  daysUntilExpiry: number | null;
};

export async function requireAuth(allowedRoles: Role[]): Promise<AuthContext> {
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

  const fullProfile: Profile = {
    ...(profile as Profile),
    email: user.email ?? undefined,
  };

  let tenant: Tenant | null = null;
  let daysUntilExpiry: number | null = null;

  if (profile.role !== 'super_admin' && profile.tenant_id) {
    const { data: t } = await supabase
      .from('tenants')
      .select(
        'id, status, suspension_reason, business_name, name, plan, subscription_expires_at, business_mode',
      )
      .eq('id', profile.tenant_id)
      .single();
    tenant = (t as Tenant) ?? null;
    if (tenant?.subscription_expires_at) {
      const ms = new Date(tenant.subscription_expires_at).getTime() - Date.now();
      daysUntilExpiry = Math.ceil(ms / 86_400_000);
    }
  }

  return { profile: fullProfile, tenant, daysUntilExpiry };
}
