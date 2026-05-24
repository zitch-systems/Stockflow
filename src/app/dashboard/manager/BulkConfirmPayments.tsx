'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';
import { formatDateTime, formatNaira } from '@/lib/format';
import {
  bulkConfirmPaymentsAction,
} from './actions';
import PaymentActionButtons from './PaymentActionButtons';

export type PendingPaymentRow = {
  id: string;
  rep_id: string;
  amount: number | null;
  customer_name: string | null;
  method: string | null;
  created_at: string;
  status: string;
  note: string | null;
};

export default function BulkConfirmPayments({
  payments,
}: {
  payments: PendingPaymentRow[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    if (selected.size === payments.length) setSelected(new Set());
    else setSelected(new Set(payments.map((p) => p.id)));
  }

  const totalSelected = payments
    .filter((p) => selected.has(p.id))
    .reduce((s, p) => s + Number(p.amount ?? 0), 0);

  function doBulk() {
    if (selected.size === 0) {
      toast('Select at least one payment', 'err');
      return;
    }
    if (
      !window.confirm(
        `Confirm ${selected.size} payment${selected.size === 1 ? '' : 's'} totalling ${formatNaira(totalSelected)}?`,
      )
    )
      return;
    const ids = Array.from(selected);
    startTransition(async () => {
      const res = await bulkConfirmPaymentsAction(ids);
      if (res.ok) {
        if (res.failed === 0) {
          toast(`Confirmed ${res.confirmed} payment${res.confirmed === 1 ? '' : 's'}`, 'ok');
        } else {
          toast(
            `Confirmed ${res.confirmed} of ${res.total}. ${res.failed} could not be confirmed.`,
            'warn',
          );
        }
        setSelected(new Set());
        router.refresh();
      } else {
        toast(res.error, 'err');
      }
    });
  }

  return (
    <section className="dash-section">
      <div className="dash-section-header" style={{ flexWrap: 'wrap', gap: 10 }}>
        <h2 className="dash-section-title">
          Pending queue · {payments.length}
        </h2>
        {selected.size > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, color: 'var(--ts)' }}>
              {selected.size} selected · {formatNaira(totalSelected)}
            </span>
            <button
              type="button"
              onClick={doBulk}
              disabled={pending}
              className="dash-badge ok"
              style={{
                cursor: pending ? 'not-allowed' : 'pointer',
                opacity: pending ? 0.6 : 1,
                padding: '6px 14px',
                fontWeight: 700,
                background: 'var(--accent)',
                color: '#fff',
              }}
            >
              {pending ? 'Confirming…' : 'Confirm selected'}
            </button>
          </div>
        )}
      </div>
      {payments.length === 0 ? (
        <div className="dash-empty">No payments waiting.</div>
      ) : (
        <div className="dash-table-wrap">
          <table className="dash-table">
            <thead>
              <tr>
                <th style={{ width: 32 }}>
                  <input
                    type="checkbox"
                    checked={selected.size === payments.length && payments.length > 0}
                    onChange={toggleAll}
                    aria-label="Select all"
                    style={{ cursor: 'pointer' }}
                  />
                </th>
                <th>When</th>
                <th>Customer</th>
                <th>Method</th>
                <th>Note</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => toggle(p.id)}
                      aria-label={`Select ${p.id}`}
                      style={{ cursor: 'pointer' }}
                    />
                  </td>
                  <td style={{ color: 'var(--ts)' }}>{formatDateTime(p.created_at)}</td>
                  <td>{p.customer_name || '—'}</td>
                  <td>{p.method || '—'}</td>
                  <td style={{ color: 'var(--ts)' }}>{p.note || '—'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>
                    {formatNaira(Number(p.amount ?? 0))}
                  </td>
                  <td>
                    <PaymentActionButtons paymentId={p.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
