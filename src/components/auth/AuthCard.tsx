import type { ReactNode } from 'react';

export default function AuthCard({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div
      className="relative w-full max-w-[420px] overflow-hidden rounded-2xl border p-9"
      style={{
        background: 'var(--surface)',
        borderColor: 'var(--border)',
        boxShadow: 'var(--shadow)',
      }}
    >
      <div
        className="absolute inset-x-0 top-0 h-1"
        style={{
          background:
            'linear-gradient(90deg, var(--brand) 0%, var(--brand-mid) 50%, var(--accent) 100%)',
        }}
      />
      {eyebrow && (
        <div
          className="mb-2 text-[11.5px] font-semibold uppercase tracking-[.14em]"
          style={{ color: 'var(--brand-mid)' }}
        >
          {eyebrow}
        </div>
      )}
      <h1
        className="mb-2 text-[28px] font-bold leading-tight tracking-tight"
        style={{ fontFamily: 'var(--font-sora)', color: 'var(--tp)' }}
      >
        {title}
      </h1>
      {subtitle && (
        <p className="mb-6 text-[14.5px]" style={{ color: 'var(--ts)' }}>
          {subtitle}
        </p>
      )}
      {children}
      {footer && (
        <div
          className="mt-4 text-center text-[13.5px]"
          style={{ color: 'var(--ts)' }}
        >
          {footer}
        </div>
      )}
    </div>
  );
}
