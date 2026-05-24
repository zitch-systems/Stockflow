'use client';

import { useMemo, useState } from 'react';
import Sidebar, { type NavItem } from '@/components/dashboard/Sidebar';
import PageStub from '@/components/dashboard/PageStub';
import SettingsTab from '@/components/dashboard/SettingsTab';
import { formatDate, formatDateTime, formatNaira } from '@/lib/format';
import type { Profile } from '@/lib/types';
import PlatformConfigForm from './PlatformConfigForm';
import TenantStatusButtons from './TenantStatusButtons';

type TenantRow = {
  id: string;
  name: string | null;
  business_name: string | null;
  status: string | null;
  plan: string | null;
  subscription_expires_at: string | null;
  created_at: string;
  monthly_price: number | null;
  billing_cycle: string | null;
  suspended_at: string | null;
  suspension_reason: string | null;
};

type UserRow = {
  id: string;
  full_name: string | null;
  role: string;
  tenant_id: string | null;
  is_active: boolean;
  created_at: string;
  phone: string | null;
};

type SaleRow = {
  id: string;
  total_value: number | null;
  tenant_id: string | null;
  created_at: string;
};

type PaymentRow = {
  id: string;
  amount: number | null;
  tenant_id: string | null;
  confirmed_at: string | null;
  status: string;
};

export type AdminInitialData = {
  tenants: TenantRow[];
  users: UserRow[];
  sales: SaleRow[];
  payments: PaymentRow[];
};

const ICONS = {
  home: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 12L12 4l9 8M5 10v10h4v-6h6v6h4V10" />
    </svg>
  ),
  tenants: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 21h18M5 21V8l7-4 7 4v13M9 9h.01M9 12h.01M9 15h.01M9 18h.01M14 9h.01M14 12h.01M14 15h.01M14 18h.01" />
    </svg>
  ),
  users: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </svg>
  ),
  revenue: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
    </svg>
  ),
  audit: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  ),
  config: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  ),
  settings: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
};

const NAV: NavItem[] = [
  { key: 'home', label: 'Overview', icon: ICONS.home, section: 'Overview' },
  { key: 'tenants', label: 'Tenants', icon: ICONS.tenants, section: 'Manage' },
  { key: 'users', label: 'Users', icon: ICONS.users },
  { key: 'revenue', label: 'Revenue', icon: ICONS.revenue },
  { key: 'audit', label: 'Activity Log', icon: ICONS.audit },
  { key: 'platform', label: 'Platform Config', icon: ICONS.config, section: 'Settings' },
  { key: 'settings', label: 'My Account', icon: ICONS.settings },
];

export default function AdminWorkspace({
  profile,
  initial,
}: {
  profile: Profile;
  initial: AdminInitialData;
}) {
  const [tab, setTab] = useState('home');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="dash-shell">
      <Sidebar
        brandRoleLabel="Super Admin"
        items={NAV}
        active={tab}
        onSelect={setTab}
        profile={profile}
        open={sidebarOpen}
        onCloseMobile={() => setSidebarOpen(false)}
      />
      <main className="dash-main">
        <MobileBar onToggle={() => setSidebarOpen((s) => !s)} title="Admin" />
        {tab === 'home' && <HomeTab profile={profile} initial={initial} onJump={setTab} />}
        {tab === 'tenants' && <TenantsTab initial={initial} />}
        {tab === 'users' && <UsersTab initial={initial} />}
        {tab === 'revenue' && <RevenueTab initial={initial} />}
        {tab === 'audit' && <AuditTab initial={initial} />}
        {tab === 'platform' && <PlatformTab initial={initial} />}
        {tab === 'settings' && <SettingsTab profile={profile} />}
      </main>
    </div>
  );
}

function MobileBar({ onToggle, title }: { onToggle: () => void; title: string }) {
  return (
    <div className="dash-mobile-bar">
      <button type="button" className="dash-burger" onClick={onToggle} aria-label="Menu">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
      <div
        style={{
          fontFamily: 'var(--font-sora)',
          fontWeight: 700,
          fontSize: 16,
        }}
      >
        StockFlow · {title}
      </div>
      <div style={{ width: 38 }} />
    </div>
  );
}

