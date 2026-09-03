begin;

-- DeCA-1 foundation: keep cmr_documents as the canonical operational root while
-- separating immutable regulatory PDF artifacts from their temporary public URLs.

alter table public.cmr_documents
  add column if not exists document_kind text not null default 'cmr',
  add column if not exists regulatory_scope text;

alter table public.cmr_documents
  drop constraint if exists cmr_documents_document_kind_check,
  add constraint cmr_documents_document_kind_check
    check (document_kind in ('cmr', 'deca', 'ecmr', 'pod')),
  drop constraint if exists cmr_documents_regulatory_scope_check,
  add constraint cmr_documents_regulatory_scope_check
    check (
      regulatory_scope is null
      or regulatory_scope in ('deca_es', 'cmr_convention', 'ecmr_protocol', 'efti')
    ),
  drop constraint if exists cmr_documents_regulatory_kind_scope_check,
  add constraint cmr_documents_regulatory_kind_scope_check
    check (
      document_kind not in ('deca', 'ecmr')
      or regulatory_scope is not null
    );

comment on column public.cmr_documents.document_kind is
  'Controlled canonical document kind. Existing CMR rows default to cmr; regulatory artifacts may have their own kind.';
comment on column public.cmr_documents.regulatory_scope is
  'Controlled regulatory scope when the canonical document itself is emitted under a regulatory framework.';

create table if not exists public.regulatory_document_artifacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default '00000000-0000-4000-8000-000000000001'
    references public.tenants(id) on delete restrict,
  cmr_id uuid not null references public.cmr_documents(id) on delete restrict,
  document_kind text not null
    check (document_kind in ('cmr', 'deca', 'ecmr', 'pod')),
  regulatory_scope text not null
    check (regulatory_scope in ('deca_es', 'cmr_convention', 'ecmr_protocol', 'efti')),
  version integer not null check (version > 0),
  mime_type text not null default 'application/pdf'
    check (mime_type = 'application/pdf'),
  storage_path text not null,
  sha256 text not null check (sha256 ~ '^[0-9a-fA-F]{64}$'),
  byte_size bigint not null check (byte_size > 0 and byte_size <= 5242880),
  document_created_at timestamptz not null,
  document_modified_at timestamptz not null,
  issued_at timestamptz not null default now(),
  supersedes_artifact_id uuid references public.regulatory_document_artifacts(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (cmr_id, document_kind, regulatory_scope, version),
  check (document_modified_at >= document_created_at)
);

comment on table public.regulatory_document_artifacts is
  'Immutable issued regulatory PDF versions. Each correction creates a new version and may reference the artifact it supersedes.';

create table if not exists public.regulatory_document_access_tokens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default '00000000-0000-4000-8000-000000000001'
    references public.tenants(id) on delete restrict,
  artifact_id uuid not null references public.regulatory_document_artifacts(id) on delete restrict,
  token_hash text not null unique check (token_hash ~ '^[0-9a-fA-F]{64}$'),
  valid_from timestamptz not null default now(),
  service_completed_at timestamptz,
  public_until timestamptz,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (public_until is null or public_until >= valid_from),
  check (service_completed_at is null or public_until is null or public_until <= service_completed_at + interval '7 days')
);

comment on table public.regulatory_document_access_tokens is
  'Temporary public access credentials for regulatory artifacts. Token/URL lifecycle is independent from artifact retention.';

create index if not exists regulatory_document_artifacts_cmr_idx
  on public.regulatory_document_artifacts(cmr_id, document_kind, regulatory_scope, version desc);
create index if not exists regulatory_document_artifacts_tenant_idx
  on public.regulatory_document_artifacts(tenant_id, issued_at desc);
create index if not exists regulatory_document_access_tokens_artifact_idx
  on public.regulatory_document_access_tokens(artifact_id, valid_from desc);

alter table public.regulatory_document_artifacts enable row level security;
alter table public.regulatory_document_access_tokens enable row level security;

drop policy if exists regulatory_document_artifacts_tenant_select on public.regulatory_document_artifacts;
create policy regulatory_document_artifacts_tenant_select
  on public.regulatory_document_artifacts
  for select
  to authenticated
  using (public.fornexa_has_tenant_access(tenant_id));

-- Public URL resolution is server-side only. The token registry intentionally has
-- no anon/authenticated RLS policy and stores only token hashes, never raw tokens.
revoke all on table public.regulatory_document_artifacts from anon, authenticated, service_role;
grant select on table public.regulatory_document_artifacts to authenticated;
grant select, insert on table public.regulatory_document_artifacts to service_role;

revoke all on table public.regulatory_document_access_tokens from anon, authenticated, service_role;
grant select, insert, update on table public.regulatory_document_access_tokens to service_role;

-- Immutable artifact evidence: application roles cannot UPDATE/DELETE issued versions.
-- Corrections are represented by a new version with supersedes_artifact_id.

insert into public.fornexa_schema_migrations (version, description)
values (
  '20260903062500_deca_regulatory_document_foundation',
  'DeCA-1 controlled document kind/scope plus immutable regulatory artifacts and separate public-token lifecycle'
)
on conflict (version) do nothing;

commit;
