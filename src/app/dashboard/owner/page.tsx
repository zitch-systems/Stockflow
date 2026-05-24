import DashboardStub from '@/components/dashboard/DashboardStub';
import { requireAuth } from '@/lib/guard';

export const metadata = { title: 'Owner — StockFlow' };
export const dynamic = 'force-dynamic';

export default async function OwnerDashboardPage() {
  const profile = await requireAuth(['owner']);
  return <DashboardStub title="Owner" profile={profile} />;
}
