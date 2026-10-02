"use client";
import {
  useEffect,
  useRef,
  type ReactNode,
  type ButtonHTMLAttributes,
} from "react";
export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    home: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="2" />
        <rect x="14" y="3" width="7" height="7" rx="2" />
        <rect x="3" y="14" width="7" height="7" rx="2" />
        <rect x="14" y="14" width="7" height="7" rx="2" />
      </>
    ),
    pos: (
      <>
        <path d="M3 4h2l3 12h11l2-8H6" />
        <circle cx="9" cy="20" r="1" />
        <circle cx="18" cy="20" r="1" />
      </>
    ),
    inventory: (
      <>
        <path d="m12 3 9 5v8l-9 5-9-5V8l9-5Z" />
        <path d="m3 8 9 5 9-5M12 13v8M8 5l9 5" />
      </>
    ),
    sales: (
      <>
        <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
        <path d="M9 8h6M9 12h6" />
      </>
    ),
    customers: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 21v-2a6 6 0 0 1 12 0v2M17 5a3 3 0 0 1 0 6M21 21v-2a6 6 0 0 0-3-5" />
      </>
    ),
    bell: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" />
      </>
    ),
    scan: (
      <>
        <path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5M7 8v8M10 8v8M14 8v8M17 8v8" />
      </>
    ),
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 5 5" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    back: <path d="M20 12H4m6-6-6 6 6 6" />,
    more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    profile: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 22v-2a8 8 0 0 1 16 0v2" />
      </>
    ),
    check: <path d="m5 12 4 4 10-10" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    refresh: (
      <>
        <path d="M20 7v5h-5M4 17v-5h5" />
        <path d="M5 8a8 8 0 0 1 14-3l1 2M4 17l1 2a8 8 0 0 0 14-3" />
      </>
    ),
    trend: <path d="m3 17 6-6 4 4 8-10m-6 0h6v6" />,
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.inventory}
    </svg>
  );
}
export function Button({
  children,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
}) {
  return (
    <button
      type="button"
      {...props}
      className={`sf-button sf-button--${variant} ${props.className ?? ""}`}
    >
      {children}
    </button>
  );
}
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="sf-empty">
      <span className="sf-empty-icon">
        <Icon name="inventory" size={28} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Loading() {
  return (
    <div className="sf-loading" role="status">
      <span className="spinner spinner--brand" />
      Loading your business…
    </div>
  );
}
export function Dialog({
  title,
  onClose,
  children,
  busy = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="sf-dialog"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      aria-label={title}
    >
      <div className="sf-dialog-head">
        <h2>{title}</h2>
        <Button variant="ghost" onClick={onClose} disabled={busy} aria-label="Close">
          <Icon name="close" />
        </Button>
      </div>
      {children}
    </dialog>
  );
}
export function Pagination({
  page,
  hasNext,
  busy,
  onChange,
}: {
  page: number;
  hasNext: boolean;
  busy: boolean;
  onChange: (page: number) => void;
}) {
  return (
    <div className="sf-pagination">
      <Button
        variant="ghost"
        disabled={page === 0 || busy}
        onClick={() => onChange(page - 1)}
      >
        Previous
      </Button>
      <span>Page {page + 1}</span>
      <Button
        variant="ghost"
        disabled={!hasNext || busy}
        onClick={() => onChange(page + 1)}
      >
        Next
      </Button>
    </div>
  );
}
