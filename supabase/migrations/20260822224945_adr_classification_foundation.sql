begin;

-- ADR reference data is global and versioned. Tenant-specific aliases and product
-- assignments never mutate the regulatory master.
create table if not exists public.hazmat_editions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  mode text not null default 'ROAD' check (mode in ('ROAD')),
  effective_from date not null,
  effective_to date,
  status text not null default 'DRAFT' check (status in ('DRAFT','ACTIVE','RETIRED')),
  source_uri text not null,
  source_checksum text,
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hazmat_entries (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.hazmat_editions(id) on delete restrict,
  entry_key text not null,
  un_number text not null check (un_number ~ '^[0-9]{4}$'),
  proper_shipping_name_es text not null,
  proper_shipping_name_en text,
  technical_name_required boolean not null default false,
  class_code text not null,
  classification_code text,
  subsidiary_risks text[] not null default '{}',
  label_codes text[] not null default '{}',
  packing_group text check (packing_group is null or packing_group in ('I','II','III')),
  hazard_identification_number text,
  tunnel_restriction_code text,
  limited_quantity_value numeric(14,4),
  limited_quantity_uom text,
  excepted_quantity_code text check (excepted_quantity_code is null or excepted_quantity_code ~ '^E[0-5]$'),
  transport_category smallint check (transport_category is null or transport_category between 0 and 4),
  environmentally_hazardous boolean,
  special_provision_codes text[] not null default '{}',
  packing_instruction_codes text[] not null default '{}',
  source_locator text,
  search_text text generated always as (
    lower(un_number || ' ' || proper_shipping_name_es || ' ' || coalesce(proper_shipping_name_en, ''))
  ) stored,
  created_at timestamptz not null default now(),
  unique (edition_id, entry_key)
);

