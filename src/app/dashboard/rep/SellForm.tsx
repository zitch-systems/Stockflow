'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';
import { formatNaira } from '@/lib/format';
import { recordSaleAction, type SaleLine } from './actions';

type Holding = { product_id: string; quantity: number };
type Product = {
  id: string;
  name: string;
  sku: string | null;
  sell_price: number | null;
  buy_price: number | null;
};
type Customer = { id: string; name: string };

type Row = {
  product_id: string;
  name: string;
  sku: string | null;
  onHand: number;
  defaultPrice: number;
  qty: string;
  price: string;
};

export default function SellForm({
  holdings,
  products,
  customers,
}: {
  holdings: Holding[];
  products: Product[];
  customers: Customer[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const initialRows = useMemo<Row[]>(() => {
    return holdings
      .filter((h) => h.quantity > 0)
      .map((h) => {
        const p = products.find((p) => p.id === h.product_id);
        return {
          product_id: h.product_id,
          name: p?.name ?? '— unknown',
          sku: p?.sku ?? null,
          onHand: Number(h.quantity ?? 0),
          defaultPrice: Number(p?.sell_price ?? 0),
          qty: '',
          price: String(p?.sell_price ?? ''),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [holdings, products]);

  const [rows, setRows] = useState<Row[]>(initialRows);
  const [customerName, setCustomerName] = useState('');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [paymentMode, setPaymentMode] = useState<'cash' | 'credit'>('cash');

  const total = rows.reduce(
    (s, r) => s + Number(r.qty || 0) * Number(r.price || 0),
    0,
  );
  const totalCases = rows.reduce((s, r) => s + Number(r.qty || 0), 0);

  function updateRow(index: number, patch: Partial<Row>) {
    setRows((rs) => {
      const next = [...rs];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }

  function reset() {
    setRows(initialRows.map((r) => ({ ...r, qty: '', price: String(r.defaultPrice) })));
    setCustomerName('');
    setCustomerId(null);
    setPaymentMode('cash');
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const lines: SaleLine[] = rows
      .filter((r) => Number(r.qty) > 0)
      .map((r) => ({
        product_id: r.product_id,
        quantity: Number(r.qty),
        unit_price: Number(r.price) || r.defaultPrice,
      }));
    if (lines.length === 0) {
      toast('Add a quantity to at least one product', 'err');
      return;
    }
    if (!customerName.trim()) {
      toast('Enter a customer name', 'err');
      return;
    }
    startTransition(async () => {
      const res = await recordSaleAction({
        customerName: customerName.trim(),
        customerId,
        paymentMode,
        lines,
      });
      if (res.ok) {
        toast(res.message || 'Sale recorded', 'ok');
        reset();
        router.refresh();
      } else {
        toast(res.error, 'err');
      }
    });
  }

  if (initialRows.length === 0) {
    return (
      <div className="dash-section">
        <div className="dash-empty">
          You have no stock on hand. Use <strong>Request Stock</strong> to ask your manager for
          more before recording sales.
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="dash-section">
      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: '1fr 1fr', marginBottom: 18 }}>
        <Field label="Customer name">
          <input
            list="rep-customer-list"
            value={customerName}
            onChange={(e) => {
              const name = e.target.value;
              setCustomerName(name);
              const match = customers.find((c) => c.name === name);
              setCustomerId(match?.id ?? null);
            }}
            placeholder="e.g. Mama Ngozi Stores"
            required
            style={inputStyle}
          />
          <datalist id="rep-customer-list">
            {customers.map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
        </Field>
        <Field label="Payment">
          <div style={{ display: 'flex', gap: 8 }}>
            {(['cash', 'credit'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setPaymentMode(m)}
                className="dash-badge"
                style={{
                  cursor: 'pointer',
                  background: paymentMode === m ? 'var(--brand)' : 'var(--surface-2)',
                  color: paymentMode === m ? '#fff' : 'var(--ts)',
                  border: `1px solid ${paymentMode === m ? 'var(--brand)' : 'var(--border)'}`,
                  padding: '8px 14px',
                  fontSize: 12,
                }}
              >
                {m === 'cash' ? 'Cash now' : 'On credit'}
              </button>
            ))}
          </div>
        </Field>
      </div>

      <div className="dash-table-wrap">
        <table className="dash-table">
          <thead>
            <tr>
              <th>Product</th>
              <th style={{ textAlign: 'right' }}>On hand</th>
              <th style={{ textAlign: 'right' }}>Unit price</th>
              <th style={{ textAlign: 'right' }}>Quantity</th>
              <th style={{ textAlign: 'right' }}>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const subtotal = Number(r.qty || 0) * Number(r.price || 0);
              return (
                <tr key={r.product_id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{r.name}</div>
                    {r.sku && (
                      <div style={{ fontSize: 11, color: 'var(--tm)' }}>{r.sku}</div>
                    )}
                  </td>
                  <td style={{ textAlign: 'right', color: 'var(--ts)' }}>{r.onHand}</td>
                  <td style={{ textAlign: 'right' }}>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={r.price}
                      onChange={(e) => updateRow(i, { price: e.target.value })}
                      style={{ ...inputStyle, width: 110, textAlign: 'right' }}
                    />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      max={r.onHand}
                      value={r.qty}
                      onChange={(e) => updateRow(i, { qty: e.target.value })}
                      style={{ ...inputStyle, width: 80, textAlign: 'right' }}
                      placeholder="0"
                    />
                  </td>
                  <td
                    style={{
                      textAlign: 'right',
                      fontWeight: 600,
                      color: subtotal > 0 ? 'var(--tp)' : 'var(--tm)',
                    }}
                  >
                    {formatNaira(subtotal)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 18,
          gap: 14,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ fontSize: 12, color: 'var(--tm)' }}>
            {totalCases} case{totalCases === 1 ? '' : 's'}
          </div>
          <div
            style={{
              fontSize: 22,
              fontFamily: 'var(--font-sora)',
              fontWeight: 700,
              color: 'var(--tp)',
            }}
          >
            {formatNaira(total)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={reset}
            disabled={pending}
            className="dash-badge"
            style={{ cursor: pending ? 'not-allowed' : 'pointer', padding: '10px 18px' }}
          >
            Reset
          </button>
          <button
            type="submit"
            disabled={pending || total === 0}
            className="dash-badge ok"
            style={{
              cursor: pending || total === 0 ? 'not-allowed' : 'pointer',
              opacity: total === 0 ? 0.6 : 1,
              padding: '10px 22px',
              fontSize: 13,
              fontWeight: 700,
              background: 'var(--accent)',
              color: '#fff',
            }}
          >
            {pending ? 'Recording…' : `Record ${paymentMode} sale`}
          </button>
        </div>
      </div>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        style={{
          display: 'block',
          fontSize: 12,
          fontWeight: 500,
          color: 'var(--ts)',
          marginBottom: 6,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 38,
  padding: '0 12px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--surface)',
  color: 'var(--tp)',
  fontSize: 14,
  outline: 'none',
};
