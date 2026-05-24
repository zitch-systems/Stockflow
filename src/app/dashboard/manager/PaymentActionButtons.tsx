'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';
import { confirmPaymentAction, rejectPaymentAction } from './actions';

export default function PaymentActionButtons({
  paymentId,
  compact,
}: {
  paymentId: string;
  compact?: boolean;
}) {
  const toast = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<'confirm' | 'reject' | null>(null);

  function doConfirm() {
    setBusy('confirm');
    startTransition(async () => {
      const res = await confirmPaymentAction(paymentId);
      setBusy(null);
      if (res.ok) {
        toast(res.message || 'Payment confirmed', 'ok');
        router.refresh();
      } else {
        toast(res.error, 'err');
      }
    });
  }

  function doReject() {
    const reason = window.prompt('Reject this payment? Optional reason:', '');
    if (reason === null) return; // user cancelled
    setBusy('reject');
    startTransition(async () => {
      const res = await rejectPaymentAction(paymentId, reason || undefined);
      setBusy(null);
      if (res.ok) {
        toast(res.message || 'Payment rejected', 'warn');
        router.refresh();
      } else {
        toast(res.error, 'err');
      }
    });
  }

  const size = compact ? 'compact' : 'full';
  return (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
      <button
        type="button"
        onClick={doReject}
        disabled={pending}
        className="dash-badge"
        style={{
          background: 'var(--danger-bg)',
          color: 'var(--danger)',
          border: '1px solid var(--danger)',
          cursor: pending ? 'not-allowed' : 'pointer',
          opacity: pending ? 0.6 : 1,
          padding: size === 'compact' ? '4px 10px' : '6px 12px',
        }}
      >
        {busy === 'reject' ? '…' : 'Reject'}
      </button>
      <button
        type="button"
        onClick={doConfirm}
        disabled={pending}
        className="dash-badge ok"
        style={{
          cursor: pending ? 'not-allowed' : 'pointer',
          opacity: pending ? 0.6 : 1,
          padding: size === 'compact' ? '4px 10px' : '6px 12px',
          fontWeight: 700,
        }}
      >
        {busy === 'confirm' ? '…' : 'Confirm'}
      </button>
    </div>
  );
}
