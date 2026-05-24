'use client';

import { useState, type ReactNode } from 'react';
import { logoutAction } from '@/app/(auth)/actions';
import type { Profile } from '@/lib/types';

export type NavItem = {
  key: string;
  label: string;
  icon: ReactNode;
  section?: string;
};

export default function Sidebar({
  brandRoleLabel,
  items,
  active,
  onSelect,
  profile,
  open,
  onCloseMobile,
}: {
  brandRoleLabel: string;
  items: NavItem[];
  active: string;
  onSelect: (key: string) => void;
  profile: Profile;
  open: boolean;
  onCloseMobile: () => void;
}) {
  const initials = (profile.full_name || profile.email || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || '··';

  // Group items by section
  const sections: Array<{ section: string | undefined; items: NavItem[] }> = [];
  for (const item of items) {
    const tail = sections[sections.length - 1];
    if (tail && tail.section === item.section) tail.items.push(item);
    else sections.push({ section: item.section, items: [item] });
  }

  return (
    <aside className={`dash-sidebar ${open ? 'open' : ''}`}>
      <div className="dash-brand">
        <div className="dash-brand-mark">S</div>
        <div>
          <div className="dash-brand-text">
            Stock<span>Flow</span>
          </div>
          <div className="dash-brand-role">{brandRoleLabel}</div>
        </div>
      </div>

      {sections.map((s, i) => (
        <div key={i}>
          {s.section && <div className="dash-nav-section">{s.section}</div>}
          {s.items.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`dash-nav-link ${active === item.key ? 'active' : ''}`}
              onClick={() => {
                onSelect(item.key);
                onCloseMobile();
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      ))}

      <div className="dash-sidebar-footer">
        <ThemeToggle />
        <div className="dash-user-card" style={{ marginTop: 8 }}>
          <div className="dash-user-avatar">{initials}</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="dash-user-name">
              {profile.full_name || profile.email}
            </div>
            <div className="dash-user-role">{profile.role.replace('_', ' ')}</div>
          </div>
        </div>
        <form action={logoutAction} style={{ marginTop: 8 }}>
          <button
            type="submit"
            className="dash-nav-link"
            style={{ color: 'var(--danger)' }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  // Initialize from DOM on mount
  if (typeof document !== 'undefined' && theme === 'light') {
    const cur = document.documentElement.getAttribute('data-theme') as
      | 'light'
      | 'dark'
      | null;
    if (cur === 'dark') setTheme('dark');
  }
  function toggle() {
    const next = theme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('sf_theme', next);
    } catch {}
    setTheme(next);
  }
  return (
    <button type="button" className="dash-nav-link" onClick={toggle}>
      {theme === 'dark' ? (
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
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
          strokeWidth="1.8"
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
      {theme === 'dark' ? 'Dark' : 'Light'} mode
    </button>
  );
}
