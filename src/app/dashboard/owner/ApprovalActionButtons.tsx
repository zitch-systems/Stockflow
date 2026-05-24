'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';
import { resolveApprovalAction } from './actions';

export default function ApprovalActionButtons({ approvalId }: { approvalId: string }) {
  const toast = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);

  function decide(decision: 'approved' | 'rejected') {
    const notes =
      decision === 'rejected'
        ? window.prompt('Reject — optional reason:', '')
        : null;
    if (decision === 'rejected' && notes === null) return; // cancelled

    setBusy(decision === 'approved' ? 'approve' : 'reject');
    startTransition(async () => {
      const res = await resolveApprovalAction(
        approvalId,
        decision,
        notes || undefined,
      );
      setBusy(null);
      if (res.ok) {
        toast(res.message || 'Done', decision === 'approved' ? 'ok' : 'warn');
        router.refresh();
      } else {
        toast(res.error, 'err');
      }
    });
  }

  return (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
      <button
        type="button"
        onClick={() => decide('rejected')}
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
        onClick={() => decide('approved')}
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
