import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { dashboardForRole } from '@/lib/roles';
import type { Role } from '@/lib/types';
import AuthCard from '@/components/auth/AuthCard';
import SignupForm from './SignupForm';

export const metadata = { title: 'Start free trial — StockFlow' };

export default async function SignupPage() {
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

  return (
    <AuthCard
      eyebrow="Free for 14 days"
      title="Create your StockFlow account"
      subtitle="Set up your business in two minutes. No card required."
      footer={
        <>
          Already have an account?{' '}
          <Link
            href="/login"
            className="font-semibold"
            style={{ color: 'var(--brand-mid)' }}
          >
            Sign in
          </Link>
        </>
      }
    >
      <SignupForm />
    </AuthCard>
  );
}
