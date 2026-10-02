begin;

-- ============================================================================
-- 1. MULTI-COMPANY / MULTI-SOCIETY (ORG & ROL)
-- ============================================================================

-- Legal entities under tenant (ORG)
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  company_code text not null,
  legal_name text not null,
  trade_name text,
  tax_id text not null,
  country_code char(2) not null default 'ES',
  functional_currency char(3) not null default 'EUR',
  fiscal_address_id uuid references public.party_addresses(id) on delete set null,
  timezone text not null default 'Europe/Madrid',
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE', 'SUSPENDED')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, company_code)
);

-- Enrich parties with international and corporate hierarchy attributes (PTY)
alter table public.parties
  add column if not exists gln varchar(13),
  add column if not exists eori varchar(17),
  add column if not exists parent_party_id uuid references public.parties(id) on delete set null,
  add column if not exists tax_id_type text default 'NIF_IVA' check (tax_id_type in ('NIF_IVA', 'PASSPORT', 'VAT_EU', 'LOCAL_TAX_ID', 'OTHER'));

-- Normalized party roles per company with validity periods (ROL)
create table if not exists public.party_roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  party_id uuid not null references public.parties(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  role_code text not null check (role_code in ('CUSTOMER', 'CARRIER', 'SUPPLIER', 'SHIPPER', 'CONSIGNEE', 'LOGISTICS_OPERATOR', 'FORWARDER', 'CUSTOMS_BROKER')),
  valid_from date not null default current_date,
  valid_to date,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'BLOCKED', 'PENDING_REVIEW', 'EXPIRED')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (tenant_id, party_id, company_id, role_code)
);

-- ============================================================================
-- 2. CARRIER COMPLIANCE & ONBOARDING (CAR)
-- ============================================================================

-- Carrier qualification, policy coverage and transport licenses
create table if not exists public.carrier_profiles (
  party_id uuid primary key references public.parties(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  carrier_code text not null,
  transport_licence_number text,
  insurance_policy_number text,
  insurance_carrier_name text,
  insurance_coverage_amount numeric(14,2) check (insurance_coverage_amount is null or insurance_coverage_amount >= 0),
  insurance_expiry_date date,
  adr_certified boolean not null default false,
  qualification_status text not null default 'PENDING_REVIEW' check (qualification_status in ('APPROVED', 'PROVISIONAL', 'SUSPENDED', 'EXPIRED', 'PENDING_REVIEW')),
  qualification_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, carrier_code)
);

-- ============================================================================
-- 3. PRODUCT MASTER CATALOG, PACKAGING & UOM (PRD, PACK, UOM)
-- ============================================================================

-- Units of measure definitions (UOM)
create table if not exists public.uom_definitions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  code text not null,
  name text not null,
  category text not null check (category in ('QUANTITY', 'WEIGHT', 'VOLUME', 'LENGTH', 'TIME', 'TEMPERATURE', 'AREA')),
  iso_code text,
  is_base_unit boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

-- Conversions between units of measure (UOM)
create table if not exists public.uom_conversions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  from_uom_id uuid not null references public.uom_definitions(id) on delete cascade,
  to_uom_id uuid not null references public.uom_definitions(id) on delete cascade,
  factor numeric(18,8) not null check (factor > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, from_uom_id, to_uom_id)
);

-- Evolve products table with full master catalog fields (PRD)
alter table public.products
  add column if not exists owner_party_id uuid references public.parties(id) on delete restrict,
  add column if not exists description text,
  add column if not exists category_code text,
  add column if not exists gtin varchar(14),
  add column if not exists hs_code varchar(12),
  add column if not exists uom_base text not null default 'UN',
  add column if not exists net_weight_kg numeric(10,3) check (net_weight_kg is null or net_weight_kg >= 0),
  add column if not exists gross_weight_kg numeric(10,3) check (gross_weight_kg is null or gross_weight_kg >= 0),
  add column if not exists length_cm numeric(8,2) check (length_cm is null or length_cm >= 0),
  add column if not exists width_cm numeric(8,2) check (width_cm is null or width_cm >= 0),
  add column if not exists height_cm numeric(8,2) check (height_cm is null or height_cm >= 0),
  add column if not exists volume_m3 numeric(10,4) check (volume_m3 is null or volume_m3 >= 0),
  add column if not exists is_hazardous boolean not null default false,
  add column if not exists is_temperature_controlled boolean not null default false,
  add column if not exists temp_min_c numeric(4,1),
  add column if not exists temp_max_c numeric(4,1),
  add column if not exists shelf_life_days integer check (shelf_life_days is null or shelf_life_days >= 0),
  add column if not exists is_batch_managed boolean not null default false,
  add column if not exists is_serial_managed boolean not null default false;

