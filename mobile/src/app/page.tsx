"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import "@/components/auth.css";

export default function IndexPage() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => { if (!cancelled) setFailed(true); }, 12000);
    getSupabase().auth.getSession().then(({ data, error }) => {
      if (cancelled) return;
      window.clearTimeout(timer);
      if (error) { setFailed(true); return; }
      router.replace(data.session ? "/home" : "/login");
    }).catch(() => { if (!cancelled) { window.clearTimeout(timer); setFailed(true); } });
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [router, attempt]);

  return (
    <main className="sf-auth sf-auth-splash">
      <div className="sf-auth-mark" aria-hidden="true">S</div>
      <h1>StockFlow</h1>
      {failed ? <>
        <p role="alert">We couldn’t restore your session. Try again or continue to sign in.</p>
        <button className="sf-auth-primary" type="button" onClick={() => { setFailed(false); setAttempt((value) => value + 1); }}>Try again</button>
        <Link className="sf-auth-secondary" href="/login">Continue to sign in</Link>
      </> : <>
        <p>Your business. Ready to move.</p>
        <div className="spinner spinner--brand" role="status" aria-label="Opening StockFlow" />
      </>}
    </main>
  );
}
