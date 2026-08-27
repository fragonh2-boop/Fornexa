-- FORNEXA tariff engine foundation
-- Incorporates the Claude/GPT cross-review while keeping the migration non-destructive.
-- Pricing remains tenant-owned. Rules are closed evaluators with typed/validated params in application code.

-- Tenant-aware FK targets used by the new pricing domain.
create unique index if not exists parties_tenant_id_id_key on public.parties(tenant_id, id);
create unique index if not exists service_catalog_tenant_id_id_key on public.service_catalog(tenant_id, id);
create unique index if not exists tariff_headers_tenant_id_id_key on public.tariff_headers(tenant_id, id);

create table if not exists public.tariff_zones (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  name text not null,
  country character(2),
  purpose text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tariff_zones_country_upper_ck check (country is null or country = upper(country))
);
create unique index if not exists tariff_zones_tenant_id_id_key on public.tariff_zones(tenant_id, id);
create unique index if not exists tariff_zones_tenant_name_key on public.tariff_zones(tenant_id, name);

create table if not exists public.tariff_zone_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  zone_id uuid not null,
  member_type text not null check (member_type in ('COUNTRY','ADMIN_DIVISION','POSTAL_CODE','POSTAL_RANGE','POSTAL_PREFIX')),
  country character(2) not null,
  admin_division_code text,
  postal_code text,
  postal_range_from text,
  postal_range_to text,
  postal_prefix text,
  excluded boolean not null default false,
  created_at timestamptz not null default now(),
  constraint tariff_zone_members_zone_fk foreign key (tenant_id, zone_id)
    references public.tariff_zones(tenant_id, id) on delete cascade,
  constraint tariff_zone_members_country_upper_ck check (country = upper(country)),
  constraint tariff_zone_members_shape_ck check (
    (member_type='COUNTRY' and admin_division_code is null and postal_code is null and postal_range_from is null and postal_range_to is null and postal_prefix is null) or
    (member_type='ADMIN_DIVISION' and admin_division_code is not null and postal_code is null and postal_range_from is null and postal_range_to is null and postal_prefix is null) or
    (member_type='POSTAL_CODE' and postal_code is not null and admin_division_code is null and postal_range_from is null and postal_range_to is null and postal_prefix is null) or
    (member_type='POSTAL_RANGE' and postal_range_from is not null and postal_range_to is not null and admin_division_code is null and postal_code is null and postal_prefix is null) or
    (member_type='POSTAL_PREFIX' and postal_prefix is not null and admin_division_code is null and postal_code is null and postal_range_from is null and postal_range_to is null)
  )
);
create index if not exists tariff_zone_members_zone_idx on public.tariff_zone_members(tenant_id, zone_id);
create index if not exists tariff_zone_members_postal_idx on public.tariff_zone_members(tenant_id, country, postal_code) where postal_code is not null;
create index if not exists tariff_zone_members_admin_idx on public.tariff_zone_members(tenant_id, country, admin_division_code) where admin_division_code is not null;
create index if not exists tariff_zone_members_prefix_idx on public.tariff_zone_members(tenant_id, country, postal_prefix) where postal_prefix is not null;

alter table public.tariff_headers
  add column if not exists kind text not null default 'SELL',
  add column if not exists origin_zone_id uuid,
  add column if not exists destination_zone_id uuid;

alter table public.tariff_headers drop constraint if exists tariff_headers_kind_check;
alter table public.tariff_headers add constraint tariff_headers_kind_check check (kind in ('COST','SELL'));
alter table public.tariff_headers drop constraint if exists tariff_headers_origin_zone_tenant_fk;
alter table public.tariff_headers add constraint tariff_headers_origin_zone_tenant_fk
  foreign key (tenant_id, origin_zone_id) references public.tariff_zones(tenant_id, id);
alter table public.tariff_headers drop constraint if exists tariff_headers_destination_zone_tenant_fk;
alter table public.tariff_headers add constraint tariff_headers_destination_zone_tenant_fk
  foreign key (tenant_id, destination_zone_id) references public.tariff_zones(tenant_id, id);

alter table public.tariff_lines add column if not exists component text not null default 'BASE';
comment on column public.tariff_lines.adr_surcharge is 'DEPRECATED: use tariff_rules.';
comment on column public.tariff_lines.liftgate_surcharge is 'DEPRECATED: use tariff_rules.';
comment on column public.tariff_lines.waiting_time_rate is 'DEPRECATED: use tariff_rules.';
comment on column public.tariff_lines.customs_fee is 'DEPRECATED: use tariff_rules.';
comment on column public.tariff_lines.fuel_surcharge_formula is 'DEPRECATED: use typed tariff_rules + fuel indices.';
comment on column public.tariff_lines.discount_percent is 'DEPRECATED: use tariff_rules.';
comment on column public.party_services.price is 'DEPRECATED: prices resolve through the canonical tariff engine. Kept temporarily for compatibility.';

