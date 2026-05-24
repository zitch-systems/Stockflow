'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';
import { formatNaira } from '@/lib/format';
import { requestStockAction, type RequestLine } from './actions';

type Product = {
  id: string;
  name: string;
  sku: string | null;
  sell_price: number | null;
};

type Row = {
  product_id: string;
  name: string;
  sku: string | null;
  price: number;
  qty: string;
};

export default function RequestStockForm({ products }: { products: Product[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [notes, setNotes] = useState('');

  const initialRows = useMemo<Row[]>(
    () =>
      products
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((p) => ({
          product_id: p.id,
          name: p.name,
          sku: p.sku ?? null,
          price: Number(p.sell_price ?? 0),
          qty: '',
        })),
    [products],
  );
  const [rows, setRows] = useState<Row[]>(initialRows);

  const totalCases = rows.reduce((s, r) => s + Number(r.qty || 0), 0);
  const totalValue = rows.reduce(
    (s, r) => s + Number(r.qty || 0) * r.price,
    0,
  );

  function reset() {
    setRows(initialRows.map((r) => ({ ...r, qty: '' })));
    setNotes('');
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const lines: RequestLine[] = rows
      .filter((r) => Number(r.qty) > 0)
      .map((r) => ({ product_id: r.product_id, quantity: Number(r.qty) }));
    if (lines.length === 0) {
      toast('Set a quantity on at least one product', 'err');
      return;
    }
    startTransition(async () => {
      const res = await requestStockAction({ lines, notes: notes.trim() });
      if (res.ok) {
        toast(res.message || 'Request sent', 'ok');
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
          No products defined for your tenant yet. Ask your manager to add products.
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="dash-section">
      <div className="dash-table-wrap">
        <table className="dash-table">
          <thead>
            <tr>
              <th>Product</th>
              <th style={{ textAlign: 'right' }}>Sell price</th>
              <th style={{ textAlign: 'right' }}>Cases requested</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.product_id}>
                <td>
                  <div style={{ fontWeight: 600 }}>{r.name}</div>
                  {r.sku && (
                    <div style={{ fontSize: 11, color: 'var(--tm)' }}>{r.sku}</div>
                  )}
                </td>
                <td style={{ textAlign: 'right', color: 'var(--ts)' }}>
                  {formatNaira(r.price)}
                </td>
                <td style={{ textAlign: 'right' }}>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={r.qty}
                    onChange={(e) => {
                      const v = e.target.value;
                      setRows((rs) => {
                        const next = [...rs];
                        next[i] = { ...next[i], qty: v };
                        return next;
                      });
                    }}
                    placeholder="0"
                    style={{
                      width: 80,
                      height: 36,
                      padding: '0 10px',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      background: 'var(--surface)',
                      color: 'var(--tp)',
                      fontSize: 14,
                      outline: 'none',
                      textAlign: 'right',
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 14 }}>
        <label
          htmlFor="req-notes"
          style={{ display: 'block', fontSize: 12, color: 'var(--ts)', marginBottom: 6 }}
        >
          Notes (optional)
        </label>
        <textarea
          id="req-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Anything the manager should know"
          style={{
            width: '100%',
            padding: '8px 12px',
            border: '1px solid var(--border)',
            borderRadius: 8,
            background: 'var(--surface)',
            color: 'var(--tp)',
            fontSize: 14,
            outline: 'none',
            resize: 'vertical',
            fontFamily: 'inherit',
          }}
        />
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
            {totalCases} case{totalCases === 1 ? '' : 's'} · est. value
          </div>
          <div
            style={{
              fontSize: 22,
              fontFamily: 'var(--font-sora)',
              fontWeight: 700,
              color: 'var(--tp)',
            }}
          >
            {formatNaira(totalValue)}
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
            Clear
          </button>
          <button
            type="submit"
            disabled={pending || totalCases === 0}
            className="dash-badge ok"
            style={{
              cursor: pending || totalCases === 0 ? 'not-allowed' : 'pointer',
              opacity: totalCases === 0 ? 0.6 : 1,
              padding: '10px 22px',
              fontSize: 13,
              fontWeight: 700,
              background: 'var(--accent)',
              color: '#fff',
            }}
          >
            {pending ? 'Sending…' : 'Send request'}
          </button>
        </div>
      </div>
    </form>
  );
}
