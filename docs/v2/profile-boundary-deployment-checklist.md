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
- [x] **C. Narrow interim fix — chosen.** `supabase/review/profile-containment.sql`, tested by `tests/profile-containment-v2.mjs` (in `npm test`). It revokes no grant or policy, so every call site in the table above keeps working. It closes the escalation paths reproduced on the captured schema:

  | Path | Before | After |
  |------|--------|-------|
  | Owner sets another profile's `role` (incl. `super_admin`) | allowed | denied; only an active `super_admin` changes roles |
  | User raises own `is_active`, `debt_limit`, `nin_verified`, `bvn_verified`, `kyc_complete`, `monthly_target`, `commission_rate` | allowed | denied |
  | Owner edits another `owner` / `super_admin` profile | allowed | denied |
  | Browser session inserts a profile | allowed for owners and for a user's own id | denied (service role, Auth triggers and provisioning are unaffected) |
  | Owner writes tenant `plan`, `status`, trial, price, `max_reps`, subscription or suspension fields | allowed | denied; name, contact, logo and `business_mode` still editable |
  | Public signup with `tenant_id` metadata joins that business as an active manager/rep | allowed | profile is created **inactive**; it sees no tenant data until the owner activates it |
  | Deactivated account keeps tenant access with its old JWT | yes | `get_my_role()` / `get_my_tenant_id()` return NULL for inactive profiles |

  Trade-offs to accept with C:
  - Staff provisioned through `provision-user` (if it relies on the signup trigger) now start inactive; the owner activates them from Staff. Until then their login reports a missing business profile.
  - Suspended businesses still keep access through an old JWT; the suspended-tenant helper change stays in `profile-boundary.sql` so the retained suspension banner keeps working.
  - It is containment, not the end state. A and B remain the follow-up.

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
- [ ] Option C: apply `profile-containment.sql` (one transaction). Do **not** also apply `signup-boundary.sql` or `profile-boundary.sql` in this rollout.
- [ ] Confirm the live `handle_new_signup` body matches the captured one apart from the inactive staff insert (preflight records its hash); the script replaces it wholesale.
- [ ] Confirm every tenant column the billing guard names exists on the live table (preflight column list).
- [ ] Re-run the containment tests against the **restored** schema, not only the fixture. Locally: `npm run test:containment` (12 checks).
- [ ] With **real JWTs** for each role (owner, manager, rep, `super_admin`, other-tenant owner), confirm the option C table:
  - [ ] Owner cannot change any `role`, edit another owner/admin profile, or insert a profile.
  - [ ] Owner cannot write tenant `plan`, `status`, `trial_ends_at`, price, `max_reps`, subscription or suspension columns.
  - [ ] Rep/manager cannot change their own `is_active`, `debt_limit`, verification flags, target or commission.
  - [ ] Owner **can** still edit staff KYC and `debt_limit`, deactivate and reactivate staff, and edit business name/contact/logo/mode.
  - [ ] Everyone can still update own `full_name` / `phone`.
  - [ ] `super_admin` can still change roles and tenant billing from `admin-dashboard.html`.
  - [ ] Deactivated user's old JWT loses tenant data access immediately.
- [ ] Signup: new business owner still gets an active owner profile, tenant and default expense categories; metadata naming an existing `tenant_id` lands inactive with no tenant data.
- [ ] Provisioning: approve a rep application through `provision-user`, then activate the rep from Staff and confirm they can sign in and sell.
- [ ] Walk through every row of the table in section 0 against the restore. Under option C each should still succeed.
- [ ] Confirm every other reader of `get_my_role()` / `get_my_tenant_id()` (all RLS policies) still works. Under option C they return NULL only for inactive profiles.
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
- [ ] Apply `profile-containment.sql`.
- [ ] Verify with operator-created test accounts: an owner cannot change a role or billing field; a rep cannot raise their own debt limit; an owner can still deactivate/reactivate staff and edit KYC; a metadata signup naming a business lands inactive.
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
