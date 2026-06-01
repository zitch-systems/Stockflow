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

-- 1) Profiles must never be inserted from the client. Only the
--    handle_new_user() trigger (SECURITY DEFINER) or an admin provisioning
--    function should create rows. Revoke direct client INSERT.
revoke insert on table public.profiles from authenticated, anon;

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

-- 3) (Recommended) confirm the SELECT/UPDATE policies are tenant-scoped, e.g.:
--    create policy profiles_self_update on public.profiles
--      for update to authenticated
--      using  (id = auth.uid())
--      with check (id = auth.uid());
--    Owners/managers managing staff should go through a SECURITY DEFINER
--    function or a separate policy gated on the actor's role + matching tenant.
