'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';
import {
  changePasswordAction,
  updateProfileAction,
} from '@/lib/actions/settings';
import type { Profile } from '@/lib/types';

export default function SettingsTab({ profile }: { profile: Profile }) {
  return (
    <>
      <div className="dash-page-header">
        <div className="dash-page-block">
          <div className="dash-page-eyebrow">{profile.email}</div>
          <h1 className="dash-page-title">My account</h1>
          <p className="dash-page-sub">
            Keep your name, phone, and password up to date.
          </p>
        </div>
      </div>
      <ProfileForm profile={profile} />
      <PasswordForm />
    </>
  );
}

function ProfileForm({ profile }: { profile: Profile }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [fullName, setFullName] = useState(profile.full_name ?? '');
  const [phone, setPhone] = useState(profile.phone ?? '');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await updateProfileAction({ fullName, phone });
      if (res.ok) {
        toast(res.message || 'Saved', 'ok');
        router.refresh();
      } else {
        toast(res.error, 'err');
      }
    });
  }

  return (
    <form onSubmit={submit} className="dash-section">
      <div className="dash-section-header">
        <h2 className="dash-section-title">Profile</h2>
      </div>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
        <Field label="Full name" required>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Your full name"
            required
            style={inputStyle}
          />
        </Field>
        <Field label="Phone (optional)">
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+234…"
            style={inputStyle}
          />
        </Field>
        <Field label="Email (read-only)">
          <input
            type="email"
            value={profile.email ?? ''}
            disabled
            style={{ ...inputStyle, background: 'var(--surface-2)', color: 'var(--tm)' }}
          />
        </Field>
        <Field label="Role (read-only)">
          <input
            type="text"
            value={profile.role.replace('_', ' ')}
            disabled
            style={{ ...inputStyle, background: 'var(--surface-2)', color: 'var(--tm)' }}
          />
        </Field>
      </div>
      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
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
          {pending ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}

function PasswordForm() {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await changePasswordAction({ password, confirm });
      if (res.ok) {
        toast(res.message || 'Saved', 'ok');
        setPassword('');
        setConfirm('');
      } else {
        toast(res.error, 'err');
      }
    });
  }

  return (
    <form onSubmit={submit} className="dash-section">
      <div className="dash-section-header">
        <h2 className="dash-section-title">Change password</h2>
      </div>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
        <Field label="New password" required>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            autoComplete="new-password"
            required
            style={inputStyle}
          />
        </Field>
        <Field label="Confirm new password" required>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Re-enter password"
            autoComplete="new-password"
            required
            style={inputStyle}
          />
        </Field>
      </div>
      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="submit"
          disabled={pending || !password}
          className="dash-badge ok"
          style={{
            cursor: pending || !password ? 'not-allowed' : 'pointer',
            opacity: pending || !password ? 0.6 : 1,
            padding: '10px 22px',
            fontSize: 13,
            fontWeight: 700,
            background: 'var(--brand)',
            color: '#fff',
            height: 38,
          }}
        >
          {pending ? 'Updating…' : 'Update password'}
        </button>
      </div>
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
          fontSize: 12,
          fontWeight: 500,
          color: 'var(--ts)',
          marginBottom: 6,
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
  height: 38,
  padding: '0 12px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--surface)',
  color: 'var(--tp)',
  fontSize: 14,
  outline: 'none',
};
