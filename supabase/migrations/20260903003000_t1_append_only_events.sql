begin;

-- T1: event history is append-only. Application writes are server-side only.
-- Current producers use createSupabaseAdmin(), so service_role retains SELECT/INSERT
-- while browser roles cannot mutate or append directly.

alter table public.transport_events enable row level security;
alter table public.operational_events enable row level security;

drop policy if exists tenant_isolation on public.transport_events;
drop policy if exists tenant_isolation on public.operational_events;

drop policy if exists transport_events_tenant_select on public.transport_events;
create policy transport_events_tenant_select
on public.transport_events
for select
to authenticated
using (public.fornexa_has_tenant_access(tenant_id));

drop policy if exists operational_events_tenant_select on public.operational_events;
create policy operational_events_tenant_select
on public.operational_events
for select
to authenticated
using (public.fornexa_has_tenant_access(tenant_id));

-- Remove the legacy broad default grants first, then grant only the capabilities
-- required by the verified server-side producers and authenticated readers.
revoke all privileges on table public.transport_events from anon, authenticated, service_role;
revoke all privileges on table public.operational_events from anon, authenticated, service_role;

grant select on table public.transport_events to authenticated;
grant select on table public.operational_events to authenticated;
grant select, insert on table public.transport_events to service_role;
grant select, insert on table public.operational_events to service_role;

-- Defense in depth: even if UPDATE/DELETE are accidentally re-granted later,
-- event rows remain immutable. TRUNCATE is blocked by the privilege matrix above.
create or replace function public.fornexa_reject_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'FORNEXA event history is append-only; use a compensating event instead'
    using errcode = '55000';
end;
$$;

revoke all on function public.fornexa_reject_event_mutation() from public, anon, authenticated, service_role;

drop trigger if exists transport_events_reject_mutation on public.transport_events;
create trigger transport_events_reject_mutation
before update or delete on public.transport_events
for each row execute function public.fornexa_reject_event_mutation();

drop trigger if exists operational_events_reject_mutation on public.operational_events;
create trigger operational_events_reject_mutation
before update or delete on public.operational_events
for each row execute function public.fornexa_reject_event_mutation();

comment on table public.transport_events is 'Histórico append-only de emisión, llegada, POD, firma e incidencias.';
comment on table public.operational_events is 'Histórico append-only de eventos operativos de FORNEXA.';

commit;
