'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { dashboardForRole } from '@/lib/roles';
import type { Role } from '@/lib/types';

export type AuthState = {
  error?: string;
  ok?: string;
} | undefined;

export async function loginAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get('email') || '').trim();
  const password = String(formData.get('password') || '');
  if (!email || !password) return { error: 'Email and password are required.' };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const msg = error.message || 'Sign in failed';
    return {
      error: msg.toLowerCase().includes('invalid')
        ? 'Email or password is incorrect.'
        : msg,
    };
  }

  const { data: profile, error: pe } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', data.user.id)
    .single();

  if (pe || !profile) {
    return {
      error:
        'Your account profile is not set up yet. If you were added as staff, ask your owner to check your account in the Staff tab. If you just signed up, make sure you confirmed your email first.',
    };
  }
  if (!profile.is_active) {
    await supabase.auth.signOut();
    return { error: 'Your account is deactivated. Contact your administrator.' };
  }

  redirect(dashboardForRole(profile.role as Role));
}

export async function signupAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get('email') || '').trim();
  const password = String(formData.get('password') || '');
  const fullName = String(formData.get('fullName') || '').trim();
  const businessName = String(formData.get('businessName') || '').trim();
  const phone = String(formData.get('phone') || '').trim();

  if (!email || !password || !fullName || !businessName) {
    return { error: 'Please fill in all required fields.' };
  }
  if (password.length < 8) {
    return { error: 'Password must be at least 8 characters.' };
  }

  const supabase = await createClient();
  const origin = (await headers()).get('origin') ?? '';

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      data: {
        full_name: fullName,
        business_name: businessName,
        phone: phone || null,
        role: 'owner',
      },
    },
  });

  if (error) return { error: error.message || 'Sign up failed.' };
  return {
    ok: `We sent a confirmation email to ${email}. Click the link to activate your account.`,
  };
}

export async function forgotPasswordAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get('email') || '').trim();
  if (!email) return { error: 'Please enter your email.' };

  const supabase = await createClient();
  const origin = (await headers()).get('origin') ?? '';
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/reset-password`,
  });
  if (error) return { error: error.message || 'Could not send reset email.' };
  return {
    ok: 'If an account exists for that email, we sent a reset link.',
  };
}

export async function resetPasswordAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const password = String(formData.get('password') || '');
  const confirm = String(formData.get('confirm') || '');
  if (password.length < 8) {
    return { error: 'Password must be at least 8 characters.' };
  }
  if (password !== confirm) return { error: 'Passwords do not match.' };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message || 'Could not update password.' };
  redirect('/login?reset=1');
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
