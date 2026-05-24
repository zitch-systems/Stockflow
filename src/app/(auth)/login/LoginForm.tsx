'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { loginAction, type AuthState } from '../actions';
import FormField from '@/components/auth/FormField';
import SubmitButton from '@/components/auth/SubmitButton';
import ErrorBox from '@/components/auth/ErrorBox';

type Notice = { tone: 'warn' | 'ok' | 'error'; message: string } | null;

export default function LoginForm({ notice }: { notice: Notice }) {
  const [state, formAction] = useActionState<AuthState, FormData>(
    loginAction,
    undefined,
  );

  const banner =
    state?.error
      ? { tone: 'error' as const, message: state.error }
      : state?.ok
        ? { tone: 'ok' as const, message: state.ok }
        : notice;

  return (
    <form action={formAction} noValidate>
      <ErrorBox message={banner?.message} tone={banner?.tone} />
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
        autoComplete="current-password"
        placeholder="••••••••"
        required
        reveal
      />
      <div className="-mt-1.5 mb-3.5 text-right">
        <Link
          href="/forgot-password"
          className="text-[12.5px] font-medium"
          style={{ color: 'var(--ts)' }}
        >
          Forgot password?
        </Link>
      </div>
      <SubmitButton>Sign In</SubmitButton>
    </form>
  );
}
