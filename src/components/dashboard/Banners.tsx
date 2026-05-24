'use client';

import { useState } from 'react';
import type { Tenant } from '@/lib/types';

export default function Banners({
  tenant,
  daysUntilExpiry,
}: {
  tenant: Tenant | null;
  daysUntilExpiry: number | null;
}) {
  const [expiryHidden, setExpiryHidden] = useState(false);

  if (!tenant) return null;

  const showSuspended = tenant.status === 'suspended';
  const showExpiry =
    !expiryHidden &&
    daysUntilExpiry !== null &&
    daysUntilExpiry <= 7;

  if (!showSuspended && !showExpiry) return null;

  return (
    <div className="sticky top-0 z-50 flex flex-col">
      {showSuspended && (
        <div
          className="flex items-center gap-2.5 px-3.5 py-2 text-[12.5px] font-medium text-white shadow-[0_2px_8px_rgba(0,0,0,.15)]"
          style={{ background: '#DC2626' }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            className="flex-shrink-0"
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span className="flex-1">
            <strong>Account suspended.</strong>{' '}
            {tenant.suspension_reason
              ? `Reason: ${tenant.suspension_reason}. `
              : ''}
            Some actions may be blocked. Contact support to reactivate.
          </span>
        </div>
      )}
      {showExpiry && daysUntilExpiry !== null && (
        <div
          className="flex items-center gap-2.5 px-3.5 py-2 text-[12.5px] font-medium text-white shadow-[0_2px_8px_rgba(0,0,0,.15)]"
          style={{
            background: daysUntilExpiry <= 0 ? '#92400E' : '#B45309',
          }}
        >
          <span className="flex-1">
            {daysUntilExpiry <= 0
              ? `⚠ ${tenant.business_name || tenant.name || 'Your account'}: subscription expired. Contact support to renew.`
              : `⏰ ${tenant.business_name || tenant.name || 'Your account'}: subscription expires in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? '' : 's'}. Renew soon.`}
          </span>
          <a
            href="mailto:support@stockflow.com.ng"
            className="whitespace-nowrap font-bold"
            style={{ color: '#FDE68A' }}
          >
            Renew now
          </a>
          <button
            type="button"
            onClick={() => setExpiryHidden(true)}
            aria-label="Dismiss"
            className="px-1 text-lg leading-none text-white"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
