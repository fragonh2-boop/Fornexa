-- FORNEXA operational cardinality model
-- Commercial demand -> delivery notes -> shipment files -> physical trip legs -> transport documents.
-- A shipment file is the persistent operational identity. A trip is a physical execution leg.

create table if not exists public.transport_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_id text,
  customer_reference text,
  status text not null default 'Abierto',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.delivery_notes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.transport_orders(id) on delete restrict,
  delivery_note_number text not null,
  customer_reference text,
  status text not null default 'Pendiente',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(order_id, delivery_note_number)
);

create table if not exists public.shipment_files (
  id uuid primary key default gen_random_uuid(),
  file_number text not null unique,
  delivery_note_id uuid not null unique references public.delivery_notes(id) on delete restrict,
  status text not null default 'Abierto',
  origin_text text,
  destination_text text,
  service text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transport_trips (
  id uuid primary key default gen_random_uuid(),
  trip_number text not null unique,
  status text not null default 'Planificado',
  carrier_id text,
  tractor_registration text,
  trailer_registration text,
  origin_text text,
  destination_text text,
  planned_departure timestamptz,
  planned_arrival timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- N:M deliberately models one file travelling over several legs and one trip carrying several files.
create table if not exists public.shipment_file_trips (
  shipment_file_id uuid not null references public.shipment_files(id) on delete cascade,
  trip_id uuid not null references public.transport_trips(id) on delete cascade,
  sequence integer not null default 1,
  status text not null default 'Planificado',
  loaded_at timestamptz,
  unloaded_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key(shipment_file_id, trip_id),
  unique(shipment_file_id, sequence)
);

-- CMR / carta de porte is a documentary projection of one or more shipment files.
-- N:M also permits the same file to have distinct transport documents over different legs.
create table if not exists public.cmr_shipment_files (
  cmr_id uuid not null references public.cmr_documents(id) on delete cascade,
  shipment_file_id uuid not null references public.shipment_files(id) on delete restrict,
  sequence integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key(cmr_id, shipment_file_id),
  unique(cmr_id, sequence)
);

create index if not exists delivery_notes_order_idx on public.delivery_notes(order_id, created_at);
create index if not exists shipment_files_delivery_note_idx on public.shipment_files(delivery_note_id);
create index if not exists shipment_file_trips_trip_idx on public.shipment_file_trips(trip_id, sequence);
create index if not exists cmr_shipment_files_file_idx on public.cmr_shipment_files(shipment_file_id);

alter table public.transport_orders enable row level security;
alter table public.delivery_notes enable row level security;
alter table public.shipment_files enable row level security;
alter table public.transport_trips enable row level security;
alter table public.shipment_file_trips enable row level security;
alter table public.cmr_shipment_files enable row level security;

comment on table public.delivery_notes is 'One order can contain N delivery notes; each delivery note has exactly one shipment file.';
comment on table public.shipment_files is 'Persistent operational transport identity, one-to-one with a delivery note.';
comment on table public.shipment_file_trips is 'Ordered physical trip legs for a shipment file; trips can consolidate many shipment files.';
comment on table public.cmr_shipment_files is 'Transport-document projection: one CMR can represent one or many shipment files.';
