"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { getSupabase, isTransientFetchError } from "@/lib/supabase";
import { WEB_APP_URL } from "@/lib/roles";
import { Button } from "./ui";
import "./workspace.css";
export default function AccountForm({ mode }: { mode: "register" | "reset" }) {
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const fields = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const email = String(fields.get("email")).trim(),
        sb = getSupabase();
      if (mode === "reset") {
        const result = await sb.auth.resetPasswordForEmail(email, {
          redirectTo: `${WEB_APP_URL}/reset-password.html`,
        });
        if (result.error) throw result.error;
        setNotice(
          "If an account uses this email, you will receive a password-reset link. Complete the reset in your browser, then return here to sign in.",
        );
      } else {
        const password = String(fields.get("password"));
        if (password.length < 10)
          throw new Error("Use at least 10 characters for your password.");
        const result = await sb.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${WEB_APP_URL}/login.html`,
            data: {
              full_name: String(fields.get("name")).trim(),
              business_name: String(fields.get("business")).trim(),
              phone: String(fields.get("phone") || "").trim(),
              business_mode: String(fields.get("mode")),
            },
          },
        });
        if (result.error) throw result.error;
        setNotice(
          "Check your inbox to verify your email. After verification, return to StockFlow and sign in. Existing accounts can sign in directly.",
        );
      }
    } catch (e) {
      setError(
        isTransientFetchError(e)
          ? "Could not connect. Check your internet connection and try again."
          : e instanceof Error && e.message.startsWith("Use at least")
            ? e.message
            : "We could not complete this request. Try again shortly or sign in if you already have an account.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="sf-auth-error">
      <Link className="sf-wordmark" href="/login">
        <span className="sf-brand-mark">S</span>Stock<span>Flow</span>
      </Link>
      <h1>
        {mode === "register"
          ? "Your business starts here."
          : "Reset your password."}
      </h1>
      <p>
        {mode === "register"
          ? "Create your account and business together. You can add your first product after email verification."
          : "Enter the email you use for StockFlow."}
      </p>
      {notice ? (
        <>
          <p className="sf-notice" role="status">
            {notice}
          </p>
          <Link className="sf-button sf-button--primary" href="/login">
            Continue to sign in
          </Link>
        </>
      ) : (
        <form onSubmit={submit}>
          {mode === "register" && (
            <>
              <label>
                Your name
                <input
                  name="name"
                  autoComplete="name"
                  required
                  maxLength={200}
                />
              </label>
              <label>
                Business name
                <input
                  name="business"
                  autoComplete="organization"
                  required
                  maxLength={200}
                />
              </label>
            </>
          )}
          <label>
            Email address
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
            />
          </label>
          {mode === "register" && (
            <>
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={10}
                  required
                />
              </label>
              <details>
                <summary>Business setup</summary>
                <label>
                  Business mode
                  <select name="mode" defaultValue="solo">
                    <option value="solo">I manage sales myself</option>
                    <option value="owner_rep">I manage a team of reps</option>
                  </select>
                </label>
                <label>
                  Phone (optional)
                  <input
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    maxLength={30}
                  />
                </label>
              </details>
              <p>
                By creating an account you accept the{" "}
                <a href={`${WEB_APP_URL}/terms.html`}>terms</a> and{" "}
                <a href={`${WEB_APP_URL}/privacy.html`}>privacy information</a>.
              </p>
            </>
          )}
          {error && (
            <p className="sf-error" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy}>
            {busy
              ? "Please wait…"
              : mode === "register"
                ? "Create account"
                : "Send reset link"}
          </Button>
        </form>
      )}
      <Link href="/login">Back to sign in</Link>
    </main>
  );
}
