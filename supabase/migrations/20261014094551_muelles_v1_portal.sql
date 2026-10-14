-- Source only. No application before DATA150 integration/load gate.
begin;
create unique index if not exists parties_tenant_id_id_key on public.parties(tenant_id,id);
create table public.dock_portal_access (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 carrier_party_id uuid not null, warehouse_id uuid not null, token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz not null, revoked_at timestamptz, created_by uuid not null, created_at timestamptz not null default now(),
 check(expires_at > created_at), unique(tenant_id,id),
 foreign key(tenant_id,carrier_party_id) references public.parties(tenant_id,id),
 foreign key(tenant_id,warehouse_id) references public.warehouses(tenant_id,id),
 foreign key(tenant_id,created_by) references public.tenant_members(tenant_id,user_id)
);
alter table public.dock_portal_access enable row level security;
create policy tenant_isolation on public.dock_portal_access for all to authenticated using(public.fornexa_has_tenant_access(tenant_id)) with check(public.fornexa_has_tenant_access(tenant_id));
revoke all on public.dock_portal_access from public,anon,authenticated;
grant select,insert,update,delete on public.dock_portal_access to service_role;
alter table public.dock_appointments add column portal_access_id uuid;
alter table public.dock_appointments add column portal_idempotency_key text;
alter table public.dock_appointments add column portal_request_hash text;
alter table public.dock_appointments add column portal_response jsonb;
alter table public.dock_appointments add constraint dock_portal_access_fk foreign key(tenant_id,portal_access_id) references public.dock_portal_access(tenant_id,id);
create unique index dock_portal_idempotency on public.dock_appointments(tenant_id,portal_access_id,portal_idempotency_key) where portal_access_id is not null;
-- Reuse the existing private authentication telemetry; no duplicate/global business tenant.
alter table platform_telemetry.telemetry_auth_events drop constraint telemetry_auth_events_event_type_check;
alter table platform_telemetry.telemetry_auth_events add constraint telemetry_auth_events_event_type_check check(event_type in ('LOGIN_ATTEMPT','LOGIN_SUCCESS','LOGIN_FAILURE','RECOVERY_REQUEST','FIRST_ACCESS_REQUEST','DOCK_PORTAL_ATTEMPT','DOCK_PORTAL_FAILURE'));
create index dock_portal_rate_ip on platform_telemetry.telemetry_auth_events(ip_hash,occurred_at) where event_type in ('DOCK_PORTAL_ATTEMPT','DOCK_PORTAL_FAILURE');
create index dock_portal_rate_token on platform_telemetry.telemetry_auth_events(session_id,occurred_at) where event_type in ('DOCK_PORTAL_ATTEMPT','DOCK_PORTAL_FAILURE');
-- The public best-effort capture RPC may not forge events used by the enforcement gate.
create or replace function public.fornexa_capture_auth_telemetry(p_payload jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_payload->>'event_type' not in ('LOGIN_ATTEMPT','LOGIN_SUCCESS','LOGIN_FAILURE','RECOVERY_REQUEST','FIRST_ACCESS_REQUEST') then raise exception 'Unsupported auth event'; end if;
 insert into platform_telemetry.telemetry_auth_events(occurred_at,event_type,session_id,user_id,email_hash,ip,ip_hash,path,failure_code)
 values(coalesce(nullif(p_payload->>'occurred_at','')::timestamptz,now()),p_payload->>'event_type',nullif(p_payload->>'session_id','')::uuid,nullif(p_payload->>'user_id','')::uuid,left(p_payload->>'email_hash',128),nullif(p_payload->>'ip','')::inet,left(p_payload->>'ip_hash',128),left(coalesce(p_payload->>'path','/login'),512),left(p_payload->>'failure_code',128));
 perform platform_telemetry.run_retention_if_due();
end; $$;
create or replace function public.fornexa_dock_portal_rate(p_token_hash text,p_ip_hash text,p_phase text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare sid uuid; a text; b text; denied boolean; ts timestamptz:=clock_timestamp();
begin
 if p_token_hash !~ '^[a-f0-9]{64}$' or p_ip_hash !~ '^[a-f0-9]{64}$' or p_phase not in ('REQUEST','FAILURE') then raise exception 'PORTAL_IDENTITY'; end if;
 sid := substr(p_token_hash,1,32)::uuid;
 a:=least('token:'||p_token_hash,'ip:'||p_ip_hash); b:=greatest('token:'||p_token_hash,'ip:'||p_ip_hash);
 perform pg_advisory_xact_lock(hashtextextended('dock-portal-rate:'||a,0));
 perform pg_advisory_xact_lock(hashtextextended('dock-portal-rate:'||b,0));
 if p_phase='FAILURE' then
  insert into platform_telemetry.telemetry_auth_events(occurred_at,event_type,session_id,ip_hash,ip,path) values(ts,'DOCK_PORTAL_FAILURE',sid,p_ip_hash,null,'/muelles/p/[token]'); return false;
 end if;
 select (count(*) filter(where event_type='DOCK_PORTAL_ATTEMPT' and occurred_at > ts-interval '1 minute' and session_id=sid)>=20
      or count(*) filter(where event_type='DOCK_PORTAL_ATTEMPT' and occurred_at > ts-interval '1 minute' and ip_hash=p_ip_hash)>=60
      or count(*) filter(where event_type='DOCK_PORTAL_FAILURE' and session_id=sid)>=5
      or count(*) filter(where event_type='DOCK_PORTAL_FAILURE' and ip_hash=p_ip_hash)>=5)
 into denied from platform_telemetry.telemetry_auth_events where occurred_at > ts-interval '15 minutes' and event_type in ('DOCK_PORTAL_ATTEMPT','DOCK_PORTAL_FAILURE') and (session_id=sid or ip_hash=p_ip_hash);
 if denied then return false; end if;
 insert into platform_telemetry.telemetry_auth_events(occurred_at,event_type,session_id,ip_hash,ip,path) values(ts,'DOCK_PORTAL_ATTEMPT',sid,p_ip_hash,null,'/muelles/p/[token]');
 perform platform_telemetry.run_retention_if_due(); return true;
end; $$;
revoke all on function public.fornexa_dock_portal_rate(text,text,text) from public,anon,authenticated;
grant execute on function public.fornexa_dock_portal_rate(text,text,text) to service_role;
create or replace function public.fornexa_manage_dock_portal_access(p_tenant uuid,p_actor uuid,p_carrier uuid,p_warehouse uuid,p_hash text,p_expires timestamptz,p_revoke uuid default null)
returns uuid language plpgsql security invoker set search_path='' as $$
declare aid uuid; before_row jsonb;
begin
 if not exists(select 1 from public.tenant_members where tenant_id=p_tenant and user_id=p_actor and role in ('OWNER','ADMIN') and status='ACTIVE') then raise exception 'PORTAL_FORBIDDEN'; end if;
 if p_revoke is not null then
  select to_jsonb(x.*) into before_row from public.dock_portal_access x where tenant_id=p_tenant and id=p_revoke for update;
  if before_row is null then raise exception 'PORTAL_ACCESS'; end if;
  update public.dock_portal_access set revoked_at=clock_timestamp() where tenant_id=p_tenant and id=p_revoke returning id into aid;
 else
  if p_expires <= now() or p_expires > now()+interval '30 days' or not exists(select 1 from public.carrier_profiles where tenant_id=p_tenant and party_id=p_carrier and qualification_status='APPROVED') then raise exception 'PORTAL_ACCESS'; end if;
  insert into public.dock_portal_access(tenant_id,carrier_party_id,warehouse_id,token_hash,expires_at,created_by) values(p_tenant,p_carrier,p_warehouse,p_hash,p_expires,p_actor) returning id into aid;
 end if;
 insert into public.audit_events(tenant_id,entity_type,entity_id,action,actor_user_id,source_channel,before_data,after_data) values(p_tenant,'DOCK_PORTAL_ACCESS',aid,case when p_revoke is null then 'CREATE' else 'REVOKE' end,p_actor,'FORNEXA_WEB',case when before_row is null then null else before_row-'token_hash' end,jsonb_build_object('expires_at',p_expires,'revoked',p_revoke is not null));
 return aid;
end; $$;
revoke all on function public.fornexa_manage_dock_portal_access(uuid,uuid,uuid,uuid,text,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.fornexa_manage_dock_portal_access(uuid,uuid,uuid,uuid,text,timestamptz,uuid) to service_role;
create or replace function public.fornexa_dock_calendar_allows(p_tenant uuid,p_warehouse uuid,p_start timestamptz,p_end timestamptz)
returns boolean language plpgsql security invoker set search_path='' as $$
declare h jsonb; holidays jsonb; ranges jsonb; holiday_row jsonb; local_start timestamp; local_end timestamp; day_key text;
begin
 select o.opening_hours,o.holiday_exceptions into h,holidays from public.warehouses w join public.address_operational_profiles o on o.tenant_id=w.tenant_id and o.address_id=w.address_id where w.tenant_id=p_tenant and w.id=p_warehouse and o.requires_appointment for share of o;
 if h is null or jsonb_typeof(h->'days')<>'object' or not (h->'days' ?& array['mon','tue','wed','thu','fri','sat','sun']) or (select count(*) from jsonb_object_keys(h->'days'))<>7 or not exists(select 1 from pg_timezone_names where name=h->>'timezone') then raise exception 'PORTAL_CALENDAR'; end if;
 local_start:=p_start at time zone (h->>'timezone'); local_end:=p_end at time zone (h->>'timezone');
 if local_start::date<>local_end::date then return false; end if;
 day_key := (array['mon','tue','wed','thu','fri','sat','sun'])[extract(isodow from local_start)::integer];
 select value into holiday_row from jsonb_array_elements(holidays) where value->>'date'=local_start::date::text;
 if holiday_row->>'closed'='true' then return false; end if;
 ranges:=coalesce(holiday_row->'ranges',h->'days'->day_key);
 return exists(select 1 from jsonb_array_elements(ranges) r where r->>'from' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and r->>'to' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and (r->>'from')::time <= local_start::time and (r->>'to')::time >= local_end::time and (r->>'from')::time < (r->>'to')::time);
end; $$;
revoke all on function public.fornexa_dock_calendar_allows(uuid,uuid,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.fornexa_dock_calendar_allows(uuid,uuid,timestamptz,timestamptz) to service_role;
create or replace function public.fornexa_reserve_dock_portal(p_access uuid,p_token_hash text,p_values jsonb,p_request_hash text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare access public.dock_portal_access; existing public.dock_appointments; result public.dock_appointments; r public.dock_appointment_rules; d public.warehouse_docks;
 policy jsonb; begin_at timestamptz; end_at timestamptz; stop_id uuid; order_id uuid; expedition_id uuid; n integer; warned boolean; registration text; vehicle_capacity numeric; is_adr boolean; vehicle_adr boolean; vehicle_length numeric; resolved_driver uuid;
begin
 select * into access from public.dock_portal_access where id=p_access and token_hash=p_token_hash and revoked_at is null and expires_at>clock_timestamp() for share;
 if not found then raise exception 'PORTAL_ACCESS'; end if;
 if not exists(select 1 from public.tenant_members where tenant_id=access.tenant_id and user_id=access.created_by and status='ACTIVE' and role in ('OWNER','ADMIN')) then raise exception 'PORTAL_ACCESS'; end if;
 perform 1 from public.warehouses where tenant_id=access.tenant_id and id=access.warehouse_id and status='ACTIVE' for update;
 if not found then raise exception 'PORTAL_ACCESS'; end if;
 -- Idempotency is checked under the same warehouse lock as capacity. No duplicate audit.
 select * into existing from public.dock_appointments where tenant_id=access.tenant_id and portal_access_id=access.id and portal_idempotency_key=p_values->>'idempotency_key';
 if found then
  if existing.portal_request_hash is distinct from p_request_hash then raise exception 'PORTAL_IDEMPOTENCY'; end if;
  return existing.portal_response;
 end if;
 if exists(select 1 from public.customer_blocks where tenant_id=access.tenant_id and party_id=access.carrier_party_id and released_at is null and behavior='HARD') or not exists(select 1 from public.carrier_profiles where tenant_id=access.tenant_id and party_id=access.carrier_party_id and qualification_status='APPROVED' and (insurance_expiry_date is null or insurance_expiry_date>=current_date)) then raise exception 'PORTAL_SUSPENDED'; end if;
 select exists(select 1 from public.customer_blocks where tenant_id=access.tenant_id and party_id=access.carrier_party_id and released_at is null and behavior='WARNING') into warned;
 select parameters into policy from public.dock_policies where tenant_id=access.tenant_id and warehouse_id=access.warehouse_id;
 if policy is null then raise exception 'PORTAL_POLICY'; end if;
 select count(*) into n from public.dock_appointments a join public.trip_stops s on s.tenant_id=a.tenant_id and s.id=a.trip_stop_id join public.trips t on t.tenant_id=s.tenant_id and t.id=s.trip_id where a.tenant_id=access.tenant_id and a.warehouse_id=access.warehouse_id and t.carrier_id=access.carrier_party_id and a.status='NO_SHOW' and a.planned_start>now()-interval '30 days' and a.metadata->>'attributed_to'='CARRIER';
 if n >= (policy->>'no_show_limit')::integer then raise exception 'PORTAL_SUSPENDED'; end if;
 if not (p_values->>'plate' ~ '^[A-Z0-9-]{4,12}$') or not (p_values->>'reference' ~ '^[A-Za-z0-9._/-]{1,40}$') or (p_values->>'packages')::integer not between 1 and 60 or (p_values->>'weight_kg')::numeric not between 1 and 44000 or length(p_values->>'notes')>500 or p_values->>'notes' ~ '[[:cntrl:]]' or not (p_values->>'idempotency_key' ~ '^[A-Za-z0-9_-]{16,128}$') then raise exception 'PORTAL_INPUT'; end if;
 select * into r from public.dock_appointment_rules where tenant_id=access.tenant_id and warehouse_id=access.warehouse_id and code=p_values->>'rule_code' and is_active and (direction='BOTH' or direction=p_values->>'direction');
 if not found then raise exception 'PORTAL_RULE'; end if;
 begin_at:=(p_values->>'start')::timestamptz; end_at:=begin_at+r.default_duration_minutes*interval '1 minute';
 if not isfinite(begin_at) or begin_at<clock_timestamp()+(policy->>'min_lead_minutes')::integer*interval '1 minute' or begin_at>clock_timestamp()+(policy->>'horizon_days')::integer*interval '1 day' or extract(second from begin_at)<>0 or extract(minute from begin_at)::integer%30<>0 then raise exception 'PORTAL_WINDOW'; end if;
 if not public.fornexa_dock_calendar_allows(access.tenant_id,access.warehouse_id,begin_at,end_at) then raise exception 'PORTAL_CALENDAR'; end if;
 -- Only a preassigned carrier journey can be booked. Plates are never copied into appointments.
 select count(*) into n from public.trip_stops s join public.trips t on t.tenant_id=s.tenant_id and t.id=s.trip_id join public.vehicles v on v.tenant_id=t.tenant_id and v.id=t.vehicle_id join public.trip_expeditions te on te.tenant_id=t.tenant_id and te.trip_id=t.id join public.expeditions e on e.tenant_id=te.tenant_id and e.id=te.expedition_id join public.orders o on o.tenant_id=e.tenant_id and o.id=e.order_id join public.warehouses w on w.tenant_id=s.tenant_id and w.address_id=s.address_id
 where s.tenant_id=access.tenant_id and w.id=access.warehouse_id and t.carrier_id=access.carrier_party_id and upper(v.registration)=p_values->>'plate' and s.status='PENDING' and t.status not in ('COMPLETED','CANCELLED') and ((p_values->>'direction'='INBOUND' and s.stop_type='DELIVERY') or (p_values->>'direction'='OUTBOUND' and s.stop_type='PICKUP')) and (e.code=p_values->>'reference' or o.code=p_values->>'reference' or o.customer_reference=p_values->>'reference');
 if n<>1 then raise exception 'PORTAL_REFERENCE'; end if;
 select s.id,o.id,e.id,v.registration,v.capacity_weight,v.adr_enabled,case when v.metadata->>'length_m' ~ '^[0-9]+(\.[0-9]+)?$' then (v.metadata->>'length_m')::numeric end,t.driver_id,coalesce(o.adr<>'{}'::jsonb,false) into stop_id,order_id,expedition_id,registration,vehicle_capacity,vehicle_adr,vehicle_length,resolved_driver,is_adr from public.trip_stops s join public.trips t on t.tenant_id=s.tenant_id and t.id=s.trip_id join public.vehicles v on v.tenant_id=t.tenant_id and v.id=t.vehicle_id join public.trip_expeditions te on te.tenant_id=t.tenant_id and te.trip_id=t.id join public.expeditions e on e.tenant_id=te.tenant_id and e.id=te.expedition_id join public.orders o on o.tenant_id=e.tenant_id and o.id=e.order_id join public.warehouses w on w.tenant_id=s.tenant_id and w.address_id=s.address_id
 where s.tenant_id=access.tenant_id and w.id=access.warehouse_id and t.carrier_id=access.carrier_party_id and upper(v.registration)=p_values->>'plate' and s.status='PENDING' and t.status not in ('COMPLETED','CANCELLED') and ((p_values->>'direction'='INBOUND' and s.stop_type='DELIVERY') or (p_values->>'direction'='OUTBOUND' and s.stop_type='PICKUP')) and (e.code=p_values->>'reference' or o.code=p_values->>'reference' or o.customer_reference=p_values->>'reference') for share of s,t,v,o,e;
 if vehicle_capacity is null or (p_values->>'weight_kg')::numeric>vehicle_capacity or (is_adr and r.cargo_profile<>'HAZMAT_ADR') then raise exception 'PORTAL_COMPATIBILITY'; end if;
 if r.cargo_profile in ('HAZMAT_ADR','LIQUID_TANKER') and not exists(select 1 from public.warehouses w join public.address_operational_profiles p on p.tenant_id=w.tenant_id and p.address_id=w.address_id where w.tenant_id=access.tenant_id and w.id=access.warehouse_id and p.adr_capable) then raise exception 'PORTAL_COMPATIBILITY'; end if;
 if r.cargo_profile='HAZMAT_ADR' and (not coalesce(vehicle_adr,false) or not exists(select 1 from public.drivers where tenant_id=access.tenant_id and id=resolved_driver and adr_qualified) or not exists(select 1 from public.carrier_profiles where tenant_id=access.tenant_id and party_id=access.carrier_party_id and adr_certified)) then raise exception 'PORTAL_COMPATIBILITY'; end if;
 if exists(select 1 from public.dock_appointments where tenant_id=access.tenant_id and trip_stop_id=stop_id and booking_kind='FIRM' and status in ('CONFIRMED','CHECKED_IN','AT_DOCK','OPERATION_ENDED')) then raise exception 'PORTAL_ALREADY_BOOKED'; end if;
 select dock.* into d from public.warehouse_docks dock where dock.tenant_id=access.tenant_id and dock.warehouse_id=access.warehouse_id and dock.status='ACTIVE' and dock.is_active and r.cargo_profile=any(dock.cargo_profiles) and (dock.max_weight_t is null or dock.max_weight_t*1000 >= greatest(vehicle_capacity,(p_values->>'weight_kg')::numeric)) and (dock.max_vehicle_length_m is null or (vehicle_length is not null and vehicle_length>0 and vehicle_length<=dock.max_vehicle_length_m)) and (r.cargo_profile<>'CHILLED' or dock.temperature_regime in ('CHILLED','CONTROLLED')) and (r.cargo_profile<>'FROZEN' or dock.temperature_regime='FROZEN') and (r.cargo_profile not in ('HAZMAT_ADR','LIQUID_TANKER') or dock.has_spill_basin) and not exists(select 1 from public.dock_appointments a where a.tenant_id=access.tenant_id and a.dock_id=dock.id and a.booking_kind='FIRM' and a.status in ('CONFIRMED','CHECKED_IN','AT_DOCK','OPERATION_ENDED') and a.occupied_range && tstzrange(begin_at,end_at+dock.buffer_minutes*interval '1 minute','[)')) order by dock.sort_order,dock.code limit 1;
 if not found then raise exception 'PORTAL_CAPACITY'; end if;
 select count(*) into n from public.dock_appointments where tenant_id=access.tenant_id and warehouse_id=access.warehouse_id and rule_id=r.id and booking_kind='FIRM' and status in ('CONFIRMED','CHECKED_IN','AT_DOCK','OPERATION_ENDED') and occupied_range && tstzrange(begin_at,end_at+d.buffer_minutes*interval '1 minute','[)');
 if n>=r.max_appointments_per_slot then raise exception 'PORTAL_CAPACITY'; end if;
 insert into public.dock_appointments(tenant_id,warehouse_id,dock_id,trip_stop_id,order_id,expedition_id,rule_id,direction,planned_start,planned_end,requested_start,requested_end,status,booking_kind,booked_via,is_confirmed,portal_access_id,portal_idempotency_key,portal_request_hash,metadata)
 values(access.tenant_id,access.warehouse_id,d.id,stop_id,order_id,expedition_id,r.id,p_values->>'direction',begin_at,end_at,begin_at,end_at,'CONFIRMED','FIRM','PORTAL',true,access.id,p_values->>'idempotency_key',p_request_hash,jsonb_build_object('notes',p_values->>'notes')) returning * into result;
 insert into public.audit_events(tenant_id,entity_type,entity_id,action,actor_user_id,source_channel,after_data) values(access.tenant_id,'DOCK_APPOINTMENT',result.id,'CREATE',null,'PORTAL',jsonb_build_object('appointment',to_jsonb(result),'declared_packages',p_values->'packages','declared_weight_kg',p_values->'weight_kg','reference',p_values->>'reference','warnings',warned,'authorized_by',access.created_by));
 update public.dock_appointments set portal_response=jsonb_build_object('code',result.code,'start',result.planned_start,'end',result.planned_end,'status',result.status,'warning',warned) where tenant_id=access.tenant_id and id=result.id returning portal_response into p_values;
 return p_values;
end; $$;
revoke all on function public.fornexa_reserve_dock_portal(uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.fornexa_reserve_dock_portal(uuid,text,jsonb,text) to service_role;
commit;
