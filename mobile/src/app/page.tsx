'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { getSupabase } from '@/lib/supabase';

// Entry splash: decide where to go based on the persisted Supabase session.
export default function IndexPage() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await getSupabase().auth.getSession();
      if (cancelled) return;
      router.replace(data.session ? '/home' : '/login');
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="splash">
      <div className="brand-mark">S</div>
      <div className="brand-text" style={{ color: 'var(--tp)' }}>
        Stock<span>Flow</span>
      </div>
      <div className="spinner spinner--brand" role="status" aria-label="Loading" />
    </main>
  );
}
