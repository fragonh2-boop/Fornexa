begin;

-- P0-B: issue a native DeCA artifact and its public capability in one database
-- transaction. Storage upload happens first; the application removes the object
-- if this RPC rolls back. The function remains SECURITY INVOKER and is callable
-- only by service_role.
create or replace function public.fornexa_issue_deca_native_artifact(
  p_tenant_id uuid,
  p_cmr_id uuid,
  p_version integer,
  p_storage_path text,
  p_sha256 text,
  p_byte_size bigint,
  p_document_created_at timestamptz,
  p_document_modified_at timestamptz,
  p_supersedes_artifact_id uuid,
  p_metadata jsonb,
  p_token_hash text,
  p_valid_from timestamptz,
  p_service_completed_at timestamptz,
  p_public_until timestamptz
)
returns table (
  artifact_id uuid,
  access_id uuid,
  artifact_issued_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_artifact_id uuid;
  v_access_id uuid;
  v_issued_at timestamptz;
begin
  if not exists (
    select 1
    from public.cmr_documents
    where id = p_cmr_id
      and tenant_id = p_tenant_id
  ) then
    raise exception 'CMR tenant mismatch' using errcode = '23503';
  end if;

  if p_supersedes_artifact_id is not null and not exists (
    select 1
    from public.regulatory_document_artifacts
    where id = p_supersedes_artifact_id
      and tenant_id = p_tenant_id
      and cmr_id = p_cmr_id
      and document_kind = 'deca'
      and regulatory_scope = 'deca_es'
  ) then
    raise exception 'Superseded artifact mismatch' using errcode = '23503';
  end if;

  insert into public.regulatory_document_artifacts (
    tenant_id,
    cmr_id,
    document_kind,
    regulatory_scope,
    version,
    mime_type,
    storage_path,
    sha256,
    byte_size,
    document_created_at,
    document_modified_at,
    supersedes_artifact_id,
    metadata
  ) values (
    p_tenant_id,
    p_cmr_id,
    'deca',
    'deca_es',
    p_version,
    'application/pdf',
    p_storage_path,
    p_sha256,
    p_byte_size,
    p_document_created_at,
    p_document_modified_at,
    p_supersedes_artifact_id,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id, issued_at into v_artifact_id, v_issued_at;

  insert into public.regulatory_document_access_tokens (
    tenant_id,
    artifact_id,
    token_hash,
    valid_from,
    service_completed_at,
    public_until
  ) values (
    p_tenant_id,
    v_artifact_id,
    p_token_hash,
    p_valid_from,
    p_service_completed_at,
    p_public_until
  )
  returning id into v_access_id;

  return query select v_artifact_id, v_access_id, v_issued_at;
end;
$$;

revoke all on function public.fornexa_issue_deca_native_artifact(
  uuid, uuid, integer, text, text, bigint, timestamptz, timestamptz,
  uuid, jsonb, text, timestamptz, timestamptz, timestamptz
) from public, anon, authenticated;
grant execute on function public.fornexa_issue_deca_native_artifact(
  uuid, uuid, integer, text, text, bigint, timestamptz, timestamptz,
  uuid, jsonb, text, timestamptz, timestamptz, timestamptz
) to service_role;

comment on function public.fornexa_issue_deca_native_artifact(
  uuid, uuid, integer, text, text, bigint, timestamptz, timestamptz,
  uuid, jsonb, text, timestamptz, timestamptz, timestamptz
) is 'Atomically records one immutable native DeCA PDF version and its hashed public capability. SECURITY INVOKER; service_role only.';

insert into public.fornexa_schema_migrations (version, description)
values (
  '20260907175000_deca_native_atomic_issuance',
  'P0-B atomic native DeCA artifact plus public capability issuance'
)
on conflict (version) do nothing;

commit;
