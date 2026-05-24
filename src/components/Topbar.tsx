'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type CTA = { label: string; href: string };

export default function Topbar({
  rightLabel,
  cta,
}: {
  rightLabel?: string;
  cta?: CTA;
}) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const t =
      (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') ||
      'light';
    setTheme(t);
  }, []);

  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('sf_theme', next);
    } catch {}
    setTheme(next);
  }

  return (
    <div
      className="flex h-[60px] items-center justify-between px-6"
      style={{ background: 'var(--brand)' }}
    >
      <Link href="/landing" className="flex items-center gap-2.5 text-white">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-lg font-extrabold"
          style={{
            color: 'var(--brand)',
            fontFamily: 'var(--font-sora)',
          }}
        >
          S
        </div>
        <div
          className="text-lg font-bold tracking-tight text-white"
          style={{ fontFamily: 'var(--font-sora)' }}
        >
          Stock<span style={{ color: 'var(--accent)' }}>Flow</span>
        </div>
      </Link>

      <div className="flex items-center gap-1.5">
        {rightLabel && (
          <span
            className="hidden cursor-default rounded-md px-3 py-1.5 text-[13.5px] font-medium sm:inline-block"
            style={{ color: 'rgba(255,255,255,.7)' }}
          >
            {rightLabel}
          </span>
        )}
        {cta && (
          <Link
            href={cta.href}
            className="rounded-md px-3 py-1.5 text-[13.5px] font-semibold text-white transition hover:no-underline"
            style={{ background: 'rgba(255,255,255,.12)' }}
          >
            {cta.label}
          </Link>
        )}
        <button
          type="button"
          onClick={toggleTheme}
          aria-label="Toggle theme"
          title="Toggle theme"
          className="ml-1 inline-flex h-[34px] w-[34px] items-center justify-center rounded-md text-white transition hover:bg-white/20"
          style={{ background: 'rgba(255,255,255,.1)' }}
        >
          {theme === 'dark' ? (
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
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
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
