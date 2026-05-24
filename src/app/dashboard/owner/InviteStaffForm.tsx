'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';
import { inviteStaffAction } from './actions';

export default function InviteStaffForm() {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'manager' | 'rep'>('rep');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await inviteStaffAction({ email, fullName, phone, role });
      if (res.ok) {
        toast(res.message || 'Invite sent', 'ok');
        setEmail('');
        setFullName('');
        setPhone('');
        setRole('rep');
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
      style={{ marginTop: 0 }}
    >
      <div className="dash-section-header">
        <h2 className="dash-section-title">Invite a staff member</h2>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '2fr 2fr 1fr 1fr auto',
          gap: 10,
          alignItems: 'end',
        }}
      >
        <Field label="Email" required>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="them@business.com"
            required
            style={inputStyle}
          />
        </Field>
        <Field label="Full name" required>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Full name"
            required
            style={inputStyle}
          />
        </Field>
        <Field label="Phone">
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+234…"
            style={inputStyle}
          />
        </Field>
        <Field label="Role" required>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as 'manager' | 'rep')}
            style={inputStyle}
          >
            <option value="rep">Sales rep</option>
            <option value="manager">Manager</option>
          </select>
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
          {pending ? 'Sending…' : 'Send invite'}
        </button>
      </div>
      <p style={{ marginTop: 10, color: 'var(--tm)', fontSize: 12 }}>
        They&apos;ll get an email with a link to set their password and land on the right
        dashboard. Already-registered emails will be rejected.
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
