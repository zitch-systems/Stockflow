'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';
import { bulkExtendSubscriptionsAction } from './actions';

export default function PlatformConfigForm() {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [days, setDays] = useState('7');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(days);
    if (!Number.isFinite(n) || n <= 0) {
      toast('Days must be a positive number', 'err');
      return;
    }
    if (!window.confirm(`Extend every active/trial subscription by ${n} days?`)) return;
    startTransition(async () => {
      const res = await bulkExtendSubscriptionsAction(n);
      if (res.ok) {
        toast(res.message || 'Done', 'ok');
        router.refresh();
      } else {
        toast(res.error, 'err');
      }
    });
  }

  return (
    <form
      onSubmit={submit}
      className="dash-section"
      style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr auto' }}
    >
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
          Extend every active/trial subscription by (days)
        </label>
        <input
          type="number"
          min="1"
          step="1"
          value={days}
          onChange={(e) => setDays(e.target.value)}
          style={{
            width: '100%',
            height: 38,
            padding: '0 12px',
            border: '1px solid var(--border)',
            borderRadius: 8,
            background: 'var(--surface)',
            color: 'var(--tp)',
            fontSize: 14,
            outline: 'none',
          }}
        />
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end' }}>
        <button
          type="submit"
          disabled={pending}
          className="dash-badge ok"
          style={{
            cursor: pending ? 'not-allowed' : 'pointer',
            opacity: pending ? 0.6 : 1,
            padding: '10px 22px',
            fontSize: 13,
            fontWeight: 700,
            background: 'var(--accent)',
            color: '#fff',
            height: 38,
          }}
        >
          {pending ? 'Extending…' : 'Extend all'}
        </button>
      </div>
    </form>
  );
}
