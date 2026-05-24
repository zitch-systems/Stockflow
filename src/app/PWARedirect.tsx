'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PWARedirect() {
  const router = useRouter();
  useEffect(() => {
    const isPWA =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      // iOS Safari
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    router.replace(isPWA ? '/login' : '/landing');
  }, [router]);
  return null;
}
