'use client';

import { useEffect, useState } from 'react';

export function useIOSDetect() {
  const [isIOSSafari, setIsIOSSafari] = useState(false);
  useEffect(() => {
    const ua = navigator.userAgent || '';
    const isIOS =
      /iphone|ipad|ipod/i.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isSafari =
      !/chrome|android|crios|fxios/i.test(ua) && /safari/i.test(ua);
    setIsIOSSafari(isIOS && isSafari);
  }, []);
  return isIOSSafari;
}

export function IOSModalTrigger({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        const m = document.getElementById('lp-ios-modal');
        if (m) {
          m.style.display = 'flex';
          document.body.style.overflow = 'hidden';
        }
      }}
    >
      {children}
    </button>
  );
}

export function IOSModal() {
  return (
    <div
      id="lp-ios-modal"
      style={{
        display: 'none',
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,.65)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          (e.currentTarget as HTMLDivElement).style.display = 'none';
          document.body.style.overflow = '';
        }
      }}
    >
      <div
        style={{
          background: 'var(--surface)',
          borderRadius: '22px 22px 0 0',
          padding: '28px 22px 36px',
          maxWidth: 480,
          width: '100%',
          margin: '0 auto',
        }}
      >
        <div
          style={{
            width: 40,
            height: 4,
            borderRadius: 2,
            background: 'var(--border)',
            margin: '0 auto 22px',
          }}
        />
        <h3
          style={{
            fontFamily: 'var(--font-sora)',
            fontSize: '1.15rem',
            fontWeight: 700,
            marginBottom: 6,
          }}
        >
          Install on iPhone / iPad
        </h3>
        <p
          style={{
            color: 'var(--ts)',
            fontSize: '.84rem',
            marginBottom: 22,
          }}
        >
          Open <strong>Safari</strong>, then follow these steps:
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
          {[
            ['1', <>Open <strong>stockflow.com.ng</strong> in <strong>Safari</strong> (not Chrome).</>],
            ['2', <>Tap the <strong>Share</strong> button at the bottom of the screen.</>],
            ['3', <>Scroll down and tap <strong>&ldquo;Add to Home Screen&rdquo;</strong>.</>],
            ['✓', <>Tap <strong>&ldquo;Add&rdquo;</strong> — StockFlow appears on your home screen!</>],
          ].map(([n, body], i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  background: n === '✓' ? 'var(--success)' : 'var(--brand)',
                  color: '#fff',
                  fontFamily: 'var(--font-sora)',
                  fontWeight: 700,
                  fontSize: '.82rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {n}
              </div>
              <div style={{ fontSize: '.88rem', paddingTop: 6 }}>{body}</div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            const m = document.getElementById('lp-ios-modal');
            if (m) m.style.display = 'none';
            document.body.style.overflow = '';
          }}
          style={{
            width: '100%',
            padding: 14,
            borderRadius: 11,
            background: 'var(--brand)',
            color: '#fff',
            fontFamily: 'var(--font-sora)',
            fontWeight: 700,
            fontSize: '.95rem',
            border: 'none',
            cursor: 'pointer',
            minHeight: 48,
          }}
        >
          Got it, thanks!
        </button>
      </div>
    </div>
  );
}

export function IOSBottomBanner() {
  const isIOSSafari = useIOSDetect();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isIOSSafari) return;
    if (localStorage.getItem('sf_ios_dismissed') === '1') return;
    const t = setTimeout(() => setVisible(true), 2000);
    return () => clearTimeout(t);
  }, [isIOSSafari]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 200,
        background: 'var(--brand)',
        color: '#fff',
        padding: '14px 20px 20px',
        borderTop: '2px solid var(--accent)',
        boxShadow: '0 -4px 20px rgba(0,0,0,.25)',
      }}
    >
      <div
        style={{
          maxWidth: 480,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            flexShrink: 0,
            background: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icon-192.png"
            alt="StockFlow"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontFamily: 'var(--font-sora)',
              fontWeight: 700,
              fontSize: 14,
              marginBottom: 4,
            }}
          >
            Install StockFlow on your iPhone
          </div>
          <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.8)', lineHeight: 1.5 }}>
            Tap Share, then <strong>&ldquo;Add to Home Screen&rdquo;</strong> to install the app.
          </div>
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => {
            localStorage.setItem('sf_ios_dismissed', '1');
            setVisible(false);
          }}
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(255,255,255,.6)',
            fontSize: 20,
            cursor: 'pointer',
            padding: '0 0 0 8px',
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}
