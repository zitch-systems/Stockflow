'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';
import { setStaffActiveAction } from './actions';

export default function StaffActionButton({
  staffId,
  isActive,
  isSelf,
}: {
  staffId: string;
  isActive: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  if (isSelf) {
    return (
      <span className="dash-badge" style={{ padding: '4px 10px', opacity: 0.6 }}>
        You
      </span>
    );
  }

  function toggle() {
    const verb = isActive ? 'Deactivate' : 'Reactivate';
    if (!window.confirm(`${verb} this staff member?`)) return;
    setBusy(true);
    startTransition(async () => {
      const res = await setStaffActiveAction(staffId, !isActive);
      setBusy(false);
      if (res.ok) {
        toast(res.message || 'Done', isActive ? 'warn' : 'ok');
        router.refresh();
      } else toast(res.error, 'err');
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      className={`dash-badge ${isActive ? '' : 'ok'}`}
      style={{
        cursor: pending ? 'not-allowed' : 'pointer',
        opacity: pending ? 0.6 : 1,
        background: isActive ? 'var(--danger-bg)' : undefined,
        color: isActive ? 'var(--danger)' : undefined,
        border: isActive ? '1px solid var(--danger)' : undefined,
        padding: '4px 10px',
      }}
    >
      {busy ? '…' : isActive ? 'Deactivate' : 'Reactivate'}
    </button>
  );
}
