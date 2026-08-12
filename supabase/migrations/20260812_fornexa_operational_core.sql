begin;

create extension if not exists pgcrypto;

create table if not exists public.fornexa_schema_migrations (
  version text primary key,
  description text not null,
  applied_at timestamptz not null default now()
);

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  status text not null default 'PILOT' check (status in ('PILOT','ACTIVE','SUSPENDED','CLOSED')),
  default_currency char(3) not null default 'EUR',
  default_language text not null default 'es',
  timezone text not null default 'Europe/Madrid',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.tenants (id, code, name, status)
values ('00000000-0000-4000-8000-000000000001', 'FORNEXA-PILOT', 'FORNEXA Pilot', 'PILOT')
on conflict (id) do update set name = excluded.name;

create table if not exists public.tenant_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'OPERATOR' check (role in ('OWNER','ADMIN','PLANNER','OPERATOR','DRIVER','VIEWER')),
  status text not null default 'ACTIVE' check (status in ('INVITED','ACTIVE','SUSPENDED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

insert into public.tenant_members (tenant_id, user_id, role, status)
select '00000000-0000-4000-8000-000000000001', id, 'OWNER', 'ACTIVE'
from auth.users
on conflict (tenant_id, user_id) do nothing;

create sequence if not exists public.party_code_seq start with 1;
create sequence if not exists public.order_code_seq start with 1;
create sequence if not exists public.delivery_note_code_seq start with 1;
create sequence if not exists public.expedition_code_seq start with 1;
create sequence if not exists public.trip_code_seq start with 1;
create sequence if not exists public.offer_code_seq start with 1;

create or replace function public.fornexa_next_code(prefix text, sequence_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare next_value bigint;
begin
  execute format('select nextval(%L::regclass)', sequence_name) into next_value;
  return prefix || '-' || to_char(timezone('utc', now()), 'YY') || lpad(next_value::text, 6, '0');
end;
$$;

revoke all on function public.fornexa_next_code(text, text) from public, anon, authenticated;
grant execute on function public.fornexa_next_code(text, text) to service_role;

create table if not exists public.parties (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.tenants(id) on delete restrict,
  code text not null default public.fornexa_next_code('TER', 'public.party_code_seq'),
  legal_name text not null,
  trade_name text,
  tax_id text,
  country_code char(2) not null default 'ES',
  language text not null default 'es',
  currency char(3) not null default 'EUR',
  is_customer boolean not null default false,
  is_supplier boolean not null default false,
  is_carrier boolean not null default false,
  is_shipper boolean not null default false,
  is_consignee boolean not null default false,
  adr_control boolean not null default false,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE','BLOCKED')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code),
  unique nulls not distinct (tenant_id, country_code, tax_id)
);

create table if not exists public.party_addresses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.tenants(id) on delete restrict,
  party_id uuid not null references public.parties(id) on delete cascade,
  code text,
  address_type text not null default 'OPERATING' check (address_type in ('FISCAL','OPERATING','PICKUP','DELIVERY','WAREHOUSE','OTHER')),
  name text,
  address_line1 text not null,
  address_line2 text,
  postal_code text,
  city text not null,
  region text,
  country_code char(2) not null default 'ES',
  latitude numeric(10,7) check (latitude between -90 and 90),
  longitude numeric(10,7) check (longitude between -180 and 180),
  contact_name text,
  contact_phone text,
  contact_email text,
  default_window_start time,
  default_window_end time,
  instructions text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (tenant_id, party_id, code)
);

create table if not exists public.party_contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.tenants(id) on delete restrict,
  party_id uuid not null references public.parties(id) on delete cascade,
  name text not null,
  role text,
  phone text,
  email text,
  is_primary boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.service_catalog (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.tenants(id) on delete restrict,
  code text not null,
  name text not null,
  description text,
  mode text not null default 'ROAD',
  service_type text not null,
  unit text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table if not exists public.party_services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.tenants(id) on delete restrict,
  party_id uuid not null references public.parties(id) on delete cascade,
  service_id uuid not null references public.service_catalog(id) on delete restrict,
  relationship_type text not null check (relationship_type in ('CONTRACTED','OFFERED')),
  reference text,
  price numeric(16,4),
  currency char(3) not null default 'EUR',
  valid_from date,
  valid_to date,
  conditions jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (party_id, service_id, relationship_type)
);

create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.tenants(id) on delete restrict,
  code text not null,
  name text not null,
  owner_party_id uuid references public.parties(id) on delete set null,
  address_id uuid references public.party_addresses(id) on delete set null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  capabilities jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.tenants(id) on delete restrict,
  owner_party_id uuid references public.parties(id) on delete set null,
  registration text not null,
  vehicle_type text,
  capacity_weight numeric(14,3),
  capacity_volume numeric(14,3),
  adr_enabled boolean not null default false,
  status text not null default 'AVAILABLE' check (status in ('AVAILABLE','ASSIGNED','MAINTENANCE','INACTIVE')),
  telematics_provider text,
  telematics_external_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, registration)
);

