'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function Nav() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  useEffect(() => {
    setTheme(
      (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') ||
        'light',
    );
  }, []);
  function toggle() {
    const next = theme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('sf_theme', next);
    } catch {}
    setTheme(next);
  }

  return (
    <nav className="lp-nav">
      <div className="lp-container lp-nav-inner">
        <a href="#top" className="lp-brand">
          <div className="lp-brand-mark">S</div>
          <div className="lp-brand-text">
            Stock<span>Flow</span>
          </div>
        </a>
        <div className="lp-nav-links">
          <a href="#how" className="lp-nav-link lp-hide-sm">
            How it works
          </a>
          <a href="#roles" className="lp-nav-link lp-hide-sm">
            Roles
          </a>
          <a href="#pricing" className="lp-nav-link lp-hide-sm">
            Pricing
          </a>
          <a href="#faq" className="lp-nav-link lp-hide-sm">
            FAQ
          </a>
          <button
            type="button"
            className="lp-theme-btn"
            onClick={toggle}
            aria-label="Toggle theme"
            title="Toggle theme"
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
          <Link
            href="/login"
            className="lp-nav-link"
            style={{ background: 'rgba(255,255,255,.1)', color: '#fff' }}
          >
            Sign in
          </Link>
          <Link href="/signup" className="lp-btn lp-btn-primary">
            Get early access →
          </Link>
        </div>
      </div>
    </nav>
  );
}
