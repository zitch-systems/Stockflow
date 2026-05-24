'use client';

import { useActionState } from 'react';
import { signupAction, type AuthState } from '../actions';
import FormField from '@/components/auth/FormField';
import SubmitButton from '@/components/auth/SubmitButton';
import ErrorBox from '@/components/auth/ErrorBox';

export default function SignupForm() {
  const [state, formAction] = useActionState<AuthState, FormData>(
    signupAction,
    undefined,
  );

  return (
    <form action={formAction} noValidate>
      <ErrorBox
        message={state?.error ?? state?.ok}
        tone={state?.error ? 'error' : 'ok'}
      />
      <FormField
        id="businessName"
        name="businessName"
        label="Business name"
        autoComplete="organization"
        placeholder="e.g. Adeta Trading Co."
        required
      />
      <FormField
        id="fullName"
        name="fullName"
        label="Your name"
        autoComplete="name"
        placeholder="Full name"
        required
      />
      <FormField
        id="phone"
        name="phone"
        label="Phone (optional)"
        type="tel"
        autoComplete="tel"
        placeholder="+234…"
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
      <FormField
        id="password"
        name="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        placeholder="At least 8 characters"
        required
        reveal
      />
      <SubmitButton>Create account</SubmitButton>
    </form>
  );
}
