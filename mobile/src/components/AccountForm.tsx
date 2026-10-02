"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { getSupabase, isTransientFetchError } from "@/lib/supabase";
import { WEB_APP_URL } from "@/lib/roles";
import { AuthMessage, AuthShell, PasswordField, useEmailCooldown } from "./AuthShell";

export default function AccountForm({ mode }: { mode: "register" | "reset" }) {
  const register = mode === "register";
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [business, setBusiness] = useState("");
  const [businessMode, setBusinessMode] = useState("solo");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const busyRef = useRef(false);
  const { remaining, startCooldown } = useEmailCooldown();

  function moveToStep(nextStep: 1 | 2) {
    setStep(nextStep);
    setError("");
    window.requestAnimationFrame(() => document.getElementById(nextStep === 2 ? "business" : "name")?.focus());
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current) return;
    if (register && step === 1) {
      if (!name.trim()) { setError("Enter your name so your team knows who you are."); return; }
      if (password.length < 10) { setError("Use at least 10 characters for your password."); return; }
      moveToStep(2);
      return;
    }
    if (register && !business.trim()) { setError("Enter the name of your business."); return; }
    busyRef.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (!navigator.onLine) throw new TypeError("Network unavailable");
      const sb = getSupabase();
      if (!register) {
        const result = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${WEB_APP_URL}/reset-password.html` });
        if (result.error) throw result.error;
      } else {
        const result = await sb.auth.signUp({
          email: email.trim(), password,
          options: {
            emailRedirectTo: `${WEB_APP_URL}/login.html`,
            // An owner creates a new business. The server sets their tenant and
            // authority; never send role, tenant_id or staff authority here.
            data: { full_name: name.trim(), business_name: business.trim(), phone: phone.trim(), business_mode: businessMode },
          },
        });
        if (result.error) throw result.error;
        setPassword("");
        if (result.data.session) {
          // Also support projects where email verification is already satisfied.
          // Workspace independently loads the authoritative profile before use.
          router.replace("/home");
          return;
        }
      }
      setEmail((value) => value.trim());
      setPending(true);
      startCooldown();
      window.requestAnimationFrame(() => document.getElementById("auth-title")?.focus());
    } catch (caught) {
      setError(isTransientFetchError(caught)
        ? "Could not reach StockFlow. Check your internet connection and try again."
        : "We couldn’t complete this request. Try again shortly, or sign in if you already have an account.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function resend() {
    if (busyRef.current || remaining > 0) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    startCooldown();
    try {
      if (!navigator.onLine) throw new TypeError("Network unavailable");
      const sb = getSupabase();
      const result = register
        ? await sb.auth.resend({ type: "signup", email: email.trim(), options: { emailRedirectTo: `${WEB_APP_URL}/login.html` } })
        : await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${WEB_APP_URL}/reset-password.html` });
      if (result.error) throw result.error;
      setNotice("If this email is eligible, another email has been requested. Check your inbox and spam folder.");
    } catch (caught) {
      setError(isTransientFetchError(caught)
        ? "Could not connect. Check your connection, then request the email again."
        : "We couldn’t request another email yet. Check your inbox, wait a moment and try again.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const title = pending ? "Check your inbox" : register ? step === 1 ? "Start with you." : "Meet your business." : "Forgot your password?";
  const description = pending
    ? register ? "One more step before you get started." : "Your next step happens in your browser."
    : register ? step === 1 ? "Create your owner account. Next, we’ll set up your business." : "Just the essentials. You can add products and invite your team after setup."
    : "Enter the email you use for StockFlow. We’ll help you get back to business.";

  return (
    <AuthShell title={title} description={description} back eyebrow={register ? "A SIMPLE START FOR YOUR BUSINESS" : "ACCOUNT RECOVERY"} onBack={() => {
      if (busyRef.current) return true;
      if (pending) { router.replace("/login"); return true; }
      if (register && step === 2) { moveToStep(1); return true; }
      return false;
    }}>
      {pending ? (
        <div className="sf-auth-pending">
          <div className="sf-auth-checkmark" aria-hidden="true">↗</div>
          <AuthMessage>
            {register ? "If this address is eligible, a verification email has been requested for:" : "If an account uses this address, a reset email has been requested for:"}
            <strong className="sf-auth-email">{email}</strong>
            Already registered? You can return to sign in.
          </AuthMessage>
          <ol className="sf-auth-steps">
            <li>Check your inbox and spam folder.</li>
            <li>{register ? "Open the confirmation link to verify your email." : "Open the reset link and choose a new password in your browser."}</li>
            <li>Return to the StockFlow app and sign in.</li>
          </ol>
          {error && <AuthMessage error>{error}</AuthMessage>}
          {notice && <AuthMessage>{notice}</AuthMessage>}
          <Link className="sf-auth-primary" href="/login">Continue to sign in</Link>
          <button className="sf-auth-secondary" onClick={resend} type="button" disabled={busy || remaining > 0}>
            {busy ? "Requesting email…" : remaining > 0 ? `Resend available in ${remaining}s` : "Request another email"}
          </button>
          <button className="sf-auth-edit" type="button" disabled={busy} onClick={() => { setPending(false); setNotice(""); setError(""); moveToStep(1); }}>
            Use a different email address
          </button>
        </div>
      ) : (
        <>
          {register && <ol className="sf-auth-progress" aria-label="Account setup progress">
            <li aria-current={step === 1 ? "step" : undefined}>1 · Your account</li>
            <li aria-current={step === 2 ? "step" : undefined}>2 · Your business</li>
          </ol>}
          <form className="sf-auth-form" onSubmit={submit} aria-busy={busy}>
            <fieldset disabled={busy}>
              {(!register || step === 1) && <>
                {register && <div className="sf-auth-field">
                  <label htmlFor="name">Your name</label>
                  <input id="name" name="name" autoComplete="name" required maxLength={200} placeholder="e.g. Tomi Adebayo" value={name} onChange={(event) => setName(event.target.value)} />
                </div>}
                <div className="sf-auth-field">
                  <label htmlFor="email">Email address</label>
                  <input id="email" name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required maxLength={254} placeholder="you@business.com" value={email} onChange={(event) => setEmail(event.target.value)} />
                </div>
                {register && <PasswordField id="password" name="password" autoComplete="new-password" minLength={10} required placeholder="Create a password" hint="Use at least 10 characters. A memorable phrase works well." value={password} onChange={(event) => setPassword(event.target.value)} />}
              </>}
              {register && step === 2 && <>
                <div className="sf-auth-field">
                  <label htmlFor="business">Business name</label>
                  <input id="business" name="business" autoComplete="organization" required maxLength={200} placeholder="e.g. Adebayo Stores" value={business} onChange={(event) => setBusiness(event.target.value)} />
                </div>
                <div className="sf-auth-field">
                  <label htmlFor="business-mode">How do you manage sales?</label>
                  <select id="business-mode" name="mode" value={businessMode} onChange={(event) => setBusinessMode(event.target.value)}>
                    <option value="solo">I manage sales myself</option>
                    <option value="owner_rep">I manage a team of reps</option>
                  </select>
                  <p className="sf-auth-hint">Choose how you work today. Team access is assigned securely by the business owner.</p>
                </div>
                <details className="sf-auth-options">
                  <summary>Add a business phone (optional)</summary>
                  <div className="sf-auth-field">
                    <label htmlFor="phone">Phone number</label>
                    <input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={30} placeholder="e.g. +234 800 000 0000" value={phone} onChange={(event) => setPhone(event.target.value)} />
                  </div>
                </details>
                <p className="sf-auth-legal">By creating an account you accept the <a href={`${WEB_APP_URL}/terms.html`} target="_blank" rel="noreferrer">terms</a> and <a href={`${WEB_APP_URL}/privacy.html`} target="_blank" rel="noreferrer">privacy information</a>.</p>
              </>}
            </fieldset>
            {error && <AuthMessage error>{error}</AuthMessage>}
            <div className="sf-auth-row">
              {register && step === 2 && <button type="button" className="sf-auth-secondary" disabled={busy} onClick={() => moveToStep(1)}>Back</button>}
              <button type="submit" className="sf-auth-primary" disabled={busy}>
                {busy && <span className="spinner" aria-hidden="true" />}
                {busy ? register ? "Creating account…" : "Requesting link…" : register ? step === 1 ? "Continue" : "Create account" : "Send reset link"}
              </button>
            </div>
          </form>
          {register && <p className="sf-auth-staff">Joining an existing business? <Link href="/login">Sign in with your invitation.</Link></p>}
        </>
      )}
    </AuthShell>
  );
}
