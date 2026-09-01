create schema if not exists platform_telemetry;

revoke all on schema platform_telemetry from public, anon, authenticated;
grant usage on schema platform_telemetry to service_role;

create table if not exists platform_telemetry.telemetry_requests (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  request_id text,
  session_id uuid,
  ip inet,
  ip_hash text,
  host text,
  method text not null,
  path text not null,
  user_agent text,
  referrer text,
  accept_language text,
  country text,
  region text,
  city text
);

create table if not exists platform_telemetry.telemetry_auth_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  event_type text not null check (event_type in ('LOGIN_ATTEMPT','LOGIN_SUCCESS','LOGIN_FAILURE','RECOVERY_REQUEST','FIRST_ACCESS_REQUEST')),
  session_id uuid,
  user_id uuid,
  email_hash text,
  ip inet,
  ip_hash text,
  path text not null default '/login',
  failure_code text
);

create table if not exists platform_telemetry.telemetry_page_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  session_id uuid not null,
  user_id uuid,
  path text not null,
  referrer_path text,
  visibility_state text,
  dwell_ms integer check (dwell_ms is null or dwell_ms >= 0)
);

create table if not exists platform_telemetry.maintenance_state (
  singleton boolean primary key default true check (singleton),
  last_run_at timestamptz not null default to_timestamp(0)
);
insert into platform_telemetry.maintenance_state(singleton) values (true) on conflict (singleton) do nothing;

create index if not exists telemetry_requests_occurred_at_idx on platform_telemetry.telemetry_requests (occurred_at desc);
create index if not exists telemetry_requests_session_idx on platform_telemetry.telemetry_requests (session_id, occurred_at desc);
create index if not exists telemetry_requests_ip_hash_idx on platform_telemetry.telemetry_requests (ip_hash, occurred_at desc);
create index if not exists telemetry_auth_events_occurred_at_idx on platform_telemetry.telemetry_auth_events (occurred_at desc);
create index if not exists telemetry_auth_events_session_idx on platform_telemetry.telemetry_auth_events (session_id, occurred_at desc);
create index if not exists telemetry_page_events_session_idx on platform_telemetry.telemetry_page_events (session_id, occurred_at asc);

alter table platform_telemetry.telemetry_requests enable row level security;
alter table platform_telemetry.telemetry_auth_events enable row level security;
alter table platform_telemetry.telemetry_page_events enable row level security;
alter table platform_telemetry.maintenance_state enable row level security;

revoke all on all tables in schema platform_telemetry from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema platform_telemetry to service_role;

create or replace function platform_telemetry.run_retention_if_due()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed boolean := false;
begin
  update platform_telemetry.maintenance_state
     set last_run_at = now()
   where singleton = true
     and last_run_at < now() - interval '1 hour'
  returning true into claimed;

  if coalesce(claimed, false) then
    update platform_telemetry.telemetry_requests
       set ip = null
     where ip is not null
       and occurred_at < now() - interval '7 days';
    update platform_telemetry.telemetry_auth_events
       set ip = null
     where ip is not null
       and occurred_at < now() - interval '7 days';
    delete from platform_telemetry.telemetry_requests where occurred_at < now() - interval '90 days';
    delete from platform_telemetry.telemetry_auth_events where occurred_at < now() - interval '90 days';
    delete from platform_telemetry.telemetry_page_events where occurred_at < now() - interval '90 days';
  end if;
end;
$$;

revoke all on function platform_telemetry.run_retention_if_due() from public, anon, authenticated;
grant execute on function platform_telemetry.run_retention_if_due() to service_role;

create or replace function public.fornexa_capture_request_telemetry(p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into platform_telemetry.telemetry_requests(
    occurred_at, request_id, session_id, ip, ip_hash, host, method, path,
    user_agent, referrer, accept_language, country, region, city
  ) values (
    coalesce(nullif(p_payload->>'occurred_at','')::timestamptz, now()),
    left(p_payload->>'request_id', 200),
    nullif(p_payload->>'session_id','')::uuid,
    nullif(p_payload->>'ip','')::inet,
    left(p_payload->>'ip_hash', 128),
    left(p_payload->>'host', 255),
    left(coalesce(p_payload->>'method','GET'), 12),
    left(coalesce(p_payload->>'path','/'), 512),
    left(p_payload->>'user_agent', 1024),
    left(p_payload->>'referrer', 1024),
    left(p_payload->>'accept_language', 255),
    left(p_payload->>'country', 8),
    left(p_payload->>'region', 64),
    left(p_payload->>'city', 128)
  );
  perform platform_telemetry.run_retention_if_due();
end;
$$;

create or replace function public.fornexa_capture_auth_telemetry(p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into platform_telemetry.telemetry_auth_events(
    occurred_at, event_type, session_id, user_id, email_hash, ip, ip_hash, path, failure_code
  ) values (
    coalesce(nullif(p_payload->>'occurred_at','')::timestamptz, now()),
    p_payload->>'event_type',
    nullif(p_payload->>'session_id','')::uuid,
    nullif(p_payload->>'user_id','')::uuid,
    left(p_payload->>'email_hash', 128),
    nullif(p_payload->>'ip','')::inet,
    left(p_payload->>'ip_hash', 128),
    left(coalesce(p_payload->>'path','/login'), 512),
    left(p_payload->>'failure_code', 128)
  );
  perform platform_telemetry.run_retention_if_due();
end;
$$;

create or replace function public.fornexa_capture_page_telemetry(p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into platform_telemetry.telemetry_page_events(
    occurred_at, session_id, user_id, path, referrer_path, visibility_state, dwell_ms
  ) values (
    coalesce(nullif(p_payload->>'occurred_at','')::timestamptz, now()),
    (p_payload->>'session_id')::uuid,
    nullif(p_payload->>'user_id','')::uuid,
    left(coalesce(p_payload->>'path','/'), 512),
    left(p_payload->>'referrer_path', 512),
    left(p_payload->>'visibility_state', 32),
    nullif(p_payload->>'dwell_ms','')::integer
  );
  perform platform_telemetry.run_retention_if_due();
end;
$$;

create or replace function public.fornexa_read_telemetry(p_limit integer default 200)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'requests', coalesce((select jsonb_agg(to_jsonb(r) order by r.occurred_at desc) from (select * from platform_telemetry.telemetry_requests order by occurred_at desc limit least(greatest(p_limit,1),500)) r), '[]'::jsonb),
    'auth_events', coalesce((select jsonb_agg(to_jsonb(a) order by a.occurred_at desc) from (select * from platform_telemetry.telemetry_auth_events order by occurred_at desc limit least(greatest(p_limit,1),500)) a), '[]'::jsonb),
    'page_events', coalesce((select jsonb_agg(to_jsonb(p) order by p.occurred_at desc) from (select * from platform_telemetry.telemetry_page_events order by occurred_at desc limit least(greatest(p_limit * 3,1),1500)) p), '[]'::jsonb)
  );
$$;

revoke all on function public.fornexa_capture_request_telemetry(jsonb) from public, anon, authenticated;
revoke all on function public.fornexa_capture_auth_telemetry(jsonb) from public, anon, authenticated;
revoke all on function public.fornexa_capture_page_telemetry(jsonb) from public, anon, authenticated;
revoke all on function public.fornexa_read_telemetry(integer) from public, anon, authenticated;
grant execute on function public.fornexa_capture_request_telemetry(jsonb) to service_role;
grant execute on function public.fornexa_capture_auth_telemetry(jsonb) to service_role;
grant execute on function public.fornexa_capture_page_telemetry(jsonb) to service_role;
grant execute on function public.fornexa_read_telemetry(integer) to service_role;
