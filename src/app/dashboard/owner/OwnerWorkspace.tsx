'use client';

import { useMemo, useState } from 'react';
import Sidebar, { type NavItem } from '@/components/dashboard/Sidebar';
import PageStub from '@/components/dashboard/PageStub';
import { formatDate, formatDateTime, formatNaira } from '@/lib/format';
import type { Profile } from '@/lib/types';
import ApprovalActionButtons from './ApprovalActionButtons';

type Sale = {
  id: string;
  total_value: number | null;
  status: string;
  created_at: string;
  rep_id: string | null;
};
type Payment = {
  id: string;
  amount: number | null;
  status: string;
  confirmed_at: string | null;
  created_at: string;
};
type Staff = {
  id: string;
  full_name: string | null;
  role: string;
  is_active: boolean;
  phone: string | null;
  created_at: string;
};
type Product = {
  id: string;
  name: string;
  sku: string | null;
  stock_quantity: number | null;
  low_stock_threshold: number | null;
  buy_price: number | null;
  sell_price: number | null;
};
type Approval = {
  id: string;
  kind: string;
  requested_by: string | null;
  status: string;
  created_at: string;
  payload: unknown;
};

export type PLPeriod = {
  label: string;
  from: string;
  to: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  expenses: number;
  netProfit: number;
  cash: number;
  saleCount: number;
};

export type AuditEvent = {
  id: string;
  record_type: string | null;
  record_id: string | null;
  actor_id: string | null;
  previous_status: string | null;
  new_status: string | null;
  notes: string | null;
  created_at: string;
};

export type OwnerInitialData = {
  sales: Sale[];
  payments: Payment[];
  staff: Staff[];
  products: Product[];
  pendingApprovals: Approval[];
  businessMode: string;
  businessName: string;
  pl: { thisMonth: PLPeriod; lastMonth: PLPeriod };
  auditEvents: AuditEvent[];
};

const ICONS = {
  home: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 12L12 4l9 8M5 10v10h4v-6h6v6h4V10" />
    </svg>
  ),
  approve: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  business: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 21h18M5 21V8l7-4 7 4v13" />
    </svg>
  ),
  users: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8z" />
    </svg>
  ),
  audit: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  ),
  reports: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <line x1="12" y1="20" x2="12" y2="10" />
      <line x1="18" y1="20" x2="18" y2="4" />
      <line x1="6" y1="20" x2="6" y2="16" />
    </svg>
  ),
  warehouse: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
    </svg>
  ),
  settings: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
};

const NAV: NavItem[] = [
  { key: 'home', label: 'Overview', icon: ICONS.home, section: 'Today' },
  { key: 'approve', label: 'Approvals', icon: ICONS.approve, section: 'Manage' },
  { key: 'business', label: 'Business', icon: ICONS.business },
  { key: 'users', label: 'Staff', icon: ICONS.users },
  { key: 'warehouse', label: 'Warehouse', icon: ICONS.warehouse },
  { key: 'reports', label: 'Reports & P&L', icon: ICONS.reports },
  { key: 'audit', label: 'Audit log', icon: ICONS.audit },
  { key: 'settings', label: 'My Account', icon: ICONS.settings, section: 'Settings' },
];

export default function OwnerWorkspace({
  profile,
  initial,
}: {
  profile: Profile;
  initial: OwnerInitialData;
}) {
  const [tab, setTab] = useState('home');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="dash-shell">
      <Sidebar
        brandRoleLabel="Owner"
        items={NAV}
        active={tab}
        onSelect={setTab}
        profile={profile}
        open={sidebarOpen}
        onCloseMobile={() => setSidebarOpen(false)}
      />
      <main className="dash-main">
        <MobileBar onToggle={() => setSidebarOpen((s) => !s)} title="Owner" />
        {tab === 'home' && <OwnerHome profile={profile} initial={initial} onJump={setTab} />}
        {tab === 'approve' && <ApprovalsTab initial={initial} />}
        {tab === 'business' && <BusinessTab initial={initial} />}
        {tab === 'users' && <StaffTab initial={initial} />}
        {tab === 'warehouse' && <WarehouseTab initial={initial} />}
        {tab === 'reports' && <ReportsTab initial={initial} />}
        {tab === 'audit' && <AuditTab initial={initial} />}
        {tab === 'settings' && (
          <PageStub title="My account" body="Owner profile and password." />
        )}
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
      <div style={{ fontFamily: 'var(--font-sora)', fontWeight: 700, fontSize: 16 }}>
        StockFlow · {title}
      </div>
      <div style={{ width: 38 }} />
    </div>
  );
}

