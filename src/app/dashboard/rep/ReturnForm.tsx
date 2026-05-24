'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';
import { submitReturnAction } from './actions';

type Holding = { product_id: string; quantity: number };
type Product = { id: string; name: string };

export default function ReturnForm({
  holdings,
  products,
}: {
  holdings: Holding[];
  products: Product[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');

  const heldOnly = holdings
    .filter((h) => h.quantity > 0)
    .map((h) => {
      const p = products.find((p) => p.id === h.product_id);
      return { id: h.product_id, name: p?.name ?? '— unknown', onHand: h.quantity };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await submitReturnAction({
        productId,
        quantity: Number(quantity),
        reason,
      });
      if (res.ok) {
        toast(res.message || 'Return submitted', 'ok');
        setProductId('');
        setQuantity('');
        setReason('');
        router.refresh();
      } else {
        toast(res.error, 'err');
      }
    });
  }

  if (heldOnly.length === 0) {
    return null;
  }

  return (
    <form onSubmit={submit} className="dash-section">
      <div className="dash-section-header">
        <h2 className="dash-section-title">Return stock</h2>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr 3fr auto',
          gap: 10,
          alignItems: 'end',
        }}
      >
        <Field label="Product" required>
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            required
            style={inputStyle}
          >
            <option value="">Pick a product…</option>
            {heldOnly.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.onHand} on hand)
              </option>
            ))}
          </select>
        </Field>
        <Field label="Quantity" required>
          <input
            type="number"
            min="1"
            step="1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
            style={inputStyle}
          />
        </Field>
        <Field label="Reason" required>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Damaged in transit"
            required
            style={inputStyle}
          />
        </Field>
        <button
          type="submit"
          disabled={pending}
          className="dash-badge ok"
          style={{
            cursor: pending ? 'not-allowed' : 'pointer',
            opacity: pending ? 0.6 : 1,
            padding: '8px 18px',
            fontSize: 13,
            fontWeight: 700,
            background: 'var(--accent)',
            color: '#fff',
            height: 36,
          }}
        >
          {pending ? 'Sending…' : 'Submit return'}
        </button>
      </div>
      <p style={{ marginTop: 10, color: 'var(--tm)', fontSize: 12 }}>
        Your manager will approve or reject. Approved returns move stock back to the
        warehouse and out of your holdings.
      </p>
    </form>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        style={{
          display: 'block',
          fontSize: 11,
          color: 'var(--tm)',
          marginBottom: 4,
          textTransform: 'uppercase',
          letterSpacing: '.06em',
          fontWeight: 600,
        }}
      >
        {label}
        {required && <span style={{ color: 'var(--danger)' }}> *</span>}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 36,
  padding: '0 10px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--surface)',
  color: 'var(--tp)',
  fontSize: 13,
  outline: 'none',
};
