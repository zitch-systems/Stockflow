"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { AuthMessage, AuthShell, PasswordField, useEmailCooldown } from "@/components/AuthShell";
import { isKnownRole, WEB_APP_URL } from "@/lib/roles";
import { getSupabase, isTransientFetchError } from "@/lib/supabase";

type Notice = { text: string; error?: boolean; offerResend?: boolean } | null;

// Profile checks help the user recover from setup problems. Database RLS and
// authoritative RPCs still decide access; signup metadata grants no authority.
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const busy = useRef(false);
  const { remaining, startCooldown } = useEmailCooldown();

  useEffect(() => {
    let cancelled = false;
    getSupabase().auth.getSession().then(({ data, error }) => {
      if (!cancelled && !busy.current && !error && data.session) router.replace("/home");
    }).catch(() => {
      // Sign-in stays available if restoring a previous session fails.
    });
    return () => { cancelled = true; };
  }, [router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setNotice(null);
    setLoading(true);
    const sb = getSupabase();
    try {
      if (!navigator.onLine) throw new TypeError("Network unavailable");
      const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
      if (error || !data.session) {
        if (error && isTransientFetchError(error)) throw error;
        if (error?.code === "email_not_confirmed") {
          setNotice({ error: true, text: "Verify your email before signing in. Open the confirmation link in your inbox, then return here.", offerResend: true });
        } else if (error?.status === 429 || error?.code === "over_request_rate_limit") {
          setNotice({ error: true, text: "Too many sign-in attempts. Wait a moment and try again." });
        } else {
          setNotice({ error: true, text: "We couldn’t sign you in. Check your email and password, or reset your password below." });
        }
        return;
      }
      const { data: profile, error: profileError } = await sb.from("profiles").select("role,is_active").eq("id", data.session.user.id).single();
      if (profileError || !profile) {
        if (profileError && (isTransientFetchError(profileError) || profileError.code !== "PGRST116")) {
          setNotice({ error: true, text: "Your sign-in worked, but we couldn’t load your business access. Check your connection and try again." });
          return;
        }
        await sb.auth.signOut({ scope: "local" });
        setNotice({ error: true, text: "Your account needs its business profile set up. Staff should ask their business owner to check the invitation. New owners should contact StockFlow support." });
        return;
      }
      if (!profile.is_active || !isKnownRole(profile.role)) {
        await sb.auth.signOut({ scope: "local" });
        setNotice({ error: true, text: "Your business access is unavailable. Ask your business owner or administrator to check your account." });
        return;
      }
      setPassword("");
      router.replace("/home");
    } catch (error) {
      setNotice({ error: true, text: isTransientFetchError(error)
        ? "Could not reach StockFlow. Check your internet connection and try again."
        : "We couldn’t complete sign-in. Please try again shortly." });
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }

  async function resendConfirmation() {
    if (busy.current || remaining > 0 || !email.trim()) return;
    busy.current = true;
    setResending(true);
    startCooldown();
    try {
      if (!navigator.onLine) throw new TypeError("Network unavailable");
      const { error } = await getSupabase().auth.resend({ type: "signup", email: email.trim(), options: { emailRedirectTo: `${WEB_APP_URL}/login.html` } });
      if (error) throw error;
      setNotice({ text: "If this account needs verification, a confirmation email has been requested. Check your inbox and spam folder.", offerResend: true });
    } catch (error) {
      setNotice({ error: true, text: isTransientFetchError(error)
        ? "Could not connect. Check your connection, then request the email again."
        : "We couldn’t request another email yet. Wait a moment, check your inbox and try again.", offerResend: true });
    } finally {
      busy.current = false;
      setResending(false);
    }
  }

  return (
    <AuthShell title="Welcome back" description="Sign in to keep your stock, sales and business moving.">
      <form className="sf-auth-form" onSubmit={onSubmit} aria-busy={loading}>
        <fieldset disabled={loading || resending}>
          <div className="sf-auth-field">
            <label htmlFor="email">Email address</label>
            <input type="email" inputMode="email" id="email" name="email" required autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={254} placeholder="you@business.com" value={email} onChange={(event) => setEmail(event.target.value)} />
          </div>
          <PasswordField id="password" name="password" required autoComplete="current-password" placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </fieldset>
        <div className="sf-auth-forgot"><Link href="/forgot-password">Forgot password?</Link></div>
        {notice && <AuthMessage error={notice.error}>
          <p>{notice.text}</p>
          {notice.offerResend && <button type="button" disabled={resending || loading || remaining > 0} onClick={resendConfirmation}>{resending ? "Requesting email…" : remaining > 0 ? `Resend available in ${remaining}s` : "Resend confirmation email"}</button>}
        </AuthMessage>}
        <button className="sf-auth-primary" type="submit" disabled={loading || resending}>
          {loading && <span className="spinner" aria-hidden="true" />}{loading ? "Signing in…" : "Sign In"}
        </button>
      </form>
      <div className="sf-auth-divider" />
      <p className="sf-auth-account-link">New to StockFlow? <Link href="/register">Start a free trial</Link></p>
      <p className="sf-auth-staff">Joining a team? Use the email your business owner invited.</p>
    </AuthShell>
  );
}
