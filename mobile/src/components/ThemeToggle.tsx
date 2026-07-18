'use client';

import { useSyncExternalStore } from 'react';

// Theme lives on <html data-theme> (set pre-paint by the layout's inline
// script) and persists under the same sf_theme key the web app uses. The DOM
// attribute is the store; a custom event notifies subscribers of toggles.
const THEME_EVENT = 'sf-theme';

function subscribe(callback: () => void) {
  window.addEventListener(THEME_EVENT, callback);
  return () => window.removeEventListener(THEME_EVENT, callback);
}

function getSnapshot(): 'light' | 'dark' {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

function getServerSnapshot(): 'light' | 'dark' {
  return 'light';
}

export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function toggle() {
    const next = theme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('sf_theme', next);
    } catch {
      // storage unavailable (private mode) — theme just won't persist
    }
    window.dispatchEvent(new Event(THEME_EVENT));
  }

  return (
    <button type="button" className="theme-btn" onClick={toggle} aria-label="Toggle dark mode">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        {theme === 'dark' ? (
          <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
        ) : (
          <>
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
          </>
        )}
      </svg>
    </button>
  );
}
