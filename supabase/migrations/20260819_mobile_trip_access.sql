create table if not exists public.mobile_trip_access (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  trip_id uuid not null references public.trips(id) on delete cascade,
  driver_id uuid references public.drivers(id) on delete set null,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  check (expires_at > created_at)
);

create index if not exists mobile_trip_access_trip_idx
  on public.mobile_trip_access (tenant_id, trip_id, expires_at desc);

create index if not exists mobile_trip_access_driver_idx
  on public.mobile_trip_access (tenant_id, driver_id, expires_at desc)
  where driver_id is not null;

alter table public.mobile_trip_access enable row level security;

comment on table public.mobile_trip_access is
  'Server-only capability tokens granting FORNEXA Mobile access to one canonical trip. Tokens are stored only as SHA-256 hashes and can expire or be revoked.';
comment on column public.mobile_trip_access.token_hash is
  'SHA-256 hash of the bearer token. The plaintext token must never be persisted.';
