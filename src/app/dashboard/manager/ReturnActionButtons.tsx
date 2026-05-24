'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';
import { approveReturnAction, rejectReturnAction } from './actions';

export default function ReturnActionButtons({ returnId }: { returnId: string }) {
  const toast = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);

  function approve() {
    setBusy('approve');
    startTransition(async () => {
      const res = await approveReturnAction(returnId);
      setBusy(null);
      if (res.ok) {
        toast(res.message || 'Approved', 'ok');
        router.refresh();
      } else toast(res.error, 'err');
    });
  }
  function reject() {
    const reason = window.prompt('Reject this return? Optional reason:', '');
    if (reason === null) return;
    setBusy('reject');
    startTransition(async () => {
      const res = await rejectReturnAction(returnId, reason || undefined);
      setBusy(null);
      if (res.ok) {
        toast(res.message || 'Rejected', 'warn');
        router.refresh();
      } else toast(res.error, 'err');
    });
  }

  return (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
      <button
        type="button"
        onClick={reject}
        disabled={pending}
        className="dash-badge"
        style={{
          background: 'var(--danger-bg)',
          color: 'var(--danger)',
          border: '1px solid var(--danger)',
          cursor: pending ? 'not-allowed' : 'pointer',
          opacity: pending ? 0.6 : 1,
          padding: '4px 10px',
        }}
      >
        {busy === 'reject' ? '…' : 'Reject'}
      </button>
      <button
        type="button"
        onClick={approve}
        disabled={pending}
        className="dash-badge ok"
        style={{
          cursor: pending ? 'not-allowed' : 'pointer',
          opacity: pending ? 0.6 : 1,
          padding: '4px 10px',
          fontWeight: 700,
        }}
      >
        {busy === 'approve' ? '…' : 'Approve'}
      </button>
    </div>
  );
}
