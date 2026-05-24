import Link from 'next/link';

export default function ImpersonationBanner({
  businessName,
}: {
  businessName: string;
}) {
  return (
    <div
      className="sticky top-0 z-50"
      style={{
        background: '#7C3AED',
        color: '#fff',
        padding: '8px 14px',
        fontSize: 12.5,
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        boxShadow: '0 2px 8px rgba(0,0,0,.18)',
      }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        style={{ flexShrink: 0 }}
      >
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
      <span style={{ flex: 1 }}>
        Impersonating <strong>{businessName}</strong> — writes will be blocked.
      </span>
      <Link
        href="/dashboard/admin"
        style={{
          color: '#fff',
          background: 'rgba(255,255,255,.18)',
          padding: '4px 10px',
          borderRadius: 6,
          fontSize: 11.5,
          fontWeight: 700,
          textDecoration: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        Exit impersonation
      </Link>
    </div>
  );
}
