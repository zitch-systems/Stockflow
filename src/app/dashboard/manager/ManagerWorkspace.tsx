'use client';

import { useMemo, useState } from 'react';
import Sidebar, { type NavItem } from '@/components/dashboard/Sidebar';
import PageStub from '@/components/dashboard/PageStub';
import { formatDateTime, formatNaira } from '@/lib/format';
import type { Profile } from '@/lib/types';
import PaymentActionButtons from './PaymentActionButtons';
import StockRequestActionButtons from './StockRequestActionButtons';
import ExpenseForm from './ExpenseForm';
import SettingsTab from '@/components/dashboard/SettingsTab';
import InvoicesTab, { type InvoiceSale } from '@/components/dashboard/InvoicesTab';
import RealtimeRefresher from '@/components/dashboard/RealtimeRefresher';
import BulkConfirmPayments from './BulkConfirmPayments';
import ProductManager from '@/components/dashboard/ProductManager';

const REALTIME_TABLES = [
  'payments',
  'sales',
  'stock_requests',
  'expenses',
  'products',
  'profiles',
];

type PendingPayment = {
  id: string;
  rep_id: string;
  amount: number | null;
  customer_name: string | null;
  method: string | null;
  created_at: string;
  status: string;
  note: string | null;
};
type WarehouseProduct = {
  id: string;
  name: string;
  sku: string | null;
  stock_quantity: number | null;
  low_stock_threshold: number | null;
};
type SaleSnap = {
  id: string;
  total_value: number | null;
  status: string;
  created_at: string;
};
type Rep = { id: string; full_name: string | null; role: string; is_active: boolean };
type Expense = {
  id: string;
  category: string;
  amount: number | null;
  description: string | null;
  created_at: string;
  logged_by: string | null;
};
type StockReqItem = {
  product_id: string;
  quantity: number | null;
  unit_price: number | null;
};
type StockReq = {
  id: string;
  rep_id: string;
  status: string;
  created_at: string;
  notes: string | null;
  total_cases: number | null;
  total_value: number | null;
  stock_request_items?: StockReqItem[] | null;
};

export type ManagerInitialData = {
  pendingPayments: PendingPayment[];
  products: WarehouseProduct[];
  sales: SaleSnap[];
  reps: Rep[];
  pendingStockRequests: StockReq[];
  expenses: Expense[];
  invoiceSales: InvoiceSale[];
  businessName: string;
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
  warehouse: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <path d="M9 22V12h6v10" />
    </svg>
  ),
  reps: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
    </svg>
  ),
  finance: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
    </svg>
  ),
  invoice: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
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
  { key: 'approve', label: 'Confirm payments', icon: ICONS.approve, section: 'Operations' },
  { key: 'warehouse', label: 'Warehouse', icon: ICONS.warehouse },
  { key: 'reps', label: 'Stock requests', icon: ICONS.reps },
  { key: 'finance', label: 'Finance', icon: ICONS.finance },
  { key: 'invoice', label: 'Invoices', icon: ICONS.invoice },
  { key: 'settings', label: 'My Account', icon: ICONS.settings, section: 'Settings' },
];

export default function ManagerWorkspace({
  profile,
  initial,
}: {
  profile: Profile;
  initial: ManagerInitialData;
}) {
  const [tab, setTab] = useState('home');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="dash-shell">
      <RealtimeRefresher tenantId={profile.tenant_id} tables={REALTIME_TABLES} />
      <Sidebar
        brandRoleLabel="Manager"
        items={NAV}
        active={tab}
        onSelect={setTab}
        profile={profile}
        open={sidebarOpen}
        onCloseMobile={() => setSidebarOpen(false)}
      />
      <main className="dash-main">
        <MobileBar onToggle={() => setSidebarOpen((s) => !s)} title="Manager" />
        {tab === 'home' && <ManagerHome profile={profile} initial={initial} onJump={setTab} />}
        {tab === 'approve' && <PendingPaymentsTab initial={initial} />}
        {tab === 'warehouse' && <WarehouseTab initial={initial} />}
        {tab === 'reps' && <StockRequestsTab initial={initial} />}
        {tab === 'finance' && <FinanceTab initial={initial} />}
        {tab === 'invoice' && (
          <InvoicesTab
            sales={initial.invoiceSales}
            businessName={initial.businessName}
            repNameById={
              new Map(
                initial.reps.map((r) => [r.id, r.full_name || '—']),
              )
            }
            productNameById={
              new Map(initial.products.map((p) => [p.id, p.name]))
            }
          />
        )}
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
      <div style={{ fontFamily: 'var(--font-sora)', fontWeight: 700, fontSize: 16 }}>
        StockFlow · {title}
      </div>
      <div style={{ width: 38 }} />
    </div>
  );
}

