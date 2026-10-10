// Auth emails and the retained /login.html alias land on the workspace login
// with Supabase's redirect parameters in the query or fragment. The workspace
// deliberately does not adopt sessions from URLs (detectSessionInUrl: false),
// so these parameters only choose a message; the caller strips them from the
// address bar so tokens are not left in history or shared links.

export type LoginUrlNotice = { text: string; error?: boolean; offerResend?: boolean } | null;

const AUTH_PARAMS = [
  "access_token", "refresh_token", "expires_at", "expires_in", "token_type", "provider_token",
  "type", "code", "error", "error_code", "error_description", "expired", "err", "sb",
];

function params(search: string, hash: string): URLSearchParams {
  const all = new URLSearchParams(search.replace(/^\?/, ""));
  new URLSearchParams(hash.replace(/^#/, "")).forEach((value, key) => all.set(key, value));
  return all;
}

export function loginNoticeFromUrl(search: string, hash: string): LoginUrlNotice {
  const p = params(search, hash);
  if (p.has("error") || p.has("error_code")) {
    return {
      error: true,
      offerResend: true,
      text: "That email link has expired or was already used. Sign in if your email is confirmed, or request a new confirmation email.",
    };
  }
  if (p.get("type") === "signup" || p.get("type") === "email" || (p.has("code") && !p.has("type"))) {
    return { text: "Your email is confirmed. Sign in to continue." };
  }
  if (p.get("expired") === "1") {
    return { error: true, text: "Your session expired for security. Please sign in again." };
  }
  return null;
}

// True when the URL carries anything this page should remove before render.
export function hasAuthUrlParams(search: string, hash: string): boolean {
  const p = params(search, hash);
  return AUTH_PARAMS.some((key) => p.has(key));
}
