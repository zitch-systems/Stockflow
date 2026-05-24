import { requireAuth } from '@/lib/guard';
import { createClient } from '@/lib/supabase/server';
import AdminWorkspace, { type AdminInitialData } from './AdminWorkspace';
import Banners from '@/components/dashboard/Banners';
import '@/app/dashboard/dashboard.css';

export const metadata = { title: 'Admin — StockFlow' };
export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  const ctx = await requireAuth(['super_admin']);
  const supabase = await createClient();
  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const [tenantsRes, usersRes, salesRes, paymentsRes] = await Promise.all([
    supabase
      .from('tenants')
      .select(
        'id, name, business_name, status, plan, subscription_expires_at, created_at, monthly_price, billing_cycle, suspended_at, suspension_reason',
      )
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('profiles')
      .select('id, full_name, role, tenant_id, is_active, created_at, phone')
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('sales')
      .select('id, total_value, tenant_id, created_at')
      .gte('created_at', since30)
      .limit(500),
    supabase
      .from('payments')
      .select('id, amount, tenant_id, confirmed_at, status')
      .eq('status', 'confirmed')
      .not('confirmed_at', 'is', null)
      .gte('confirmed_at', since30)
      .limit(500),
  ]);

  const initial: AdminInitialData = {
    tenants: tenantsRes.data ?? [],
    users: usersRes.data ?? [],
    sales: salesRes.data ?? [],
    payments: paymentsRes.data ?? [],
  };

  return (
    <>
      <Banners tenant={ctx.tenant} daysUntilExpiry={ctx.daysUntilExpiry} />
      <AdminWorkspace profile={ctx.profile} initial={initial} />
    </>
  );
}
