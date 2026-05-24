'use client';

import { useMemo, useState } from 'react';
import Sidebar, { type NavItem } from '@/components/dashboard/Sidebar';
import PageStub from '@/components/dashboard/PageStub';
import SettingsTab from '@/components/dashboard/SettingsTab';
import { formatDateTime, formatNaira } from '@/lib/format';
import type { Profile } from '@/lib/types';
import SellForm from './SellForm';
import RequestStockForm from './RequestStockForm';

type Holding = { product_id: string; quantity: number };
type Sale = {
  id: string;
  customer_name: string | null;
  total_value: number | null;
  status: string;
  created_at: string;
};
type Payment = {
  id: string;
  amount: number | null;
  status: string;
  confirmed_at: string | null;
  created_at: string;
};
type Product = {
  id: string;
  name: string;
  sku: string | null;
  sell_price?: number | null;
  buy_price?: number | null;
};
type Customer = { id: string; name: string };

export type RepInitialData = {
  holdings: Holding[];
  sales: Sale[];
  payments: Payment[];
  products: Product[];
  customers: Customer[];
  todayIso: string;
};

const ICONS = {
  home: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
  sell: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 001.68-2.15L17 7H6" />
    </svg>
  ),
  request: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  ),
  invoice: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  ),
  ledger: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 4v16M19 4v16" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="3" y1="15" x2="21" y2="15" />
    </svg>
  ),
  settings: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  ),
};

const NAV: NavItem[] = [
  { key: 'home', label: 'Home', icon: ICONS.home, section: 'Today' },
  { key: 'sell', label: 'Record Sale', icon: ICONS.sell, section: 'Work' },
  { key: 'request', label: 'Request Stock', icon: ICONS.request },
  { key: 'invoice', label: 'Invoices', icon: ICONS.invoice },
  { key: 'ledger', label: 'Customer Ledger', icon: ICONS.ledger },
  { key: 'settings', label: 'My Account', icon: ICONS.settings, section: 'Settings' },
];

