import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { dashboardForRole } from '@/lib/roles';
import type { Role } from '@/lib/types';
import AuthCard from '@/components/auth/AuthCard';
import LoginForm from './LoginForm';

export const metadata = { title: 'Sign In — StockFlow' };

type SP = Promise<{ expired?: string; err?: string; reset?: string }>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SP;
}) {
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
  }

  const sp = await searchParams;
  let notice: { tone: 'warn' | 'ok' | 'error'; message: string } | null = null;
  if (sp.expired === '1') {
    notice = {
      tone: 'warn',
      message: 'Your session expired for security. Please sign in again.',
    };
  } else if (sp.err === 'profile_missing') {
    notice = {
      tone: 'error',
      message:
        'Your account profile is not set up. If you were added as staff, ask your owner to check your account. If you just signed up, confirm your email first.',
    };
  } else if (sp.reset === '1') {
    notice = {
      tone: 'ok',
      message: 'Password updated. Sign in with your new password.',
    };
  }

  return (
    <AuthCard
      eyebrow="Welcome back"
      title="Sign in to your account"
      subtitle="Enter your email and password to continue."
      footer={
        <>
          Don&apos;t have an account?{' '}
          <Link
            href="/signup"
            className="font-semibold"
            style={{ color: 'var(--brand-mid)' }}
          >
            Start a free trial
          </Link>
        </>
      }
    >
      <LoginForm notice={notice} />
    </AuthCard>
  );
}
