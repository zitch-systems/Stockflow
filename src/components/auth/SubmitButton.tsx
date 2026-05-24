'use client';

import { useFormStatus } from 'react-dom';

export default function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex w-full items-center justify-center gap-2 rounded-lg text-[14.5px] font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        height: '46px',
        background: 'var(--accent)',
        fontFamily: 'var(--font-sora)',
      }}
    >
      {pending && (
        <span
          className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white"
          aria-hidden
        />
      )}
      <span>{children}</span>
    </button>
  );
}
