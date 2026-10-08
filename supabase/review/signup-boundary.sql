-- REVIEW ONLY: standalone identity containment from the unchanged V2 handler.
-- Test on an isolated restore and verify all legitimate staff provisioners.
-- Creates no business/profile backfill and never trusts public staff metadata.
begin;
create or replace function public.handle_new_signup() returns trigger
language plpgsql security definer set search_path = '' as $$
declare business text:=nullif(trim(new.raw_user_meta_data->>'business_name'),'');
  name text:=coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'),''),split_part(new.email,'@',1));
  phone text:=nullif(trim(new.raw_user_meta_data->>'phone'),''); mode text:=new.raw_user_meta_data->>'business_mode'; tenant uuid;
begin
  if business is null then return new; end if;
  if length(business)>200 or length(name)>200 or length(coalesce(phone,''))>30 then raise exception 'Check business and account details'; end if;
  if mode is null or mode not in ('solo','owner_rep','owner_manager_rep') then mode:='owner_rep'; end if;
  insert into public.tenants(name,business_name,plan,status,business_mode,contact_email,contact_phone,trial_ends_at)
    values(business,business,'starter','trial',mode,new.email,phone,now()+interval '14 days') returning id into tenant;
  insert into public.profiles(id,tenant_id,full_name,phone,role,is_active) values(new.id,tenant,name,phone,'owner',true);
  insert into public.expense_categories(tenant_id,name,is_active)
    select tenant,x,true from unnest(array['Fuel','Vehicle Maintenance','Office Supplies','Salaries','Rent','Utilities','Other']) x;
  return new;
end $$;
-- Replace only the two documented identity handlers; retain unrelated Auth triggers.
do $$ declare t record; begin
  for t in select trg.tgname from pg_catalog.pg_trigger trg join pg_catalog.pg_proc f on f.oid=trg.tgfoid
    where trg.tgrelid='auth.users'::regclass and not trg.tgisinternal and f.proname in('handle_new_signup','handle_new_user') loop
    execute pg_catalog.format('drop trigger %I on auth.users',t.tgname);
  end loop;
end $$;
create trigger stockflow_v2_signup after insert on auth.users for each row execute function public.handle_new_signup();
revoke all on function public.handle_new_signup() from public,anon,authenticated;

commit;
