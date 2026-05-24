import DashboardStub from '@/components/dashboard/DashboardStub';
import { requireAuth } from '@/lib/guard';

export const metadata = { title: 'Owner — StockFlow' };
export const dynamic = 'force-dynamic';

export default async function OwnerDashboardPage() {
  const ctx = await requireAuth(['owner']);
  return <DashboardStub title="Owner" ctx={ctx} />;
}
