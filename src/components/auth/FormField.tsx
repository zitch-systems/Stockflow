'use client';

import { useState, type InputHTMLAttributes } from 'react';

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  reveal?: boolean;
};

export default function FormField({ label, reveal, id, type, ...rest }: Props) {
  const [shown, setShown] = useState(false);
  const inputType = reveal && type === 'password' ? (shown ? 'text' : 'password') : type;

  return (
    <div className="relative mb-3.5">
      <label
        htmlFor={id}
        className="mb-1.5 block text-[12.5px] font-medium"
        style={{ color: 'var(--ts)' }}
      >
        {label}
      </label>
      <input
        id={id}
        type={inputType}
        {...rest}
        className="w-full rounded-lg border px-3 outline-none transition focus:shadow-[0_0_0_3px_var(--brand-light)]"
        style={{
          height: '42px',
          paddingRight: reveal ? '42px' : '12px',
          borderColor: 'var(--border)',
          background: 'var(--surface)',
          color: 'var(--tp)',
          fontSize: '14px',
        }}
      />
      {reveal && (
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? 'Hide password' : 'Show password'}
          className="absolute right-1.5 bottom-1.5 flex h-[30px] w-[30px] items-center justify-center rounded-md transition hover:bg-[var(--surface-2)]"
          style={{ color: 'var(--tm)' }}
        >
          {shown ? (
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          ) : (
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      )}
    </div>
  );
}
