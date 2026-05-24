import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { dashboardForRole } from '@/lib/roles';
import type { Role } from '@/lib/types';
import PWARedirect from './PWARedirect';

export const dynamic = 'force-dynamic';

export default async function RootPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    if (profile?.role) redirect(dashboardForRole(profile.role as Role));
    await supabase.auth.signOut();
  }

  // Not signed in: PWA users go to /login, browsers go to /landing.
  // The detection requires window APIs, so it runs on the client.
  return (
    <div
      className="flex flex-1 items-center justify-center text-sm"
      style={{ background: '#1A3C5E', color: '#fff' }}
    >
      <div className="flex items-center">
        <span
          aria-hidden
          className="mr-2.5 inline-block h-2.5 w-2.5 animate-pulse rounded-full"
          style={{ background: '#F97316' }}
        />
        Loading…
      </div>
      <PWARedirect />
    </div>
  );
}
