import DashboardStub from '@/components/dashboard/DashboardStub';
import { requireAuth } from '@/lib/guard';

export const metadata = { title: 'Manager — StockFlow' };
export const dynamic = 'force-dynamic';

export default async function ManagerDashboardPage() {
  const ctx = await requireAuth(['manager', 'owner']);
  return <DashboardStub title="Manager" ctx={ctx} />;
}
