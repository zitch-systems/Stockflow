import Topbar from '@/components/Topbar';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Topbar rightLabel="New here?" cta={{ label: 'Start free', href: '/signup' }} />
      <div
        className="flex flex-1 items-center justify-center px-6 py-12"
        style={{ background: 'var(--bg)' }}
      >
        {children}
      </div>
      <div
        className="border-t px-6 py-6 text-center text-[13px]"
        style={{
          background: 'var(--surface)',
          borderColor: 'var(--border)',
          color: 'var(--tm)',
        }}
      >
        © 2026 StockFlow
      </div>
    </>
  );
}
