# StockFlow incident review — 8 October 2026

## Verified evidence

The owner greeting concatenates the authoritative profile full name, an em dash, and the tenant `business_name || name`. The screenshot’s “HACKED” suffix is the tenant name, not a profile name. Read-only inspection found a tenant with `name='HACKED'`, null business name, and `updated_at=2026-06-05 22:10:10.873284+00` (5 June at 23:10 Lagos). This establishes the retained row and its last-update timestamp; it does not establish the actor, exact attack time, or completeness of compromise. The user reports the incident was earlier or its date is unknown. No name or historical record was corrected.

The deployed owner page, shared Supabase client and service worker matched the review repository files byte-for-byte when fetched. They contained no literal HACKED marker and used the expected Supabase project. This does not certify every deployed asset, CDN history, browser extension, device, or account session.

A pattern scan found no service-role JWT, `sb_secret_` key, GitHub personal token or private-key PEM in 201 tracked files or 687 unique historical Git blobs scanned. Large blobs above 3 MB were excluded. This is limited evidence, not a complete credential inventory. The public Supabase anon key is intentionally a client credential; making the Git repository private would not repair a database permission flaw.

## Independently reproduced authorization defect

The live profile UPDATE policy lets an owner update another profile, including its role. The deployed profile trigger prevents tenant changes only. On the captured schema with fictional identities, an owner successfully promoted another same-tenant account to `super_admin`; that account then successfully renamed a profile in another tenant. No attack was executed on production records.

An owner cannot directly UPDATE an ordinary foreign profile while the SELECT policy hides it; the proven escalation above bypasses that restriction. This distinguishes policy text from effective behavior.

The live signup trigger also accepts an existing tenant ID and manager/rep role from public, user-editable metadata, and activates the new profile. The existing V2 signup replacement removes that trust, but it is not installed in the actual database. The retained source’s claim that profile hardening is deployed is not sufficient: the inspected live trigger and policies remain the authority.

Tenant UPDATE grants also expose platform billing/subscription/status fields to owner clients. The reviewed boundary limits business owners to their own business display/contact fields.

## Reviewed safeguards and verification

`supabase/review/profile-boundary.sql` removes direct browser profile provisioning/deletion and sensitive-field writes; retains active users’ own full-name/phone edits; removes direct tenant creation/deletion and billing/status writes; and retains owner contact/display editing only within their business. It clears column grants as well as table grants. Platform/staff administration must move through trusted server operations. Service-role grants and historical rows are preserved.

`tests/profile-boundary-v2.mjs` first reproduces the escalation only on fictional records and verifies ten deny/allow and signup boundaries after the patch. Existing signup/invitation tests independently verify the staged V2 identity handler. These are local captured-schema checks, not real JWT or restored-production acceptance.

Supabase security advisors additionally reported leaked-password protection disabled and publicly executable definer functions. Public execution alone is not proof a guarded function is exploitable; each body and grant needs review.

## Unresolved incident/release requirements

The Auth audit table returned no entries in the last 30 days. The unified log inventory had recent Auth sources, but an attempted detailed audit query returned a backend error. No June incident trace was recovered. The available evidence cannot attribute the name change, establish that privileged credentials were stolen, or certify that financial records were unaffected.

Before production remediation: capture and verify an encrypted backup including Auth/Storage metadata and uploaded objects; restore it in isolation; inventory current platform administrators/staff against approved ownership; reconcile all existing identity provisioners; test the signup/profile/tenant changes with real JWTs and inherited grants; establish session revocation/password recovery and the configured leaked-password/MFA controls. Do not infer legitimate roles or rewrite identities from editable metadata.

The existing deployment runbook requires a verified backup and isolated restore before production migration. This review has not applied any production SQL, rewritten the HACKED tenant name, changed existing roles, revoked user sessions or rotated credentials. The authorization defect therefore remains a live release requirement until the verified containment is deployed.
