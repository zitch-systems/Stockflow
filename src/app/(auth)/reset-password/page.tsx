import AuthCard from '@/components/auth/AuthCard';
import ResetForm from './ResetForm';

export const metadata = { title: 'Set new password — StockFlow' };

export default function ResetPasswordPage() {
  return (
    <AuthCard
      eyebrow="New password"
      title="Choose a new password"
      subtitle="Pick something you haven't used before."
    >
      <ResetForm />
    </AuthCard>
  );
}
