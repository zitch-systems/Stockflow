'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';
import { setTenantStatusAction } from './actions';

export default function TenantStatusButtons({
  tenantId,
  status,
}: {
  tenantId: string;
  status: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<'suspend' | 'reactivate' | null>(null);
  const isSuspended = status === 'suspended';

  function toggle() {
    if (isSuspended) {
      if (!window.confirm('Reactivate this tenant?')) return;
      setBusy('reactivate');
      startTransition(async () => {
        const res = await setTenantStatusAction(tenantId, 'active');
        setBusy(null);
        if (res.ok) {
          toast(res.message || 'Reactivated', 'ok');
          router.refresh();
        } else toast(res.error, 'err');
      });
    } else {
      const reason = window.prompt('Suspend — reason (optional):', '');
      if (reason === null) return;
      setBusy('suspend');
      startTransition(async () => {
        const res = await setTenantStatusAction(tenantId, 'suspended', reason || undefined);
        setBusy(null);
        if (res.ok) {
          toast(res.message || 'Suspended', 'warn');
          router.refresh();
        } else toast(res.error, 'err');
      });
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      className={`dash-badge ${isSuspended ? 'ok' : ''}`}
      style={{
        cursor: pending ? 'not-allowed' : 'pointer',
        opacity: pending ? 0.6 : 1,
        background: isSuspended ? undefined : 'var(--danger-bg)',
        color: isSuspended ? undefined : 'var(--danger)',
        border: isSuspended ? undefined : '1px solid var(--danger)',
        padding: '4px 10px',
      }}
    >
      {busy
        ? '…'
        : isSuspended
          ? 'Reactivate'
          : 'Suspend'}
    </button>
  );
}
