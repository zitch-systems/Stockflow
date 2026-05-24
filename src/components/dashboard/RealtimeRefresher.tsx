'use client';

import { useRouter } from 'next/navigation';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

export default function RealtimeRefresher({
  tenantId,
  tables,
}: {
  tenantId: string | null;
  tables: string[];
}) {
  const router = useRouter();
  useRealtimeRefresh({
    tenantId,
    tables,
    onChange: () => router.refresh(),
  });
  return null;
}
