# Trusted staff invitation

Staged source, not a deployed or mail-delivery certification. This endpoint replaces browser `auth.signUp` and temporary-password sharing for the retained owner's **Send Invitation** form. The separate existing `provision-user` endpoint used by rep applications has no source in this repository and must be inspected/ported before the new signup trigger is deployed.

The handler verifies the calling JWT using Auth `getUser`, then reserves a canonical request through an owner-only database function. It ignores HTTP tenant/actor fields. Service credentials are used only inside this function to invite the approved email and finish the approved profile. User-editable metadata contains recovery markers, never tenant/role authority. Existing accounts are not rebound. One email reservation coordinates competing requests; retries must keep the original request ID and details.

Auth invitation and database creation cannot be one database transaction. The operation record permits recovery after a provider response or profile completion is lost. A pending result must be retried, not given a new identity. Success reports **invitation requested**, not confirmed mail delivery. Existing-account conflicts and permanently failed reservations need operator review with audit evidence; do not delete/reassign an Auth account to clear the error.

## Validation

```sh
npm test
npx --yes --package deno@2.9.6 deno check --no-config --no-lock --node-modules-dir=none supabase/functions/provision-stockflow-staff/index.ts
```

SQL tests use isolated PostgreSQL. Handler tests inject clients and send no email. Real signup/invite/recovery/revocation and mail-provider failures remain acceptance gates.

## Deployment gates

1. Inspect the actual Auth triggers, profile-protection trigger and existing provisioning endpoints on a restored staging project. Reconcile the real schema with the migration. The migration prevents public signup from attaching a staff profile, which may require changing older provisioners.
2. Apply the reviewed migration only after backup/restore and compatibility testing. Confirm `begin_staff_invite` is authenticated/owner-only, `state`/`finish` are service-only, and no direct profile identity mutations remain available to ordinary clients.
3. Deploy this function to the correct project using its trusted provider runtime. Provider-injected `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` stay server-side. Set `STOCKFLOW_WEB_ORIGIN` to the approved web origin; add any preview origin deliberately in the CORS allowlist instead of using a wildcard.
4. Verify the gateway accepts the project's actual JWT format while this handler still performs `getUser`. Verify the Auth invitation redirect to `/reset-password.html`, email delivery, rate limits, recovery markers and tenant/profile data through real test accounts.
5. Run owner -> invitation -> password setup -> staff login -> sale -> owner sees transaction, plus wrong-role/foreign-tenant/duplicate/revocation/failure tests. Do not switch production UI before these gates pass.

Never expose service credentials in a public build or log request/JWT/mail data. CORS is a browser control, not the authorization boundary.
