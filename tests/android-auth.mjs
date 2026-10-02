import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

// UI-only Auth fixture. Every external request from this fresh page is blocked
// or answered here; these checks never send email or create a real account.
export async function runAndroidAuthChecks({ page, context, check, root }) {
  const authPage = await context.newPage();
  const origin = page.url().startsWith('http://127.0.0.1:') ? new URL(page.url()).origin : 'http://127.0.0.1:4173';
  const screenshots = resolve(root, 'docs/android');
  await mkdir(screenshots, { recursive: true });
  const requests = [];
  const pageErrors = [];
  let rejectNextEmail = false;
  let signupResponse = null;
  authPage.on('pageerror', (error) => pageErrors.push(error.message));
  await authPage.setViewportSize({ width: 375, height: 812 });
  await authPage.clock.install();
  authPage.setDefaultTimeout(12000);
  await authPage.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === origin) return route.continue();
    const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
    if (!url.hostname.endsWith('.supabase.co') || !['/auth/v1/signup', '/auth/v1/recover', '/auth/v1/resend'].includes(url.pathname)) return route.abort();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    assert.equal(request.method(), 'POST');
    const body = request.postDataJSON();
    requests.push({ path: url.pathname, body, redirectTo: url.searchParams.get('redirect_to') });
    if (rejectNextEmail) {
      rejectNextEmail = false;
      return route.fulfill({ status: 429, headers, body: JSON.stringify({ code: 'over_email_send_rate_limit', msg: 'Fixture provider detail must not reach the user' }) });
    }
    if (url.pathname === '/auth/v1/signup') {
      signupResponse = { id: '29000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: body.email, user_metadata: body.data, app_metadata: { provider: 'email', providers: ['email'] }, identities: [], created_at: new Date().toISOString() };
      return route.fulfill({ status: 200, headers, body: JSON.stringify(signupResponse) });
    }
    return route.fulfill({ status: 200, headers, body: '{}' });
  });
  const noOverflow = async () => assert.ok(await authPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Auth page overflows at 375px: ${authPage.url()}`);
  const screenshot = async (name) => { await noOverflow(); await authPage.screenshot({ path: resolve(screenshots, name), fullPage: true }); };
  try {
    await check('Android login validates fields, exposes password visibility and handles offline sign-in', async () => {
      await authPage.goto(`${origin}/login/`);
      await authPage.getByRole('heading', { name: 'Welcome back' }).waitFor();
      await authPage.getByRole('button', { name: 'Sign In', exact: true }).click();
      assert.equal(await authPage.locator('form').evaluate((form) => form.checkValidity()), false);
      assert.equal(requests.length, 0);
      await authPage.getByLabel('Email address').fill('not-an-email');
      await authPage.getByLabel('Password', { exact: true }).fill('fixture-password');
      await authPage.getByRole('button', { name: 'Sign In', exact: true }).click();
      assert.equal(await authPage.locator('#email').evaluate((input) => input.validity.typeMismatch), true);
      await authPage.getByRole('button', { name: 'Show password' }).click();
      assert.equal(await authPage.getByLabel('Password', { exact: true }).getAttribute('type'), 'text');
      await authPage.getByRole('button', { name: 'Hide password' }).click();
      assert.equal(await authPage.getByLabel('Password', { exact: true }).getAttribute('type'), 'password');
      await authPage.getByLabel('Email address').fill('owner@auth-fixture.example');
      await authPage.evaluate(() => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }));
      await authPage.getByRole('button', { name: 'Sign In', exact: true }).click();
      await authPage.getByRole('alert').filter({ hasText: 'Check your internet connection' }).waitFor();
      assert.equal(await authPage.getByRole('button', { name: 'Sign In', exact: true }).isEnabled(), true);
      assert.equal(requests.length, 0);
      await authPage.evaluate(() => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true }));
      await authPage.goto(`${origin}/login/`);
      await authPage.getByRole('heading', { name: 'Welcome back' }).waitFor();
      await screenshot('auth-login.png');
    });

    await check('Android password recovery shows pending email and recovers from a failed resend without exposing provider errors', async () => {
      await authPage.getByRole('link', { name: 'Forgot password?' }).click();
      await authPage.getByRole('heading', { name: 'Forgot your password?' }).waitFor();
      await authPage.getByLabel('Email address').fill('reset@auth-fixture.example');
      await authPage.getByRole('button', { name: 'Send reset link' }).click();
      await authPage.getByRole('heading', { name: 'Check your inbox' }).waitFor();
      await authPage.getByText('reset@auth-fixture.example', { exact: true }).waitFor();
      assert.equal(requests.at(-1).path, '/auth/v1/recover');
      assert.match(requests.at(-1).redirectTo, /^https:\/\/.+\/reset-password\.html$/);
      assert.equal(await authPage.getByRole('button', { name: /Resend available in/ }).isDisabled(), true);
      await screenshot('auth-recovery.png');
      await authPage.clock.fastForward(61000);
      rejectNextEmail = true;
      await authPage.getByRole('button', { name: 'Request another email' }).click();
      await authPage.getByRole('alert').filter({ hasText: 'couldn’t request another email yet' }).waitFor();
      assert.equal(await authPage.getByText('Fixture provider detail must not reach the user').count(), 0);
      assert.equal(await authPage.getByRole('button', { name: /Resend available in/ }).isDisabled(), true);
      await authPage.clock.fastForward(61000);
      await authPage.getByRole('button', { name: 'Request another email' }).click();
      await authPage.getByRole('status').filter({ hasText: 'another email has been requested' }).waitFor();
      assert.equal(requests.filter((request) => request.path === '/auth/v1/recover').length, 3);
      await authPage.getByRole('link', { name: 'Continue to sign in' }).click();
      await authPage.getByRole('heading', { name: 'Welcome back' }).waitFor();
    });

    await check('Android two-step owner setup preserves fields, submits once without authority claims and reaches verification pending', async () => {
      await authPage.getByRole('link', { name: 'Start a free trial' }).click();
      await authPage.getByRole('heading', { name: 'Start with you.' }).waitFor();
      await authPage.getByLabel('Your name').fill('Tomi Auth Fixture');
      await authPage.getByLabel('Email address').fill('new-owner@auth-fixture.example');
      await authPage.getByLabel('Password', { exact: true }).fill('short');
      await authPage.getByRole('button', { name: 'Continue', exact: true }).click();
      assert.equal(await authPage.getByLabel('Password', { exact: true }).evaluate((input) => input.validity.tooShort), true);
      assert.equal(requests.filter((request) => request.path === '/auth/v1/signup').length, 0);
      await authPage.getByLabel('Password', { exact: true }).fill('fixture-strong-password');
      await screenshot('auth-signup-account.png');
      await authPage.getByRole('button', { name: 'Continue', exact: true }).click();
      await authPage.getByRole('heading', { name: 'Meet your business.' }).waitFor();
      await authPage.getByLabel('Business name').fill('Adebayo Auth Fixture');
      await authPage.getByLabel('How do you manage sales?').selectOption('owner_rep');
      await authPage.getByText('Add a business phone (optional)', { exact: true }).click();
      await authPage.getByLabel('Phone number').fill('+2348000000000');
      await authPage.getByRole('button', { name: 'Back', exact: true }).click();
      assert.equal(await authPage.getByLabel('Your name').inputValue(), 'Tomi Auth Fixture');
      assert.equal(await authPage.getByLabel('Email address').inputValue(), 'new-owner@auth-fixture.example');
      assert.equal(await authPage.getByLabel('Password', { exact: true }).inputValue(), 'fixture-strong-password');
      await authPage.getByRole('button', { name: 'Continue', exact: true }).click();
      assert.equal(await authPage.getByLabel('Business name').inputValue(), 'Adebayo Auth Fixture');
      await screenshot('auth-signup-business.png');
      await authPage.getByRole('button', { name: 'Create account', exact: true }).evaluate((button) => { button.click(); button.click(); });
      await authPage.getByRole('heading', { name: 'Check your inbox' }).waitFor();
      const signups = requests.filter((request) => request.path === '/auth/v1/signup');
      assert.equal(signups.length, 1);
      assert.equal(signups[0].body.email, 'new-owner@auth-fixture.example');
      assert.equal(signups[0].body.password, 'fixture-strong-password');
      assert.deepEqual(signups[0].body.data, { full_name: 'Tomi Auth Fixture', business_name: 'Adebayo Auth Fixture', phone: '+2348000000000', business_mode: 'owner_rep' });
      for (const key of ['tenant_id', 'role', 'is_active', 'branch']) assert.equal(Object.hasOwn(signups[0].body.data, key), false);
      assert.match(signups[0].redirectTo, /^https:\/\/.+\/login\.html$/);
      assert.ok(signupResponse);
      await authPage.getByText('new-owner@auth-fixture.example', { exact: true }).waitFor();
      await screenshot('auth-verification.png');
      await authPage.clock.fastForward(61000);
      await authPage.getByRole('button', { name: 'Request another email' }).click();
      await authPage.getByRole('status').filter({ hasText: 'another email has been requested' }).waitFor();
      assert.equal(requests.at(-1).path, '/auth/v1/resend');
      assert.equal(requests.at(-1).body.type, 'signup');
      assert.equal(requests.at(-1).body.email, 'new-owner@auth-fixture.example');
      await authPage.getByRole('button', { name: 'Use a different email address' }).click();
      await authPage.getByRole('heading', { name: 'Start with you.' }).waitFor();
      assert.equal(await authPage.getByLabel('Password', { exact: true }).inputValue(), '');
      assert.deepEqual(pageErrors, []);
    });
  } catch (error) {
    await authPage.screenshot({ path: resolve(screenshots, 'auth-test-failure.png'), fullPage: true }).catch(() => {});
    console.error('AUTH FIXTURE FAILURE', { url: authPage.url(), text: (await authPage.locator('body').innerText()).slice(-5000), fields: await authPage.locator('input').evaluateAll((inputs) => inputs.map((input) => ({ name: input.name, type: input.type, hasValue: Boolean(input.value), valid: input.checkValidity() }))), pageErrors, requests: requests.map(({ path, redirectTo }) => ({ path, redirectTo })) });
    throw error;
  } finally {
    await authPage.close();
  }
}
