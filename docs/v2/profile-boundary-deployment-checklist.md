# Profile / tenant / signup boundary — production deployment checklist

**Status: DRAFT for operator review. Nothing here has been run against production.**

Closes the live authorization defect in [security-incident-review-20261008.md](security-incident-review-20261008.md):
an owner can promote another same-tenant profile to `super_admin`; the signup trigger trusts
editable metadata for tenant/role; owners can write tenant billing/status columns.

Scripts (review-only, not registered migrations):

| Script | Effect |
|--------|--------|
| `supabase/review/signup-boundary.sql` | Replaces `handle_new_signup`; drops the `auth.users` triggers that call `handle_new_signup` / `handle_new_user`; installs `stockflow_v2_signup`. |
| `supabase/review/profile-boundary.sql` | Rewrites `get_my_role` / `get_my_tenant_id`; drops all INSERT/UPDATE/DELETE policies on `profiles` and `tenants`; revokes all write grants; re-grants narrow self/owner updates. |

Read first: [deployment-runbook.md](deployment-runbook.md) (sections 1–4 and "Profile/tenant incident containment").
Project: `fjmkenowgfxepwpyjcss`. The Supabase MCP in some sessions points at a different org: confirm the project ref before every step.

---

## 0. Decide the order — read this before anything else

`profile-boundary.sql` **breaks existing front-end writes.** After it runs, the browser can write only
`profiles.full_name` / `phone` on the actor's own row and `tenants.name, business_name, contact_email, contact_phone, logo_url` for the owner's own tenant. These call sites then fail with a permission error:

| Page | Lines | What stops working |
|------|-------|--------------------|
| `owner-dashboard.html` | 3505 | Rep provisioning: KYC, bank, guarantor, `debt_limit` written to the new profile |
| | 3536, 3545 | Applying / deactivating via approval actions (`target_profile_id`) |
| | 3786, 5398 | Activate / deactivate staff |
| | 7061 | Changing `business_mode` (column not granted) |
| | 3839, 3924 | Still work (granted columns / own row) |
| `manager-dashboard.html` | 4353, 4674 | Editing a rep's `debt_limit` |
| | 3516 | Still works (own `full_name`/`phone`) |
| `admin-dashboard.html` | 1664, 1678, 1689, 1713, 1740, 2170, 2386 | Suspend, reactivate, delete, create tenant; plan/price/billing changes |
| | 1787, 2111, 1917, 2479 | Creating users; activating / deactivating profiles |
| `rep-dashboard.html` | 2331 | Still works |
| `owner-dashboard.html` | 3457–3466 | Calls the `provision-user` Edge Function, whose source is **not in this repo** and may depend on the old signup contract |

Also check `mobile/` and any Edge Function or cron job that writes `profiles` / `tenants`. A grep of `mobile/src` found none.

**Decision needed from the operator** (pick one before scheduling):

- [ ] **A. Contain first, accept the loss of admin features.** Deploy both scripts now. Staff and platform administration stops until server replacements ship. Choose this if the escalation is judged more urgent than owner/admin workflows.
- [ ] **B. Ship server replacements first.** Build trusted RPCs / Edge Functions for the rows above, switch the pages to them, then deploy the scripts. Longer window with the hole open.
- [ ] **C. Narrow interim fix.** Deploy `signup-boundary.sql` alone (touches only the signup trigger), plus a minimal profile-trigger change that blocks `role`, `tenant_id` and `is_active` changes by non-admins, and defer the full rewrite. This needs a new script and tests. Not written yet.

`signup-boundary.sql` does not depend on the other script and has no front-end write impact, but it changes **how new accounts get tenants**. See section 4.

---

## 1. Before touching production

- [ ] Confirm the target is project `fjmkenowgfxepwpyjcss`.
- [ ] Run `supabase/preflight.sql` read-only; store the output **privately** (it contains real identifiers).
- [ ] Record the actual `auth.users` triggers and `profiles` triggers (preflight lists them). Note any not named `handle_new_signup` / `handle_new_user`: the signup script drops only triggers calling those two.
- [ ] Inventory every `profiles` / `tenants` policy and grant. The script drops **every** non-SELECT policy on both tables, including ones this repo does not know about.
- [ ] Recover the source of `provision-user` (Supabase dashboard → Edge Functions) and decide whether it is retired, ported to `provision-stockflow-staff`, or left to break.
- [ ] Reconcile the **four** active `super_admin` profiles against the approved owner roster. Do not infer legitimacy from the role label.
- [ ] Identify the "HACKED" tenant row. Preserve it as evidence; do not rename it.
- [ ] Record the current deployed Git SHA and the Vercel / Netlify / Cloudflare deployment IDs for rollback.

## 2. Backup and restore proof (hard gate)

