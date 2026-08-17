-- FORNEXA canonical CMR model
create table if not exists public.cmr_parties (
  id uuid primary key default gen_random_uuid(),
  cmr_id uuid not null references public.cmr_documents(id) on delete cascade,
  role text not null check (role in ('sender','consignee','carrier','successive_carrier')),
  sequence integer not null default 1,
  customer_id text,
  legal_name text not null,
  tax_id text,
  address text,
  postal_code text,
  city text,
  country_code text,
  contact_name text,
  contact_phone text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (cmr_id, role, sequence)
);

create table if not exists public.cmr_goods_lines (
  id uuid primary key default gen_random_uuid(),
  cmr_id uuid not null references public.cmr_documents(id) on delete cascade,
  sequence integer not null,
  marks_numbers text,
  packages integer,
  packaging_code text,
  packaging_description text,
  goods_description text not null,
  statistical_number text,
  gross_weight numeric(14,3),
  volume numeric(14,3),
  adr_declared boolean not null default false,
  un_number text,
  adr_class text,
  labels text,
  packing_group text,
  tunnel_code text,
  adr_description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (cmr_id, sequence)
);

create table if not exists public.cmr_attachments (
  id uuid primary key default gen_random_uuid(),
  cmr_id uuid not null references public.cmr_documents(id) on delete cascade,
  sequence integer not null default 1,
  document_type text not null,
  title text not null,
  storage_path text,
  external_reference text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (cmr_id, sequence)
);

create table if not exists public.cmr_clauses (
  id uuid primary key default gen_random_uuid(),
  cmr_id uuid not null references public.cmr_documents(id) on delete cascade,
  clause_type text not null check (clause_type in ('sender_instruction','carrier_reservation','particular_term','payment_instruction')),
  sequence integer not null default 1,
  text_value text not null,
  source text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (cmr_id, clause_type, sequence)
);

create table if not exists public.cmr_signatures (
  id uuid primary key default gen_random_uuid(),
  cmr_id uuid not null references public.cmr_documents(id) on delete cascade,
  stop_id uuid references public.transport_stops(id) on delete set null,
  role text not null check (role in ('sender','carrier','consignee')),
  signer_name text,
  signer_document text,
  company_name text,
  signature_storage_path text,
  stamp_storage_path text,
  signature_method text not null default 'electronic',
  signed_at timestamptz not null default now(),
  latitude numeric(10,7),
  longitude numeric(10,7),
  device_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.cmr_documents
  add column if not exists external_document_number text,
  add column if not exists sender_instructions text,
  add column if not exists carrier_reservations text,
  add column if not exists particular_terms text,
  add column if not exists carriage_charges jsonb not null default '{}'::jsonb,
  add column if not exists cash_on_delivery jsonb not null default '{}'::jsonb,
  add column if not exists established_at text,
  add column if not exists established_on date;

create index if not exists cmr_parties_cmr_role_idx on public.cmr_parties(cmr_id, role, sequence);
create index if not exists cmr_goods_lines_cmr_idx on public.cmr_goods_lines(cmr_id, sequence);
create index if not exists cmr_attachments_cmr_idx on public.cmr_attachments(cmr_id, sequence);
create index if not exists cmr_clauses_cmr_type_idx on public.cmr_clauses(cmr_id, clause_type, sequence);
create index if not exists cmr_signatures_cmr_role_idx on public.cmr_signatures(cmr_id, role, signed_at desc);

alter table public.cmr_parties enable row level security;
alter table public.cmr_goods_lines enable row level security;
alter table public.cmr_attachments enable row level security;
alter table public.cmr_clauses enable row level security;
alter table public.cmr_signatures enable row level security;

comment on table public.cmr_goods_lines is 'Structured CMR boxes 6-12, including ADR details per goods line.';
comment on table public.cmr_parties is 'Structured CMR parties: sender, consignee, contractual carrier and successive carriers.';
comment on table public.cmr_clauses is 'CMR boxes 13, 18, 19 and payment instructions without conflating their semantics.';
comment on table public.cmr_signatures is 'CMR signatures 22-24 with signer, timestamp, position and evidence metadata.';

insert into public.fornexa_schema_migrations (version, description)
values ('20260814_cmr_canonical_model', 'cmr_parties, cmr_goods_lines, cmr_attachments, cmr_clauses, cmr_signatures')
on conflict (version) do nothing;
