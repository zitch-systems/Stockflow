'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';
import { addExpenseAction } from './actions';

const CATEGORIES = [
  'Fuel',
  'Salary',
  'Rent',
  'Utilities',
  'Supplies',
  'Transport',
  'Maintenance',
  'Other',
];

export default function ExpenseForm() {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await addExpenseAction({
        category,
        amount: Number(amount),
        description,
      });
      if (res.ok) {
        toast(res.message || 'Expense logged', 'ok');
        setAmount('');
        setDescription('');
        setCategory(CATEGORIES[0]);
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
      style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr 2fr auto' }}
    >
      <Field label="Category">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          style={inputStyle}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Amount (₦)">
        <input
          type="number"
          step="0.01"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          required
          style={inputStyle}
        />
      </Field>
      <Field label="Description">
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Generator fuel for branch"
          required
          style={inputStyle}
        />
      </Field>
      <Field label="&nbsp;">
        <button
          type="submit"
          disabled={pending}
          className="dash-badge ok"
          style={{
            cursor: pending ? 'not-allowed' : 'pointer',
            opacity: pending ? 0.6 : 1,
            padding: '10px 18px',
            fontSize: 13,
            fontWeight: 700,
            background: 'var(--accent)',
            color: '#fff',
            height: 38,
          }}
        >
          {pending ? 'Saving…' : 'Log expense'}
        </button>
      </Field>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
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
        dangerouslySetInnerHTML={{ __html: label }}
      />
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
