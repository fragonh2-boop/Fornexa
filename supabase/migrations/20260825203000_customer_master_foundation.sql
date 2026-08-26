begin;

alter table public.parties
  add column if not exists eori text,
  add column if not exists gln text,
  add column if not exists cnae_code text,
  add column if not exists commercial_register text,
  add column if not exists business_group_party_id uuid references public.parties(id) on delete set null,
  add column if not exists billing_party_id uuid references public.parties(id) on delete set null,
  add column if not exists account_manager_user_id uuid references auth.users(id) on delete set null;

alter table public.parties drop constraint if exists parties_status_check;
alter table public.parties add constraint parties_status_check
  check (status in ('DRAFT','ACTIVE','REVIEW','BLOCKED','INACTIVE'));

alter table public.party_contacts
  add column if not exists department text,
  add column if not exists language text,
  add column if not exists schedule jsonb not null default '{}'::jsonb,
  add column if not exists notification_channels text[] not null default '{}'::text[],
  add column if not exists valid_from date,
  add column if not exists valid_to date;

create table if not exists public.customer_billing_profiles (
  party_id uuid primary key references public.parties(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  payment_method text,
  payment_terms_days integer check (payment_terms_days is null or payment_terms_days >= 0),
  credit_limit numeric(16,2) check (credit_limit is null or credit_limit >= 0),
  credit_insurance boolean not null default false,
  invoice_grouping text,
  requires_order_reference boolean not null default false,
  tax_regime text,
  invoice_channel text,
  billing_email text,
  sales_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_blocks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  party_id uuid not null references public.parties(id) on delete cascade,
  block_type text not null check (block_type in ('OPERATIONAL','BILLING','RISK','DOCUMENTARY')),
  behavior text not null default 'WARNING' check (behavior in ('WARNING','HARD')),
  reason text not null,
  blocked_by uuid references auth.users(id) on delete set null,
  blocked_at timestamptz not null default now(),
  released_by uuid references auth.users(id) on delete set null,
  released_at timestamptz,
  release_reason text,
  check (released_at is null or released_at >= blocked_at)
);

create table if not exists public.address_operational_profiles (
  address_id uuid primary key references public.party_addresses(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  has_dock boolean not null default false,
  needs_forklift boolean not null default false,
  requires_appointment boolean not null default false,
  pallet_exchange boolean not null default false,
  adr_capable boolean not null default false,
  temperature_controlled boolean not null default false,
  temperature_min numeric(7,2),
  temperature_max numeric(7,2),
  geofence_radius_m integer check (geofence_radius_m is null or geofence_radius_m >= 0),
  opening_hours jsonb not null default '{}'::jsonb,
  holiday_exceptions jsonb not null default '[]'::jsonb,
  average_wait_minutes integer check (average_wait_minutes is null or average_wait_minutes >= 0),
  access_instructions text,
  account_manager_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (temperature_min is null or temperature_max is null or temperature_min <= temperature_max)
);

create table if not exists public.tariff_headers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  code text not null,
  name text not null,
  status text not null default 'DRAFT' check (status in ('DRAFT','ACTIVE','INACTIVE')),
  version integer not null default 1 check (version > 0),
  valid_from date not null,
  valid_to date,
  currency char(3) not null default 'EUR',
  priority integer not null default 100,
  service_id uuid references public.service_catalog(id) on delete restrict,
  origin_country char(2),
  destination_country char(2),
  superseded_by_id uuid references public.tariff_headers(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code, version),
  check (valid_to is null or valid_to >= valid_from)
);

create table if not exists public.tariff_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  tariff_header_id uuid not null references public.tariff_headers(id) on delete cascade,
  pricing_unit text not null check (pricing_unit in ('SHIPMENT','PALLET','KG','TON','LINEAR_M','KM','STOP')),
  from_quantity numeric(16,4) not null default 0,
  to_quantity numeric(16,4),
  unit_price numeric(16,4) not null check (unit_price >= 0),
  minimum_amount numeric(16,4) check (minimum_amount is null or minimum_amount >= 0),
  adr_surcharge numeric(16,4) check (adr_surcharge is null or adr_surcharge >= 0),
  liftgate_surcharge numeric(16,4) check (liftgate_surcharge is null or liftgate_surcharge >= 0),
  waiting_time_rate numeric(16,4) check (waiting_time_rate is null or waiting_time_rate >= 0),
  customs_fee numeric(16,4) check (customs_fee is null or customs_fee >= 0),
  fuel_surcharge_formula text,
  discount_percent numeric(7,4) check (discount_percent is null or discount_percent between 0 and 100),
  created_at timestamptz not null default now(),
  unique (tariff_header_id, pricing_unit, from_quantity),
  check (to_quantity is null or to_quantity > from_quantity)
);

