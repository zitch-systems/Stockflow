'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import ThemeToggle from '@/components/ThemeToggle';
import { roleLabel, webDashboardForRole } from '@/lib/roles';
import { getSupabase } from '@/lib/supabase';

type Profile = {
  id: string;
  tenant_id: string | null;
  full_name: string | null;
  role: string | null;
  phone: string | null;
  is_active: boolean;
};

type State =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; profile: Profile; email: string };

// Authenticated landing screen. Native dashboards will grow here; until then
// it hands off to the role's full dashboard on the web app.
export default function HomePage() {
  const router = useRouter();
  const [state, setState] = useState<State>({ phase: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sb = getSupabase();
      const { data } = await sb.auth.getSession();
      if (cancelled) return;
      if (!data.session) {
        router.replace('/login');
        return;
      }

      const { data: profile, error } = await sb
        .from('profiles')
        .select('id, tenant_id, full_name, role, phone, is_active')
        .eq('id', data.session.user.id)
        .single();
      if (cancelled) return;

      if (error || !profile) {
        setState({
          phase: 'error',
          message:
            'Could not load your profile. If you just signed up, confirm your email first — otherwise ask your owner to check your account.',
        });
        return;
      }
      if (!profile.is_active) {
        await sb.auth.signOut();
        if (!cancelled) router.replace('/login');
        return;
      }
      setState({ phase: 'ready', profile, email: data.session.user.email ?? '' });
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function signOut() {
    await getSupabase().auth.signOut();
    router.replace('/login');
  }

  if (state.phase === 'loading') {
    return (
      <main className="splash">
        <div className="brand-mark">S</div>
        <div className="spinner spinner--brand" role="status" aria-label="Loading" />
      </main>
    );
  }

  return (
    <>
      <header className="topbar">
        <Link href="/" className="brand" aria-label="StockFlow home">
          <div className="brand-mark">S</div>
          <div className="brand-text">
            Stock<span>Flow</span>
          </div>
        </Link>
        <div className="topbar-right">
          <ThemeToggle />
        </div>
      </header>

      <main className="shell shell--top">
        <div className="card">
          {state.phase === 'error' ? (
            <>
              <h1 className="card-title">Something went wrong</h1>
              <div className="err show" role="alert">
                {state.message}
              </div>
              <button type="button" className="btn btn--ghost" onClick={signOut}>
                Sign out and try again
              </button>
            </>
          ) : (
            <>
              <div className="profile-row">
                <div className="avatar" aria-hidden="true">
                  {(state.profile.full_name || state.email || 'S').trim().charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="profile-name">{state.profile.full_name || 'There you are!'}</div>
                  <div className="profile-mail">{state.email}</div>
                </div>
              </div>

              <span className="chip">{roleLabel(state.profile.role)}</span>

              <div className="action-list">
                <a
                  className="action"
                  href={webDashboardForRole(state.profile.role)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className="action-ico" aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="7" height="9" rx="1" />
                      <rect x="14" y="3" width="7" height="5" rx="1" />
                      <rect x="14" y="12" width="7" height="9" rx="1" />
                      <rect x="3" y="16" width="7" height="5" rx="1" />
                    </svg>
                  </span>
                  <span className="action-body">
                    <span className="action-title">Open your dashboard</span>
                    <br />
                    <span className="action-sub">Sales, stock and payments on the web app</span>
                  </span>
                </a>
              </div>

              <p className="card-sub" style={{ marginBottom: 16 }}>
                You&apos;re signed in on the StockFlow mobile app. Native sales and inventory
                screens land here next — your account and data are shared with the web app.
              </p>

              <button type="button" className="btn btn--danger-ghost" onClick={signOut}>
                Sign out
              </button>
            </>
          )}
        </div>
      </main>

      <div className="page-foot">© 2026 StockFlow</div>
    </>
  );
}
