import { describe, expect, it } from 'vitest';
import { isTransientFetchError } from './supabase';

describe('isTransientFetchError', () => {
  it('recognises browser fetch failure wordings', () => {
    // Chrome / Chromium / Capacitor Android webview
    expect(isTransientFetchError(new TypeError('Failed to fetch'))).toBe(true);
    // Firefox
    expect(isTransientFetchError({ message: 'NetworkError when attempting to fetch resource.' })).toBe(true);
    // Safari
    expect(isTransientFetchError({ message: 'Load failed' })).toBe(true);
    // Node undici / newer Supabase runtimes
    expect(isTransientFetchError({ message: 'fetch failed' })).toBe(true);
    // React Native / older webviews
    expect(isTransientFetchError({ message: 'Network request failed' })).toBe(true);
  });

  it('leaves real server errors alone (they get their own handling path)', () => {
    expect(isTransientFetchError({ message: 'Invalid login credentials' })).toBe(false);
    expect(isTransientFetchError({ message: 'JSON object requested, multiple (or no) rows returned' })).toBe(false);
    expect(isTransientFetchError(null)).toBe(false);
    expect(isTransientFetchError(undefined)).toBe(false);
  });
});
