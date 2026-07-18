import { describe, expect, it } from 'vitest';
import { formatDate, formatNaira } from './format';

describe('formatNaira', () => {
  it('formats amounts with en-NG thousands separators', () => {
    expect(formatNaira(0)).toBe('₦0');
    expect(formatNaira(950)).toBe('₦950');
    expect(formatNaira(1234567)).toBe('₦1,234,567');
  });

  it('degrades safely on null/undefined/NaN', () => {
    expect(formatNaira(null)).toBe('₦0');
    expect(formatNaira(undefined)).toBe('₦0');
    expect(formatNaira(Number.NaN)).toBe('₦0');
  });
});

describe('formatDate', () => {
  it('returns empty string for missing input', () => {
    expect(formatDate(null)).toBe('');
    expect(formatDate(undefined)).toBe('');
    expect(formatDate('')).toBe('');
  });

  it('renders an en-NG date containing day, short month and year', () => {
    // Pick noon in the local TZ so the day never rolls over — 12:00Z on
    // 2026-07-18 would land on the 19th east of UTC+11 (e.g. Codemagic
    // agents in AU regions), so use the runner's own timezone as the anchor.
    const local = new Date(2026, 6, 18, 12, 0, 0); // month is 0-indexed → July
    const out = formatDate(local.toISOString());
    expect(out).toContain('2026');
    expect(out.toLowerCase()).toContain('jul');
    expect(out).toContain('18');
  });
});
