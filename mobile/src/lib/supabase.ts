import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Same Supabase project as the web app (see supabase-client.js at the repo
// root). The anon key is a public client credential — RLS policies in the
// database are the only trust boundary. Never put a service key here.
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://fjmkenowgfxepwpyjcss.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqbWtlbm93Z2Z4ZXB3cHlqY3NzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMDEzNjAsImV4cCI6MjA5MjY3NzM2MH0.cR1azmmJlYGEnjVgIDntINMzorjUS6Ftu_ex_KJFfUM';

let client: SupabaseClient | null = null;

// Lazy singleton so every page shares one auth session (persisted in the
// webview's localStorage). detectSessionInUrl is off: the mobile app has no
// email-link redirect flows yet — those still go through the website.
export function getSupabase(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}