- [ ] Encrypted provider backup / PITR point, **plus** a logical export (data, functions, policies, grants, Auth metadata).
- [ ] Storage objects backed up separately.
- [ ] Record timestamp, checksums, retention, encryption and access owner.
- [ ] Restore into an isolated project with mail and webhooks disabled. Verify tenant / profile counts and balances against the manifest.
- [ ] Record the measured restore time. A download without a successful restore does not count.

## 3. Rehearse on the isolated restore

- [ ] Run `supabase/preflight.sql` on the restore and diff against production; the fixture in `tests/fixtures/` is inferred, not the live schema.
- [ ] Apply `signup-boundary.sql`, then `profile-boundary.sql`, each inside its own transaction (both already `begin … commit`).
- [ ] Re-run the boundary tests against the **restored** schema, not only the fixture. Locally: `node tests/profile-boundary-v2.mjs` (13 checks).
- [ ] With **real JWTs** for each role (owner, manager, rep, `super_admin`, other-tenant owner, anon), confirm:
  - [ ] Owner cannot UPDATE another profile (role, `is_active`, `tenant_id`, `debt_limit`).
  - [ ] Owner cannot write tenant `plan`, `status`, `trial_ends_at`, price or subscription columns.
  - [ ] User can still update own `full_name` / `phone`.
  - [ ] Deactivated user's old JWT loses tenant data access immediately.
  - [ ] Suspended tenant's users lose access with an old JWT.
  - [ ] `anon` cannot read `profiles` or `tenants`.
  - [ ] Direct INSERT / DELETE / TRUNCATE on both tables is denied for `anon` and `authenticated`.
- [ ] Signup: new business owner still gets tenant + owner profile + default expense categories; metadata naming an existing `tenant_id` or role `manager` / `rep` gains nothing.
- [ ] Walk through every row of the table in section 0 against the restore and record what fails. Confirm the failure is a clean error toast, not a silent success.
- [ ] Confirm every other reader of `get_my_role()` / `get_my_tenant_id()` (all RLS policies) still works. The functions now return NULL for inactive users and suspended tenants.
- [ ] `get_advisors` (security) before and after; record new warnings.

## 4. Signup and onboarding compatibility

- [ ] Verify how staff reach the system today (`provision-user` Edge Function, invite emails, admin-created users) against the new signup trigger, which **ignores** metadata staff attachment.
- [ ] Deploy `provision-stockflow-staff` (see its README) if staff invitations are to work. It needs `SUPABASE_SERVICE_ROLE_KEY` set as an Edge Function secret by the operator, never in the repo or browser.
- [ ] Set `STOCKFLOW_WEB_ORIGIN` for that function.
- [ ] Test: owner invites a manager and a rep; invitee sets a password via the email link; role and tenant are correct; revoking access works.
- [ ] Test password recovery and email confirmation end to end (redirect URLs must match Auth settings).

## 5. Production deployment (maintenance window)

- [ ] Announce the window; tell admins which features pause (per decision A / B).
- [ ] Take a fresh PITR marker immediately before the change.
- [ ] Apply `signup-boundary.sql`. Verify with a throwaway signup (delete the test user and tenant afterward, with the operator's approval).
- [ ] Apply `profile-boundary.sql`.
- [ ] Re-run the section 3 JWT checks against production using **test accounts the operator creates**, never real staff.
- [ ] Smoke-test one login per role and one sale.
- [ ] Watch Auth and API logs for 403 / 42501 spikes for at least an hour.

## 6. After deployment

- [ ] Auth settings: enable **leaked-password protection**; consider MFA for `super_admin` and owners.
- [ ] Review the publicly executable `SECURITY DEFINER` functions flagged by the advisor. Read each body and grant. `security-remediation/db-hardening-2026-06-05/06_revoke_public_execute_on_definer_rpcs.sql` is the starting point.
- [ ] Rotate sessions for the four platform admins and any account you cannot vouch for; force password resets.
- [ ] Rotate the service-role key if there is any doubt about exposure. The anon key is public by design and needs no rotation.
- [ ] Update `PLATFORM-AUDIT-2026-06.md` and `docs/v2/issue-register.md`: the profile-trigger "verified deployed" claim was wrong.
- [ ] Tick the matching rows in [launch-checklist.md](launch-checklist.md) only with production evidence.

## 7. Rollback

- Both scripts are transactional, so a failure mid-run leaves nothing half applied.
- **Do not** roll back by restoring the old policies: that reopens the escalation. If the app is unusable, prefer fixing forward with a narrow server RPC for the broken action.
- Last resort: provider restore to the section 5 PITR marker. This loses data written after it, so it needs an explicit recovery-point and data-loss decision from the operator.
- The signup trigger can be restored from the preflight output (trigger definitions and function hashes are recorded there).

## Open questions for the operator

1. Option A, B or C in section 0?
2. Is `provision-user` still in use, and where is its source?
3. Who are the approved `super_admin` accounts?
4. What maintenance window, and who is on call?
