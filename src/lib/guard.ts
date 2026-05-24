import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { dashboardForRole } from '@/lib/roles';
import type { Profile, Role, Tenant } from '@/lib/types';

export type AuthContext = {
  profile: Profile;
  tenant: Tenant | null;
  daysUntilExpiry: number | null;
  impersonating: { tenantId: string; businessName: string } | null;
};

export async function requireAuth(
  allowedRoles: Role[],
  opts?: { asTenant?: string | null },
): Promise<AuthContext> {
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

  const wantsImpersonate = opts?.asTenant && opts.asTenant.length > 0;
  const isSuperAdmin = profile.role === 'super_admin';

  // Role check, with super_admin allowed to bypass when impersonating.
  if (!allowedRoles.includes(profile.role as Role)) {
    if (!(isSuperAdmin && wantsImpersonate)) {
      redirect(dashboardForRole(profile.role as Role));
    }
  }

  // Determine effective tenant.
  let effectiveTenantId = profile.tenant_id;
  let impersonating: AuthContext['impersonating'] = null;

  if (wantsImpersonate) {
    if (!isSuperAdmin) {
      // Silently strip the param if a non-admin tried to use it.
      effectiveTenantId = profile.tenant_id;
    } else {
      effectiveTenantId = opts!.asTenant!;
    }
  }

  const fullProfile: Profile = {
    ...(profile as Profile),
    tenant_id: effectiveTenantId,
    email: user.email ?? undefined,
  };

  let tenant: Tenant | null = null;
  let daysUntilExpiry: number | null = null;

  if (effectiveTenantId) {
    const { data: t } = await supabase
      .from('tenants')
      .select(
        'id, status, suspension_reason, business_name, name, plan, subscription_expires_at, business_mode',
      )
      .eq('id', effectiveTenantId)
      .single();
    tenant = (t as Tenant) ?? null;
    if (tenant?.subscription_expires_at) {
      const ms = new Date(tenant.subscription_expires_at).getTime() - Date.now();
      daysUntilExpiry = Math.ceil(ms / 86_400_000);
    }
  }

  if (wantsImpersonate && isSuperAdmin && tenant) {
    impersonating = {
      tenantId: tenant.id,
      businessName: tenant.business_name || tenant.name || 'Tenant',
    };
  }

  return { profile: fullProfile, tenant, daysUntilExpiry, impersonating };
}
