type Tone = 'error' | 'warn' | 'ok';

export default function ErrorBox({
  message,
  tone = 'error',
}: {
  message?: string | null;
  tone?: Tone;
}) {
  if (!message) return null;
  const bg =
    tone === 'warn'
      ? 'var(--warn-bg)'
      : tone === 'ok'
        ? 'var(--success-bg)'
        : 'var(--danger-bg)';
  const color =
    tone === 'warn'
      ? 'var(--warn)'
      : tone === 'ok'
        ? 'var(--success)'
        : 'var(--danger)';
  return (
    <div
      role="alert"
      className="mb-4 flex items-start gap-2 rounded-lg border px-3.5 py-3 text-[13px] leading-snug"
      style={{ background: bg, color, borderColor: color }}
    >
      {message}
    </div>
  );
}
