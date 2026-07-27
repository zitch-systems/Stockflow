'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import ThemeToggle from '@/components/ThemeToggle';
import { WEB_APP_URL } from '@/lib/roles';
import { getSupabase, isTransientFetchError } from '@/lib/supabase';

type Notice = { kind: 'error' | 'warn'; text: string; offerResend?: boolean } | null;

// Mirrors the web login flow (login.html): signInWithPassword → profile
// role/is_active check → route. The DB (RLS) is the trust boundary — these
// checks are UX only.
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  // Already signed in? Straight to home.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await getSupabase().auth.getSession();
      if (!cancelled && data.session) router.replace('/home');
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    setNotice(null);
    setLoading(true);
    const sb = getSupabase();

    try {
      const { data, error } = await sb.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error || !data.session) {
        let msg = error?.message || 'Sign in failed';
        if (msg.toLowerCase().includes('invalid')) msg = 'Email or password is incorrect.';
        throw new Error(msg);
      }

      const { data: profile, error: pe } = await sb
        .from('profiles')
        .select('role, is_active')
        .eq('id', data.session.user.id)
        .single();

      if (pe || !profile) {
        // Distinguish "profile row doesn't exist" (setup problem) from
        // "fetch failed" (network/transient) — the latter is retryable and
        // must not be reported as an account issue.
        if (pe && isTransientFetchError(pe)) throw pe;
        throw new Error(
          'Your account profile is not set up yet. If you were added as staff, ask your owner to check your account in the Staff tab. If you just signed up, make sure you confirmed your email first.',
        );
      }
      if (!profile.is_active) {
        await sb.auth.signOut();
        throw new Error('Your account is deactivated. Contact your administrator.');
      }

      router.replace('/home');
    } catch (err) {
      let msg = err instanceof Error ? err.message : 'Sign in failed';
      if (isTransientFetchError(err)) {
        msg = 'Could not reach StockFlow. Check your internet connection and try again.';
      }
      const lower = msg.toLowerCase();
      const unconfirmed =
        lower.includes('email not confirmed') ||
        lower.includes('confirm your email') ||
        lower.includes('confirmation');
      setNotice(
        unconfirmed
          ? {
              kind: 'error',
              text: 'Check your inbox and click the confirmation link first. ',
              offerResend: true,
            }
          : { kind: 'error', text: msg },
      );
      setLoading(false);
    }
  }

  const [resending, setResending] = useState(false);
  async function resendConfirmation() {
    if (resending) return;
    const addr = email.trim();
    if (!addr) return;
    setResending(true);
    // The app runs under a Capacitor/localhost origin, so point the confirmation
    // link at the hosted web app instead of the in-app origin (which Supabase
    // would reject and which has no login.html to land on).
    const { error } = await getSupabase().auth.resend({
      type: 'signup',
      email: addr,
      options: { emailRedirectTo: `${WEB_APP_URL}/login.html` },
    });
    setResending(false);
    if (error) {
      const em = (error.message || '').toLowerCase();
      const code = (error as { status?: number }).status ?? 0;
      let text: string;
      if (em.includes('already confirmed') || em.includes('already verified')) {
        text = '✓ This email is already confirmed — just sign in.';
      } else if (code === 429 || em.includes('rate') || em.includes('too many') || em.includes('over_email_send_rate_limit')) {
        text = 'Too many resend attempts. Please wait a minute and check your spam folder.';
      } else {
        text = 'Could not resend: ' + error.message;
      }
      setNotice({ kind: em.includes('already confirmed') || em.includes('already verified') ? 'warn' : 'error', text });
    } else {
      setNotice({ kind: 'warn', text: '✓ Confirmation email resent — check your inbox (and spam folder).' });
    }
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

      <main className="shell">
        <div className="card">
          <h1 className="card-title">Welcome back</h1>
          <p className="card-sub">Sign in to manage your stock, sales and payments.</p>

          <div className={`err ${notice ? 'show' : ''} ${notice?.kind === 'warn' ? 'warn' : ''}`} role="alert" aria-live="polite">
            {notice?.text}
            {notice?.offerResend && (
              <button
                type="button"
                onClick={resendConfirmation}
                disabled={resending}
                style={{ color: 'var(--brand-mid)', fontWeight: 600, textDecoration: 'underline', opacity: resending ? 0.6 : 1 }}
              >
                {resending ? 'Resending…' : 'Resend email'}
              </button>
            )}
          </div>

          <form onSubmit={onSubmit} noValidate>
            <div className="field">
              <label className="field-label" htmlFor="email">
                Email address
              </label>
              <input
                type="email"
                id="email"
                name="email"
                required
                autoComplete="email"
                placeholder="you@business.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="field pw-wrap">
              <label className="field-label" htmlFor="password">
                Password
              </label>
              <input
                type={showPwd ? 'text' : 'password'}
                id="password"
                name="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
                style={{ paddingRight: 42 }}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="pw-toggle"
                onClick={() => setShowPwd((v) => !v)}
                aria-label={showPwd ? 'Hide password' : 'Show password'}
                aria-pressed={showPwd}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  {showPwd ? (
                    <>
                      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </>
                  ) : (
                    <>
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </>
                  )}
                </svg>
              </button>
            </div>

            <div className="forgot-row">
              <a href={`${WEB_APP_URL}/forgot-password.html`} target="_blank" rel="noopener noreferrer">
                Forgot password?
              </a>
            </div>

            <button type="submit" className="btn" disabled={loading}>
              {loading && <span className="spinner" aria-hidden="true" />}
              <span>{loading ? 'Signing in…' : 'Sign In'}</span>
            </button>

            <div className="foot">
              Don&apos;t have an account?{' '}
              <a href={`${WEB_APP_URL}/signup.html`} target="_blank" rel="noopener noreferrer">
                Start a free trial
              </a>
            </div>
          </form>
        </div>
      </main>

      <div className="page-foot">© 2026 StockFlow</div>
    </>
  );
}
