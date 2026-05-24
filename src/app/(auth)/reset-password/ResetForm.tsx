'use client';

import { useActionState } from 'react';
import { resetPasswordAction, type AuthState } from '../actions';
import FormField from '@/components/auth/FormField';
import SubmitButton from '@/components/auth/SubmitButton';
import ErrorBox from '@/components/auth/ErrorBox';

export default function ResetForm() {
  const [state, formAction] = useActionState<AuthState, FormData>(
    resetPasswordAction,
    undefined,
  );
  return (
    <form action={formAction} noValidate>
      <ErrorBox message={state?.error} tone="error" />
      <FormField
        id="password"
        name="password"
        label="New password"
        type="password"
        autoComplete="new-password"
        placeholder="At least 8 characters"
        required
        reveal
      />
      <FormField
        id="confirm"
        name="confirm"
        label="Confirm password"
        type="password"
        autoComplete="new-password"
        placeholder="Re-enter password"
        required
        reveal
      />
      <SubmitButton>Update password</SubmitButton>
    </form>
  );
}
