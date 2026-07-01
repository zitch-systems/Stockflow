-- ============================================================================
-- 01 — profiles RLS hardening (fixes C2: privilege escalation)
-- ============================================================================
-- TEMPLATE — review against your real schema and test in a Supabase branch.
--
-- Goal: a user may edit ONLY their own non-privileged fields (full_name,
-- phone, and a few personal KYC fields). Nobody may self-assign role /
-- tenant_id / is_active / debt_limit. Profile *creation* is server-only.
--
-- This neutralises both the console attack
--   sb.from('profiles').update({ role:'owner' })
-- and the user_metadata-trusting recovery upsert in supabase-client.js.
-- ============================================================================

-- 1) Profiles should ideally be created only by the handle_new_user() trigger
--    (SECURITY DEFINER) or an admin provisioning function. The blunt way to
--    enforce that is to revoke client INSERT — but ⚠️ the frontend STILL creates
--    profile rows directly today, so the revoke below would BREAK:
--      • login / recovery bootstrap  supabase-client.js:79,90  (profiles.upsert)
--      • owner creates rep/manager   owner-dashboard.html:6047  (profiles.insert)
--      • super-admin provisioning    admin-dashboard.html:1781 (upsert), :2105 (insert)
--    Left commented until those paths move server-side. The field-lock trigger
--    in step 2 below ALREADY stops the main escalation (UPDATE role/tenant_id),
--    so it is safe to deploy this file without the revoke. To also close the
--    INSERT vector without breaking the app, prefer a BEFORE INSERT trigger
--    that forces role to a safe default and blocks self-assigning
--    super_admin / tenant_id — not this blanket revoke.
--
-- revoke insert on table public.profiles from authenticated, anon;

-- 2) Block changes to protected columns on any UPDATE that isn't performed by
--    a privileged actor. Implemented as a trigger because RLS WITH CHECK
--    cannot easily express "these specific columns are immutable".
create or replace function public.enforce_profile_field_locks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id   uuid := auth.uid();
  actor_role text;
begin
  -- Service role / server-side (no JWT) context: allow. SECURITY DEFINER
  -- functions and the auth trigger run with auth.uid() = null.
  if actor_id is null then
    return new;
  end if;

  select role into actor_role from public.profiles where id = actor_id;

  -- A user editing THEIR OWN row who is not an owner/manager/super_admin
  -- (i.e. a rep) may not touch any privileged column.
  if new.id = actor_id and coalesce(actor_role, 'rep') not in ('owner','manager','super_admin') then
    if new.role       is distinct from old.role
       or new.tenant_id is distinct from old.tenant_id
       or new.is_active is distinct from old.is_active
       or new.debt_limit is distinct from old.debt_limit then
      raise exception 'profiles: cannot modify privileged fields (role/tenant_id/is_active/debt_limit)';
    end if;
  end if;

  -- Nobody except a super_admin may ever change tenant_id (prevents an owner
  -- moving accounts between tenants) or grant super_admin.
  if coalesce(actor_role,'') <> 'super_admin' then
    if new.tenant_id is distinct from old.tenant_id then
      raise exception 'profiles: tenant_id is immutable';
    end if;
    if new.role = 'super_admin' and old.role is distinct from 'super_admin' then
      raise exception 'profiles: cannot self-assign super_admin';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_profile_field_locks on public.profiles;
create trigger trg_enforce_profile_field_locks
  before update on public.profiles
  for each row execute function public.enforce_profile_field_locks();

-- 2b) BEFORE INSERT companion — closes the INSERT half of C2.
--    The field-lock trigger in step 2 is BEFORE UPDATE only, but the C2 evidence
--    in supabase-client.js is an *upsert* (an INSERT for a brand-new user), and
--    `before update` never fires on INSERT. The live DB already (a) forces role
--    server-side in handle_new_signup() and (b) runs protect_profile_sensitive_fields();
--    add this only if that deployed trigger is UPDATE-only, so the same locks
--    apply when a row is created directly from the client.
--
--    ⚠️ INTERACTION: this makes a client self-INSERT of a privileged role fail.
--    That is intentional — the requireAuth() recovery upsert
--    (supabase-client.js) trusts user-writable user_metadata.role, which is the
--    C2 vector. Legitimate owner/staff provisioning happens inside
--    handle_new_signup() (where auth.uid() is null and is allowed below). Before
--    deploying, make the recovery path stop relying on client role for
--    privileged staff (provision server-side), or a manager whose profile row is
--    missing will be unable to self-recover a 'manager' profile.
create or replace function public.enforce_profile_insert_locks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id   uuid := auth.uid();
  actor_role text;
begin
  -- Service role / SECURITY DEFINER trigger context (handle_new_signup,
  -- admin provisioning function): auth.uid() is null — allow.
  if actor_id is null then
    return new;
  end if;

  select role into actor_role from public.profiles where id = actor_id;

  -- super_admin may provision anything.
  if coalesce(actor_role, '') = 'super_admin' then
    return new;
  end if;

  -- Nobody but a super_admin may create a super_admin.
  if new.role = 'super_admin' then
    raise exception 'profiles: cannot create a super_admin';
  end if;

  if new.id = actor_id then
    -- Creating your OWN row from the client (recovery upsert / console call):
    -- least privilege only. Privileged roles must come from the server trigger.
    if new.role is distinct from 'rep' then
      raise exception 'profiles: a self-created profile may only be role=rep (got %)', new.role;
    end if;
  else
    -- Creating a row for SOMEONE ELSE: only owner/manager, only manager/rep,
    -- and only inside the actor's own tenant.
    if coalesce(actor_role, '') not in ('owner', 'manager') then
      raise exception 'profiles: not permitted to create profiles for other users';
    end if;
    if new.role not in ('manager', 'rep') then
      raise exception 'profiles: provisioned staff role must be manager or rep';
    end if;
    if new.tenant_id is distinct from (select tenant_id from public.profiles where id = actor_id) then
      raise exception 'profiles: cannot create a profile in another tenant';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_profile_insert_locks on public.profiles;
create trigger trg_enforce_profile_insert_locks
  before insert on public.profiles
  for each row execute function public.enforce_profile_insert_locks();

-- 3) (Recommended) confirm the SELECT/UPDATE policies are tenant-scoped, e.g.:
--    create policy profiles_self_update on public.profiles
--      for update to authenticated
--      using  (id = auth.uid())
--      with check (id = auth.uid());
--    Owners/managers managing staff should go through a SECURITY DEFINER
--    function or a separate policy gated on the actor's role + matching tenant.
