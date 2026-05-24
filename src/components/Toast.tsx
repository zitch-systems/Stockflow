'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

type ToastType = 'ok' | 'err' | 'warn';
type ToastFn = (message: string, type?: ToastType) => void;

const ToastContext = createContext<ToastFn | null>(null);

export function useToast(): ToastFn {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

const COLORS: Record<ToastType, string> = {
  ok: '#16A34A',
  err: '#DC2626',
  warn: '#D97706',
};

function Icon({ type }: { type: ToastType }) {
  if (type === 'ok') {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );
  }
  if (type === 'warn') {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
      >
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    );
  }
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<{ text: string; type: ToastType } | null>(null);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback<ToastFn>((text, type = 'ok') => {
    setMsg({ text, type });
    setVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(false), 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed left-1/2 z-[99999] flex max-w-[min(90vw,360px)] min-w-[180px] items-center gap-2 overflow-hidden text-ellipsis whitespace-nowrap rounded-full px-4 py-2.5 text-[13px] font-medium text-white shadow-[0_6px_24px_rgba(0,0,0,.3)] transition-all"
        style={{
          bottom: 'calc(env(safe-area-inset-bottom,0px) + 76px)',
          fontFamily: 'var(--font-sans)',
          background: msg ? COLORS[msg.type] : '#0F1923',
          opacity: visible ? 1 : 0,
          transform: `translateX(-50%) translateY(${visible ? '0' : '16px'})`,
        }}
      >
        {msg && (
          <>
            <Icon type={msg.type} />
            <span className="overflow-hidden text-ellipsis">{msg.text}</span>
          </>
        )}
      </div>
    </ToastContext.Provider>
  );
}