export default function RepWorkspace({
  profile,
  initial,
}: {
  profile: Profile;
  initial: RepInitialData;
}) {
  const [tab, setTab] = useState('home');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="dash-shell">
      <Sidebar
        brandRoleLabel="Sales Rep"
        items={NAV}
        active={tab}
        onSelect={setTab}
        profile={profile}
        open={sidebarOpen}
        onCloseMobile={() => setSidebarOpen(false)}
      />
      <main className="dash-main">
        <MobileBar onToggle={() => setSidebarOpen((s) => !s)} title="Rep" />
        {tab === 'home' && <RepHome profile={profile} initial={initial} />}
        {tab === 'sell' && (
          <>
            <div className="dash-page-header">
              <div className="dash-page-block">
                <div className="dash-page-eyebrow">New sale</div>
                <h1 className="dash-page-title">Record a sale</h1>
                <p className="dash-page-sub">
                  Pick the products from your holdings, set the price, choose cash or credit.
                </p>
              </div>
            </div>
            <SellForm
              holdings={initial.holdings}
              products={initial.products.map((p) => ({
                id: p.id,
                name: p.name,
                sku: p.sku ?? null,
                sell_price: p.sell_price ?? null,
                buy_price: p.buy_price ?? null,
              }))}
              customers={initial.customers}
            />
          </>
        )}
        {tab === 'request' && (
          <>
            <div className="dash-page-header">
              <div className="dash-page-block">
                <div className="dash-page-eyebrow">Resupply</div>
                <h1 className="dash-page-title">Request stock</h1>
                <p className="dash-page-sub">
                  Set a quantity for each product you need from the warehouse. Your manager
                  will approve or reject.
                </p>
              </div>
            </div>
            <RequestStockForm
              products={initial.products.map((p) => ({
                id: p.id,
                name: p.name,
                sku: p.sku ?? null,
                sell_price: p.sell_price ?? null,
              }))}
            />
          </>
        )}
        {tab === 'invoice' && (
          <PageStub title="Invoices" body="Generate and share branded receipts for every sale." />
        )}
        {tab === 'ledger' && <LedgerTab initial={initial} />}
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

function RepHome({
  profile,
  initial,
}: {
  profile: Profile;
  initial: RepInitialData;
}) {
  const stats = useMemo(() => {
    const todayMs = new Date(initial.todayIso).getTime();
    const todaySales = initial.sales.filter(
      (s) => new Date(s.created_at).getTime() >= todayMs && s.status !== 'cancelled',
    );
    const todayCount = todaySales.length;
    const todayValue = todaySales.reduce((s, r) => s + Number(r.total_value || 0), 0);

    const todayPayments = initial.payments
      .filter(
        (p) =>
          p.status === 'confirmed' &&
          p.confirmed_at &&
          new Date(p.confirmed_at).getTime() >= todayMs,
      )
      .reduce((s, p) => s + Number(p.amount || 0), 0);

    const stockCases = initial.holdings.reduce(
      (s, h) => s + Number(h.quantity || 0),
      0,
    );

    const outstandingDebt = initial.sales
      .filter((s) => s.status === 'credit' || s.status === 'pending')
      .reduce((s, r) => s + Number(r.total_value || 0), 0);

    return { todayCount, todayValue, todayPayments, stockCases, outstandingDebt };
  }, [initial]);

  const recentSales = initial.sales.slice(0, 8);
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
          <h1 className="dash-page-title">
            Good {greeting()}, {firstName}
          </h1>
          <p className="dash-page-sub">
            {stats.todayCount} sale{stats.todayCount === 1 ? '' : 's'} today ·{' '}
            {formatNaira(stats.todayPayments)} collected.
          </p>
        </div>
      </div>

      <div className="dash-stats">
        <Stat label="Today · sales value" value={formatNaira(stats.todayValue)} />
        <Stat label="Today · cash collected" value={formatNaira(stats.todayPayments)} tone="ok" />
        <Stat label="Stock on hand" value={`${stats.stockCases} cases`} />
        <Stat label="Outstanding debt" value={formatNaira(stats.outstandingDebt)} tone="warn" />
      </div>

      <section className="dash-section">
        <div className="dash-section-header">
          <h2 className="dash-section-title">Recent sales</h2>
        </div>
        <div className="dash-table-wrap">
          <table className="dash-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>When</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {recentSales.length === 0 && (
                <tr>
                  <td colSpan={4} className="dash-empty">
                    No sales yet. Record your first sale from the &ldquo;Record Sale&rdquo; tab.
                  </td>
                </tr>
              )}
              {recentSales.map((s) => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600 }}>{s.customer_name || '—'}</td>
                  <td style={{ color: 'var(--ts)' }}>{formatDateTime(s.created_at)}</td>
                  <td>
                    <span
                      className={`dash-badge ${
                        s.status === 'paid' || s.status === 'completed' || s.status === 'cash'
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
      </section>

      <section className="dash-section">
        <div className="dash-section-header">
          <h2 className="dash-section-title">Your holdings</h2>
        </div>
        {initial.holdings.length === 0 ? (
          <div className="dash-empty">
            You have no stock on hand. Use the &ldquo;Request Stock&rdquo; tab to request more from
            your manager.
          </div>
        ) : (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th style={{ textAlign: 'right' }}>Quantity</th>
                </tr>
              </thead>
              <tbody>
                {initial.holdings.map((h) => {
                  const p = initial.products.find((p) => p.id === h.product_id);
                  return (
                    <tr key={h.product_id}>
                      <td style={{ fontWeight: 600 }}>{p?.name || '— (unknown product)'}</td>
                      <td style={{ color: 'var(--ts)' }}>{p?.sku || '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{h.quantity}</td>
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

function LedgerTab({ initial }: { initial: RepInitialData }) {
  const ledger = useMemo(() => {
    type Row = {
      name: string;
      saleCount: number;
      revenue: number;
      outstanding: number;
      lastWhen: string;
    };
    const byCustomer = new Map<string, Row>();
    for (const s of initial.sales) {
      const name = (s.customer_name || '— anonymous').trim();
      const value = Number(s.total_value ?? 0);
      const outstanding = s.status === 'paid' || s.status === 'cash' || s.status === 'cancelled' ? 0 : value;
      const existing = byCustomer.get(name);
      if (existing) {
        existing.saleCount += 1;
        existing.revenue += value;
        existing.outstanding += outstanding;
        if (s.created_at > existing.lastWhen) existing.lastWhen = s.created_at;
      } else {
        byCustomer.set(name, {
          name,
          saleCount: 1,
          revenue: value,
          outstanding,
          lastWhen: s.created_at,
        });
      }
    }
    return Array.from(byCustomer.values()).sort(
      (a, b) => b.outstanding - a.outstanding || b.lastWhen.localeCompare(a.lastWhen),
    );
  }, [initial.sales]);

  const totalDebt = ledger.reduce((s, r) => s + r.outstanding, 0);
  const totalRevenue = ledger.reduce((s, r) => s + r.revenue, 0);

  return (
    <>
      <div className="dash-page-header">
        <div className="dash-page-block">
          <div className="dash-page-eyebrow">
            {ledger.length} customer{ledger.length === 1 ? '' : 's'} · 30d
          </div>
          <h1 className="dash-page-title">Customer ledger</h1>
          <p className="dash-page-sub">
            Who owes you, who&apos;s paid, who&apos;s your biggest buyer.
          </p>
        </div>
      </div>

      <div className="dash-stats">
        <div className="dash-stat">
          <div className="dash-stat-label">Revenue · 30d</div>
          <div className="dash-stat-value">{formatNaira(totalRevenue)}</div>
        </div>
        <div className="dash-stat">
          <div className="dash-stat-label">Outstanding debt</div>
          <div
            className="dash-stat-value"
            style={{ color: totalDebt > 0 ? 'var(--warn)' : 'var(--success)' }}
          >
            {formatNaira(totalDebt)}
          </div>
        </div>
      </div>

      <section className="dash-section">
        <div className="dash-section-header">
          <h2 className="dash-section-title">By customer</h2>
        </div>
        {ledger.length === 0 ? (
          <div className="dash-empty">
            No sales recorded yet. Record your first sale from the &ldquo;Record Sale&rdquo; tab.
          </div>
        ) : (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th style={{ textAlign: 'right' }}>Sales</th>
                  <th style={{ textAlign: 'right' }}>Revenue</th>
                  <th style={{ textAlign: 'right' }}>Outstanding</th>
                  <th>Last sale</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((r) => (
                  <tr key={r.name}>
                    <td style={{ fontWeight: 600 }}>{r.name}</td>
                    <td style={{ textAlign: 'right' }}>{r.saleCount}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>
                      {formatNaira(r.revenue)}
                    </td>
                    <td
                      style={{
                        textAlign: 'right',
                        fontWeight: 700,
                        color: r.outstanding > 0 ? 'var(--warn)' : 'var(--success)',
                      }}
                    >
                      {formatNaira(r.outstanding)}
                    </td>
                    <td style={{ color: 'var(--ts)' }}>{formatDateTime(r.lastWhen)}</td>
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

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
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
