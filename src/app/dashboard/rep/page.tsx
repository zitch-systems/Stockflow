import DashboardStub from '@/components/dashboard/DashboardStub';
import { requireAuth } from '@/lib/guard';

export const metadata = { title: 'Sales Rep — StockFlow' };
export const dynamic = 'force-dynamic';

export default async function RepDashboardPage() {
  const ctx = await requireAuth(['rep']);
  return <DashboardStub title="Sales Rep" ctx={ctx} />;
}
