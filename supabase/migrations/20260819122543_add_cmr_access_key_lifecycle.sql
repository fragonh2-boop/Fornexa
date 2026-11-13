alter table public.cmr_documents
  add column if not exists access_key_expires_at timestamptz null,
  add column if not exists access_key_revoked_at timestamptz null;

comment on column public.cmr_documents.access_key_expires_at is
  'Optional expiry timestamp for capability-based shared CMR access. NULL means no automatic expiry.';

comment on column public.cmr_documents.access_key_revoked_at is
  'Revocation timestamp for shared CMR access. Non-NULL disables the access key immediately.';

create index if not exists idx_cmr_documents_access_key_active
  on public.cmr_documents (access_key)
  where access_key_revoked_at is null;
