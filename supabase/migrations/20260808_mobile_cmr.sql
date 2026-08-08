create extension if not exists pgcrypto;

create sequence if not exists public.cmr_number_seq start with 1;

create or replace function public.next_cmr_number()
returns text
language sql
security definer
set search_path = ''
as $$
  select 'CMR-' || to_char(timezone('utc', now()), 'YY') || lpad(nextval('public.cmr_number_seq')::text, 6, '0');
$$;

revoke all on function public.next_cmr_number() from public, anon, authenticated;
grant execute on function public.next_cmr_number() to service_role;

create table if not exists public.cmr_documents (
  id uuid primary key default gen_random_uuid(),
  cmr_number text not null unique,
  access_key text not null unique,
  status text not null default 'Emitido' check (status in ('Borrador','Emitido','En tránsito','Entregado','Cerrado','Anulado')),
  source text not null default 'expedicion',
  expedition_id text,
  trip_id text,
  customer_ids text[] not null default '{}',
  sender text not null,
  recipient text not null,
  pickup_location text not null,
  delivery_location text not null,
  carrier text not null,
  vehicle_registration text,
  trailer_registration text,
  goods_description text not null,
  packages integer,
  packaging text,
  gross_weight numeric(14,3),
  volume numeric(14,3),
  instructions text,
  adr jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  issued_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transport_stops (
  id uuid primary key default gen_random_uuid(),
  cmr_id uuid not null references public.cmr_documents(id) on delete cascade,
  sequence integer not null,
  stop_type text not null check (stop_type in ('Recogida','Entrega')),
  company text not null,
  address text not null,
  window_start timestamptz,
  window_end timestamptz,
  contact_phone text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  status text not null default 'Pendiente' check (status in ('Pendiente','Llegada','Completada','Incidencia')),
  arrived_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (cmr_id, sequence)
);

create table if not exists public.transport_events (
  id uuid primary key default gen_random_uuid(),
  cmr_id uuid not null references public.cmr_documents(id) on delete cascade,
  stop_id uuid references public.transport_stops(id) on delete cascade,
  event_type text not null,
  occurred_at timestamptz not null default now(),
  latitude numeric(10,7),
  longitude numeric(10,7),
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.transport_evidence (
  id uuid primary key default gen_random_uuid(),
  cmr_id uuid not null references public.cmr_documents(id) on delete cascade,
  stop_id uuid not null references public.transport_stops(id) on delete cascade,
  event_id uuid references public.transport_events(id) on delete set null,
  kind text not null default 'pod_photo',
  storage_path text not null,
  captured_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists cmr_documents_status_idx on public.cmr_documents(status, issued_at desc);
create index if not exists transport_stops_cmr_idx on public.transport_stops(cmr_id, sequence);
create index if not exists transport_events_cmr_idx on public.transport_events(cmr_id, occurred_at desc);
create index if not exists transport_evidence_stop_idx on public.transport_evidence(stop_id, captured_at desc);

alter table public.cmr_documents enable row level security;
alter table public.transport_stops enable row level security;
alter table public.transport_events enable row level security;
alter table public.transport_evidence enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('transport-evidence', 'transport-evidence', false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

comment on table public.cmr_documents is 'CMR definitivos compartidos por FORNEXA web y Driver.';
comment on table public.transport_events is 'Histórico inmutable de emisión, llegada, POD, firma e incidencias.';
