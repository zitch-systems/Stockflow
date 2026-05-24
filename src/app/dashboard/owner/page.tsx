import { requireAuth } from '@/lib/guard';
import { createClient } from '@/lib/supabase/server';
import Banners from '@/components/dashboard/Banners';
import OwnerWorkspace, { type OwnerInitialData } from './OwnerWorkspace';
import '@/app/dashboard/dashboard.css';

export const metadata = { title: 'Owner — StockFlow' };
export const dynamic = 'force-dynamic';

export default async function OwnerDashboardPage() {
  const ctx = await requireAuth(['owner']);
  const supabase = await createClient();
  const tenantId = ctx.profile.tenant_id;
  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const [salesRes, paymentsRes, staffRes, productsRes, pendingApprovalsRes] = await Promise.all([
    supabase
      .from('sales')
      .select('id, total_value, status, created_at, rep_id')
      .eq('tenant_id', tenantId ?? '')
      .gte('created_at', since30)
      .limit(1000),
    supabase
      .from('payments')
      .select('id, amount, status, confirmed_at, created_at')
      .eq('tenant_id', tenantId ?? '')
      .gte('created_at', since30)
      .limit(1000),
    supabase
      .from('profiles')
      .select('id, full_name, role, is_active, phone, created_at')
      .eq('tenant_id', tenantId ?? '')
      .order('created_at', { ascending: false }),
    supabase
      .from('products')
      .select('id, name, sku, stock_quantity, low_stock_threshold, buy_price, sell_price')
      .eq('tenant_id', tenantId ?? '')
      .limit(200),
    supabase
      .from('approvals')
      .select('id, kind, requested_by, status, created_at, payload')
      .eq('tenant_id', tenantId ?? '')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  const initial: OwnerInitialData = {
    sales: salesRes.data ?? [],
    payments: paymentsRes.data ?? [],
    staff: staffRes.data ?? [],
    products: productsRes.data ?? [],
    pendingApprovals: pendingApprovalsRes.data ?? [],
    businessMode: ctx.tenant?.business_mode ?? 'owner_rep',
    businessName:
      ctx.tenant?.business_name || ctx.tenant?.name || 'Your business',
  };

  return (
    <>
      <Banners tenant={ctx.tenant} daysUntilExpiry={ctx.daysUntilExpiry} />
      <OwnerWorkspace profile={ctx.profile} initial={initial} />
    </>
  );
}