function HomeTab({
  profile,
  initial,
  onJump,
}: {
  profile: Profile;
  initial: AdminInitialData;
  onJump: (k: string) => void;
}) {
  const stats = useMemo(() => {
    const salesTotal = initial.sales.reduce((s, r) => s + Number(r.total_value || 0), 0);
    const cashTotal = initial.payments.reduce((s, r) => s + Number(r.amount || 0), 0);
    const activeTenants = initial.tenants.filter((t) => t.status !== 'suspended').length;
    const reps = initial.users.filter((u) => u.role === 'rep' && u.is_active).length;
    return { salesTotal, cashTotal, activeTenants, reps };
  }, [initial]);

  const recentTenants = initial.tenants.slice(0, 6);
  const recentActivity = useMemo(() => {
    type Ev = { when: string; kind: string; tenant: string; detail: string };
    const tenantById = new Map(initial.tenants.map((t) => [t.id, t]));
    const events: Ev[] = [];
    for (const s of initial.sales) {
      const t = tenantById.get(s.tenant_id ?? '');
      events.push({
        when: s.created_at,
        kind: 'Sale',
        tenant: t?.business_name || t?.name || '—',
        detail: formatNaira(Number(s.total_value ?? 0)),
      });
    }
    for (const p of initial.payments) {
      if (!p.confirmed_at) continue;
      const t = tenantById.get(p.tenant_id ?? '');
      events.push({
        when: p.confirmed_at,
        kind: 'Payment',
        tenant: t?.business_name || t?.name || '—',
        detail: formatNaira(Number(p.amount ?? 0)),
      });
    }
    return events.sort((a, b) => (a.when < b.when ? 1 : -1)).slice(0, 8);
  }, [initial]);

  const today = new Date().toLocaleDateString('en-NG', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });
  const firstName = (profile.full_name || profile.email || 'there').split(/\s+/)[0];

  return (
    <>
      <div className="dash-page-header">
        <div className="dash-page-block">
          <div className="dash-page-eyebrow">{today}</div>
          <h1 className="dash-page-title">
            Welcome back<span style={{ color: 'var(--tm)' }}>, </span>
            {firstName}
          </h1>
          <p className="dash-page-sub">Here&apos;s how your platform is doing today.</p>
        </div>
      </div>

      <div className="dash-stats">
        <Stat label="Active tenants" value={String(stats.activeTenants)} />
        <Stat label="Active reps" value={String(stats.reps)} />
        <Stat label="Sales · 30d" value={formatNaira(stats.salesTotal)} />
        <Stat label="Cash collected · 30d" value={formatNaira(stats.cashTotal)} tone="ok" />
      </div>

      <section className="dash-section">
        <div className="dash-section-header">
          <h2 className="dash-section-title">Recent tenants</h2>
          <button
            type="button"
            className="dash-nav-link"
            style={{ background: 'none', padding: '4px 10px', color: 'var(--brand-mid)' }}
            onClick={() => onJump('tenants')}
          >
            View all →
          </button>
        </div>
        <div className="dash-table-wrap">
          <table className="dash-table">
            <thead>
              <tr>
                <th>Business</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {recentTenants.length === 0 && (
                <tr>
                  <td colSpan={4} className="dash-empty">
                    No tenants yet.
                  </td>
                </tr>
              )}
              {recentTenants.map((t) => (
                <tr key={t.id}>
                  <td>{t.business_name || t.name || '—'}</td>
                  <td>{t.plan || '—'}</td>
                  <td>
                    <StatusBadge status={t.status} />
                  </td>
                  <td style={{ color: 'var(--ts)' }}>{formatDate(t.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="dash-section">
        <div className="dash-section-header">
          <h2 className="dash-section-title">Recent activity</h2>
          <button
            type="button"
            className="dash-nav-link"
            style={{ background: 'none', padding: '4px 10px', color: 'var(--brand-mid)' }}
            onClick={() => onJump('audit')}
          >
            View all →
          </button>
        </div>
        <div className="dash-table-wrap">
          <table className="dash-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Kind</th>
                <th>Tenant</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {recentActivity.length === 0 && (
                <tr>
                  <td colSpan={4} className="dash-empty">
                    No activity in the last 30 days.
                  </td>
                </tr>
              )}
              {recentActivity.map((e, i) => (
                <tr key={i}>
                  <td style={{ color: 'var(--ts)' }}>{formatDate(e.when)}</td>
                  <td>
                    <span className={`dash-badge ${e.kind === 'Payment' ? 'ok' : ''}`}>
                      {e.kind}
                    </span>
                  </td>
                  <td>{e.tenant}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{e.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function TenantsTab({ initial }: { initial: AdminInitialData }) {
  const [filter, setFilter] = useState<'all' | 'active' | 'suspended'>('all');
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    const Q = q.trim().toLowerCase();
    return initial.tenants.filter((t) => {
      if (filter === 'active' && t.status === 'suspended') return false;
      if (filter === 'suspended' && t.status !== 'suspended') return false;
      if (!Q) return true;
      return (
        (t.business_name || '').toLowerCase().includes(Q) ||
        (t.name || '').toLowerCase().includes(Q) ||
        (t.plan || '').toLowerCase().includes(Q)
      );
    });
  }, [initial.tenants, filter, q]);

  return (
    <>
      <div className="dash-page-header">
        <div className="dash-page-block">
          <div className="dash-page-eyebrow">{rows.length} of {initial.tenants.length}</div>
          <h1 className="dash-page-title">Tenants</h1>
          <p className="dash-page-sub">Every business using StockFlow.</p>
        </div>
      </div>

      <section className="dash-section">
        <div className="dash-section-header" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['all', 'active', 'suspended'] as const).map((f) => (
              <button
                key={f}
                type="button"
                className={`dash-badge ${filter === f ? 'ok' : ''}`}
                onClick={() => setFilter(f)}
                style={{ cursor: 'pointer' }}
              >
                {f}
              </button>
            ))}
          </div>
          <input
            type="search"
            placeholder="Search business, plan…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{
              flex: 1,
              minWidth: 200,
              padding: '8px 12px',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 13.5,
              background: 'var(--surface-2)',
              color: 'var(--tp)',
              outline: 'none',
            }}
          />
        </div>

        <div className="dash-table-wrap">
          <table className="dash-table">
            <thead>
              <tr>
                <th>Business</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Expires</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="dash-empty">
                    No tenants match.
                  </td>
                </tr>
              )}
              {rows.map((t) => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 600 }}>{t.business_name || t.name || '—'}</td>
                  <td>{t.plan || '—'}</td>
                  <td>
                    <StatusBadge status={t.status} />
                  </td>
                  <td style={{ color: 'var(--ts)' }}>
                    {t.subscription_expires_at ? formatDate(t.subscription_expires_at) : '—'}
                  </td>
                  <td style={{ color: 'var(--ts)' }}>{formatDate(t.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function UsersTab({ initial }: { initial: AdminInitialData }) {
  const [role, setRole] = useState<'all' | 'owner' | 'manager' | 'rep'>('all');
  const [q, setQ] = useState('');
  const tenantNameById = useMemo(
    () =>
      new Map(
        initial.tenants.map((t) => [t.id, t.business_name || t.name || '—']),
      ),
    [initial.tenants],
  );
  const rows = useMemo(() => {
    const Q = q.trim().toLowerCase();
    return initial.users.filter((u) => {
      if (role !== 'all' && u.role !== role) return false;
      if (!Q) return true;
      return (
        (u.full_name || '').toLowerCase().includes(Q) ||
        (u.phone || '').toLowerCase().includes(Q)
      );
    });
  }, [initial.users, role, q]);
  return (
    <>
      <div className="dash-page-header">
        <div className="dash-page-block">
          <div className="dash-page-eyebrow">{rows.length} of {initial.users.length}</div>
          <h1 className="dash-page-title">Users</h1>
          <p className="dash-page-sub">Every account across every tenant.</p>
        </div>
      </div>
      <section className="dash-section">
        <div className="dash-section-header" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['all', 'owner', 'manager', 'rep'] as const).map((r) => (
              <button
                key={r}
                type="button"
                className={`dash-badge ${role === r ? 'ok' : ''}`}
                onClick={() => setRole(r)}
                style={{ cursor: 'pointer' }}
              >
                {r}
              </button>
            ))}
          </div>
          <input
            type="search"
            placeholder="Search name or phone…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{
              flex: 1,
              minWidth: 200,
              padding: '8px 12px',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 13.5,
              background: 'var(--surface-2)',
              color: 'var(--tp)',
              outline: 'none',
            }}
          />
        </div>
        <div className="dash-table-wrap">
          <table className="dash-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Tenant</th>
                <th>Phone</th>
                <th>Active</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="dash-empty">
                    No users match.
                  </td>
                </tr>
              )}
              {rows.map((u) => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 600 }}>{u.full_name || '—'}</td>
                  <td>
                    <span className="dash-badge">{u.role}</span>
                  </td>
                  <td>{u.tenant_id ? tenantNameById.get(u.tenant_id) || '—' : '—'}</td>
                  <td style={{ color: 'var(--ts)' }}>{u.phone || '—'}</td>
                  <td>
                    {u.is_active ? (
                      <span className="dash-badge ok">Active</span>
                    ) : (
                      <span className="dash-badge err">Inactive</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function RevenueTab({ initial }: { initial: AdminInitialData }) {
  const stats = useMemo(() => {
    const active = initial.tenants.filter((t) => t.status === 'active');
    const paying = active.filter(
      (t) => t.plan && t.plan !== 'trial' && Number(t.monthly_price ?? 0) > 0,
    );
    const mrr = paying.reduce((s, t) => {
      const price = Number(t.monthly_price ?? 0);
      if (t.billing_cycle === 'annual') return s + price / 12;
      if (t.billing_cycle === 'quarterly') return s + price / 3;
      return s + price;
    }, 0);
    const arr = mrr * 12;
    const arpu = paying.length ? mrr / paying.length : 0;

    const byPlan = new Map<string, number>();
    for (const t of initial.tenants) {
      const k = t.plan || 'unspecified';
      byPlan.set(k, (byPlan.get(k) ?? 0) + 1);
    }
    return { mrr, arr, arpu, payingCount: paying.length, byPlan: Array.from(byPlan.entries()).sort((a, b) => b[1] - a[1]) };
  }, [initial.tenants]);

  const sorted = useMemo(
    () => [...initial.tenants].sort((a, b) => Number(b.monthly_price ?? 0) - Number(a.monthly_price ?? 0)),
    [initial.tenants],
  );

  return (
    <>
      <div className="dash-page-header">
        <div className="dash-page-block">
          <div className="dash-page-eyebrow">{stats.payingCount} paying tenants</div>
          <h1 className="dash-page-title">Revenue</h1>
          <p className="dash-page-sub">
            MRR normalises annual / quarterly billing to a monthly figure.
          </p>
        </div>
      </div>

      <div className="dash-stats">
        <Stat label="MRR" value={formatNaira(Math.round(stats.mrr))} tone="ok" />
        <Stat label="ARR" value={formatNaira(Math.round(stats.arr))} />
        <Stat label="ARPU" value={formatNaira(Math.round(stats.arpu))} />
        <Stat label="Paying tenants" value={String(stats.payingCount)} />
      </div>

      <section className="dash-section">
        <div className="dash-section-header">
          <h2 className="dash-section-title">Plan distribution</h2>
        </div>
        {stats.byPlan.length === 0 ? (
          <div className="dash-empty">No tenants yet.</div>
        ) : (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Plan</th>
                  <th style={{ textAlign: 'right' }}>Tenants</th>
                </tr>
              </thead>
              <tbody>
                {stats.byPlan.map(([plan, count]) => (
                  <tr key={plan}>
                    <td style={{ textTransform: 'capitalize' }}>{plan}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="dash-section">
        <div className="dash-section-header">
          <h2 className="dash-section-title">Subscription breakdown</h2>
        </div>
        <div className="dash-table-wrap">
          <table className="dash-table">
            <thead>
              <tr>
                <th>Business</th>
                <th>Plan</th>
                <th style={{ textAlign: 'right' }}>Price</th>
                <th>Cycle</th>
                <th>Expires</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={6} className="dash-empty">
                    No tenants yet.
                  </td>
                </tr>
              )}
              {sorted.map((t) => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 600 }}>{t.business_name || t.name || '—'}</td>
                  <td style={{ textTransform: 'capitalize' }}>{t.plan || '—'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>
                    {formatNaira(Number(t.monthly_price ?? 0))}
                  </td>
                  <td style={{ textTransform: 'capitalize' }}>{t.billing_cycle || 'monthly'}</td>
                  <td style={{ color: 'var(--ts)' }}>
                    {t.subscription_expires_at ? formatDate(t.subscription_expires_at) : '—'}
                  </td>
                  <td>
                    <StatusBadge status={t.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function AuditTab({ initial }: { initial: AdminInitialData }) {
  const tenantById = useMemo(
    () => new Map(initial.tenants.map((t) => [t.id, t.business_name || t.name || '—'])),
    [initial.tenants],
  );
  const events = useMemo(() => {
    type Ev = { when: string; kind: string; tenant: string; detail: string; tone: 'ok' | 'warn' | 'err' | null };
    const out: Ev[] = [];
    for (const s of initial.sales) {
      const t = tenantById.get(s.tenant_id ?? '');
      out.push({
        when: s.created_at,
        kind: 'Sale',
        tenant: t || '—',
        detail: formatNaira(Number(s.total_value ?? 0)),
        tone: null,
      });
    }
    for (const p of initial.payments) {
      if (!p.confirmed_at) continue;
      const t = tenantById.get(p.tenant_id ?? '');
      out.push({
        when: p.confirmed_at,
        kind: 'Payment',
        tenant: t || '—',
        detail: formatNaira(Number(p.amount ?? 0)),
        tone: 'ok',
      });
    }
    for (const t of initial.tenants) {
      out.push({
        when: t.created_at,
        kind: 'Tenant created',
        tenant: t.business_name || t.name || '—',
        detail: t.plan || '—',
        tone: null,
      });
      if (t.status === 'suspended' && t.suspended_at) {
        out.push({
          when: t.suspended_at,
          kind: 'Tenant suspended',
          tenant: t.business_name || t.name || '—',
          detail: t.suspension_reason || 'no reason',
          tone: 'err',
        });
      }
    }
    return out.sort((a, b) => (a.when < b.when ? 1 : -1)).slice(0, 80);
  }, [initial, tenantById]);

  return (
    <>
      <div className="dash-page-header">
        <div className="dash-page-block">
          <div className="dash-page-eyebrow">{events.length} events</div>
          <h1 className="dash-page-title">Activity log</h1>
          <p className="dash-page-sub">
            Cross-tenant feed: sales, confirmed payments, and tenant lifecycle events.
          </p>
        </div>
      </div>
      <section className="dash-section">
        <div className="dash-table-wrap">
          <table className="dash-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Kind</th>
                <th>Tenant</th>
                <th style={{ textAlign: 'right' }}>Detail</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 && (
                <tr>
                  <td colSpan={4} className="dash-empty">
                    No activity yet.
                  </td>
                </tr>
              )}
              {events.map((e, i) => (
                <tr key={i}>
                  <td style={{ color: 'var(--ts)' }}>{formatDateTime(e.when)}</td>
                  <td>
                    <span className={`dash-badge ${e.tone === 'ok' ? 'ok' : e.tone === 'err' ? 'err' : ''}`}>
                      {e.kind}
                    </span>
                  </td>
                  <td>{e.tenant}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{e.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function PlatformTab({ initial }: { initial: AdminInitialData }) {
  return (
    <>
      <div className="dash-page-header">
        <div className="dash-page-block">
          <div className="dash-page-eyebrow">{initial.tenants.length} tenants</div>
          <h1 className="dash-page-title">Platform configuration</h1>
          <p className="dash-page-sub">
            Bulk operations and per-tenant lifecycle controls.
          </p>
        </div>
      </div>

      <PlatformConfigForm />

      <section className="dash-section">
        <div className="dash-section-header">
          <h2 className="dash-section-title">Per-tenant controls</h2>
        </div>
        <div className="dash-table-wrap">
          <table className="dash-table">
            <thead>
              <tr>
                <th>Business</th>
                <th>Plan</th>
                <th>Expires</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {initial.tenants.length === 0 && (
                <tr>
                  <td colSpan={5} className="dash-empty">
                    No tenants yet.
                  </td>
                </tr>
              )}
              {initial.tenants.map((t) => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 600 }}>{t.business_name || t.name || '—'}</td>
                  <td style={{ textTransform: 'capitalize' }}>{t.plan || '—'}</td>
                  <td style={{ color: 'var(--ts)' }}>
                    {t.subscription_expires_at ? formatDate(t.subscription_expires_at) : '—'}
                  </td>
                  <td>
                    <StatusBadge status={t.status} />
                  </td>
                  <td>
                    <TenantStatusButtons tenantId={t.id} status={t.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'ok' | 'warn' | 'err';
}) {
  return (
    <div className="dash-stat">
      <div className="dash-stat-label">{label}</div>
      <div
        className="dash-stat-value"
        style={
          tone === 'ok'
            ? { color: 'var(--success)' }
            : tone === 'err'
              ? { color: 'var(--danger)' }
              : undefined
        }
      >
        {value}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  if (status === 'suspended') return <span className="dash-badge err">Suspended</span>;
  if (status === 'trial') return <span className="dash-badge warn">Trial</span>;
  return <span className="dash-badge ok">{status || 'Active'}</span>;
}
