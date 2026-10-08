-- Review only. Reconcile and test on an isolated restore before deployment.
-- No profile, identity, tenant or historical business record is rewritten.
begin;
-- Authorization is refreshed from authoritative rows on every statement;
-- an old JWT must not retain business access after account deactivation or
-- tenant suspension. These helpers are shared by the retained RLS policies.
create or replace function public.get_my_role() returns text
 language sql stable security definer set search_path='' as $$
 select p.role::text from public.profiles p where p.id=auth.uid() and p.is_active
 and (p.role::text='super_admin' or exists(select 1 from public.tenants t where t.id=p.tenant_id and t.status::text<>'suspended'))
$$;
create or replace function public.get_my_tenant_id() returns uuid
 language sql stable security definer set search_path='' as $$
 select p.tenant_id from public.profiles p where p.id=auth.uid() and p.is_active
 and (p.role::text='super_admin' or exists(select 1 from public.tenants t where t.id=p.tenant_id and t.status::text<>'suspended'))
$$;
revoke execute on function public.get_my_role(),public.get_my_tenant_id() from public,anon;
grant execute on function public.get_my_role(),public.get_my_tenant_id() to authenticated;
do $$declare p record;c record;begin
 for p in select policyname from pg_policies where schemaname='public' and tablename='profiles' and cmd in ('ALL','INSERT','UPDATE','DELETE') loop
  execute format('drop policy %I on public.profiles',p.policyname);
 end loop;
 revoke insert,update,delete,truncate,references,trigger on public.profiles from public,anon,authenticated;
 for c in select attname from pg_attribute where attrelid='public.profiles'::regclass and attnum>0 and not attisdropped loop
  execute format('revoke insert (%I),update (%I),references (%I) on public.profiles from public,anon,authenticated',c.attname,c.attname,c.attname);
 end loop;
end $$;
revoke select on public.profiles from public,anon;
-- Staff provisioning must use an authorized server path. Client account
-- editing is limited to personal contact fields on the actor's own row.
grant update(full_name,phone) on public.profiles to authenticated;
create policy stockflow_profile_self_contact on public.profiles for update to authenticated
 using(id=(select auth.uid()) and is_active)
 with check(id=(select auth.uid()) and is_active);
-- Owners may edit business contact/display fields, never plan, subscription,
-- status, price or tenant identity. Platform administration needs a server path.
do $$declare p record;c record;begin
 for p in select policyname from pg_policies where schemaname='public' and tablename='tenants' and cmd in ('ALL','INSERT','UPDATE','DELETE') loop
  execute format('drop policy %I on public.tenants',p.policyname);
 end loop;
 revoke insert,update,delete,truncate,references,trigger on public.tenants from public,anon,authenticated;
 for c in select attname from pg_attribute where attrelid='public.tenants'::regclass and attnum>0 and not attisdropped loop
  execute format('revoke insert (%I),update (%I),references (%I) on public.tenants from public,anon,authenticated',c.attname,c.attname,c.attname);
 end loop;
end $$;
revoke select on public.tenants from public,anon;
grant update(name,business_name,contact_email,contact_phone,logo_url) on public.tenants to authenticated;
create policy stockflow_tenant_owner_contact on public.tenants for update to authenticated
 using(id=(select public.get_my_tenant_id()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active and p.role::text='owner'))
 with check(id=(select public.get_my_tenant_id()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active and p.role::text='owner'));
commit;
