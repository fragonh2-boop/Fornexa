-- 20260817212235_cmr_canonical_model_rls_and_hardening
-- Materialised Git source for the Supabase ledger entry 20260817212235.
-- MUST-145G-2: this file is now atomic (single transaction) and re-executable
-- (every statement is idempotent), so a partial failure cannot leave half of the
-- policy set applied. Historical provenance of the applied content is preserved
-- in docs/verification/supabase-ledger-content-manifest-20261127.json
-- (ledger content: 3177 bytes, git-blob sha1 1c2012bc8ad5aeb81cbe5fe1682e0f92cd5c9447).

begin;

-- 1) Tenant-isolation RLS policies for the CMR canonical model tables.
-- These tables don't carry their own tenant_id; they hang off cmr_documents (which does)
-- via cmr_id, so the policy resolves the tenant through that relationship.

drop policy if exists tenant_isolation on public.cmr_attachments;
create policy tenant_isolation on public.cmr_attachments
  for all to authenticated
  using (exists (select 1 from public.cmr_documents d where d.id = cmr_attachments.cmr_id and public.fornexa_has_tenant_access(d.tenant_id)))
  with check (exists (select 1 from public.cmr_documents d where d.id = cmr_attachments.cmr_id and public.fornexa_has_tenant_access(d.tenant_id)));

drop policy if exists tenant_isolation on public.cmr_clauses;
create policy tenant_isolation on public.cmr_clauses
  for all to authenticated
  using (exists (select 1 from public.cmr_documents d where d.id = cmr_clauses.cmr_id and public.fornexa_has_tenant_access(d.tenant_id)))
  with check (exists (select 1 from public.cmr_documents d where d.id = cmr_clauses.cmr_id and public.fornexa_has_tenant_access(d.tenant_id)));

drop policy if exists tenant_isolation on public.cmr_expeditions;
create policy tenant_isolation on public.cmr_expeditions
  for all to authenticated
  using (exists (select 1 from public.cmr_documents d where d.id = cmr_expeditions.cmr_id and public.fornexa_has_tenant_access(d.tenant_id)))
  with check (exists (select 1 from public.cmr_documents d where d.id = cmr_expeditions.cmr_id and public.fornexa_has_tenant_access(d.tenant_id)));

drop policy if exists tenant_isolation on public.cmr_goods_lines;
create policy tenant_isolation on public.cmr_goods_lines
  for all to authenticated
  using (exists (select 1 from public.cmr_documents d where d.id = cmr_goods_lines.cmr_id and public.fornexa_has_tenant_access(d.tenant_id)))
  with check (exists (select 1 from public.cmr_documents d where d.id = cmr_goods_lines.cmr_id and public.fornexa_has_tenant_access(d.tenant_id)));

drop policy if exists tenant_isolation on public.cmr_parties;
create policy tenant_isolation on public.cmr_parties
  for all to authenticated
  using (exists (select 1 from public.cmr_documents d where d.id = cmr_parties.cmr_id and public.fornexa_has_tenant_access(d.tenant_id)))
  with check (exists (select 1 from public.cmr_documents d where d.id = cmr_parties.cmr_id and public.fornexa_has_tenant_access(d.tenant_id)));

drop policy if exists tenant_isolation on public.cmr_signatures;
create policy tenant_isolation on public.cmr_signatures
  for all to authenticated
  using (exists (select 1 from public.cmr_documents d where d.id = cmr_signatures.cmr_id and public.fornexa_has_tenant_access(d.tenant_id)))
  with check (exists (select 1 from public.cmr_documents d where d.id = cmr_signatures.cmr_id and public.fornexa_has_tenant_access(d.tenant_id)));

-- 2) fornexa_schema_migrations is public-exposed via PostgREST with RLS disabled (linter ERROR).
-- It's internal bookkeeping; nobody should read/write it through the API. Enabling RLS with
-- no policy locks it to service_role only, matching how every other internal table behaves.
alter table public.fornexa_schema_migrations enable row level security;

-- 3) fornexa_check_expedition_delivery_note_order has a mutable search_path (linter WARN).
-- Its body already schema-qualifies every reference (public.expeditions, public.delivery_notes),
-- so pinning search_path is safe and closes the function-hijacking vector.
alter function public.fornexa_check_expedition_delivery_note_order() set search_path = '';

commit;