-- Backfill owner and description from existing customer_id and name if present
update public.products
set owner_party_id = customer_id
where owner_party_id is null and customer_id is not null;

update public.products
set description = name
where description is null and name is not null;

-- Packaging hierarchy and palletization parameters (PACK)
create table if not exists public.product_packagings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete cascade,
  pack_code text not null,
  pack_type text not null check (pack_type in ('UNIT', 'INNER_BOX', 'MASTER_CARTON', 'PALLET', 'TOTE', 'CONTAINER')),
  barcode text,
  units_per_pack numeric(10,2) not null check (units_per_pack > 0),
  parent_pack_id uuid references public.product_packagings(id) on delete set null,
  gross_weight_kg numeric(10,3) check (gross_weight_kg is null or gross_weight_kg >= 0),
  length_cm numeric(8,2) check (length_cm is null or length_cm >= 0),
  width_cm numeric(8,2) check (width_cm is null or width_cm >= 0),
  height_cm numeric(8,2) check (height_cm is null or height_cm >= 0),
  volume_m3 numeric(10,4) check (volume_m3 is null or volume_m3 >= 0),
  ti_boxes_per_layer integer check (ti_boxes_per_layer is null or ti_boxes_per_layer > 0),
  hi_layers integer check (hi_layers is null or hi_layers > 0),
  is_stackable boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, product_id, pack_code)
);

-- Ensure order lines linkage with master product catalog
alter table public.order_lines
  add column if not exists product_id uuid references public.products(id) on delete restrict;

-- ============================================================================
-- 4. WMS PHYSICAL & LOGICAL STRUCTURE (ZONES, BINS, INVENTORY & MOVEMENTS)
-- ============================================================================

-- Warehouse physical zones
create table if not exists public.warehouse_zones (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  zone_code text not null,
  zone_name text not null,
  zone_type text not null default 'STORAGE' check (zone_type in ('RECEIVING', 'STORAGE', 'PICKING', 'STAGING', 'SHIPPING', 'QUARANTINE', 'RETURNS', 'CROSS_DOCK')),
  temperature_regime text not null default 'AMBIENT' check (temperature_regime in ('AMBIENT', 'CHILLED', 'FROZEN', 'CONTROLLED')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (warehouse_id, zone_code)
);

-- Physical warehouse bin locations
create table if not exists public.warehouse_bins (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  zone_id uuid references public.warehouse_zones(id) on delete set null,
  bin_code text not null,
  aisle text,
  rack text,
  shelf text,
  bin_position text,
  bin_type text not null default 'PALLET_RACK' check (bin_type in ('PALLET_RACK', 'SHELVING', 'BULK_FLOOR', 'CANTILEVER', 'DOCK_STAGE', 'CROSS_DOCK', 'DYNAMIC_FLOW')),
  max_weight_kg numeric(10,2) check (max_weight_kg is null or max_weight_kg > 0),
  max_volume_m3 numeric(10,4) check (max_volume_m3 is null or max_volume_m3 > 0),
  max_pallets integer not null default 1 check (max_pallets >= 0),
  is_blocked boolean not null default false,
  block_reason text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (warehouse_id, bin_code)
);

-- Physical inventory stock on hand per bin, product, batch and status
create table if not exists public.inventory_quants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  bin_id uuid not null references public.warehouse_bins(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  owner_party_id uuid references public.parties(id) on delete restrict,
  batch_number text,
  serial_number text,
  expiry_date date,
  quantity_on_hand numeric(12,3) not null default 0 check (quantity_on_hand >= 0),
  quantity_reserved numeric(12,3) not null default 0 check (quantity_reserved >= 0 and quantity_reserved <= quantity_on_hand),
  uom text not null default 'UN',
  stock_status text not null default 'AVAILABLE' check (stock_status in ('AVAILABLE', 'RESERVED', 'INSPECTION', 'QUARANTINE', 'DAMAGED', 'BLOCKED')),
  last_counted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (bin_id, product_id, owner_party_id, batch_number, serial_number, stock_status)
);

-- Sequence for internal warehouse movements
create sequence if not exists public.inventory_movement_code_seq start with 1;

-- Logical material movements inside the warehouse with hourly and duration traceability
create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  movement_number text not null default public.fornexa_next_code('MOV', 'public.inventory_movement_code_seq'),
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  movement_type text not null check (movement_type in ('RECEIPT', 'PUTAWAY', 'INTERNAL_TRANSFER', 'REPLENISHMENT', 'PICKING', 'PACKING', 'SHIPMENT', 'COUNT_ADJUSTMENT', 'QUARANTINE_RELOCATION')),
  product_id uuid not null references public.products(id) on delete restrict,
  source_bin_id uuid references public.warehouse_bins(id) on delete restrict,
  destination_bin_id uuid references public.warehouse_bins(id) on delete restrict,
  quantity numeric(12,3) not null check (quantity > 0),
  uom text not null default 'UN',
  owner_party_id uuid references public.parties(id) on delete restrict,
  batch_number text,
  serial_number text,
  reference_order_id uuid references public.orders(id) on delete set null,
  reference_delivery_note_id uuid references public.delivery_notes(id) on delete set null,
  operator_id text,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  status text not null default 'COMPLETED' check (status in ('PLANNED', 'REQUESTED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, movement_number)
);

-- Automatically compute movement duration if timestamps provided
create or replace function public.fornexa_calc_movement_duration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.completed_at is not null and new.started_at is not null and new.duration_seconds is null then
    new.duration_seconds := greatest(0, round(extract(epoch from (new.completed_at - new.started_at))))::integer;
  end if;
  return new;
end;
$$;

drop trigger if exists inventory_movements_calc_duration on public.inventory_movements;
create trigger inventory_movements_calc_duration
  before insert or update on public.inventory_movements
  for each row execute function public.fornexa_calc_movement_duration();

-- ============================================================================
-- 5. EXTERNAL IDENTIFIERS & INTEGRATION MAPPINGS (INT)
-- ============================================================================

-- Cross-reference with external systems (SAP, Business Central, Oracle OTM, WMS)
create table if not exists public.external_identifiers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  system_code text not null,
  entity_type text not null check (entity_type in ('PARTY', 'PRODUCT', 'ADDRESS', 'TARIFF', 'SERVICE', 'WAREHOUSE', 'BIN', 'ORDER', 'CARRIER')),
  canonical_id uuid not null,
  external_id text not null,
  company_scope text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, system_code, entity_type, external_id)
);

