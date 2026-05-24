export function formatNaira(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) return '₦0';
  return '₦' + Number(amount).toLocaleString('en-NG');
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('en-NG', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-NG', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}
