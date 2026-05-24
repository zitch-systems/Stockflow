'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

export function useRealtimeRefresh({
  tenantId,
  tables,
  onChange,
  debounceMs = 350,
}: {
  tenantId: string | null;
  tables: string[];
  onChange: () => void;
  debounceMs?: number;
}) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!tenantId || tables.length === 0) return;
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const debounced = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => onChangeRef.current(), debounceMs);
    };
    const channel = supabase.channel(`sf-tenant-${tenantId}`);
    for (const table of tables) {
      channel.on(
        // @ts-expect-error - supabase-js postgres_changes typing is loose
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          filter: `tenant_id=eq.${tenantId}`,
        },
        debounced,
      );
    }
    channel.subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [tenantId, tables.join(','), debounceMs]); // eslint-disable-line react-hooks/exhaustive-deps
}
