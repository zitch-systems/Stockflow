import { createClient } from 'npm:@supabase/supabase-js@2.110.7';
import { staffInviteHandler } from './handler.mjs';

// Provider-injected credentials; none are sent to the browser or logged.
const url = Deno.env.get('SUPABASE_URL')!;
const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const webOrigin = new URL(Deno.env.get('STOCKFLOW_WEB_ORIGIN') ?? 'https://stockflow.com.ng').origin;
const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
Deno.serve(staffInviteHandler({
  webOrigin,
  userClient: (authorization: string) => createClient(url, anon, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  }),
  serviceClient: () => admin,
}));