-- ============================================================================
-- 6. INDEXES FOR PERFORMANCE
-- ============================================================================

create index if not exists companies_tenant_status_idx on public.companies(tenant_id, status);
create index if not exists party_roles_party_idx on public.party_roles(party_id, status);
create index if not exists party_roles_company_role_idx on public.party_roles(company_id, role_code);
create index if not exists carrier_profiles_tenant_status_idx on public.carrier_profiles(tenant_id, qualification_status);
create index if not exists carrier_profiles_expiry_idx on public.carrier_profiles(insurance_expiry_date);
create index if not exists uom_definitions_tenant_cat_idx on public.uom_definitions(tenant_id, category);
create index if not exists products_tenant_sku_idx on public.products(tenant_id, sku);
create index if not exists products_owner_idx on public.products(owner_party_id, status);
create index if not exists products_gtin_idx on public.products(tenant_id, gtin);
create index if not exists product_packagings_product_idx on public.product_packagings(product_id, is_active);
create index if not exists warehouse_zones_warehouse_idx on public.warehouse_zones(warehouse_id, is_active);
create index if not exists warehouse_bins_warehouse_zone_idx on public.warehouse_bins(warehouse_id, zone_id, is_active);
create index if not exists warehouse_bins_code_idx on public.warehouse_bins(warehouse_id, bin_code);
create index if not exists inventory_quants_bin_prod_idx on public.inventory_quants(bin_id, product_id, stock_status);
create index if not exists inventory_quants_warehouse_prod_idx on public.inventory_quants(warehouse_id, product_id);
create index if not exists inventory_quants_owner_idx on public.inventory_quants(owner_party_id);
create index if not exists inventory_movements_warehouse_type_idx on public.inventory_movements(warehouse_id, movement_type, status);
create index if not exists inventory_movements_product_idx on public.inventory_movements(product_id, created_at desc);
create index if not exists inventory_movements_hourly_idx on public.inventory_movements(requested_at, started_at, completed_at);
create index if not exists inventory_movements_order_ref_idx on public.inventory_movements(reference_order_id);
create index if not exists external_identifiers_lookup_idx on public.external_identifiers(tenant_id, system_code, entity_type, external_id);
create index if not exists external_identifiers_canonical_idx on public.external_identifiers(tenant_id, canonical_id);

