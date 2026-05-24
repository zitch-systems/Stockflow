import { logoutAction } from '@/app/(auth)/actions';
import type { Profile } from '@/lib/types';

export default function DashboardStub({
  title,
  profile,
}: {
  title: string;
  profile: Profile;
}) {
  return (
    <div
      className="flex min-h-screen flex-col"
      style={{ background: 'var(--bg)', color: 'var(--tp)' }}
    >
      <div
        className="flex h-[60px] items-center justify-between px-6"
        style={{ background: 'var(--brand)' }}
      >
        <div
          className="text-lg font-bold text-white"
          style={{ fontFamily: 'var(--font-sora)' }}
        >
          Stock<span style={{ color: 'var(--accent)' }}>Flow</span> · {title}
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="rounded-md px-3 py-1.5 text-[13px] font-semibold text-white transition hover:bg-white/20"
            style={{ background: 'rgba(255,255,255,.12)' }}
          >
            Sign out
          </button>
        </form>
      </div>
      <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <div
          className="rounded-2xl border p-8"
          style={{
            background: 'var(--surface)',
            borderColor: 'var(--border)',
            boxShadow: 'var(--shadow)',
          }}
        >
          <div
            className="mb-2 text-[11.5px] font-semibold uppercase tracking-[.14em]"
            style={{ color: 'var(--brand-mid)' }}
          >
            Migration in progress
          </div>
          <h1
            className="mb-2 text-3xl font-bold"
            style={{ fontFamily: 'var(--font-sora)' }}
          >
            {title} dashboard
          </h1>
          <p className="mb-6" style={{ color: 'var(--ts)' }}>
            Welcome back, {profile.full_name || profile.email}. The full
            dashboard is being ported from the legacy app — features will land
            here in upcoming sessions.
          </p>
          <dl
            className="grid grid-cols-2 gap-y-2 text-sm"
            style={{ color: 'var(--ts)' }}
          >
            <dt className="font-medium">Role</dt>
            <dd style={{ color: 'var(--tp)' }}>{profile.role}</dd>
            <dt className="font-medium">Tenant</dt>
            <dd style={{ color: 'var(--tp)' }}>
              {profile.tenant_id ?? '— (super admin)'}
            </dd>
            <dt className="font-medium">Email</dt>
            <dd style={{ color: 'var(--tp)' }}>{profile.email}</dd>
          </dl>
        </div>
      </div>
    </div>
  );
}
