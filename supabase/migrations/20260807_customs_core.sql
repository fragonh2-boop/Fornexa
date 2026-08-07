create table if not exists customs_cases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
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

create table if not exists customs_messages (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references customs_cases(id) on delete cascade,
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

create table if not exists customs_events (
  id bigint generated always as identity primary key,
  case_id uuid not null references customs_cases(id) on delete cascade,
  event_type text not null,
  actor_id uuid,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists customs_cases_mrn_idx on customs_cases(mrn);
create index if not exists customs_messages_queue_idx on customs_messages(status, created_at);
alter table customs_cases enable row level security;
alter table customs_messages enable row level security;
alter table customs_events enable row level security;
