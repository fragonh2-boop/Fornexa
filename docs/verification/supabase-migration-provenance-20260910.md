# Supabase migration provenance — 2026-09-10

## Scope

Read-only reconciliation of the migration files on FORNEXA `main` against the migration history reported by Supabase production. No migration was applied, repaired, reverted or rerun; no development/Preview branch was created; no production schema/data was mutated.

Production project: `gqkjqhpmyejmehbuombk`.
Repository baseline inspected: `a78a8fc01f23ef8cb583fda15df13d68c713cd28`.

## Live branch state

Supabase reports only the Git-linked default branch `main`. Its database project is `ACTIVE_HEALTHY`, while the branch integration status is `MIGRATIONS_FAILED`. This separates the deployment/provenance problem from production database health.

Current Supabase documentation states that local migration files are compared with `supabase_migrations.schema_migrations` by migration timestamp/version. The repository therefore must not retain duplicate or historically different active version prefixes if the remote history uses other versions.

## Summary of drift

- Active repository SQL migration files: **34**.
- Standard Supabase production history rows: **33**.
- Exact version + logical-name matches: **3**.
- Logical matches with a different version/timestamp: **29**.
  - 28 retain the same logical name.
  - `cmr_access_key_lifecycle` corresponds to remote `add_cmr_access_key_lifecycle` and also has a different version.
- Remote-only standard migration: **1** — `20260817212235_cmr_canonical_model_rls_and_hardening`.
- Repository-only active migrations: **2** — `20260812_local_storage_import` and `20260818_cmr_number_sequence_resync`.
- Duplicate active repository version prefixes exist for `20260812`, `20260817`, `20260818` and `20260819`.

These duplicate/coarse historical prefixes and timestamp mismatches are sufficient to explain why Git migration history cannot be considered synchronized even though the production schema is healthy.

## Standard-history mapping

| Logical migration | Repository version | Supabase production version | State |
|---|---:|---:|---|
| customs_core | 20260807 | 20260807 | exact |
| mobile_cmr | 20260808 | 20260808 | exact |
| fornexa_operational_core | 20260812 | 20260812 | exact |
| expedition_order_link | 20260817 | 20260817142306 | version drift |
| cmr_canonical_model | 20260814 | 20260817142325 | version drift |
| cmr_expeditions_bridge | 20260817 | 20260817142337 | version drift |
| expeditions_order_id_unique | 20260817 | 20260817143337 | version drift |
| cmr_canonical_model_rls_and_hardening | — | 20260817212235 | remote-only |
| restore_order_expedition_1to1 | 20260818 | 20260818145812 | version drift |
| harden_tenant_access_function | 20260819 | 20260819092059 | version drift |
| restrict_tenant_members_writes | 20260819 | 20260819092309 | version drift |
| cmr_access_key_lifecycle / add_cmr_access_key_lifecycle | 20260819 | 20260819122543 | version + name drift |
| review_access_token_registry | 20260819 | 20260819122954 | version drift |
| harden_review_token_rpc | 20260819 | 20260819123105 | version drift |
| cmr_view_sessions | 20260819 | 20260819125158 | version drift |
| mobile_trip_access | 20260819 | 20260819160358 | version drift |
| enable_private_review_access_tokens_rls | 20260821181001 | 20260821181033 | version drift |
| adr_classification_foundation | 20260822224945 | 20260822231141 | version drift |
| adr_foundation_indexes | 20260822231225 | 20260822231258 | version drift |
| shared_party_addresses | 20260823074500 | 20260823140914 | version drift |
| shared_party_address_indexes | 20260823081000 | 20260823140952 | version drift |
| remove_legacy_route_service | 20260825101500 | 20260824223616 | version drift |
| address_subdivision_key | 20260825150000 | 20260825125419 | version drift |
| allow_party_review_status | 20260825163000 | 20260825142459 | version drift |
| customer_master_foundation | 20260825203000 | 20260825184549 | version drift |
| tariff_engine_foundation | 20260827164000 | 20260827144018 | version drift |
| platform_telemetry | 20260901 | 20260901173359 | version drift |
| t1_append_only_events | 20260903003000 | 20260903002354 | version drift |
| deca_regulatory_document_foundation | 20260903062500 | 20260903051911 | version drift |
| deca_regulatory_storage | 20260905054500 | 20260905051522 | version drift |
| deca_public_url_lifecycle | 20260906143000 | 20260907153004 | version drift; known A2 manual reconcile |
| deca_native_atomic_issuance | 20260907175000 | 20260907182639 | version drift |
| canonical_fiscal_address | 20260910084703 | 20260910094055 | version drift |

