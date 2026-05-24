'use client';

import { useActionState } from 'react';
import { forgotPasswordAction, type AuthState } from '../actions';
import FormField from '@/components/auth/FormField';
import SubmitButton from '@/components/auth/SubmitButton';
import ErrorBox from '@/components/auth/ErrorBox';

export default function ForgotForm() {
  const [state, formAction] = useActionState<AuthState, FormData>(
    forgotPasswordAction,
    undefined,
  );
  return (
    <form action={formAction} noValidate>
      <ErrorBox
        message={state?.error ?? state?.ok}
        tone={state?.error ? 'error' : 'ok'}
      />
      <FormField
        id="email"
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        placeholder="you@business.com"
        required
      />
      <SubmitButton>Send reset link</SubmitButton>
    </form>
  );
}
