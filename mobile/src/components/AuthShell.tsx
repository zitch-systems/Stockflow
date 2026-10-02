"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Capacitor } from "@capacitor/core";
import ThemeToggle from "./ThemeToggle";
import "./auth.css";

export function AuthShell({ title, description, children, back = false, eyebrow = "STOCKFLOW FOR YOUR BUSINESS", onBack }: {
  title: string;
  description: string;
  children: ReactNode;
  back?: boolean;
  eyebrow?: string;
  onBack?: () => boolean;
}) {
  const backAction = useRef(onBack);
  useEffect(() => { backAction.current = onBack; }, [onBack]);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let cancelled = false;
    let remove: (() => Promise<void>) | undefined;
    void import("@capacitor/app").then(async ({ App }) => {
      if (cancelled) return;
      const listener = await App.addListener("backButton", async ({ canGoBack }) => {
        if (backAction.current?.()) return;
        if (canGoBack) window.history.back();
        else await App.minimizeApp();
      });
      if (cancelled) await listener.remove();
      else remove = () => listener.remove();
    }).catch(() => {
      // The visible navigation remains usable if the native bridge is absent.
    });
    return () => { cancelled = true; void remove?.(); };
  }, []);
  return (
    <div className="sf-auth">
      <header className="sf-auth-header">
        <Link href="/login" className="sf-auth-brand" aria-label="StockFlow sign in">
          <span className="sf-auth-mark" aria-hidden="true">S</span>
          <span>Stock<span className="sf-auth-brand-accent">Flow</span></span>
        </Link>
        <ThemeToggle />
      </header>
      <main className="sf-auth-main">
        <aside className="sf-auth-intro">
          <span className="sf-auth-eyebrow">YOUR BUSINESS. IN YOUR POCKET.</span>
          <h2>Know your stock.<br />Keep business moving.</h2>
          <p>From your first product to the day’s last sale, bring your stock, customers and business performance together.</p>
          <div className="sf-auth-benefits">
            <span><b aria-hidden="true">01</b> Find stock in seconds</span>
            <span><b aria-hidden="true">02</b> Record sales with confidence</span>
            <span><b aria-hidden="true">03</b> See how your business is doing</span>
          </div>
          <p className="sf-auth-intro-note">Made for the way you work.</p>
        </aside>
        <section className="sf-auth-panel" aria-labelledby="auth-title">
          {back && <Link href="/login" className="sf-auth-back"><span aria-hidden="true">←</span> Back to sign in</Link>}
          <span className="sf-auth-eyebrow">{eyebrow}</span>
          <h1 id="auth-title" tabIndex={-1}>{title}</h1>
          <p className="sf-auth-description">{description}</p>
          {children}
        </section>
      </main>
      <footer className="sf-auth-footer">StockFlow · Your stock. Your sales. Your business.</footer>
    </div>
  );
}

export function PasswordField({ id, label = "Password", hint, ...props }: InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label?: string;
  hint?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="sf-auth-field">
      <label htmlFor={id}>{label}</label>
      <div className="sf-auth-password">
        <input {...props} id={id} type={visible ? "text" : "password"} aria-describedby={hint ? `${id}-hint` : undefined} />
        <button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible} disabled={props.disabled}>
          {visible ? "Hide" : "Show"}
        </button>
      </div>
      {hint && <p className="sf-auth-hint" id={`${id}-hint`}>{hint}</p>}
    </div>
  );
}

export function AuthMessage({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return <div className={`sf-auth-message ${error ? "sf-auth-message--error" : ""}`} role={error ? "alert" : "status"}>{children}</div>;
}

// This is a UI resend affordance; provider rate limits remain authoritative.
export function useEmailCooldown() {
  const [clock, setClock] = useState({ deadline: 0, now: 0 });
  const remaining = Math.max(0, Math.ceil((clock.deadline - clock.now) / 1000));
  useEffect(() => {
    if (clock.deadline <= clock.now) return;
    const sync = () => setClock((value) => ({ ...value, now: Date.now() }));
    const timeout = window.setTimeout(sync, 1000);
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [clock.deadline, clock.now]);
  return { remaining, startCooldown: () => {
    const now = Date.now();
    setClock({ deadline: now + 60000, now });
  } };
}
