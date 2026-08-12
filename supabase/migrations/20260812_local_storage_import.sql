begin;

-- Preserve every business value found in legacy browser storage before it is
-- projected into the normalized FORNEXA operational model.
create table if not exists public.local_storage_imports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.tenants(id) on delete restrict,
  source_origin text not null,
  storage_key text not null,
  item_key text not null,
  content_hash text not null,
  payload jsonb not null,
  normalized_entity_type text,
  normalized_entity_id uuid,
  first_seen_at timestamptz not null default now(),
  last_synced_at timestamptz not null default now(),
  unique (tenant_id, source_origin, storage_key, item_key)
);

create table if not exists public.local_storage_sync_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default '00000000-0000-4000-8000-000000000001' references public.tenants(id) on delete restrict,
  source_origin text not null,
  status text not null default 'RUNNING' check (status in ('RUNNING','COMPLETED','FAILED')),
  storage_keys integer not null default 0,
  source_items integer not null default 0,
  normalized_records integer not null default 0,
  summary jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

-- The former NULLS NOT DISTINCT constraint allowed only one party without a
-- tax number per tenant/country. Pilot imports legitimately contain several
-- incomplete masters, so uniqueness applies only when a tax number exists.
alter table public.parties
  drop constraint if exists parties_tenant_id_country_code_tax_id_key;

create unique index if not exists parties_tenant_country_tax_unique
  on public.parties(tenant_id, country_code, tax_id)
  where tax_id is not null and btrim(tax_id) <> '';

create index if not exists local_storage_imports_key_idx
  on public.local_storage_imports(tenant_id, storage_key, last_synced_at desc);

create index if not exists local_storage_sync_runs_started_idx
  on public.local_storage_sync_runs(tenant_id, started_at desc);

alter table public.local_storage_imports enable row level security;
alter table public.local_storage_sync_runs enable row level security;

drop policy if exists tenant_isolation on public.local_storage_imports;
create policy tenant_isolation on public.local_storage_imports
  for all to authenticated
  using (public.fornexa_has_tenant_access(tenant_id))
  with check (public.fornexa_has_tenant_access(tenant_id));

drop policy if exists tenant_isolation on public.local_storage_sync_runs;
create policy tenant_isolation on public.local_storage_sync_runs
  for all to authenticated
  using (public.fornexa_has_tenant_access(tenant_id))
  with check (public.fornexa_has_tenant_access(tenant_id));

insert into public.fornexa_schema_migrations(version, description)
values ('20260812_local_storage_import', 'Archivo y normalización idempotente de datos heredados de localStorage')
on conflict (version) do nothing;

commit;
