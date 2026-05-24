import Link from 'next/link';
import Topbar from '@/components/Topbar';

export const metadata = { title: 'StockFlow — Sales & inventory for distributors' };

export default function LandingPage() {
  return (
    <>
      <Topbar rightLabel="Already a user?" cta={{ label: 'Sign in', href: '/login' }} />
      <main
        className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center"
        style={{ background: 'var(--bg)' }}
      >
        <div
          className="mb-3 text-[11.5px] font-semibold uppercase tracking-[.14em]"
          style={{ color: 'var(--brand-mid)' }}
        >
          Built for Nigerian distributors
        </div>
        <h1
          className="mb-4 max-w-2xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl"
          style={{ fontFamily: 'var(--font-sora)', color: 'var(--tp)' }}
        >
          Sell faster. Track stock. Get paid.
        </h1>
        <p
          className="mb-8 max-w-xl text-lg"
          style={{ color: 'var(--ts)' }}
        >
          StockFlow gives owners, managers, and sales reps a single place to
          run the business — from invoices to inventory to outstanding debts.
        </p>
        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <Link
            href="/signup"
            className="rounded-lg px-6 py-3 text-[14.5px] font-semibold text-white transition hover:brightness-110"
            style={{
              background: 'var(--accent)',
              fontFamily: 'var(--font-sora)',
              boxShadow: '0 6px 16px rgba(249,115,22,.3)',
            }}
          >
            Start free trial
          </Link>
          <Link
            href="/login"
            className="rounded-lg border px-6 py-3 text-[14.5px] font-semibold transition"
            style={{
              borderColor: 'var(--border)',
              color: 'var(--tp)',
              background: 'var(--surface)',
            }}
          >
            Sign in
          </Link>
        </div>
        <p
          className="mt-8 max-w-md text-sm"
          style={{ color: 'var(--tm)' }}
        >
          Full marketing landing page is being ported from the legacy app.
        </p>
      </main>
      <div
        className="border-t px-6 py-6 text-center text-[13px]"
        style={{
          background: 'var(--surface)',
          borderColor: 'var(--border)',
          color: 'var(--tm)',
        }}
      >
        © 2026 StockFlow
      </div>
    </>
  );
}