-- ============================================================================
-- 7. UPDATED_AT TRIGGERS
-- ============================================================================

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'companies','party_roles','carrier_profiles','uom_definitions','uom_conversions',
    'product_packagings','warehouse_zones','warehouse_bins','inventory_quants',
    'inventory_movements','external_identifiers'
  ] loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_set_updated_at', table_name);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.fornexa_set_updated_at()',
      table_name || '_set_updated_at', table_name
    );
  end loop;
end $$;

-- ============================================================================
-- 8. ROW-LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'companies','party_roles','carrier_profiles','uom_definitions','uom_conversions',
    'product_packagings','warehouse_zones','warehouse_bins','inventory_quants',
    'inventory_movements','external_identifiers'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists tenant_isolation on public.%I', table_name);
    execute format(
      'create policy tenant_isolation on public.%I for all to authenticated using (public.fornexa_has_tenant_access(tenant_id)) with check (public.fornexa_has_tenant_access(tenant_id))',
      table_name
    );
  end loop;
end $$;

-- ============================================================================
-- 9. PILOT TENANT SEED DATA
-- ============================================================================

-- Default company for pilot tenant
insert into public.companies (
  tenant_id, company_code, legal_name, tax_id, country_code, functional_currency, timezone, status
)
values (
  '00000000-0000-4000-8000-000000000001',
  'FORNEXA-LOG',
  'FORNEXA LOGISTICS S.L.',
  'B88888888',
  'ES',
  'EUR',
  'Europe/Madrid',
  'ACTIVE'
)
on conflict (tenant_id, company_code) do nothing;

-- Default units of measure (UOM)
insert into public.uom_definitions (tenant_id, code, name, category, is_base_unit)
values
  ('00000000-0000-4000-8000-000000000001', 'UN', 'Unidad', 'QUANTITY', true),
  ('00000000-0000-4000-8000-000000000001', 'BOX', 'Caja', 'QUANTITY', false),
  ('00000000-0000-4000-8000-000000000001', 'PAL', 'Palé EUR', 'QUANTITY', false),
  ('00000000-0000-4000-8000-000000000001', 'KG', 'Kilogramo', 'WEIGHT', true),
  ('00000000-0000-4000-8000-000000000001', 'G', 'Gramo', 'WEIGHT', false),
  ('00000000-0000-4000-8000-000000000001', 'TON', 'Tonelada', 'WEIGHT', false),
  ('00000000-0000-4000-8000-000000000001', 'M3', 'Metro cúbico', 'VOLUME', true),
  ('00000000-0000-4000-8000-000000000001', 'L', 'Litro', 'VOLUME', false),
  ('00000000-0000-4000-8000-000000000001', 'M', 'Metro', 'LENGTH', true),
  ('00000000-0000-4000-8000-000000000001', 'LDM', 'Metro lineal de carga', 'LENGTH', false)
on conflict (tenant_id, code) do nothing;

-- Conversions for default units
insert into public.uom_conversions (tenant_id, from_uom_id, to_uom_id, factor)
select
  '00000000-0000-4000-8000-000000000001',
  u1.id,
  u2.id,
  c.factor
from (
  values
    ('G', 'KG', 0.00100000),
    ('KG', 'G', 1000.00000000),
    ('TON', 'KG', 1000.00000000),
    ('KG', 'TON', 0.00100000),
    ('L', 'M3', 0.00100000),
    ('M3', 'L', 1000.00000000)
) as c(from_code, to_code, factor)
join public.uom_definitions u1 on u1.tenant_id = '00000000-0000-4000-8000-000000000001' and u1.code = c.from_code
join public.uom_definitions u2 on u2.tenant_id = '00000000-0000-4000-8000-000000000001' and u2.code = c.to_code
on conflict (tenant_id, from_uom_id, to_uom_id) do nothing;

-- ============================================================================
-- 10. MIGRATION LEDGER ENTRY
-- ============================================================================

insert into public.fornexa_schema_migrations (version, description)
values (
  '20261002233000_master_data_foundation',
  'Catálogo de datos maestros, homologación de transportistas, sociedades y estructura WMS con trazabilidad horaria'
)
on conflict (version) do nothing;

commit;
