'use client';

import { useEffect, useState } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const isInstalled =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    setInstalled(isInstalled);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setInstalled(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  async function trigger() {
    if (deferred) {
      await deferred.prompt();
      await deferred.userChoice;
      setDeferred(null);
      return;
    }
    const ua = navigator.userAgent || '';
    if (/android/i.test(ua)) {
      alert(
        'To install on Android:\n\n1. Open this site in Chrome\n2. Tap the ⋮ menu (top right)\n3. Tap "Add to Home Screen"\n4. Tap "Install"',
      );
    } else {
      alert(
        'To install on Desktop:\n\n• Chrome/Edge: Click the install icon in the address bar\n• Or: Menu → "Install StockFlow..."',
      );
    }
  }

  return { trigger, canInstall: !!deferred, installed };
}

export default function InstallButton({
  className,
  label = 'Install App',
  showWhenUnavailable = false,
}: {
  className?: string;
  label?: string;
  showWhenUnavailable?: boolean;
}) {
  const { trigger, canInstall, installed } = useInstallPrompt();
  if (installed) return null;
  if (!canInstall && !showWhenUnavailable) return null;
  return (
    <button type="button" onClick={trigger} className={className}>
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
      >
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      {label}
    </button>
  );
}

export function InstalledBadge() {
  const { installed } = useInstallPrompt();
  return (
    <span
      className={`lp-installed-badge ${installed ? 'show' : ''}`}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
      App installed
    </span>
  );
}