## Duplicate active local versions

The repository currently contains multiple active `.sql` files sharing the same migration prefix:

- `20260812`: `fornexa_operational_core`, `local_storage_import`.
- `20260817`: `cmr_expeditions_bridge`, `expedition_order_link`, `expeditions_order_id_unique`.
- `20260818`: `cmr_number_sequence_resync`, `restore_order_expedition_1to1`.
- `20260819`: access-key lifecycle, view sessions, review-token hardening, tenant-access hardening, mobile-trip access, tenant-member restriction and review-token registry.

The production standard history resolves those historical batches into unique timestamps, except the two repository-only migrations described below.

## Repository-only migration: local_storage_import

`20260812_local_storage_import.sql` is absent from `supabase_migrations.schema_migrations`, but its production effects are directly present:

- `public.local_storage_imports` exists;
- `public.local_storage_sync_runs` exists;
- RLS is enabled on both tables;
- both tables have the `tenant_isolation` policy for `authenticated`;
- `local_storage_imports_key_idx`, `local_storage_sync_runs_started_idx` and `parties_tenant_country_tax_unique` exist;
- `public.fornexa_schema_migrations` contains `20260812_local_storage_import`.

Conclusion: this is historical schema already present outside the standard Supabase migration-history row. It must **not** be blindly executed again merely to repair provenance.

## Repository-only migration: cmr_number_sequence_resync

`20260818_cmr_number_sequence_resync.sql` is absent from standard Supabase history and its custom marker is not present in `public.fornexa_schema_migrations`.

Read-only production check on 2026-09-10:

- `public.cmr_number_seq` exists;
- sequence `last_value = 11`, `is_called = true`;
- highest persisted suffix for a current-year canonical `CMR-YY######` document = `3`.

Therefore the invariant targeted by the file — sequence not behind persisted current-year CMR numbers — is currently satisfied (`11 >= 3`). This does **not** prove that this historical file itself was executed, so it must not be marked applied without an explicit provenance decision.

## Remote-only migration: cmr_canonical_model_rls_and_hardening

Supabase standard history contains `20260817212235_cmr_canonical_model_rls_and_hardening`, but no active or historical file with that exact path was found in the current repository/default-branch path history.

Production currently has `tenant_isolation` ALL policies for `authenticated` on:

- `cmr_parties`;
- `cmr_goods_lines`;
- `cmr_attachments`;
- `cmr_clauses`;
- `cmr_signatures`.

The earlier repository migration `20260814_cmr_canonical_model.sql` creates/enables RLS on those five tables but does not create those policies. The remote-only hardening migration is therefore materially relevant to reconstructing a fresh database from Git. Its original SQL must not be invented. If the exact historical SQL cannot be recovered, a transparent historical placeholder plus a later forward reconciliation migration must restore the verified final invariants for fresh branches.

## Safe repair direction

Do not mutate production history or rename files blindly. The next implementation should be reviewed as one coherent provenance repair:

1. Rename the 29 logically matched active files so their migration version prefixes match the existing standard Supabase production versions, preserving SQL bodies unless an evidence-backed reason requires otherwise.
2. Add a repository representation for remote version `20260817212235`; prefer the original SQL if recoverable. If it cannot be recovered, explicitly mark the historical file as provenance-only and enforce the verified current RLS/hardening state in a new forward reconciliation migration.
3. Remove the two repository-only historical files from the active migration stream only together with a forward, idempotent reconciliation that preserves their required final schema/invariants for fresh branches.
4. Do not mark either repository-only migration as `applied` in production merely because its file exists. `local_storage_import` has direct state evidence; `cmr_number_sequence_resync` has only invariant evidence.
5. Validate a clean migration replay before changing production migration history. A Supabase Preview/development branch may incur cost and requires explicit cost approval; do not create one implicitly.
6. Only after clean replay should any `migration repair` operation be considered. Supabase documents `migration repair` as a migration-history-only operation, but it still changes the production tracking table and therefore requires an explicit, evidence-backed repair plan.

## Current decision

A2 is **diagnosed but not yet repaired**. Production remains healthy. The failing Git migration state is a provenance/integration problem, not evidence of a failed production schema. No destructive or billing-bearing action was taken during this investigation.
