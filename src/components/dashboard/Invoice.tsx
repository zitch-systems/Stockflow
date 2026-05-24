'use client';

import { formatDateTime, formatNaira } from '@/lib/format';

export type InvoiceLine = {
  name: string;
  quantity: number;
  unit_price: number;
};

export type InvoiceData = {
  saleId: string;
  customerName: string;
  status: string;
  createdAt: string;
  repName: string;
  businessName: string;
  lines: InvoiceLine[];
  totalCases: number;
  totalValue: number;
};

export default function Invoice({ data }: { data: InvoiceData }) {
  return (
    <>
      <style jsx global>{`
        @media print {
          .dash-shell .dash-sidebar,
          .dash-shell .dash-mobile-bar,
          .invoice-actions {
            display: none !important;
          }
          body,
          .dash-main {
            background: #fff !important;
            padding: 0 !important;
          }
          .invoice-card {
            box-shadow: none !important;
            border: none !important;
            max-width: 100% !important;
          }
        }
      `}</style>
      <div
        className="invoice-card"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: 28,
          maxWidth: 640,
          margin: '0 auto',
          boxShadow: 'var(--shadow)',
          fontFamily: 'var(--font-sans)',
        }}
      >
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            paddingBottom: 18,
            borderBottom: '2px solid var(--brand)',
            marginBottom: 18,
          }}
        >
          <div>
            <div
              style={{
                fontFamily: 'var(--font-sora)',
                fontWeight: 800,
                fontSize: 22,
                color: 'var(--brand)',
                letterSpacing: '-0.02em',
              }}
            >
              {data.businessName}
            </div>
            <div style={{ color: 'var(--ts)', fontSize: 12, marginTop: 4 }}>
              Receipt #{data.saleId.slice(0, 8).toUpperCase()}
            </div>
          </div>
          <StatusPill status={data.status} />
        </header>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 14,
            marginBottom: 18,
            fontSize: 13,
          }}
        >
          <Cell label="Customer">{data.customerName}</Cell>
          <Cell label="Date">{formatDateTime(data.createdAt)}</Cell>
          <Cell label="Sales rep">{data.repName}</Cell>
          <Cell label="Status">{data.status}</Cell>
        </div>

        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 13,
            marginBottom: 18,
          }}
        >
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ textAlign: 'left', padding: '8px 4px', color: 'var(--ts)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em' }}>Item</th>
              <th style={{ textAlign: 'right', padding: '8px 4px', color: 'var(--ts)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em' }}>Qty</th>
              <th style={{ textAlign: 'right', padding: '8px 4px', color: 'var(--ts)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em' }}>Unit</th>
              <th style={{ textAlign: 'right', padding: '8px 4px', color: 'var(--ts)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em' }}>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {data.lines.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: 18, textAlign: 'center', color: 'var(--tm)' }}>
                  No line items.
                </td>
              </tr>
            )}
            {data.lines.map((l, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '10px 4px', fontWeight: 500 }}>{l.name}</td>
                <td style={{ padding: '10px 4px', textAlign: 'right' }}>{l.quantity}</td>
                <td style={{ padding: '10px 4px', textAlign: 'right', color: 'var(--ts)' }}>
                  {formatNaira(l.unit_price)}
                </td>
                <td style={{ padding: '10px 4px', textAlign: 'right', fontWeight: 600 }}>
                  {formatNaira(l.unit_price * l.quantity)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 14px',
            background: 'var(--brand)',
            color: '#fff',
            borderRadius: 8,
            marginBottom: 10,
          }}
        >
          <div>
            <div style={{ fontSize: 11, opacity: 0.85, textTransform: 'uppercase', letterSpacing: '.06em' }}>
              {data.totalCases} case{data.totalCases === 1 ? '' : 's'}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-sora)',
                fontWeight: 700,
                fontSize: 12,
                opacity: 0.85,
                textTransform: 'uppercase',
                letterSpacing: '.1em',
              }}
            >
              Total
            </div>
          </div>
          <div
            style={{
              fontFamily: 'var(--font-sora)',
              fontWeight: 800,
              fontSize: 28,
            }}
          >
            {formatNaira(data.totalValue)}
          </div>
        </div>
        <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--tm)', marginTop: 14 }}>
          Powered by StockFlow · {data.saleId}
        </div>
      </div>

      <div
        className="invoice-actions"
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 10,
          marginTop: 18,
        }}
      >
        <button
          type="button"
          onClick={() => window.print()}
          className="dash-badge ok"
          style={{
            cursor: 'pointer',
            padding: '10px 22px',
            fontSize: 13,
            fontWeight: 700,
            background: 'var(--brand)',
            color: '#fff',
          }}
        >
          Print / Save as PDF
        </button>
      </div>
    </>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10.5,
          textTransform: 'uppercase',
          letterSpacing: '.08em',
          color: 'var(--tm)',
          marginBottom: 4,
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontWeight: 600,
          fontFamily: 'var(--font-sora)',
          color: 'var(--tp)',
          textTransform: label === 'Status' ? 'capitalize' : 'none',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const ok = status === 'paid' || status === 'cash' || status === 'completed';
  const cancelled = status === 'cancelled';
  return (
    <span
      style={{
        padding: '4px 12px',
        borderRadius: 99,
        fontSize: 11,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '.08em',
        background: ok ? 'var(--success-bg)' : cancelled ? 'var(--danger-bg)' : 'var(--warn-bg)',
        color: ok ? 'var(--success)' : cancelled ? 'var(--danger)' : 'var(--warn)',
        border: `1px solid ${ok ? 'var(--success)' : cancelled ? 'var(--danger)' : 'var(--warn)'}`,
      }}
    >
      {status}
    </span>
  );
}
