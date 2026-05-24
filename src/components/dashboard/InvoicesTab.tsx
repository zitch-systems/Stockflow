'use client';

import { useMemo, useState } from 'react';
import Invoice, { type InvoiceLine } from './Invoice';
import { formatDateTime, formatNaira } from '@/lib/format';

export type InvoiceSale = {
  id: string;
  customer_name: string | null;
  status: string;
  created_at: string;
  total_cases: number | null;
  total_value: number | null;
  rep_id: string | null;
  sale_items?: Array<{
    product_id: string;
    quantity: number | null;
    unit_price: number | null;
    products?: { name: string | null } | null;
  }> | null;
};

export default function InvoicesTab({
  sales,
  businessName,
  repNameById,
  productNameById,
}: {
  sales: InvoiceSale[];
  businessName: string;
  repNameById: Map<string, string>;
  productNameById: Map<string, string>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    sales[0]?.id ?? null,
  );
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const Q = q.trim().toLowerCase();
    if (!Q) return sales;
    return sales.filter(
      (s) =>
        (s.customer_name || '').toLowerCase().includes(Q) ||
        s.id.toLowerCase().includes(Q),
    );
  }, [sales, q]);

  const selected = useMemo(
    () => sales.find((s) => s.id === selectedId) ?? null,
    [sales, selectedId],
  );

  const invoiceData = useMemo(() => {
    if (!selected) return null;
    const lines: InvoiceLine[] = (selected.sale_items ?? []).map((it) => ({
      name:
        it.products?.name ||
        productNameById.get(it.product_id) ||
        '— unknown product',
      quantity: Number(it.quantity ?? 0),
      unit_price: Number(it.unit_price ?? 0),
    }));
    return {
      saleId: selected.id,
      customerName: selected.customer_name || '—',
      status: selected.status,
      createdAt: selected.created_at,
      repName: repNameById.get(selected.rep_id ?? '') || '—',
      businessName,
      lines,
      totalCases: Number(selected.total_cases ?? 0),
      totalValue: Number(selected.total_value ?? 0),
    };
  }, [selected, productNameById, repNameById, businessName]);

  return (
    <>
      <div className="dash-page-header">
        <div className="dash-page-block">
          <div className="dash-page-eyebrow">
            {filtered.length} of {sales.length}
          </div>
          <h1 className="dash-page-title">Invoices</h1>
          <p className="dash-page-sub">
            Pick a sale to view its branded receipt. Print or save as PDF.
          </p>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(260px, 340px) 1fr',
          gap: 16,
        }}
        className="invoices-grid"
      >
        <section className="dash-section" style={{ padding: 0, height: 'fit-content' }}>
          <div style={{ padding: 14, borderBottom: '1px solid var(--border)' }}>
            <input
              type="search"
              placeholder="Search customer or invoice id…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{
                width: '100%',
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
          <div style={{ maxHeight: 560, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div className="dash-empty">No invoices match.</div>
            ) : (
              filtered.map((s) => {
                const active = s.id === selectedId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedId(s.id)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '12px 14px',
                      borderBottom: '1px solid var(--border)',
                      background: active ? 'var(--brand-light)' : 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'inherit',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 8,
                        marginBottom: 3,
                      }}
                    >
                      <span style={{ fontWeight: 600, fontSize: 13 }}>
                        {s.customer_name || '—'}
                      </span>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>
                        {formatNaira(Number(s.total_value ?? 0))}
                      </span>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 11,
                        color: 'var(--ts)',
                      }}
                    >
                      <span>{formatDateTime(s.created_at)}</span>
                      <span style={{ textTransform: 'capitalize' }}>{s.status}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <section>
          {invoiceData ? (
            <Invoice data={invoiceData} />
          ) : (
            <div className="dash-section">
              <div className="dash-empty">
                Select an invoice from the list to view it.
              </div>
            </div>
          )}
        </section>
      </div>

      <style jsx>{`
        @media (max-width: 880px) {
          .invoices-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </>
  );
}
