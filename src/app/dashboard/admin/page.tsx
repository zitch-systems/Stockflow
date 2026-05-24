import DashboardStub from '@/components/dashboard/DashboardStub';
import { requireAuth } from '@/lib/guard';

export const metadata = { title: 'Admin — StockFlow' };
export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  const ctx = await requireAuth(['super_admin']);
  return <DashboardStub title="Admin" ctx={ctx} />;
}