create table if not exists public.drivers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.tenants(id) on delete restrict,
  supplier_party_id uuid references public.parties(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  code text not null,
  name text not null,
  phone text,
  email text,
  licence_number text,
  adr_qualified boolean not null default false,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE','UNAVAILABLE')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.tenants(id) on delete restrict,
  code text not null default public.fornexa_next_code('PT', 'public.order_code_seq'),
  customer_id uuid not null references public.parties(id) on delete restrict,
  customer_reference text,
  service_id uuid references public.service_catalog(id) on delete set null,
  pickup_address_id uuid references public.party_addresses(id) on delete restrict,
  delivery_address_id uuid references public.party_addresses(id) on delete restrict,
  requested_pickup_start timestamptz,
  requested_pickup_end timestamptz,
  requested_delivery_start timestamptz,
  requested_delivery_end timestamptz,
  packages integer check (packages is null or packages >= 0),
  gross_weight numeric(14,3) check (gross_weight is null or gross_weight >= 0),
  volume numeric(14,3) check (volume is null or volume >= 0),
  linear_meters numeric(14,3) check (linear_meters is null or linear_meters >= 0),
  goods_description text,
  adr jsonb not null default '{}'::jsonb,
  status text not null default 'DRAFT' check (status in ('DRAFT','READY','PARTIALLY_PLANNED','PLANNED','IN_TRANSIT','COMPLETED','CANCELLED')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table if not exists public.order_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.tenants(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete cascade,
  line_number integer not null check (line_number > 0),
  description text not null,
  sku text,
  packages integer check (packages is null or packages >= 0),
  gross_weight numeric(14,3) check (gross_weight is null or gross_weight >= 0),
  volume numeric(14,3) check (volume is null or volume >= 0),
  adr jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (order_id, line_number)
);

create table if not exists public.delivery_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.tenants(id) on delete restrict,
  code text not null default public.fornexa_next_code('ALB', 'public.delivery_note_code_seq'),
  order_id uuid not null references public.orders(id) on delete restrict,
  external_reference text,
  pickup_address_id uuid references public.party_addresses(id) on delete restrict,
  delivery_address_id uuid references public.party_addresses(id) on delete restrict,
  pickup_window_start timestamptz,
  pickup_window_end timestamptz,
  delivery_window_start timestamptz,
  delivery_window_end timestamptz,
  packages integer check (packages is null or packages >= 0),
  gross_weight numeric(14,3) check (gross_weight is null or gross_weight >= 0),
  volume numeric(14,3) check (volume is null or volume >= 0),
  goods_description text,
  status text not null default 'DRAFT' check (status in ('DRAFT','READY','PLANNED','PICKED_UP','DELIVERED','CANCELLED')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table if not exists public.delivery_note_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.tenants(id) on delete restrict,
  delivery_note_id uuid not null references public.delivery_notes(id) on delete cascade,
  order_line_id uuid references public.order_lines(id) on delete restrict,
  line_number integer not null check (line_number > 0),
  description text not null,
  packages integer check (packages is null or packages >= 0),
  gross_weight numeric(14,3) check (gross_weight is null or gross_weight >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (delivery_note_id, line_number)
);

create table if not exists public.expeditions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.tenants(id) on delete restrict,
  code text not null default public.fornexa_next_code('EX', 'public.expedition_code_seq'),
  service_id uuid references public.service_catalog(id) on delete set null,
  carrier_id uuid references public.parties(id) on delete set null,
  origin_address_id uuid references public.party_addresses(id) on delete set null,
  destination_address_id uuid references public.party_addresses(id) on delete set null,
  planned_departure timestamptz,
  planned_arrival timestamptz,
  status text not null default 'PLANNED' check (status in ('DRAFT','PLANNED','ASSIGNED','IN_TRANSIT','DELIVERED','CLOSED','CANCELLED')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table if not exists public.expedition_delivery_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.tenants(id) on delete restrict,
  expedition_id uuid not null references public.expeditions(id) on delete cascade,
  delivery_note_id uuid not null references public.delivery_notes(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (expedition_id, delivery_note_id)
);

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.tenants(id) on delete restrict,
  code text not null default public.fornexa_next_code('VJ', 'public.trip_code_seq'),
  carrier_id uuid references public.parties(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  trailer_registration text,
  driver_id uuid references public.drivers(id) on delete set null,
  planned_start timestamptz,
  actual_start timestamptz,
  planned_end timestamptz,
  actual_end timestamptz,
  status text not null default 'PLANNED' check (status in ('DRAFT','PLANNED','READY','IN_PROGRESS','COMPLETED','CANCELLED')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table if not exists public.trip_expeditions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.tenants(id) on delete restrict,
  trip_id uuid not null references public.trips(id) on delete cascade,
  expedition_id uuid not null references public.expeditions(id) on delete restrict,
  sequence integer,
  created_at timestamptz not null default now(),
  unique (trip_id, expedition_id)
);

create table if not exists public.trip_stops (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.tenants(id) on delete restrict,
  trip_id uuid not null references public.trips(id) on delete cascade,
  sequence integer not null check (sequence > 0),
  stop_type text not null check (stop_type in ('PICKUP','DELIVERY','BREAK','DEPOT','OTHER')),
  address_id uuid references public.party_addresses(id) on delete set null,
  company_name text,
  full_address text not null,
  latitude numeric(10,7) check (latitude between -90 and 90),
  longitude numeric(10,7) check (longitude between -180 and 180),
  window_start timestamptz,
  window_end timestamptz,
  contact_name text,
  contact_phone text,
  operational_reference text,
  status text not null default 'PENDING' check (status in ('PENDING','ARRIVED','COMPLETED','INCIDENT','SKIPPED')),
  arrived_at timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trip_id, sequence)
);

create table if not exists public.trip_stop_delivery_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.tenants(id) on delete restrict,
  trip_stop_id uuid not null references public.trip_stops(id) on delete cascade,
  delivery_note_id uuid not null references public.delivery_notes(id) on delete restrict,
  operation text not null check (operation in ('PICKUP','DELIVERY')),
  created_at timestamptz not null default now(),
  unique (trip_stop_id, delivery_note_id, operation)
);

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.tenants(id) on delete restrict,
  code text not null default public.fornexa_next_code('OF', 'public.offer_code_seq'),
  customer_id uuid not null references public.parties(id) on delete restrict,
  service_id uuid references public.service_catalog(id) on delete set null,
  status text not null default 'DRAFT' check (status in ('DRAFT','SENT','ACCEPTED','REJECTED','EXPIRED','CANCELLED')),
  currency char(3) not null default 'EUR',
  subtotal numeric(16,4) not null default 0,
  taxes numeric(16,4) not null default 0,
  total numeric(16,4) not null default 0,
  valid_until date,
  conditions text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table if not exists public.offer_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.tenants(id) on delete restrict,
  offer_id uuid not null references public.offers(id) on delete cascade,
  line_number integer not null,
  description text not null,
  quantity numeric(14,3) not null default 1,
  unit_price numeric(16,4) not null default 0,
  total numeric(16,4) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  unique (offer_id, line_number)
);

create table if not exists public.connectors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.tenants(id) on delete restrict,
  code text not null,
  category text not null,
  provider text not null,
  status text not null default 'CONFIGURED' check (status in ('CONFIGURED','ACTIVE','DEGRADED','DISABLED')),
  configuration jsonb not null default '{}'::jsonb,
  last_health_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table if not exists public.connector_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.tenants(id) on delete restrict,
  connector_id uuid not null references public.connectors(id) on delete restrict,
  direction text not null check (direction in ('INBOUND','OUTBOUND','INTERNAL')),
  event_type text not null,
  status text not null,
  external_reference text,
  payload jsonb not null default '{}'::jsonb,
  error_message text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.communications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.tenants(id) on delete restrict,
  channel text not null check (channel in ('EMAIL','SMS','PUSH','WEBHOOK')),
  direction text not null default 'OUTBOUND' check (direction in ('INBOUND','OUTBOUND')),
  party_id uuid references public.parties(id) on delete set null,
  related_entity_type text,
  related_entity_id uuid,
  recipient text,
  subject text,
  provider text,
  provider_message_id text,
  status text not null default 'QUEUED',
  payload jsonb not null default '{}'::jsonb,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.operational_events (
  id bigint generated always as identity primary key,
  tenant_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.tenants(id) on delete restrict,
  entity_type text not null,
  entity_id uuid,
  entity_code text,
  event_type text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  source text not null default 'FORNEXA_WEB',
  occurred_at timestamptz not null default now(),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.customs_cases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.tenants(id) on delete restrict,
  reference text not null,
  country_code char(2) not null default 'ES',
  direction text not null check (direction in ('import','export','transit')),
  system text not null,
  status text not null default 'draft',
  mrn text,
  declarant_eori text,
  representative_eori text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, reference)
);

create table if not exists public.customs_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.tenants(id) on delete restrict,
  case_id uuid not null references public.customs_cases(id) on delete cascade,
  correlation_id uuid not null default gen_random_uuid(),
  direction text not null check (direction in ('outbound','inbound')),
  system text not null,
  message_type text not null,
  environment text not null,
  status text not null default 'queued',
  xml_payload text not null,
  http_status integer,
  error_codes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create table if not exists public.customs_events (
  id bigint generated always as identity primary key,
  tenant_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.tenants(id) on delete restrict,
  case_id uuid not null references public.customs_cases(id) on delete cascade,
  event_type text not null,
  actor_id uuid references auth.users(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.cmr_documents
  add column if not exists tenant_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.tenants(id) on delete restrict,
  add column if not exists expedition_record_id uuid references public.expeditions(id) on delete set null,
  add column if not exists trip_record_id uuid references public.trips(id) on delete set null,
  add column if not exists sender_party_id uuid references public.parties(id) on delete set null,
  add column if not exists recipient_party_id uuid references public.parties(id) on delete set null,
  add column if not exists carrier_party_id uuid references public.parties(id) on delete set null;

alter table public.transport_stops
  add column if not exists tenant_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.tenants(id) on delete restrict,
  add column if not exists trip_stop_id uuid references public.trip_stops(id) on delete set null,
  add column if not exists address_id uuid references public.party_addresses(id) on delete set null,
  add column if not exists contact_name text,
  add column if not exists operational_reference text;

alter table public.transport_events
  add column if not exists tenant_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.tenants(id) on delete restrict,
  add column if not exists actor_user_id uuid references auth.users(id) on delete set null;

alter table public.transport_evidence
  add column if not exists tenant_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.tenants(id) on delete restrict;

create or replace function public.fornexa_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'tenants','tenant_members','parties','party_addresses','party_contacts','service_catalog','party_services',
    'warehouses','vehicles','drivers','orders','delivery_notes','expeditions','trips','trip_stops','offers',
    'connectors','customs_cases','cmr_documents'
  ] loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_set_updated_at', table_name);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.fornexa_set_updated_at()',
      table_name || '_set_updated_at', table_name
    );
  end loop;
end $$;

create or replace function public.fornexa_has_tenant_access(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tenant_members
    where tenant_id = target_tenant_id
      and user_id = (select auth.uid())
      and status = 'ACTIVE'
  );
$$;

revoke all on function public.fornexa_has_tenant_access(uuid) from public, anon;
grant execute on function public.fornexa_has_tenant_access(uuid) to authenticated, service_role;

create index if not exists parties_tenant_roles_idx on public.parties(tenant_id, is_customer, is_supplier, status);
create index if not exists party_addresses_party_idx on public.party_addresses(party_id, is_active);
create index if not exists orders_customer_status_idx on public.orders(tenant_id, customer_id, status, created_at desc);
create index if not exists delivery_notes_order_idx on public.delivery_notes(order_id, status);
create index if not exists expedition_notes_expedition_idx on public.expedition_delivery_notes(expedition_id);
create index if not exists trip_expeditions_trip_idx on public.trip_expeditions(trip_id, sequence);
create index if not exists trip_stops_trip_idx on public.trip_stops(trip_id, sequence);
create index if not exists trip_stop_notes_stop_idx on public.trip_stop_delivery_notes(trip_stop_id);
create index if not exists offers_customer_status_idx on public.offers(tenant_id, customer_id, status, created_at desc);
create index if not exists connector_events_connector_idx on public.connector_events(connector_id, occurred_at desc);
create index if not exists communications_related_idx on public.communications(tenant_id, related_entity_type, related_entity_id, created_at desc);
create index if not exists operational_events_entity_idx on public.operational_events(tenant_id, entity_type, entity_id, occurred_at desc);
create index if not exists customs_cases_mrn_idx on public.customs_cases(mrn);
create index if not exists customs_messages_queue_idx on public.customs_messages(status, created_at);
create index if not exists cmr_documents_tenant_status_idx on public.cmr_documents(tenant_id, status, issued_at desc);
create index if not exists transport_stops_tenant_status_idx on public.transport_stops(tenant_id, status, sequence);
create index if not exists transport_events_tenant_idx on public.transport_events(tenant_id, occurred_at desc);
create index if not exists transport_evidence_tenant_idx on public.transport_evidence(tenant_id, captured_at desc);

alter table public.tenants enable row level security;
alter table public.tenant_members enable row level security;

drop policy if exists tenant_select on public.tenants;
create policy tenant_select on public.tenants for select to authenticated
using (public.fornexa_has_tenant_access(id));

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'tenant_members','parties','party_addresses','party_contacts','service_catalog','party_services','warehouses',
    'vehicles','drivers','orders','order_lines','delivery_notes','delivery_note_lines','expeditions',
    'expedition_delivery_notes','trips','trip_expeditions','trip_stops','trip_stop_delivery_notes','offers','offer_lines',
    'connectors','connector_events','communications','operational_events','customs_cases','customs_messages','customs_events',
    'cmr_documents','transport_stops','transport_events','transport_evidence'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists tenant_isolation on public.%I', table_name);
    execute format(
      'create policy tenant_isolation on public.%I for all to authenticated using (public.fornexa_has_tenant_access(tenant_id)) with check (public.fornexa_has_tenant_access(tenant_id))',
      table_name
    );
  end loop;
end $$;

insert into public.service_catalog (tenant_id, code, name, service_type, unit)
values
  ('00000000-0000-4000-8000-000000000001', 'GROUPAGE', 'Grupaje', 'GROUPAGE', 'shipment'),
  ('00000000-0000-4000-8000-000000000001', 'LTL', 'Carga parcial', 'LTL', 'shipment'),
  ('00000000-0000-4000-8000-000000000001', 'FTL', 'Carga completa', 'FTL', 'shipment'),
  ('00000000-0000-4000-8000-000000000001', 'PARCEL', 'Paquetería', 'PARCEL', 'package'),
  ('00000000-0000-4000-8000-000000000001', 'DIRECT', 'Directo', 'DIRECT', 'shipment')
on conflict (tenant_id, code) do nothing;

insert into public.fornexa_schema_migrations (version, description)
values ('20260812_fornexa_operational_core', 'Núcleo relacional multi-tenant de FORNEXA')
on conflict (version) do nothing;

comment on table public.orders is 'Partidas o pedidos de cliente. Un pedido puede originar uno o varios albaranes.';
comment on table public.delivery_notes is 'Albaranes u órdenes de recogida relacionados 1:N con el pedido de cliente.';
comment on table public.expeditions is 'Consolidación operativa de albaranes.';
comment on table public.trips is 'Trabajo asignado a vehículo y conductor; contiene expediciones y paradas ordenadas.';
comment on table public.operational_events is 'Histórico transversal append-only de entidades FORNEXA.';

commit;
