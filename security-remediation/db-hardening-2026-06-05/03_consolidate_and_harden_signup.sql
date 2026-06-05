-- Migration 03 — consolidate_and_harden_signup
-- H4: remove the duplicate signup handler (self-serve signup was creating two tenants).
-- C1: stop trusting client-supplied role. Self-serve => 'owner'; staff self-registration
--     can only be 'manager' or 'rep' (never 'owner'/'super_admin' from client metadata).

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

CREATE OR REPLACE FUNCTION public.handle_new_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
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

  -- CASE 1: self-serve signup (has business_name) -> new tenant + OWNER (role forced server-side)
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

  -- CASE 2: staff self-registration (tenant_id in metadata) -> clamp role to manager/rep only
  ELSE
    v_req_role := lower(NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'role', '')), ''));
    IF v_req_role NOT IN ('manager','rep') THEN
      v_req_role := 'rep';
    END IF;
    v_role := v_req_role::public.user_role;

    INSERT INTO public.profiles (id, tenant_id, full_name, phone, role, is_active)
    VALUES (
      NEW.id,
      NULLIF(NEW.raw_user_meta_data->>'tenant_id', '')::uuid,
      v_full_name,
      v_phone,
      v_role,
      true
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'handle_new_signup error for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$function$;

-- Trigger/utility function: not RPC-callable
REVOKE EXECUTE ON FUNCTION public.handle_new_signup() FROM anon, authenticated, public;