create table if not exists public.tariff_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  tariff_header_id uuid not null,
  rule_type text not null check (rule_type in (
    'FIXED_PER_SHIPMENT','PERCENT_OF_BASE','RATE_PER_100KG','WEIGHT_BAND',
    'ZONE_FIXED','ZONE_RATE','FUEL_INDEX_BAND','MINIMUM_CHARGE',
    'VOLUME_WEIGHT_CONVERSION','LINEAR_METER_CONVERSION','CONDITIONAL_SURCHARGE'
  )),
  component text not null default 'SURCHARGE',
  params jsonb not null default '{}'::jsonb,
  params_schema_version integer not null default 1 check (params_schema_version > 0),
  applies_to_zone_id uuid,
  valid_from date not null,
  valid_to date,
  priority integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tariff_rules_header_fk foreign key (tenant_id, tariff_header_id)
    references public.tariff_headers(tenant_id, id) on delete cascade,
  constraint tariff_rules_zone_fk foreign key (tenant_id, applies_to_zone_id)
    references public.tariff_zones(tenant_id, id),
  constraint tariff_rules_dates_ck check (valid_to is null or valid_to >= valid_from)
);
create index if not exists tariff_rules_lookup_idx on public.tariff_rules(tenant_id, tariff_header_id, is_active, valid_from, valid_to, priority);

create table if not exists public.fuel_indices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  party_id uuid not null,
  name text not null,
  currency character(3) not null default 'EUR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fuel_indices_party_fk foreign key (tenant_id, party_id)
    references public.parties(tenant_id, id)
);
create unique index if not exists fuel_indices_tenant_id_id_key on public.fuel_indices(tenant_id, id);
create unique index if not exists fuel_indices_tenant_party_name_key on public.fuel_indices(tenant_id, party_id, name);

create table if not exists public.fuel_index_values (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  fuel_index_id uuid not null,
  period_start date not null,
  period_end date not null,
  observed_value numeric not null check (observed_value >= 0),
  created_at timestamptz not null default now(),
  constraint fuel_index_values_index_fk foreign key (tenant_id, fuel_index_id)
    references public.fuel_indices(tenant_id, id) on delete cascade,
  constraint fuel_index_values_period_ck check (period_end >= period_start)
);
create unique index if not exists fuel_index_values_period_key on public.fuel_index_values(tenant_id, fuel_index_id, period_start, period_end);

create table if not exists public.fuel_index_bands (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  fuel_index_id uuid not null,
  value_from numeric not null,
  value_to numeric not null,
  surcharge_percent numeric,
  surcharge_amount numeric,
  valid_from date not null,
  valid_to date,
  created_at timestamptz not null default now(),
  constraint fuel_index_bands_index_fk foreign key (tenant_id, fuel_index_id)
    references public.fuel_indices(tenant_id, id) on delete cascade,
  constraint fuel_index_bands_range_ck check (value_to >= value_from),
  constraint fuel_index_bands_dates_ck check (valid_to is null or valid_to >= valid_from),
  constraint fuel_index_bands_surcharge_ck check (
    (surcharge_percent is not null and surcharge_amount is null and surcharge_percent >= 0) or
    (surcharge_percent is null and surcharge_amount is not null and surcharge_amount >= 0)
  )
);
create index if not exists fuel_index_bands_lookup_idx on public.fuel_index_bands(tenant_id, fuel_index_id, valid_from, valid_to, value_from, value_to);

create table if not exists public.transit_times (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  party_id uuid not null,
  service_id uuid,
  origin_zone_id uuid not null,
  destination_zone_id uuid not null,
  transit_mode text not null default 'MINUTES' check (transit_mode in ('MINUTES','BUSINESS_DAYS')),
  planned_duration_minutes integer,
  business_days integer,
  valid_from date not null,
  valid_to date,
  priority integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transit_times_party_fk foreign key (tenant_id, party_id) references public.parties(tenant_id, id),
  constraint transit_times_service_fk foreign key (tenant_id, service_id) references public.service_catalog(tenant_id, id),
  constraint transit_times_origin_zone_fk foreign key (tenant_id, origin_zone_id) references public.tariff_zones(tenant_id, id),
  constraint transit_times_destination_zone_fk foreign key (tenant_id, destination_zone_id) references public.tariff_zones(tenant_id, id),
  constraint transit_times_value_ck check (
    (transit_mode='MINUTES' and planned_duration_minutes is not null and planned_duration_minutes >= 0 and business_days is null) or
    (transit_mode='BUSINESS_DAYS' and business_days is not null and business_days >= 0 and planned_duration_minutes is null)
  ),
  constraint transit_times_dates_ck check (valid_to is null or valid_to >= valid_from)
);
create index if not exists transit_times_lookup_idx on public.transit_times(tenant_id, party_id, service_id, origin_zone_id, destination_zone_id, valid_from, valid_to, priority);

create table if not exists public.external_service_mappings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  party_id uuid not null,
  internal_service_id uuid not null,
  external_code text not null,
  external_name text,
  legacy_name text,
  valid_from date,
  valid_to date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint external_service_mappings_party_fk foreign key (tenant_id, party_id) references public.parties(tenant_id, id),
  constraint external_service_mappings_service_fk foreign key (tenant_id, internal_service_id) references public.service_catalog(tenant_id, id),
  constraint external_service_mappings_dates_ck check (valid_to is null or valid_from is null or valid_to >= valid_from)
);
create unique index if not exists external_service_mappings_code_key on public.external_service_mappings(tenant_id, party_id, external_code);