create table if not exists public.hazmat_entry_synonyms (
  id uuid primary key default gen_random_uuid(),
  hazmat_entry_id uuid not null references public.hazmat_entries(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete cascade,
  locale text not null default 'es',
  synonym text not null,
  source text not null default 'VERIFIED' check (source in ('OFFICIAL','VERIFIED','TENANT')),
  verified_at timestamptz,
  verified_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique nulls not distinct (hazmat_entry_id, tenant_id, locale, synonym)
);

create table if not exists public.hazmat_packaging_types (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.hazmat_editions(id) on delete restrict,
  code text not null,
  family text not null check (family in ('PACKAGING','IBC','LARGE_PACKAGING','PRESSURE_RECEPTACLE','TANK','BULK')),
  name_es text not null,
  name_en text,
  description text,
  source_locator text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','RETIRED')),
  created_at timestamptz not null default now(),
  unique (edition_id, code)
);

create table if not exists public.hazmat_entry_packaging_options (
  id uuid primary key default gen_random_uuid(),
  hazmat_entry_id uuid not null references public.hazmat_entries(id) on delete cascade,
  packaging_type_id uuid not null references public.hazmat_packaging_types(id) on delete restrict,
  packing_instruction_code text,
  limited_quantity_allowed boolean not null default false,
  excepted_quantity_allowed boolean not null default false,
  max_inner_quantity numeric(14,4),
  max_outer_quantity numeric(14,4),
  quantity_uom text,
  conditions jsonb not null default '{}'::jsonb,
  source_locator text,
  unique (hazmat_entry_id, packaging_type_id, packing_instruction_code)
);

create table if not exists public.hazmat_transport_category_rules (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.hazmat_editions(id) on delete cascade,
  transport_category smallint not null check (transport_category between 0 and 4),
  quantity_basis text not null,
  multiplier numeric(14,4),
  threshold numeric(14,4),
  conditions jsonb not null default '{}'::jsonb,
  source_locator text not null,
  unique (edition_id, transport_category, quantity_basis)
);

create table if not exists public.party_adr_profiles (
  party_id uuid primary key references public.parties(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  frequency text not null default 'NEVER' check (frequency in ('NEVER','SOMETIMES','ALWAYS')),
  validation_policy text not null default 'WARNING' check (validation_policy in ('INFO','WARNING','ACKNOWLEDGEMENT','BLOCKING')),
  preferred_classes text[] not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  customer_id uuid references public.parties(id) on delete restrict,
  sku text not null,
  name text not null,
  hazard_status text not null default 'UNKNOWN' check (hazard_status in ('UNKNOWN','NON_HAZARDOUS','HAZMAT')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  metadata jsonb not null default '{}'::jsonb,
  revision_number integer not null default 1 check (revision_number > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (tenant_id, customer_id, sku)
);

create table if not exists public.product_hazmat_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete cascade,
  hazmat_entry_id uuid not null references public.hazmat_entries(id) on delete restrict,
  edition_id uuid not null references public.hazmat_editions(id) on delete restrict,
  status text not null default 'VERIFIED' check (status in ('VERIFIED','REVIEW_REQUIRED','RETIRED')),
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  remembered_from_order_line_id uuid references public.order_lines(id) on delete set null,
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists product_hazmat_one_active_idx
  on public.product_hazmat_assignments(product_id)
  where valid_to is null and status <> 'RETIRED';

alter table public.orders
  add column if not exists hazmat_declaration text not null default 'UNANSWERED'
    check (hazmat_declaration in ('UNANSWERED','NO','YES')),
  add column if not exists hazmat_edition_id uuid references public.hazmat_editions(id) on delete restrict,
  add column if not exists hazmat_validation_status text not null default 'NOT_EVALUATED'
    check (hazmat_validation_status in ('NOT_EVALUATED','WARNING','ACKNOWLEDGED','VALIDATED')),
  add column if not exists revision_number integer not null default 1 check (revision_number > 0),
  add column if not exists business_id uuid not null default gen_random_uuid(),
  add column if not exists supersedes_order_id uuid references public.orders(id) on delete restrict,
  add column if not exists launched_at timestamptz,
  add column if not exists revoked_at timestamptz;

alter table public.order_lines
  add column if not exists product_id uuid references public.products(id) on delete restrict,
  add column if not exists hazard_status text not null default 'UNKNOWN'
    check (hazard_status in ('UNKNOWN','NON_HAZARDOUS','HAZMAT'));

create table if not exists public.order_line_hazmat (
  order_line_id uuid primary key references public.order_lines(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  hazmat_entry_id uuid not null references public.hazmat_entries(id) on delete restrict,
  edition_id uuid not null references public.hazmat_editions(id) on delete restrict,
  packaging_type_id uuid references public.hazmat_packaging_types(id) on delete restrict,
  technical_name text,
  net_quantity numeric(14,4),
  quantity_uom text,
  package_count integer check (package_count is null or package_count >= 0),
  inner_package_quantity numeric(14,4),
  inner_package_count integer check (inner_package_count is null or inner_package_count >= 0),
  un_number text not null,
  proper_shipping_name text not null,
  class_code text not null,
  subsidiary_risks text[] not null default '{}',
  label_codes text[] not null default '{}',
  packing_group text,
  hazard_identification_number text,
  tunnel_restriction_code text,
  transport_category smallint,
  environmentally_hazardous boolean,
  calculated_regime text not null default 'UNASSESSED'
    check (calculated_regime in ('UNASSESSED','FULL','LQ','EQ','EXEMPT_1136')),
  calculated_points numeric(14,4),
  calculation_reasons jsonb not null default '[]'::jsonb,
  rule_version text,
  input_hash text,
  calculated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_hazmat_assessments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete cascade,
  edition_id uuid references public.hazmat_editions(id) on delete restrict,
  status text not null default 'WARNING' check (status in ('INFO','WARNING','ACKNOWLEDGED','VALIDATED')),
  category_totals jsonb not null default '{}'::jsonb,
  points_total numeric(14,4),
  warnings jsonb not null default '[]'::jsonb,
  input_hash text,
  assessed_at timestamptz not null default now(),
  assessed_by uuid references auth.users(id) on delete set null
);

create table if not exists public.trip_hazmat_assessments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  trip_id uuid not null references public.trips(id) on delete cascade,
  trip_stop_id uuid references public.trip_stops(id) on delete cascade,
  edition_id uuid references public.hazmat_editions(id) on delete restrict,
  sequence integer,
  category_totals jsonb not null default '{}'::jsonb,
  points_total numeric(14,4),
  warnings jsonb not null default '[]'::jsonb,
  input_hash text,
  assessed_at timestamptz not null default now()
);

create table if not exists public.entity_revisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  entity_type text not null,
  business_id uuid not null,
  entity_id uuid,
  revision_number integer not null check (revision_number > 0),
  supersedes_revision_id uuid references public.entity_revisions(id) on delete restrict,
  lifecycle_status text not null default 'DRAFT'
    check (lifecycle_status in ('DRAFT','LAUNCHED','REVOKED','SIGNED','DELIVERED','SUPERSEDED')),
  snapshot jsonb not null,
  change_reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  launched_at timestamptz,
  revoked_at timestamptz,
  unique (tenant_id, entity_type, business_id, revision_number)
);

create table if not exists public.device_revision_dispatches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  revision_id uuid not null references public.entity_revisions(id) on delete cascade,
  device_id text not null,
  application text not null check (application in ('FORNEXA_MOBILE','FORNEXA_OPS')),
  status text not null default 'PENDING'
    check (status in ('PENDING','DELIVERED','REVOKE_PENDING','REMOVED','FAILED')),
  delivered_at timestamptz,
  revoke_requested_at timestamptz,
  removed_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  unique (revision_id, device_id, application)
);

create table if not exists public.audit_events (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  entity_type text not null,
  entity_id uuid,
  business_id uuid,
  revision_id uuid,
  action text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  source_channel text not null default 'FORNEXA_WEB',
  device_id text,
  session_id text,
  ip_address inet,
  user_agent text,
  changed_fields text[] not null default '{}',
  before_data jsonb,
  after_data jsonb,
  reason text,
  correlation_id uuid not null default gen_random_uuid(),
  occurred_at timestamptz not null default now()
);

alter table public.cmr_goods_lines
  add column if not exists source_order_line_id uuid references public.order_lines(id) on delete restrict,
  add column if not exists hazmat_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists hazmat_edition_code text,
  add column if not exists hazmat_input_hash text;

insert into public.hazmat_editions (code, effective_from, status, source_uri)
values ('ADR_2025', '2025-01-01', 'DRAFT', 'https://unece.org/info/Transport/pub/395786')
on conflict (code) do nothing;

insert into public.party_adr_profiles (party_id, tenant_id, frequency)
select id, tenant_id, case when adr_control then 'SOMETIMES' else 'NEVER' end
from public.parties
where is_customer = true
on conflict (party_id) do nothing;

create index if not exists hazmat_entries_un_idx on public.hazmat_entries(edition_id, un_number);
create index if not exists hazmat_entries_search_idx on public.hazmat_entries using gin(to_tsvector('simple', search_text));
create index if not exists hazmat_synonyms_search_idx on public.hazmat_entry_synonyms using gin(to_tsvector('simple', lower(synonym)));
create index if not exists products_customer_sku_idx on public.products(tenant_id, customer_id, sku);
create index if not exists order_lines_product_idx on public.order_lines(product_id);
create index if not exists order_hazmat_assessments_idx on public.order_hazmat_assessments(tenant_id, order_id, assessed_at desc);
create index if not exists trip_hazmat_assessments_idx on public.trip_hazmat_assessments(tenant_id, trip_id, sequence);
create index if not exists entity_revisions_lookup_idx on public.entity_revisions(tenant_id, entity_type, business_id, revision_number desc);
create index if not exists audit_events_lookup_idx on public.audit_events(tenant_id, entity_type, entity_id, occurred_at desc);

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'party_adr_profiles','products','product_hazmat_assignments','order_line_hazmat',
    'order_hazmat_assessments','trip_hazmat_assessments','entity_revisions',
    'device_revision_dispatches','audit_events'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists tenant_isolation on public.%I', table_name);
    execute format(
      'create policy tenant_read on public.%I for select to authenticated using (public.fornexa_has_tenant_access(tenant_id))',
      table_name
    );
  end loop;
end $$;

-- Audit events are readable by tenant members but are written only by trusted
-- server-side code using the service role.
drop policy if exists tenant_isolation on public.audit_events;
drop policy if exists tenant_read on public.audit_events;
create policy audit_events_select on public.audit_events for select to authenticated
using (public.fornexa_has_tenant_access(tenant_id));

alter table public.hazmat_editions enable row level security;
alter table public.hazmat_entries enable row level security;
alter table public.hazmat_entry_synonyms enable row level security;
alter table public.hazmat_packaging_types enable row level security;
alter table public.hazmat_entry_packaging_options enable row level security;
alter table public.hazmat_transport_category_rules enable row level security;

create policy hazmat_editions_read on public.hazmat_editions for select to authenticated using (true);
create policy hazmat_entries_read on public.hazmat_entries for select to authenticated using (true);
create policy hazmat_synonyms_read on public.hazmat_entry_synonyms for select to authenticated
using (tenant_id is null or public.fornexa_has_tenant_access(tenant_id));
create policy hazmat_packaging_read on public.hazmat_packaging_types for select to authenticated using (true);
create policy hazmat_entry_packaging_read on public.hazmat_entry_packaging_options for select to authenticated using (true);
create policy hazmat_transport_rules_read on public.hazmat_transport_category_rules for select to authenticated using (true);

-- Data API exposure is explicit for new projects while RLS remains authoritative.
grant select on public.hazmat_editions, public.hazmat_entries, public.hazmat_entry_synonyms,
  public.hazmat_packaging_types, public.hazmat_entry_packaging_options,
  public.hazmat_transport_category_rules to authenticated;
grant select on public.party_adr_profiles, public.products,
  public.product_hazmat_assignments, public.order_line_hazmat,
  public.order_hazmat_assessments, public.trip_hazmat_assessments,
  public.entity_revisions, public.device_revision_dispatches to authenticated;
grant select on public.audit_events to authenticated;

insert into public.fornexa_schema_migrations (version, description)
values ('20260822224945_adr_classification_foundation', 'Maestro ADR versionado, artículos, revisiones y auditoría')
on conflict (version) do nothing;

comment on table public.hazmat_editions is 'Ediciones regulatorias ADR; se activan únicamente tras revisión administrativa.';
comment on table public.hazmat_entries is 'Entradas normalizadas de la Tabla A ADR. No admite edición por tenants.';
comment on table public.products is 'Maestro de artículos específico del tenant y opcionalmente del cliente.';
comment on table public.order_line_hazmat is 'Snapshot ADR inmutable respecto al maestro para cada línea de pedido.';
comment on table public.audit_events is 'Registro append-only de cambios en maestros y operaciones FORNEXA.';

commit;
