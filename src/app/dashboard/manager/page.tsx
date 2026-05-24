import { requireAuth } from '@/lib/guard';
import { createClient } from '@/lib/supabase/server';
import Banners from '@/components/dashboard/Banners';
import ManagerWorkspace, { type ManagerInitialData } from './ManagerWorkspace';
import '@/app/dashboard/dashboard.css';

export const metadata = { title: 'Manager — StockFlow' };
export const dynamic = 'force-dynamic';

export default async function ManagerDashboardPage() {
  const ctx = await requireAuth(['manager', 'owner']);
  const supabase = await createClient();
  const tenantId = ctx.profile.tenant_id;
  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const [pendingPaymentsRes, warehouseRes, salesRes, repsRes, stockReqRes, expensesRes, invoiceSalesRes, suppliersRes, pendingReturnsRes] = await Promise.all([
    supabase
      .from('payments')
      .select('id, rep_id, amount, customer_name, method, created_at, status, note')
      .eq('tenant_id', tenantId ?? '')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('products')
      .select('id, name, sku, stock_quantity, low_stock_threshold')
      .eq('tenant_id', tenantId ?? '')
      .order('name', { ascending: true })
      .limit(50),
    supabase
      .from('sales')
      .select('id, total_value, status, created_at')
      .eq('tenant_id', tenantId ?? '')
      .gte('created_at', since30)
      .limit(500),
    supabase
      .from('profiles')
      .select('id, full_name, role, is_active')
      .eq('tenant_id', tenantId ?? '')
      .eq('role', 'rep'),
    supabase
      .from('stock_requests')
      .select(
        'id, rep_id, status, created_at, notes, total_cases, total_value, stock_request_items(product_id, quantity, unit_price)',
      )
      .eq('tenant_id', tenantId ?? '')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('expenses')
      .select('id, category, amount, description, created_at, logged_by')
      .eq('tenant_id', tenantId ?? '')
      .gte('created_at', since30)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('sales')
      .select(
        'id, customer_name, total_value, total_cases, status, created_at, rep_id, sale_items(product_id, quantity, unit_price, products(name))',
      )
      .eq('tenant_id', tenantId ?? '')
      .gte('created_at', since30)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('suppliers')
      .select('id, name, phone, contact_name, notes')
      .eq('tenant_id', tenantId ?? '')
      .order('name', { ascending: true })
      .limit(200),
    supabase
      .from('product_returns')
      .select('id, rep_id, product_id, quantity, reason, status, created_at, products(name)')
      .eq('tenant_id', tenantId ?? '')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  const initial: ManagerInitialData = {
    pendingPayments: pendingPaymentsRes.data ?? [],
    products: warehouseRes.data ?? [],
    sales: salesRes.data ?? [],
    reps: repsRes.data ?? [],
    pendingStockRequests: stockReqRes.data ?? [],
    expenses: expensesRes.data ?? [],
    invoiceSales: invoiceSalesRes.data ?? [],
    suppliers: suppliersRes.data ?? [],
    pendingReturns: pendingReturnsRes.data ?? [],
    businessName: ctx.tenant?.business_name || ctx.tenant?.name || 'Your business',
  };

  return (
    <>
      <Banners tenant={ctx.tenant} daysUntilExpiry={ctx.daysUntilExpiry} />
      <ManagerWorkspace profile={ctx.profile} initial={initial} />
    </>
  );
}