create table if not exists public.pricing_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  kind text not null check (kind in ('COST','SELL')),
  tariff_header_id uuid not null,
  tariff_header_version integer not null,
  billable_quantity numeric not null check (billable_quantity >= 0),
  billable_unit text not null,
  pickup_amount numeric,
  linehaul_amount numeric,
  delivery_amount numeric,
  surcharge_amount numeric,
  currency character(3) not null default 'EUR',
  total numeric not null,
  input jsonb not null,
  trace jsonb not null default '{}'::jsonb,
  breakdown jsonb not null default '{}'::jsonb,
  engine_version text not null,
  created_at timestamptz not null default now(),
  constraint pricing_runs_header_fk foreign key (tenant_id, tariff_header_id) references public.tariff_headers(tenant_id, id)
);
create unique index if not exists pricing_runs_tenant_id_id_key on public.pricing_runs(tenant_id, id);
create index if not exists pricing_runs_header_created_idx on public.pricing_runs(tenant_id, tariff_header_id, created_at desc);

create table if not exists public.pricing_run_components (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  pricing_run_id uuid not null,
  sequence integer not null,
  component text not null,
  description text,
  source_rule_id uuid,
  quantity numeric,
  unit text,
  rate numeric,
  amount numeric not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint pricing_run_components_run_fk foreign key (tenant_id, pricing_run_id) references public.pricing_runs(tenant_id, id) on delete cascade,
  constraint pricing_run_components_rule_fk foreign key (tenant_id, source_rule_id) references public.tariff_rules(tenant_id, id),
  unique (pricing_run_id, sequence)
);

alter table public.offers
  add column if not exists cost_pricing_run_id uuid,
  add column if not exists sell_pricing_run_id uuid,
  add column if not exists margin_amount numeric,
  add column if not exists margin_percent numeric,
  add column if not exists result text;

alter table public.offers drop constraint if exists offers_result_check;
alter table public.offers add constraint offers_result_check check (result is null or result in ('WON','LOST','EXPIRED'));
alter table public.offers drop constraint if exists offers_cost_pricing_run_tenant_fk;
alter table public.offers add constraint offers_cost_pricing_run_tenant_fk foreign key (tenant_id, cost_pricing_run_id) references public.pricing_runs(tenant_id, id);
alter table public.offers drop constraint if exists offers_sell_pricing_run_tenant_fk;
alter table public.offers add constraint offers_sell_pricing_run_tenant_fk foreign key (tenant_id, sell_pricing_run_id) references public.pricing_runs(tenant_id, id);

alter table public.offer_lines
  add column if not exists override_reason text,
  add column if not exists overridden_by uuid;

-- RLS: reuse FORNEXA's established tenant-access function.
alter table public.tariff_zones enable row level security;
alter table public.tariff_zone_members enable row level security;
alter table public.tariff_rules enable row level security;
alter table public.fuel_indices enable row level security;
alter table public.fuel_index_values enable row level security;
alter table public.fuel_index_bands enable row level security;
alter table public.transit_times enable row level security;
alter table public.external_service_mappings enable row level security;
alter table public.pricing_runs enable row level security;
alter table public.pricing_run_components enable row level security;

create policy tenant_isolation on public.tariff_zones for all to authenticated using (fornexa_has_tenant_access(tenant_id)) with check (fornexa_has_tenant_access(tenant_id));
create policy tenant_isolation on public.tariff_zone_members for all to authenticated using (fornexa_has_tenant_access(tenant_id)) with check (fornexa_has_tenant_access(tenant_id));
create policy tenant_isolation on public.tariff_rules for all to authenticated using (fornexa_has_tenant_access(tenant_id)) with check (fornexa_has_tenant_access(tenant_id));
create policy tenant_isolation on public.fuel_indices for all to authenticated using (fornexa_has_tenant_access(tenant_id)) with check (fornexa_has_tenant_access(tenant_id));
create policy tenant_isolation on public.fuel_index_values for all to authenticated using (fornexa_has_tenant_access(tenant_id)) with check (fornexa_has_tenant_access(tenant_id));
create policy tenant_isolation on public.fuel_index_bands for all to authenticated using (fornexa_has_tenant_access(tenant_id)) with check (fornexa_has_tenant_access(tenant_id));
create policy tenant_isolation on public.transit_times for all to authenticated using (fornexa_has_tenant_access(tenant_id)) with check (fornexa_has_tenant_access(tenant_id));
create policy tenant_isolation on public.external_service_mappings for all to authenticated using (fornexa_has_tenant_access(tenant_id)) with check (fornexa_has_tenant_access(tenant_id));
create policy tenant_isolation on public.pricing_runs for all to authenticated using (fornexa_has_tenant_access(tenant_id)) with check (fornexa_has_tenant_access(tenant_id));
create policy tenant_isolation on public.pricing_run_components for all to authenticated using (fornexa_has_tenant_access(tenant_id)) with check (fornexa_has_tenant_access(tenant_id));
