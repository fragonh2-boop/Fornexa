-- MUELLES-V1: source only. Production application remains gated by DATA150.
begin;
create extension if not exists btree_gist;
create unique index if not exists warehouses_tenant_id_id_key on public.warehouses(tenant_id,id);
create unique index if not exists warehouse_zones_tenant_id_id_key on public.warehouse_zones(tenant_id,id);
create unique index if not exists warehouse_zones_tenant_warehouse_id_key on public.warehouse_zones(tenant_id,warehouse_id,id);
create unique index if not exists trip_stops_tenant_id_id_key on public.trip_stops(tenant_id,id);
create unique index if not exists orders_tenant_id_id_key on public.orders(tenant_id,id);
create unique index if not exists expeditions_tenant_id_id_key on public.expeditions(tenant_id,id);
create table public.warehouse_docks (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 warehouse_id uuid not null, zone_id uuid, code text not null check(length(code) between 1 and 40), name text not null check(length(name) between 1 and 120),
 status text not null default 'ACTIVE' check(status in ('ACTIVE','MAINTENANCE','OUT_OF_SERVICE')),
 max_weight_t numeric check(max_weight_t > 0), max_vehicle_length_m numeric check(max_vehicle_length_m > 0),
 is_leveler boolean not null default false, has_scale boolean not null default false, has_pit boolean not null default false, has_spill_basin boolean not null default false,
 temperature_regime text not null default 'AMBIENT' check(temperature_regime in ('AMBIENT','CHILLED','FROZEN','CONTROLLED')),
 cargo_profiles text[] not null default '{DRY_PALLETIZED}',
 default_operation_minutes integer not null default 60 check(default_operation_minutes between 15 and 1440),
 buffer_minutes integer not null default 10 check(buffer_minutes between 0 and 240), sort_order integer not null default 0, is_active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default date_trunc('milliseconds',now()),
 unique(tenant_id,id), unique(tenant_id,warehouse_id,id), unique(tenant_id,warehouse_id,code),
 foreign key(tenant_id,warehouse_id) references public.warehouses(tenant_id,id),
 foreign key(tenant_id,warehouse_id,zone_id) references public.warehouse_zones(tenant_id,warehouse_id,id)
);
create table public.dock_appointment_rules (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id), warehouse_id uuid not null,
 code text not null check(length(code) between 1 and 40), direction text not null check(direction in ('BOTH','INBOUND','OUTBOUND','INTERNAL','RETURN','TRANSFER')),
 cargo_profile text not null check(cargo_profile in ('DRY_PALLETIZED','BULK','CHILLED','FROZEN','HAZMAT_ADR','LIQUID_TANKER','RETURNS','MIXED')),
 default_duration_minutes integer not null default 60, min_duration_minutes integer not null default 30, max_duration_minutes integer not null default 240,
 max_appointments_per_slot integer not null default 1 check(max_appointments_per_slot between 1 and 1000), requires_driver_checkin boolean not null default true, is_active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default date_trunc('milliseconds',now()),
 check(min_duration_minutes >= 15 and max_duration_minutes <= 1440 and min_duration_minutes <= default_duration_minutes and default_duration_minutes <= max_duration_minutes),
 unique(tenant_id,id), unique(tenant_id,warehouse_id,id), unique(tenant_id,warehouse_id,code),
 foreign key(tenant_id,warehouse_id) references public.warehouses(tenant_id,id)
);
create table public.dock_policies (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id), warehouse_id uuid not null,
 parameters jsonb not null default '{"min_lead_minutes":240,"horizon_days":60,"firm_fence_minutes":120,"buffer_minutes":10,"punctuality_minutes":30,"dwell_target_minutes":80,"confirmation_minutes":20,"no_show_minutes":20,"no_show_limit":2,"change_cutoff_minutes":240,"max_changes":2,"last_minute_quota_pct":10,"compensation_hour_eur":35,"allow_holiday_override":false,"block_portal_holidays":true}',
 notifications jsonb not null default '{"confirmation":true,"reminder":true,"late":true,"release":true}',
 created_at timestamptz not null default now(), updated_at timestamptz not null default date_trunc('milliseconds',now()),
 unique(tenant_id,id), unique(tenant_id,warehouse_id), foreign key(tenant_id,warehouse_id) references public.warehouses(tenant_id,id)
);
create table public.dock_appointments (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 code text not null default ('APT-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,16))), warehouse_id uuid not null,
 dock_id uuid, trip_stop_id uuid, order_id uuid, expedition_id uuid, rule_id uuid not null,
 direction text not null check(direction in ('INBOUND','OUTBOUND','INTERNAL','RETURN','TRANSFER')),
 planned_start timestamptz not null, planned_end timestamptz not null, requested_start timestamptz, requested_end timestamptz,
 -- Stored range is assigned by a trigger: timestamptz + interval is not immutable.
 occupied_range tstzrange not null, buffer_minutes integer not null default 10 check(buffer_minutes between 0 and 240),
 status text not null default 'DRAFT' check(status in ('DRAFT','CONFIRMED','CHECKED_IN','AT_DOCK','OPERATION_ENDED','COMPLETED','CANCELLED','NO_SHOW')),
 booking_kind text not null default 'FIRM' check(booking_kind in ('FIRM','PROVISIONAL','WAITLIST')),
 priority text not null default 'NORMAL' check(priority in ('LOW','NORMAL','HIGH','URGENT')),
 booked_via text not null default 'PLANNER' check(booked_via in ('PLANNER','PORTAL','API')),
 is_confirmed boolean not null default false, confirmation_deadline_at timestamptz, is_overbooked boolean not null default false,
 precheck_completed_at timestamptz, cancellation_reason text, metadata jsonb not null default '{}',
 created_at timestamptz not null default now(), updated_at timestamptz not null default date_trunc('milliseconds',now()),
 unique(tenant_id,id), unique(tenant_id,code),
 check(isfinite(planned_start) and isfinite(planned_end) and planned_end > planned_start and planned_end <= planned_start + interval '24 hours'),
 check((requested_start is null and requested_end is null) or (requested_start is not null and requested_end > requested_start)),
 check(status <> 'CANCELLED' or length(trim(cancellation_reason)) > 0),
 check(booking_kind = 'FIRM' or dock_id is null),
 foreign key(tenant_id,warehouse_id) references public.warehouses(tenant_id,id),
 foreign key(tenant_id,warehouse_id,dock_id) references public.warehouse_docks(tenant_id,warehouse_id,id),
 foreign key(tenant_id,warehouse_id,rule_id) references public.dock_appointment_rules(tenant_id,warehouse_id,id),
 foreign key(tenant_id,trip_stop_id) references public.trip_stops(tenant_id,id),
 foreign key(tenant_id,order_id) references public.orders(tenant_id,id),
 foreign key(tenant_id,expedition_id) references public.expeditions(tenant_id,id),
 exclude using gist(tenant_id with =,dock_id with =,occupied_range with &&)
 where(booking_kind='FIRM' and status in ('CONFIRMED','CHECKED_IN','AT_DOCK','OPERATION_ENDED'))
);
create index dock_appointments_tenant_date on public.dock_appointments(tenant_id,planned_start);
create or replace function public.fornexa_dock_occupied_range() returns trigger language plpgsql set search_path='' as $$
begin
 if new.dock_id is not null then
  select buffer_minutes into new.buffer_minutes from public.warehouse_docks where tenant_id=new.tenant_id and id=new.dock_id;
 end if;
 new.occupied_range := tstzrange(new.planned_start,new.planned_end + new.buffer_minutes * interval '1 minute','[)');
 return new;
end; $$;
revoke all on function public.fornexa_dock_occupied_range() from public,anon,authenticated;
create trigger dock_occupied_range before insert or update on public.dock_appointments for each row execute function public.fornexa_dock_occupied_range();
-- Events may belong to a dock reservation before a trip/CMR exists.
alter table public.transport_events alter column cmr_id drop not null;
alter table public.transport_events add column dock_appointment_id uuid;
alter table public.transport_events add constraint dock_event_appointment_fk foreign key(tenant_id,dock_appointment_id) references public.dock_appointments(tenant_id,id);
alter table public.transport_events add constraint dock_event_contract check (
 (event_type in ('DOCK_GATE_IN','DOCK_CHECK_IN','DOCK_OPERATION_START','DOCK_OPERATION_END','DOCK_CHECK_OUT') and dock_appointment_id is not null and actor_user_id is not null)
 or (event_type not like 'DOCK_%' and cmr_id is not null and dock_appointment_id is null)
) not valid;
create unique index dock_event_once on public.transport_events(tenant_id,dock_appointment_id,event_type) where dock_appointment_id is not null;
create index dock_event_timeline on public.transport_events(tenant_id,dock_appointment_id,occurred_at);
-- Reserve through server RPCs only; authenticated clients have tenant-scoped read access.
do $$ declare t text; begin
 foreach t in array array['warehouse_docks','dock_appointment_rules','dock_policies','dock_appointments'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('create policy tenant_isolation on public.%I for all to authenticated using(public.fornexa_has_tenant_access(tenant_id)) with check(public.fornexa_has_tenant_access(tenant_id))',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('grant select,insert,update,delete on public.%I to service_role',t);
 end loop;
end; $$;
create or replace function public.fornexa_write_dock_appointment(p_tenant uuid,p_actor uuid,p_id uuid,p_expected timestamptz,p_values jsonb,p_reason text default null)
returns public.dock_appointments language plpgsql security invoker set search_path='' as $$
declare old_row public.dock_appointments; result public.dock_appointments; d public.warehouse_docks; r public.dock_appointment_rules; n integer;
begin
 if not exists(select 1 from public.tenant_members where tenant_id=p_tenant and user_id=p_actor and status='ACTIVE' and role in ('OWNER','ADMIN','OPERATOR')) then raise exception 'DOCK_FORBIDDEN'; end if;
 -- One warehouse lock also protects rule capacity against concurrent reservations.
 perform 1 from public.warehouses where tenant_id=p_tenant and id=(p_values->>'warehouse_id')::uuid and status='ACTIVE' for update;
 if not found then raise exception 'DOCK_WAREHOUSE'; end if;
 if p_id is not null then
  select * into old_row from public.dock_appointments where tenant_id=p_tenant and id=p_id for update;
  if not found then raise exception 'DOCK_NOT_FOUND'; end if;
  if old_row.updated_at is distinct from p_expected then raise exception 'DOCK_STALE'; end if;
  if old_row.status not in ('DRAFT','CONFIRMED','CHECKED_IN') then raise exception 'DOCK_STATE'; end if;
 end if;
 select * into r from public.dock_appointment_rules where tenant_id=p_tenant and warehouse_id=(p_values->>'warehouse_id')::uuid and id=(p_values->>'rule_id')::uuid and is_active;
 if not found or (r.direction <> 'BOTH' and r.direction <> p_values->>'direction') then raise exception 'DOCK_RULE'; end if;
 if extract(epoch from ((p_values->>'planned_end')::timestamptz-(p_values->>'planned_start')::timestamptz))/60 not between r.min_duration_minutes and r.max_duration_minutes then raise exception 'DOCK_DURATION'; end if;
 if p_id is not null and old_row.status='CHECKED_IN' and (p_values->>'status' <> 'CHECKED_IN' or (p_values->>'warehouse_id')::uuid <> old_row.warehouse_id or (p_values->>'rule_id')::uuid <> old_row.rule_id or (p_values->>'planned_start')::timestamptz <> old_row.planned_start or (p_values->>'planned_end')::timestamptz <> old_row.planned_end or (p_values->>'trip_stop_id')::uuid is distinct from old_row.trip_stop_id) then raise exception 'DOCK_STATE'; end if;
 if p_id is null and p_values->>'status' not in ('DRAFT','CONFIRMED') then raise exception 'DOCK_STATE'; end if;
 if p_values->>'dock_id' is not null then
  select * into d from public.warehouse_docks where tenant_id=p_tenant and warehouse_id=r.warehouse_id and id=(p_values->>'dock_id')::uuid and is_active and status='ACTIVE';
  if not found or not (r.cargo_profile=any(d.cargo_profiles)) then raise exception 'DOCK_COMPATIBILITY'; end if;
 end if;
 if p_values->>'booking_kind'='FIRM' and p_values->>'status' in ('CONFIRMED','CHECKED_IN') then
  select count(*) into n from public.dock_appointments where tenant_id=p_tenant and warehouse_id=r.warehouse_id and rule_id=r.id and id is distinct from p_id and booking_kind='FIRM' and status in ('CONFIRMED','CHECKED_IN','AT_DOCK','OPERATION_ENDED') and occupied_range && tstzrange((p_values->>'planned_start')::timestamptz,(p_values->>'planned_end')::timestamptz + coalesce(d.buffer_minutes,10)*interval '1 minute','[)');
  if n >= r.max_appointments_per_slot then raise exception 'DOCK_CAPACITY'; end if;
 end if;
 if p_id is null then
  insert into public.dock_appointments(tenant_id,warehouse_id,dock_id,trip_stop_id,order_id,expedition_id,rule_id,direction,planned_start,planned_end,requested_start,requested_end,status,booking_kind,priority,is_confirmed,metadata)
  values(p_tenant,r.warehouse_id,(p_values->>'dock_id')::uuid,(p_values->>'trip_stop_id')::uuid,(p_values->>'order_id')::uuid,(p_values->>'expedition_id')::uuid,r.id,p_values->>'direction',(p_values->>'planned_start')::timestamptz,(p_values->>'planned_end')::timestamptz,(p_values->>'requested_start')::timestamptz,(p_values->>'requested_end')::timestamptz,p_values->>'status',p_values->>'booking_kind',p_values->>'priority',p_values->>'status' in ('CONFIRMED','CHECKED_IN'),coalesce(p_values->'metadata','{}')) returning * into result;
 else
  update public.dock_appointments set warehouse_id=r.warehouse_id,dock_id=(p_values->>'dock_id')::uuid,trip_stop_id=(p_values->>'trip_stop_id')::uuid,order_id=(p_values->>'order_id')::uuid,expedition_id=(p_values->>'expedition_id')::uuid,rule_id=r.id,direction=p_values->>'direction',planned_start=(p_values->>'planned_start')::timestamptz,planned_end=(p_values->>'planned_end')::timestamptz,requested_start=(p_values->>'requested_start')::timestamptz,requested_end=(p_values->>'requested_end')::timestamptz,status=p_values->>'status',booking_kind=p_values->>'booking_kind',priority=p_values->>'priority',is_confirmed=p_values->>'status' in ('CONFIRMED','CHECKED_IN'),metadata=coalesce(p_values->'metadata','{}'),updated_at=date_trunc('milliseconds',clock_timestamp()) where tenant_id=p_tenant and id=p_id returning * into result;
 end if;
 insert into public.audit_events(tenant_id,entity_type,entity_id,action,actor_user_id,source_channel,before_data,after_data,reason)
 values(p_tenant,'DOCK_APPOINTMENT',result.id,case when p_id is null then 'CREATE' else 'UPDATE' end,p_actor,'FORNEXA_WEB',case when p_id is null then null else to_jsonb(old_row) end,to_jsonb(result),p_reason);
 return result;
end; $$;
revoke all on function public.fornexa_write_dock_appointment(uuid,uuid,uuid,timestamptz,jsonb,text) from public,anon,authenticated;
grant execute on function public.fornexa_write_dock_appointment(uuid,uuid,uuid,timestamptz,jsonb,text) to service_role;
create or replace function public.fornexa_dock_action(p_tenant uuid,p_actor uuid,p_id uuid,p_expected timestamptz,p_action text,p_reason text default null)
returns public.dock_appointments language plpgsql security invoker set search_path='' as $$
declare a public.dock_appointments; result public.dock_appointments; next_status text; event_type text; ts timestamptz:=date_trunc('milliseconds',clock_timestamp());
begin
 if not exists(select 1 from public.tenant_members where tenant_id=p_tenant and user_id=p_actor and status='ACTIVE' and role in ('OWNER','ADMIN','OPERATOR')) then raise exception 'DOCK_FORBIDDEN'; end if;
 select * into a from public.dock_appointments where tenant_id=p_tenant and id=p_id for update;
 if not found then raise exception 'DOCK_NOT_FOUND'; end if;
 if a.updated_at is distinct from p_expected then raise exception 'DOCK_STALE'; end if;
 if p_action='DOCK_GATE_IN' and a.status='CONFIRMED' then next_status:='CONFIRMED'; event_type:=p_action;
 elsif p_action='DOCK_CHECK_IN' and a.status='CONFIRMED' then next_status:='CHECKED_IN'; event_type:=p_action;
 elsif p_action='DOCK_OPERATION_START' and a.status='CHECKED_IN' and a.dock_id is not null then next_status:='AT_DOCK'; event_type:=p_action;
 elsif p_action='DOCK_OPERATION_END' and a.status='AT_DOCK' then next_status:='OPERATION_ENDED'; event_type:=p_action;
 elsif p_action='DOCK_CHECK_OUT' and a.status='OPERATION_ENDED' then next_status:='COMPLETED'; event_type:=p_action;
 elsif p_action='CANCEL' and a.status in ('DRAFT','CONFIRMED') and length(trim(p_reason))>0 then next_status:='CANCELLED';
 elsif p_action='NO_SHOW' and a.status='CONFIRMED' and ts > a.planned_end + coalesce((select (parameters->>'no_show_minutes')::integer from public.dock_policies where tenant_id=p_tenant and warehouse_id=a.warehouse_id),20)*interval '1 minute' and length(trim(p_reason))>0 and not exists(select 1 from public.transport_events where tenant_id=p_tenant and dock_appointment_id=p_id) then next_status:='NO_SHOW';
 else raise exception 'DOCK_STATE'; end if;
 if p_action='DOCK_CHECK_IN' and not exists(select 1 from public.transport_events e where e.tenant_id=p_tenant and e.dock_appointment_id=p_id and e.event_type='DOCK_GATE_IN') then
  insert into public.transport_events(tenant_id,dock_appointment_id,event_type,actor_user_id,occurred_at,payload,idempotency_key) values(p_tenant,p_id,'DOCK_GATE_IN',p_actor,ts,'{}',p_tenant::text||':'||p_id::text||':DOCK_GATE_IN');
 end if;
 if event_type is not null then
  insert into public.transport_events(tenant_id,dock_appointment_id,event_type,actor_user_id,occurred_at,payload,idempotency_key) values(p_tenant,p_id,event_type,p_actor,ts,'{}',p_tenant::text||':'||p_id::text||':'||event_type);
 end if;
 if a.trip_stop_id is not null and p_action in ('DOCK_CHECK_IN','DOCK_CHECK_OUT') then
  update public.trip_stops set status=case when p_action='DOCK_CHECK_IN' then 'ARRIVED' else 'COMPLETED' end,arrived_at=case when p_action='DOCK_CHECK_IN' then coalesce(arrived_at,ts) else arrived_at end,completed_at=case when p_action='DOCK_CHECK_OUT' then coalesce(completed_at,ts) else completed_at end,updated_at=ts where tenant_id=p_tenant and id=a.trip_stop_id;
 end if;
 update public.dock_appointments set status=next_status,cancellation_reason=case when next_status='CANCELLED' then p_reason else cancellation_reason end,metadata=case when next_status='NO_SHOW' then metadata||jsonb_build_object('no_show_reason',p_reason,'attributed_to','CARRIER') else metadata end,updated_at=ts where tenant_id=p_tenant and id=p_id returning * into result;
 insert into public.audit_events(tenant_id,entity_type,entity_id,action,actor_user_id,source_channel,before_data,after_data,reason) values(p_tenant,'DOCK_APPOINTMENT',p_id,p_action,p_actor,'FORNEXA_WEB',to_jsonb(a),to_jsonb(result),p_reason);
 return result;
end; $$;
revoke all on function public.fornexa_dock_action(uuid,uuid,uuid,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.fornexa_dock_action(uuid,uuid,uuid,timestamptz,text,text) to service_role;
create or replace function public.fornexa_dock_config(p_tenant uuid,p_actor uuid,p_kind text,p_id uuid,p_values jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare t text; allowed text[]; cols text; old_row jsonb; result jsonb; wid uuid;
begin
 if not exists(select 1 from public.tenant_members where tenant_id=p_tenant and user_id=p_actor and status='ACTIVE' and role in ('OWNER','ADMIN')) then raise exception 'DOCK_FORBIDDEN'; end if;
 if p_kind='dock' then t:='warehouse_docks'; allowed:=array['warehouse_id','zone_id','code','name','status','max_weight_t','max_vehicle_length_m','is_leveler','has_scale','has_pit','has_spill_basin','temperature_regime','cargo_profiles','default_operation_minutes','buffer_minutes','sort_order','is_active'];
 elsif p_kind='rule' then t:='dock_appointment_rules'; allowed:=array['warehouse_id','code','direction','cargo_profile','default_duration_minutes','min_duration_minutes','max_duration_minutes','max_appointments_per_slot','requires_driver_checkin','is_active'];
 elsif p_kind='policy' then t:='dock_policies'; allowed:=array['warehouse_id','parameters','notifications'];
 else raise exception 'DOCK_KIND'; end if;
 if exists(select 1 from jsonb_object_keys(p_values) k where not k=any(allowed)) then raise exception 'DOCK_FIELDS'; end if;
 wid := (p_values->>'warehouse_id')::uuid;
 perform 1 from public.warehouses where tenant_id=p_tenant and id=wid for update;
 if not found then raise exception 'DOCK_WAREHOUSE'; end if;
 if p_kind='policy' and p_id is null then select id into p_id from public.dock_policies where tenant_id=p_tenant and warehouse_id=wid; end if;
 select string_agg(format('%I',key),',' order by key) into cols from jsonb_object_keys(p_values) key;
 if p_id is null then
  execute format('insert into public.%I (tenant_id,%s) select $1,%s from jsonb_populate_record(null::public.%I,$2) returning to_jsonb(%I.*)',t,cols,cols,t,t) into result using p_tenant,p_values;
 else
  execute format('select to_jsonb(x.*) from public.%I x where tenant_id=$1 and id=$2 for update',t) into old_row using p_tenant,p_id;
  if old_row is null or (old_row->>'warehouse_id')::uuid<>wid then raise exception 'DOCK_NOT_FOUND'; end if;
  execute format('update public.%I set (%s)=(select %s from jsonb_populate_record(null::public.%I,$3)),updated_at=date_trunc(''milliseconds'',clock_timestamp()) where tenant_id=$1 and id=$2 returning to_jsonb(%I.*)',t,cols,cols,t,t) into result using p_tenant,p_id,p_values;
  if p_kind='dock' then update public.dock_appointments set buffer_minutes=(result->>'buffer_minutes')::integer where tenant_id=p_tenant and dock_id=p_id; end if;
 end if;
 insert into public.audit_events(tenant_id,entity_type,entity_id,action,actor_user_id,source_channel,before_data,after_data) values(p_tenant,'DOCK_CONFIG',(result->>'id')::uuid,upper(p_kind),p_actor,'FORNEXA_WEB',old_row,result);
 return result;
end; $$;
revoke all on function public.fornexa_dock_config(uuid,uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.fornexa_dock_config(uuid,uuid,text,uuid,jsonb) to service_role;
create or replace function public.fornexa_dock_calendar(p_tenant uuid,p_actor uuid,p_warehouse uuid,p_opening jsonb,p_holidays jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare aid uuid; before_row jsonb;
begin
 if not exists(select 1 from public.tenant_members where tenant_id=p_tenant and user_id=p_actor and status='ACTIVE' and role in ('OWNER','ADMIN')) then raise exception 'DOCK_FORBIDDEN'; end if;
 select address_id into aid from public.warehouses where tenant_id=p_tenant and id=p_warehouse for update;
 if aid is null or not exists(select 1 from public.party_addresses where tenant_id=p_tenant and id=aid) then raise exception 'DOCK_ADDRESS'; end if;
 select to_jsonb(x.*) into before_row from public.address_operational_profiles x where tenant_id=p_tenant and address_id=aid for update;
 insert into public.address_operational_profiles(tenant_id,address_id,opening_hours,holiday_exceptions,requires_appointment,has_dock) values(p_tenant,aid,p_opening,p_holidays,true,true)
 on conflict(address_id) do update set opening_hours=excluded.opening_hours,holiday_exceptions=excluded.holiday_exceptions,requires_appointment=true,has_dock=true,updated_at=date_trunc('milliseconds',clock_timestamp()) where address_operational_profiles.tenant_id=p_tenant;
 if not found then raise exception 'DOCK_ADDRESS'; end if;
 insert into public.audit_events(tenant_id,entity_type,entity_id,action,actor_user_id,source_channel,before_data,after_data) values(p_tenant,'DOCK_CONFIG',aid,'CALENDAR',p_actor,'FORNEXA_WEB',before_row,jsonb_build_object('opening_hours',p_opening,'holiday_exceptions',p_holidays));
end; $$;
revoke all on function public.fornexa_dock_calendar(uuid,uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.fornexa_dock_calendar(uuid,uuid,uuid,jsonb,jsonb) to service_role;
commit;