create table if not exists public.tariff_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  tariff_header_id uuid not null references public.tariff_headers(id) on delete cascade,
  party_id uuid not null references public.parties(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (tariff_header_id, party_id)
);

alter table public.orders add column if not exists pricing_snapshot jsonb not null default '{}'::jsonb;
alter table public.offers add column if not exists pricing_snapshot jsonb not null default '{}'::jsonb;

create index if not exists customer_billing_profiles_tenant_idx on public.customer_billing_profiles(tenant_id, party_id);
create index if not exists customer_blocks_active_idx on public.customer_blocks(tenant_id, party_id, block_type) where released_at is null;
create index if not exists tariff_headers_lookup_idx on public.tariff_headers(tenant_id, status, service_id, valid_from, valid_to, priority);
create index if not exists tariff_assignments_party_idx on public.tariff_assignments(tenant_id, party_id, tariff_header_id);
create unique index if not exists tariff_headers_one_active_version_idx on public.tariff_headers(tenant_id, code) where status = 'ACTIVE';
create index if not exists party_contacts_active_idx on public.party_contacts(tenant_id, party_id, is_active);

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'customer_billing_profiles','address_operational_profiles','tariff_headers'
  ] loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_set_updated_at', table_name);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.fornexa_set_updated_at()',
      table_name || '_set_updated_at', table_name
    );
  end loop;
end $$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'customer_billing_profiles','customer_blocks','address_operational_profiles',
    'tariff_headers','tariff_lines','tariff_assignments'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists tenant_isolation on public.%I', table_name);
    execute format(
      'create policy tenant_isolation on public.%I for all to authenticated using (public.fornexa_has_tenant_access(tenant_id)) with check (public.fornexa_has_tenant_access(tenant_id))',
      table_name
    );
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
  end loop;
end $$;

update public.parties
set status = 'REVIEW',
    metadata = metadata || jsonb_build_object('demo_record', true, 'review_reason', 'Nombre genérico detectado en saneamiento del maestro'),
    updated_at = now()
where upper(trim(legal_name)) in ('NUEVO','NUEVA')
   or upper(trim(coalesce(trade_name,''))) in ('NUEVO','NUEVA');

insert into public.customer_billing_profiles (
  party_id, tenant_id, payment_method, payment_terms_days, credit_limit,
  billing_email, sales_email
)
select
  id,
  tenant_id,
  nullif(metadata #>> '{legacy,paymentMethod}', ''),
  case
    when metadata #>> '{legacy,paymentTerms}' ~ '[0-9]'
      then nullif(regexp_replace(metadata #>> '{legacy,paymentTerms}', '[^0-9]', '', 'g'), '')::integer
    else null
  end,
  case
    when replace(regexp_replace(coalesce(metadata #>> '{legacy,creditLimit}',''), '[^0-9,.-]', '', 'g'), ',', '.') ~ '^-?[0-9]+([.][0-9]+)?$'
      then replace(regexp_replace(metadata #>> '{legacy,creditLimit}', '[^0-9,.-]', '', 'g'), ',', '.')::numeric
    else null
  end,
  nullif(metadata #>> '{legacy,billingEmail}', ''),
  nullif(metadata #>> '{legacy,salesEmail}', '')
from public.parties
on conflict (party_id) do nothing;

comment on table public.customer_billing_profiles is 'Configuración tipada de facturación y riesgo del cliente; sustituye los campos comerciales en parties.metadata.';
comment on table public.customer_blocks is 'Eventos auditables de bloqueo o advertencia por cliente; released_at null identifica los vigentes.';
comment on table public.tariff_headers is 'Versiones de tarifas. Una versión activa no se edita: se sustituye por una nueva versión.';
comment on column public.orders.pricing_snapshot is 'Fotografía inmutable de tarifa e importes usados al valorar la partida.';

commit;
