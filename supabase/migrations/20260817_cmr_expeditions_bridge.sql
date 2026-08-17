-- CMR es proyeccion documental: 1 CMR puede representar N expedientes,
-- y un expediente puede tener distintos documentos en distintos tramos.
create table if not exists public.cmr_expeditions (
  cmr_id uuid not null references public.cmr_documents(id) on delete cascade,
  expedition_id uuid not null references public.expeditions(id) on delete restrict,
  sequence integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (cmr_id, expedition_id),
  unique (cmr_id, sequence)
);

create index if not exists cmr_expeditions_expedition_idx on public.cmr_expeditions(expedition_id);

alter table public.cmr_expeditions enable row level security;

comment on table public.cmr_expeditions is
  'Proyeccion documental CMR <-> Expediente (N:M). cmr_documents.expedition_record_id se mantiene como referencia legacy 1:1.';

comment on column public.cmr_documents.expedition_record_id is
  'DEPRECATED/legacy: referencia simple 1:1. Usar la tabla puente cmr_expeditions para la relacion N:M real.';

insert into public.fornexa_schema_migrations (version, description)
values ('20260817_cmr_expeditions_bridge', 'cmr_expeditions N:M bridge, deprecates single expedition_record_id for new development')
on conflict (version) do nothing;
