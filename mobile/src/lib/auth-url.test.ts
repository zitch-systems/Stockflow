import { describe, expect, it } from "vitest";
import { hasAuthUrlParams, loginNoticeFromUrl } from "./auth-url";

describe("loginNoticeFromUrl", () => {
  it("confirms a signup link from the implicit-flow fragment", () => {
    expect(loginNoticeFromUrl("", "#access_token=a&refresh_token=b&type=signup")?.text).toMatch(/email is confirmed/);
  });

  it("confirms a PKCE code link", () => {
    expect(loginNoticeFromUrl("?code=abc", "")?.text).toMatch(/email is confirmed/);
  });

  it("reports an expired or reused link and offers a resend", () => {
    const notice = loginNoticeFromUrl("", "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid");
    expect(notice).toMatchObject({ error: true, offerResend: true });
    expect(notice?.text).not.toMatch(/invalid/i);
  });

  it("explains an expired session", () => {
    expect(loginNoticeFromUrl("?expired=1", "")?.text).toMatch(/session expired/);
  });

  it("ignores unrelated parameters", () => {
    expect(loginNoticeFromUrl("?utm_source=mail", "#top")).toBeNull();
    expect(hasAuthUrlParams("?utm_source=mail", "#top")).toBe(false);
  });

  it("flags token-bearing URLs for removal", () => {
    expect(hasAuthUrlParams("", "#access_token=a&refresh_token=b")).toBe(true);
    expect(hasAuthUrlParams("?code=abc", "")).toBe(true);
  });
});