function ManagerHome({
  profile,
  initial,
  onJump,
}: {
  profile: Profile;
  initial: ManagerInitialData;
  onJump: (k: string) => void;
}) {
  const stats = useMemo(() => {
    const salesValue = initial.sales
      .filter((s) => s.status !== 'cancelled')
      .reduce((s, r) => s + Number(r.total_value || 0), 0);
    const pendingTotal = initial.pendingPayments.reduce(
      (s, p) => s + Number(p.amount || 0),
      0,
    );
    const activeReps = initial.reps.filter((r) => r.is_active).length;
    const lowStock = initial.products.filter(
      (p) =>
        p.low_stock_threshold != null &&
        p.stock_quantity != null &&
        p.stock_quantity <= p.low_stock_threshold,
    ).length;
    return { salesValue, pendingTotal, activeReps, lowStock };
  }, [initial]);

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
          <div className="dash-page-eyebrow">{today}</div>
          <h1 className="dash-page-title">Hi {firstName}</h1>
          <p className="dash-page-sub">
            {initial.pendingPayments.length} payment
            {initial.pendingPayments.length === 1 ? '' : 's'} waiting for confirmation ·{' '}
            {initial.pendingStockRequests.length} stock request
            {initial.pendingStockRequests.length === 1 ? '' : 's'} pending.
          </p>
        </div>
      </div>

      <div className="dash-stats">
        <Stat label="Sales · 30d" value={formatNaira(stats.salesValue)} />
        <Stat label="Pending payments" value={formatNaira(stats.pendingTotal)} tone="warn" />
        <Stat label="Active reps" value={String(stats.activeReps)} />
        <Stat
          label="Low-stock products"
          value={String(stats.lowStock)}
          tone={stats.lowStock > 0 ? 'err' : undefined}
        />
      </div>

      <section className="dash-section">
        <div className="dash-section-header">
          <h2 className="dash-section-title">Pending payments</h2>
          <button
            type="button"
            className="dash-nav-link"
            style={{ background: 'none', padding: '4px 10px', color: 'var(--brand-mid)' }}
            onClick={() => onJump('approve')}
          >
            Open queue →
          </button>
        </div>
        {initial.pendingPayments.length === 0 ? (
          <div className="dash-empty">All caught up. No payments waiting.</div>
        ) : (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Customer</th>
                  <th>Method</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {initial.pendingPayments.slice(0, 6).map((p) => (
                  <tr key={p.id}>
                    <td style={{ color: 'var(--ts)' }}>{formatDateTime(p.created_at)}</td>
                    <td>{p.customer_name || '—'}</td>
                    <td>{p.method || '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>
                      {formatNaira(Number(p.amount ?? 0))}
                    </td>
                    <td>
                      <PaymentActionButtons paymentId={p.id} compact />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="dash-section">
        <div className="dash-section-header">
          <h2 className="dash-section-title">Low stock</h2>
          <button
            type="button"
            className="dash-nav-link"
            style={{ background: 'none', padding: '4px 10px', color: 'var(--brand-mid)' }}
            onClick={() => onJump('warehouse')}
          >
            Warehouse →
          </button>
        </div>
        {stats.lowStock === 0 ? (
          <div className="dash-empty">Everything above its threshold.</div>
        ) : (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th style={{ textAlign: 'right' }}>On hand</th>
                  <th style={{ textAlign: 'right' }}>Threshold</th>
                </tr>
              </thead>
              <tbody>
                {initial.products
                  .filter(
                    (p) =>
                      p.low_stock_threshold != null &&
                      p.stock_quantity != null &&
                      p.stock_quantity <= p.low_stock_threshold,
                  )
                  .slice(0, 6)
                  .map((p) => (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 600 }}>{p.name}</td>
                      <td style={{ color: 'var(--ts)' }}>{p.sku || '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {p.stock_quantity}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--ts)' }}>
                        {p.low_stock_threshold}
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

function PendingPaymentsTab({ initial }: { initial: ManagerInitialData }) {
  return (
    <>
      <div className="dash-page-header">
        <div className="dash-page-block">
          <div className="dash-page-eyebrow">{initial.pendingPayments.length} pending</div>
          <h1 className="dash-page-title">Confirm payments</h1>
          <p className="dash-page-sub">
            Payments reps have collected but you haven&apos;t yet confirmed. Tick rows to
            confirm in bulk.
          </p>
        </div>
      </div>
      <BulkConfirmPayments payments={initial.pendingPayments} />
    </>
  );
}

function StockRequestsTab({ initial }: { initial: ManagerInitialData }) {
  const repNameById = useMemo(
    () =>
      new Map(initial.reps.map((r) => [r.id, r.full_name || '— unknown'])),
    [initial.reps],
  );
  return (
    <>
      <div className="dash-page-header">
        <div className="dash-page-block">
          <div className="dash-page-eyebrow">
            {initial.pendingStockRequests.length} pending
          </div>
          <h1 className="dash-page-title">Stock requests</h1>
          <p className="dash-page-sub">
            Approve a request to dispatch stock and add it to the rep&apos;s holdings.
          </p>
        </div>
      </div>
      <section className="dash-section">
        {initial.pendingStockRequests.length === 0 ? (
          <div className="dash-empty">No pending requests.</div>
        ) : (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Rep</th>
                  <th>Items</th>
                  <th style={{ textAlign: 'right' }}>Cases</th>
                  <th style={{ textAlign: 'right' }}>Value</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {initial.pendingStockRequests.map((r) => {
                  const itemCount = (r.stock_request_items ?? []).length;
                  return (
                    <tr key={r.id}>
                      <td style={{ color: 'var(--ts)' }}>{formatDateTime(r.created_at)}</td>
                      <td style={{ fontWeight: 600 }}>{repNameById.get(r.rep_id) || '—'}</td>
                      <td style={{ color: 'var(--ts)' }}>
                        {itemCount} item{itemCount === 1 ? '' : 's'}
                        {r.notes ? ` · ${r.notes}` : ''}
                      </td>
                      <td style={{ textAlign: 'right' }}>{r.total_cases ?? 0}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {formatNaira(Number(r.total_value ?? 0))}
                      </td>
                      <td>
                        <StockRequestActionButtons requestId={r.id} />
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

function WarehouseTab({ initial }: { initial: ManagerInitialData }) {
  return (
    <>
      <div className="dash-page-header">
        <div className="dash-page-block">
          <div className="dash-page-eyebrow">{initial.products.length} products</div>
          <h1 className="dash-page-title">Warehouse</h1>
          <p className="dash-page-sub">Add, edit and stock-keep your products.</p>
        </div>
      </div>
      <ProductManager
        products={initial.products.map((p) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          stock_quantity: p.stock_quantity,
          low_stock_threshold: p.low_stock_threshold,
        }))}
        showPrices={false}
      />
    </>
  );
}

function FinanceTab({ initial }: { initial: ManagerInitialData }) {
  const repNameById = useMemo(
    () =>
      new Map(initial.reps.map((r) => [r.id, r.full_name || '—'])),
    [initial.reps],
  );
  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of initial.expenses) {
      map.set(
        e.category,
        (map.get(e.category) ?? 0) + Number(e.amount ?? 0),
      );
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [initial.expenses]);
  const total = initial.expenses.reduce(
    (s, e) => s + Number(e.amount ?? 0),
    0,
  );

  return (
    <>
      <div className="dash-page-header">
        <div className="dash-page-block">
          <div className="dash-page-eyebrow">Last 30 days</div>
          <h1 className="dash-page-title">Finance</h1>
          <p className="dash-page-sub">
            Log every expense — fuel, salary, rent — so the P&amp;L reflects reality.
          </p>
        </div>
      </div>

      <ExpenseForm />

      <div className="dash-stats">
        <Stat label="Total expenses · 30d" value={formatNaira(total)} tone="warn" />
        {byCategory.slice(0, 3).map(([cat, amt]) => (
          <Stat key={cat} label={cat} value={formatNaira(amt)} />
        ))}
      </div>

      <section className="dash-section">
        <div className="dash-section-header">
          <h2 className="dash-section-title">Recent expenses</h2>
        </div>
        {initial.expenses.length === 0 ? (
          <div className="dash-empty">
            No expenses logged in the last 30 days.
          </div>
        ) : (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Category</th>
                  <th>Description</th>
                  <th>Logged by</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {initial.expenses.map((e) => (
                  <tr key={e.id}>
                    <td style={{ color: 'var(--ts)' }}>{formatDateTime(e.created_at)}</td>
                    <td>
                      <span className="dash-badge">{e.category}</span>
                    </td>
                    <td>{e.description || '—'}</td>
                    <td style={{ color: 'var(--ts)' }}>
                      {repNameById.get(e.logged_by ?? '') || '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>
                      {formatNaira(Number(e.amount ?? 0))}
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
