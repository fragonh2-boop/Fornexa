-- Source only: apply together with Muelles after DATA150 integration/load gate.
-- Known legacy shapes are migrated explicitly; every changed row has a durable
-- complete before/after image in the tenant's existing audit log.
begin;
alter table public.address_operational_profiles alter column opening_hours set default
 '{"timezone":"Europe/Madrid","days":{"mon":[],"tue":[],"wed":[],"thu":[],"fri":[],"sat":[],"sun":[]}}'::jsonb;
do $$
declare profile public.address_operational_profiles; replacement jsonb; after_row jsonb;
begin
 for profile in select * from public.address_operational_profiles
  where opening_hours in ('{}'::jsonb,'{"mon_fri":"08:00-18:00"}'::jsonb) for update loop
  replacement := '{"timezone":"Europe/Madrid","days":{"mon":[],"tue":[],"wed":[],"thu":[],"fri":[],"sat":[],"sun":[]}}'::jsonb;
  if profile.opening_hours='{"mon_fri":"08:00-18:00"}'::jsonb then
   replacement := '{"timezone":"Europe/Madrid","days":{"mon":[{"from":"08:00","to":"18:00"}],"tue":[{"from":"08:00","to":"18:00"}],"wed":[{"from":"08:00","to":"18:00"}],"thu":[{"from":"08:00","to":"18:00"}],"fri":[{"from":"08:00","to":"18:00"}],"sat":[],"sun":[]}}'::jsonb;
  end if;
  update public.address_operational_profiles p set opening_hours=replacement
   where p.tenant_id=profile.tenant_id and p.address_id=profile.address_id returning to_jsonb(p.*) into after_row;
  insert into public.audit_events(tenant_id,entity_type,entity_id,action,actor_user_id,source_channel,before_data,after_data,reason)
   values(profile.tenant_id,'ADDRESS_OPERATIONAL_PROFILE',profile.address_id,'NORMALIZE_CALENDAR',null,'MUELLES_V1_MIGRATION',to_jsonb(profile),after_row,'Explicit conversion of known legacy calendar; before image retained');
 end loop;
end; $$;
commit;
