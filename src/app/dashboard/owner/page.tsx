import { requireAuth } from '@/lib/guard';
import { createClient } from '@/lib/supabase/server';
import Banners from '@/components/dashboard/Banners';
import ImpersonationBanner from '@/components/dashboard/ImpersonationBanner';
import OwnerWorkspace, { type OwnerInitialData, type PLPeriod } from './OwnerWorkspace';
import '@/app/dashboard/dashboard.css';

export const metadata = { title: 'Owner — StockFlow' };
export const dynamic = 'force-dynamic';

type SaleWithItems = {
  id: string;
  total_value: number | null;
  status: string;
  created_at: string;
  sale_items: { quantity: number | null; buy_price_snapshot: number | null }[];
};

type Expense = { amount: number | null; created_at: string };

type Payment = {
  amount: number | null;
  status: string;
  confirmed_at: string | null;
};

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

function computePL(
  label: string,
  from: string,
  to: string,
  sales: SaleWithItems[],
  expenses: Expense[],
  payments: Payment[],
): PLPeriod {
  const inRange = (iso: string) => iso >= from && iso < to;
  const validSales = sales.filter(
    (s) => s.status !== 'cancelled' && inRange(s.created_at),
  );
  const revenue = validSales.reduce(
    (sum, s) => sum + Number(s.total_value ?? 0),
    0,
  );
  const cogs = validSales.reduce(
    (sum, s) =>
      sum +
      (s.sale_items ?? []).reduce(
        (ss, it) =>
          ss + Number(it.buy_price_snapshot ?? 0) * Number(it.quantity ?? 0),
        0,
      ),
    0,
  );
  const expensesTotal = expenses
    .filter((e) => inRange(e.created_at))
    .reduce((sum, e) => sum + Number(e.amount ?? 0), 0);
  const cash = payments
    .filter(
      (p) =>
        p.status === 'confirmed' &&
        p.confirmed_at != null &&
        inRange(p.confirmed_at),
    )
    .reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
  return {
    label,
    from,
    to,
    revenue,
    cogs,
    grossProfit: revenue - cogs,
    expenses: expensesTotal,
    netProfit: revenue - cogs - expensesTotal,
    cash,
    saleCount: validSales.length,
  };
}

export default async function OwnerDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ asTenant?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await requireAuth(['owner'], { asTenant: sp.asTenant ?? null });
  const supabase = await createClient();
  const tenantId = ctx.profile.tenant_id;
  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const now = new Date();
  const thisStart = startOfMonth(now).toISOString();
  const thisEnd = endOfMonth(now).toISOString();
  const lastStart = startOfMonth(
    new Date(now.getFullYear(), now.getMonth() - 1, 1),
  ).toISOString();
  const lastEnd = thisStart;
  const plRangeStart = lastStart; // pull enough rows to cover both periods

  const [salesRes, paymentsRes, staffRes, productsRes, pendingApprovalsRes, plSalesRes, expensesRes, auditRes] =
    await Promise.all([
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
        .gte('created_at', plRangeStart)
        .limit(2000),
      supabase
        .from('profiles')
        .select('id, full_name, role, is_active, phone, created_at')
        .eq('tenant_id', tenantId ?? '')
        .order('created_at', { ascending: false }),
      supabase
        .from('products')
        .select(
          'id, name, sku, stock_quantity, low_stock_threshold, buy_price, sell_price',
        )
        .eq('tenant_id', tenantId ?? '')
        .limit(200),
      supabase
        .from('approvals')
        .select('id, kind, requested_by, status, created_at, payload')
        .eq('tenant_id', tenantId ?? '')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('sales')
        .select(
          'id, total_value, status, created_at, sale_items(quantity, buy_price_snapshot)',
        )
        .eq('tenant_id', tenantId ?? '')
        .gte('created_at', plRangeStart)
        .limit(2000),
      supabase
        .from('expenses')
        .select('amount, created_at')
        .eq('tenant_id', tenantId ?? '')
        .gte('created_at', plRangeStart)
        .limit(2000),
      supabase
        .from('approval_history')
        .select(
          'id, record_type, record_id, actor_id, previous_status, new_status, notes, created_at',
        )
        .eq('tenant_id', tenantId ?? '')
        .order('created_at', { ascending: false })
        .limit(100),
    ]);

  const plSales = (plSalesRes.data ?? []) as SaleWithItems[];
  const expenses = (expensesRes.data ?? []) as Expense[];
  const allPayments = (paymentsRes.data ?? []) as Payment[];

  const initial: OwnerInitialData = {
    sales: salesRes.data ?? [],
    payments: allPayments,
    staff: staffRes.data ?? [],
    products: productsRes.data ?? [],
    pendingApprovals: pendingApprovalsRes.data ?? [],
    businessMode: ctx.tenant?.business_mode ?? 'owner_rep',
    businessName: ctx.tenant?.business_name || ctx.tenant?.name || 'Your business',
    pl: {
      thisMonth: computePL('This month', thisStart, thisEnd, plSales, expenses, allPayments),
      lastMonth: computePL('Last month', lastStart, lastEnd, plSales, expenses, allPayments),
    },
    auditEvents: auditRes.data ?? [],
  };

  return (
    <>
      {ctx.impersonating && (
        <ImpersonationBanner businessName={ctx.impersonating.businessName} />
      )}
      <Banners tenant={ctx.tenant} daysUntilExpiry={ctx.daysUntilExpiry} />
      <OwnerWorkspace profile={ctx.profile} initial={initial} />
    </>
  );
}
