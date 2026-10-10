-- REVIEW ONLY: interim profile/tenant containment ("option C" in
-- docs/v2/profile-boundary-deployment-checklist.md). Test on an isolated restore
-- first. Unlike profile-boundary.sql it revokes no grant or policy, so every
-- browser write the retained dashboards make today keeps working; it adds
-- row-level guards for the escalation paths reproduced on the captured schema.
-- No profile, tenant or historical record is rewritten.
begin;

-- Shared helpers: an old JWT of a deactivated account no longer carries a role
-- or tenant into RLS. (Suspended-business handling stays with profile-boundary.sql
-- so the retained suspension banner can still read its tenant row.)
create or replace function public.get_my_role() returns text
 language sql stable security definer set search_path='' as $$
 select p.role::text from public.profiles p where p.id=auth.uid() and p.is_active
$$;
create or replace function public.get_my_tenant_id() returns uuid
 language sql stable security definer set search_path='' as $$
 select p.tenant_id from public.profiles p where p.id=auth.uid() and p.is_active
$$;

-- Profiles: browser sessions cannot create profiles, change roles, edit owner or
-- platform-admin accounts other than their own, or raise their own access,
-- limits or verification. Requests without a user (service role, SQL editor,
-- Auth triggers, provisioning functions) are unaffected.
create or replace function public.protect_profile_sensitive_fields() returns trigger
 language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); actor_role text;
begin
  if actor is null then return new; end if;
  if tg_op='UPDATE' and new.tenant_id is distinct from old.tenant_id then
    raise exception 'Only super admins can change a user''s tenant' using errcode='42501';
  end if;
  select p.role::text into actor_role from public.profiles p where p.id=actor and p.is_active;
  if actor_role='super_admin' then return new; end if;
  if tg_op='INSERT' then
    raise exception 'Staff accounts are created through StockFlow provisioning' using errcode='42501';
  end if;
  if new.role is distinct from old.role then
    raise exception 'Only platform administrators can change roles' using errcode='42501';
  end if;
  if old.role::text in ('owner','super_admin') and old.id<>actor then
    raise exception 'Owner and administrator accounts can only be changed by their holder or a platform administrator' using errcode='42501';
  end if;
  if new.id=actor and (new.is_active,new.debt_limit,new.nin_verified,new.bvn_verified,new.kyc_complete,new.monthly_target,new.commission_rate)
     is distinct from (old.is_active,old.debt_limit,old.nin_verified,old.bvn_verified,old.kyc_complete,old.monthly_target,old.commission_rate) then
    raise exception 'You cannot change your own access, limits or verification' using errcode='42501';
  end if;
  return new;
end $$;
drop trigger if exists protect_profile_sensitive_fields on public.profiles;
create trigger protect_profile_sensitive_fields before insert or update on public.profiles
 for each row execute function public.protect_profile_sensitive_fields();
revoke all on function public.protect_profile_sensitive_fields() from public,anon,authenticated;

-- Tenants: owners keep editing their business name, contact, logo and mode;
-- plan, status, trial, price, limits and suspension stay with platform admins.
create or replace function public.protect_tenant_billing_fields() returns trigger
 language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then return new; end if;
  if exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_active and p.role::text='super_admin') then return new; end if;
  if (new.plan,new.status,new.trial_ends_at,new.monthly_price,new.billing_cycle,new.max_reps,new.subscription_expires_at,new.subscription_ends_at,new.is_active,new.suspension_reason,new.suspended_at)
     is distinct from (old.plan,old.status,old.trial_ends_at,old.monthly_price,old.billing_cycle,old.max_reps,old.subscription_expires_at,old.subscription_ends_at,old.is_active,old.suspension_reason,old.suspended_at) then
    raise exception 'Plan, billing and status changes are made by StockFlow administrators' using errcode='42501';
  end if;
  return new;
end $$;
drop trigger if exists protect_tenant_billing_fields on public.tenants;
create trigger protect_tenant_billing_fields before update on public.tenants
 for each row execute function public.protect_tenant_billing_fields();
revoke all on function public.protect_tenant_billing_fields() from public,anon,authenticated;

-- Signup: unchanged except that staff attached through user metadata start
-- INACTIVE. Public signup can set that metadata, so it must not grant tenant
-- access; the owner activates a genuine new staff member from Staff. Owner
-- provisioning that relies on this path (provision-user) keeps creating the
-- account. Replace with signup-boundary.sql once provisioners are verified.
create or replace function public.handle_new_signup() returns trigger
 language plpgsql security definer set search_path to 'public' as $function$
DECLARE
  v_business_name text;
  v_full_name     text;
  v_phone         text;
  v_tenant_id     uuid;
  v_biz_mode      text;
  v_req_role      text;
  v_role          public.user_role;
BEGIN
  v_business_name := COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'business_name'), ''), '');
  v_full_name     := COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''), split_part(NEW.email, '@', 1));
  v_phone         := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'phone', '')), '');
  v_biz_mode      := COALESCE(NEW.raw_user_meta_data->>'business_mode', 'owner_rep');
  IF v_biz_mode NOT IN ('solo','owner_rep','owner_manager_rep') THEN
    v_biz_mode := 'owner_rep';
  END IF;

  IF v_business_name <> '' THEN
    INSERT INTO public.tenants (name, business_name, plan, status, business_mode, contact_email, contact_phone, trial_ends_at)
    VALUES (v_business_name, v_business_name, 'starter', 'trial', v_biz_mode, NEW.email, v_phone, now() + interval '14 days')
    RETURNING id INTO v_tenant_id;

    INSERT INTO public.profiles (id, tenant_id, full_name, phone, role, is_active)
    VALUES (NEW.id, v_tenant_id, v_full_name, v_phone, 'owner', true)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.expense_categories (tenant_id, name, is_active) VALUES
      (v_tenant_id, 'Fuel', true),
      (v_tenant_id, 'Vehicle Maintenance', true),
      (v_tenant_id, 'Office Supplies', true),
      (v_tenant_id, 'Salaries', true),
      (v_tenant_id, 'Rent', true),
      (v_tenant_id, 'Utilities', true),
      (v_tenant_id, 'Other', true)
    ON CONFLICT DO NOTHING;
  ELSE
    v_req_role := lower(NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'role', '')), ''));
    IF v_req_role NOT IN ('manager','rep') THEN
      v_req_role := 'rep';
    END IF;
    v_role := v_req_role::public.user_role;

    INSERT INTO public.profiles (id, tenant_id, full_name, phone, role, is_active)
    VALUES (NEW.id, NULLIF(NEW.raw_user_meta_data->>'tenant_id', '')::uuid, v_full_name, v_phone, v_role, false)
    ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'handle_new_signup error for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$function$;

commit;
