import { createClient } from '@supabase/supabase-js';

// Server-only Supabase client using the service role key. Bypasses RLS;
// must only be imported from server-side code (server actions, route
// handlers, server components). Never import from a 'use client' module.
//
// Use sparingly — every callsite must enforce its own authz against the
// requesting user's profile before performing privileged operations.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Missing Supabase admin credentials. Set SUPABASE_SERVICE_ROLE_KEY in .env.local.',
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
