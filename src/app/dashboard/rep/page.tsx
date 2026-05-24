import { requireAuth } from '@/lib/guard';
import { createClient } from '@/lib/supabase/server';
import Banners from '@/components/dashboard/Banners';
import RepWorkspace, { type RepInitialData } from './RepWorkspace';
import '@/app/dashboard/dashboard.css';

export const metadata = { title: 'Sales Rep — StockFlow' };
export const dynamic = 'force-dynamic';

export default async function RepDashboardPage() {
  const ctx = await requireAuth(['rep']);
  const supabase = await createClient();
  const repId = ctx.profile.id;
  const tenantId = ctx.profile.tenant_id;
  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [holdingsRes, salesRes, paymentsRes, productsRes, customersRes] = await Promise.all([
    supabase
      .from('rep_holdings')
      .select('product_id, quantity')
      .eq('rep_id', repId)
      .eq('tenant_id', tenantId ?? ''),
    supabase
      .from('sales')
      .select(
        'id, customer_name, total_value, total_cases, status, created_at, rep_id, sale_items(product_id, quantity, unit_price, products(name))',
      )
      .eq('rep_id', repId)
      .eq('tenant_id', tenantId ?? '')
      .gte('created_at', since30)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('payments')
      .select('id, amount, status, confirmed_at, created_at')
      .eq('rep_id', repId)
      .eq('tenant_id', tenantId ?? '')
      .gte('created_at', since30)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('products')
      .select('id, name, sku, sell_price, buy_price')
      .eq('tenant_id', tenantId ?? ''),
    supabase
      .from('customers')
      .select('id, name, phone, address, notes')
      .eq('tenant_id', tenantId ?? '')
      .order('name', { ascending: true })
      .limit(200),
  ]);

  const initial: RepInitialData = {
    holdings: holdingsRes.data ?? [],
    sales: salesRes.data ?? [],
    payments: paymentsRes.data ?? [],
    products: productsRes.data ?? [],
    customers: customersRes.data ?? [],
    todayIso: todayStart.toISOString(),
    businessName: ctx.tenant?.business_name || ctx.tenant?.name || 'Your business',
  };

  return (
    <>
      <Banners tenant={ctx.tenant} daysUntilExpiry={ctx.daysUntilExpiry} />
      <RepWorkspace profile={ctx.profile} initial={initial} />
    </>
  );
}