function OwnerHome({
  profile,
  initial,
  onJump,
}: {
  profile: Profile;
  initial: OwnerInitialData;
  onJump: (k: string) => void;
}) {
  const stats = useMemo(() => {
    const sales = initial.sales.filter((s) => s.status !== 'cancelled');
    const revenue = sales.reduce((s, r) => s + Number(r.total_value || 0), 0);
    const cash = initial.payments
      .filter((p) => p.status === 'confirmed')
      .reduce((s, p) => s + Number(p.amount || 0), 0);
    const cogs = initial.products.reduce((acc, p) => {
      // Rough estimate: assume average sale moves stock; without sale_items we just
      // surface inventory value as a proxy until full P&L lands.
      return acc + Number(p.buy_price ?? 0) * Number(p.stock_quantity ?? 0);
    }, 0);
    const activeReps = initial.staff.filter(
      (s) => s.role === 'rep' && s.is_active,
    ).length;
    const debt = revenue - cash;
    return { revenue, cash, cogs, activeReps, debt };
  }, [initial]);

  const recentSales = initial.sales.slice(0, 6);
  const firstName = (profile.full_name || profile.email || 'there').split(/\s+/)[0];
  const today = new Date().toLocaleDateString('en-NG', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });

  return (
    <>
      <div className="dash-page-header">
        <div className="dash-page-block">
          <div className="dash-page-eyebrow">
            {today} · {initial.businessName}
          </div>
          <h1 className="dash-page-title">
            Welcome, {firstName}
          </h1>
          <p className="dash-page-sub">
            {initial.pendingApprovals.length} item
            {initial.pendingApprovals.length === 1 ? '' : 's'} need your approval.
          </p>
        </div>
      </div>

      <div className="dash-stats">
        <Stat label="Revenue · 30d" value={formatNaira(stats.revenue)} />
        <Stat label="Cash collected · 30d" value={formatNaira(stats.cash)} tone="ok" />
        <Stat label="Outstanding debt" value={formatNaira(stats.debt)} tone="warn" />
        <Stat label="Inventory value" value={formatNaira(stats.cogs)} />
        <Stat label="Active reps" value={String(stats.activeReps)} />
      </div>

      {initial.pendingApprovals.length > 0 && (
        <section className="dash-section">
          <div className="dash-section-header">
            <h2 className="dash-section-title">Awaiting your approval</h2>
            <button
              type="button"
              className="dash-nav-link"
              style={{ background: 'none', padding: '4px 10px', color: 'var(--brand-mid)' }}
              onClick={() => onJump('approve')}
            >
              Open queue →
            </button>
          </div>
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Kind</th>
                  <th>Requested by</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {initial.pendingApprovals.slice(0, 5).map((a) => (
                  <tr key={a.id}>
                    <td style={{ color: 'var(--ts)' }}>{formatDateTime(a.created_at)}</td>
                    <td>
                      <span className="dash-badge">{a.kind}</span>
                    </td>
                    <td style={{ color: 'var(--ts)' }}>{a.requested_by || '—'}</td>
                    <td>
                      <ApprovalActionButtons approvalId={a.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="dash-section">
        <div className="dash-section-header">
          <h2 className="dash-section-title">Recent sales</h2>
        </div>
        {recentSales.length === 0 ? (
          <div className="dash-empty">No sales in the last 30 days.</div>
        ) : (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {recentSales.map((s) => (
                  <tr key={s.id}>
                    <td style={{ color: 'var(--ts)' }}>{formatDateTime(s.created_at)}</td>
                    <td>
                      <span
                        className={`dash-badge ${
                          s.status === 'paid' || s.status === 'cash'
                            ? 'ok'
                            : s.status === 'cancelled'
                              ? 'err'
                              : 'warn'
                        }`}
                      >
                        {s.status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>
                      {formatNaira(Number(s.total_value ?? 0))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function ApprovalsTab({ initial }: { initial: OwnerInitialData }) {
  return (
    <>
      <div className="dash-page-header">
        <div className="dash-page-block">
          <div className="dash-page-eyebrow">{initial.pendingApprovals.length} pending</div>
          <h1 className="dash-page-title">Approvals</h1>
          <p className="dash-page-sub">
            Decisions waiting on you — price changes, supplier orders, new staff.
          </p>
        </div>
      </div>
      <section className="dash-section">
        {initial.pendingApprovals.length === 0 ? (
          <div className="dash-empty">All caught up.</div>
        ) : (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Kind</th>
                  <th>Requested by</th>
                  <th>Payload</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {initial.pendingApprovals.map((a) => (
                  <tr key={a.id}>
                    <td style={{ color: 'var(--ts)' }}>{formatDateTime(a.created_at)}</td>
                    <td>
                      <span className="dash-badge">{a.kind}</span>
                    </td>
                    <td>{a.requested_by || '—'}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--ts)' }}>
                      {JSON.stringify(a.payload)?.slice(0, 80) || '—'}
                    </td>
                    <td>
                      <ApprovalActionButtons approvalId={a.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function BusinessTab({ initial }: { initial: OwnerInitialData }) {
  return (
    <>
      <div className="dash-page-header">
        <div className="dash-page-block">
          <div className="dash-page-eyebrow">{initial.businessMode}</div>
          <h1 className="dash-page-title">{initial.businessName}</h1>
          <p className="dash-page-sub">Tenant overview.</p>
        </div>
      </div>
      <section className="dash-section">
        <div className="dash-stats">
          <Stat label="Reps" value={String(initial.staff.filter((s) => s.role === 'rep').length)} />
          <Stat label="Managers" value={String(initial.staff.filter((s) => s.role === 'manager').length)} />
          <Stat label="Products" value={String(initial.products.length)} />
          <Stat
            label="Inactive staff"
            value={String(initial.staff.filter((s) => !s.is_active).length)}
            tone={initial.staff.some((s) => !s.is_active) ? 'warn' : undefined}
          />
        </div>
      </section>
    </>
  );
}

function StaffTab({ initial }: { initial: OwnerInitialData }) {
  return (
    <>
      <div className="dash-page-header">
        <div className="dash-page-block">
          <div className="dash-page-eyebrow">{initial.staff.length} accounts</div>
          <h1 className="dash-page-title">Staff</h1>
          <p className="dash-page-sub">Everyone on your tenant.</p>
        </div>
      </div>
      <section className="dash-section">
        {initial.staff.length === 0 ? (
          <div className="dash-empty">No staff yet.</div>
        ) : (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Phone</th>
                  <th>Joined</th>
                  <th>Active</th>
                </tr>
              </thead>
              <tbody>
                {initial.staff.map((u) => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 600 }}>{u.full_name || '—'}</td>
                    <td>
                      <span className="dash-badge">{u.role}</span>
                    </td>
                    <td style={{ color: 'var(--ts)' }}>{u.phone || '—'}</td>
                    <td style={{ color: 'var(--ts)' }}>{formatDate(u.created_at)}</td>
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
        )}
        <p style={{ marginTop: 14, color: 'var(--tm)', fontSize: 12.5 }}>
          Invite / deactivate / KYC actions land in a follow-up port.
        </p>
      </section>
    </>
  );
}

function AuditTab({ initial }: { initial: OwnerInitialData }) {
  const actorById = useMemo(
    () =>
      new Map(initial.staff.map((s) => [s.id, s.full_name || s.id.slice(0, 8)])),
    [initial.staff],
  );
  return (
    <>
      <div className="dash-page-header">
        <div className="dash-page-block">
          <div className="dash-page-eyebrow">
            {initial.auditEvents.length} event
            {initial.auditEvents.length === 1 ? '' : 's'}
          </div>
          <h1 className="dash-page-title">Audit log</h1>
          <p className="dash-page-sub">
            Every approval, rejection and status change across your tenant.
          </p>
        </div>
      </div>
      <section className="dash-section">
        {initial.auditEvents.length === 0 ? (
          <div className="dash-empty">No audit events yet.</div>
        ) : (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Kind</th>
                  <th>Actor</th>
                  <th>Change</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {initial.auditEvents.map((e) => (
                  <tr key={e.id}>
                    <td style={{ color: 'var(--ts)' }}>{formatDateTime(e.created_at)}</td>
                    <td>
                      <span className="dash-badge">
                        {(e.record_type || 'action').replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td>
                      {actorById.get(e.actor_id ?? '') ||
                        (e.actor_id ? e.actor_id.slice(0, 8) : '—')}
                    </td>
                    <td>
                      {e.previous_status && (
                        <span
                          style={{
                            textDecoration: 'line-through',
                            color: 'var(--ts)',
                            marginRight: 6,
                          }}
                        >
                          {e.previous_status}
                        </span>
                      )}
                      {e.new_status && (
                        <span
                          style={{
                            fontWeight: 700,
                            color:
                              e.new_status === 'approved' || e.new_status === 'confirmed'
                                ? 'var(--success)'
                                : e.new_status === 'rejected'
                                  ? 'var(--danger)'
                                  : 'var(--accent)',
                          }}
                        >
                          → {e.new_status}
                        </span>
                      )}
                    </td>
                    <td style={{ color: 'var(--ts)', fontStyle: 'italic' }}>
                      {e.notes || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function ReportsTab({ initial }: { initial: OwnerInitialData }) {
  const [period, setPeriod] = useState<'thisMonth' | 'lastMonth'>('thisMonth');
  const p = initial.pl[period];
  const fromLabel = formatDate(p.from);
  const margin = p.revenue > 0 ? (p.netProfit / p.revenue) * 100 : 0;

  const rows: Array<{ label: string; value: string; tone?: 'pos' | 'neg' | 'total' }> = [
    { label: 'Revenue', value: formatNaira(p.revenue) },
    { label: 'Cash collected (period)', value: formatNaira(p.cash) },
    { label: 'COGS — cost of goods sold', value: `−${formatNaira(p.cogs)}`, tone: 'neg' },
    { label: 'Gross profit', value: formatNaira(p.grossProfit), tone: 'total' },
    { label: 'Expenses', value: `−${formatNaira(p.expenses)}`, tone: 'neg' },
    { label: 'Net profit', value: formatNaira(p.netProfit), tone: 'total' },
  ];

  return (
    <>
      <div className="dash-page-header">
        <div className="dash-page-block">
          <div className="dash-page-eyebrow">
            {fromLabel} → today · {p.saleCount} sale{p.saleCount === 1 ? '' : 's'}
          </div>
          <h1 className="dash-page-title">{p.label} P&amp;L</h1>
          <p className="dash-page-sub">
            Backed by actual buy prices at the time of each sale. Custom date ranges land in a
            follow-up.
          </p>
        </div>
      </div>

      <section className="dash-section">
        <div className="dash-section-header" style={{ flexWrap: 'wrap', gap: 10 }}>
          <h2 className="dash-section-title">Period</h2>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['thisMonth', 'lastMonth'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setPeriod(k)}
                className="dash-badge"
                style={{
                  cursor: 'pointer',
                  background: period === k ? 'var(--brand)' : 'var(--surface-2)',
                  color: period === k ? '#fff' : 'var(--ts)',
                  border: `1px solid ${period === k ? 'var(--brand)' : 'var(--border)'}`,
                  padding: '6px 12px',
                  fontSize: 12,
                }}
              >
                {initial.pl[k].label}
              </button>
            ))}
          </div>
        </div>

        <div className="dash-stats">
          <Stat label="Revenue" value={formatNaira(p.revenue)} />
          <Stat label="Gross profit" value={formatNaira(p.grossProfit)} tone="ok" />
          <Stat
            label="Net profit"
            value={formatNaira(p.netProfit)}
            tone={p.netProfit >= 0 ? 'ok' : 'err'}
          />
          <Stat label="Net margin" value={`${margin.toFixed(1)}%`} />
        </div>

        <div className="dash-table-wrap" style={{ marginTop: 12 }}>
          <table className="dash-table">
            <tbody>
              {rows.map((r) => (
                <tr key={r.label}>
                  <td
                    style={{
                      fontWeight: r.tone === 'total' ? 700 : 500,
                      color: r.tone === 'total' ? 'var(--tp)' : 'var(--ts)',
                    }}
                  >
                    {r.label}
                  </td>
                  <td
                    style={{
                      textAlign: 'right',
                      fontWeight: 700,
                      fontFamily: 'var(--font-sora)',
                      color:
                        r.tone === 'neg'
                          ? 'var(--danger)'
                          : r.tone === 'total'
                            ? 'var(--tp)'
                            : 'var(--tp)',
                      background: r.tone === 'total' ? 'var(--brand-light)' : undefined,
                    }}
                  >
                    {r.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p style={{ marginTop: 12, color: 'var(--tm)', fontSize: 12 }}>
          COGS uses each sale&apos;s buy_price_snapshot taken at sale time, so historical
          margins stay correct even if you change product prices later.
        </p>
      </section>
    </>
  );
}

function WarehouseTab({ initial }: { initial: OwnerInitialData }) {
  const totalValue = initial.products.reduce(
    (acc, p) =>
      acc + Number(p.buy_price ?? 0) * Number(p.stock_quantity ?? 0),
    0,
  );
  return (
    <>
      <div className="dash-page-header">
        <div className="dash-page-block">
          <div className="dash-page-eyebrow">{initial.products.length} products</div>
          <h1 className="dash-page-title">Warehouse</h1>
          <p className="dash-page-sub">Inventory value: {formatNaira(totalValue)}.</p>
        </div>
      </div>
      <section className="dash-section">
        {initial.products.length === 0 ? (
          <div className="dash-empty">No products defined yet.</div>
        ) : (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th style={{ textAlign: 'right' }}>On hand</th>
                  <th style={{ textAlign: 'right' }}>Buy</th>
                  <th style={{ textAlign: 'right' }}>Sell</th>
                  <th style={{ textAlign: 'right' }}>Margin</th>
                </tr>
              </thead>
              <tbody>
                {initial.products.map((p) => {
                  const margin =
                    p.sell_price != null && p.buy_price != null
                      ? Number(p.sell_price) - Number(p.buy_price)
                      : null;
                  return (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 600 }}>{p.name}</td>
                      <td style={{ color: 'var(--ts)' }}>{p.sku || '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {p.stock_quantity ?? '—'}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--ts)' }}>
                        {p.buy_price != null ? formatNaira(Number(p.buy_price)) : '—'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {p.sell_price != null ? formatNaira(Number(p.sell_price)) : '—'}
                      </td>
                      <td
                        style={{
                          textAlign: 'right',
                          fontWeight: 600,
                          color: margin != null && margin > 0 ? 'var(--success)' : 'var(--ts)',
                        }}
                      >
                        {margin != null ? formatNaira(margin) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
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
            : tone === 'warn'
              ? { color: 'var(--warn)' }
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
