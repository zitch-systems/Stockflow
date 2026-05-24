import Link from 'next/link';
import AuthCard from '@/components/auth/AuthCard';
import ForgotForm from './ForgotForm';

export const metadata = { title: 'Reset password — StockFlow' };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      eyebrow="Forgot password"
      title="Reset your password"
      subtitle="Enter your email and we'll send you a reset link."
      footer={
        <>
          Remembered it?{' '}
          <Link
            href="/login"
            className="font-semibold"
            style={{ color: 'var(--brand-mid)' }}
          >
            Back to sign in
          </Link>
        </>
      }
    >
      <ForgotForm />
    </AuthCard>
  );
}
