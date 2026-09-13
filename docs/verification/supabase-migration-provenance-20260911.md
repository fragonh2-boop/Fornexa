# Supabase migration provenance A2 — 2026-09-11

## Scope

Read-only reconciliation of the Git migration set against Supabase production migration metadata. This document does **not** authorize or record any `migration repair`, migration rerun, branch creation, DDL or production history mutation.

Production project: `fornexa-supply-chain`.

Observed state on 2026-09-11:

- production database / preview project status: `ACTIVE_HEALTHY`;
- Supabase Git branch `main`: `MIGRATIONS_FAILED`;
- Git `main`: 34 active `supabase/migrations/*.sql` files plus 2 `.sql.obsolete` files;
- standard `supabase_migrations.schema_migrations`: 33 rows;
- 3 versions match Git exactly (`20260807`, `20260808`, `20260812`);
- 29 migrations are logical/name matches with different version prefixes/timestamps;
- 2 active Git migrations have no standard-history row;
- 1 standard-history migration has no executable file in current Git.

The database being healthy and the Git integration reporting `MIGRATIONS_FAILED` are therefore not contradictory: the failure is provenance/history drift, not evidence of a production database outage.

## Reconciliation map

| Git migration | Standard Supabase history | Classification |
| --- | --- | --- |
| `20260807_customs_core.sql` | `20260807 customs_core` | exact version |
| `20260808_mobile_cmr.sql` | `20260808 mobile_cmr` | exact version |
| `20260812_fornexa_operational_core.sql` | `20260812 fornexa_operational_core` | exact version |
| `20260812_local_storage_import.sql` | — | Git-only in standard history; internal ledger says applied |
| `20260814_cmr_canonical_model.sql` | `20260817142325 cmr_canonical_model` | timestamp drift |
| `20260817_expedition_order_link.sql` | `20260817142306 expedition_order_link` | timestamp drift |
| `20260817_cmr_expeditions_bridge.sql` | `20260817142337 cmr_expeditions_bridge` | timestamp drift |
| `20260817_expeditions_order_id_unique.sql` | `20260817143337 expeditions_order_id_unique` | timestamp drift |
| `20260818_cmr_number_sequence_resync.sql` | — | Git-only; not recorded as applied |
| `20260818_restore_order_expedition_1to1.sql` | `20260818145812 restore_order_expedition_1to1` | timestamp drift |
| `20260819_harden_tenant_access_function.sql` | `20260819092059 harden_tenant_access_function` | timestamp drift |
| `20260819_restrict_tenant_members_writes.sql` | `20260819092309 restrict_tenant_members_writes` | timestamp drift |
| `20260819_cmr_access_key_lifecycle.sql` | `20260819122543 add_cmr_access_key_lifecycle` | timestamp + name drift |
| `20260819_review_access_token_registry.sql` | `20260819122954 review_access_token_registry` | timestamp drift |
| `20260819_harden_review_token_rpc.sql` | `20260819123105 harden_review_token_rpc` | timestamp drift |
| `20260819_cmr_view_sessions.sql` | `20260819125158 cmr_view_sessions` | timestamp drift |
| `20260819_mobile_trip_access.sql` | `20260819160358 mobile_trip_access` | timestamp drift |
| `20260821181001_enable_private_review_access_tokens_rls.sql` | `20260821181033 enable_private_review_access_tokens_rls` | timestamp drift |
| `20260822224945_adr_classification_foundation.sql` | `20260822231141 adr_classification_foundation` | timestamp drift |
| `20260822231225_adr_foundation_indexes.sql` | `20260822231258 adr_foundation_indexes` | timestamp drift |
| `20260823074500_shared_party_addresses.sql` | `20260823140914 shared_party_addresses` | timestamp drift |
| `20260823081000_shared_party_address_indexes.sql` | `20260823140952 shared_party_address_indexes` | timestamp drift |
| `20260825101500_remove_legacy_route_service.sql` | `20260824223616 remove_legacy_route_service` | timestamp drift; remote version predates Git date |
| `20260825150000_address_subdivision_key.sql` | `20260825125419 address_subdivision_key` | timestamp drift |
| `20260825163000_allow_party_review_status.sql` | `20260825142459 allow_party_review_status` | timestamp drift |
| `20260825203000_customer_master_foundation.sql` | `20260825184549 customer_master_foundation` | timestamp drift |
| `20260827164000_tariff_engine_foundation.sql` | `20260827144018 tariff_engine_foundation` | timestamp drift + confirmed DDL source drift; missing unique index restored in Git on 2026-09-11 |
| `20260901_platform_telemetry.sql` | `20260901173359 platform_telemetry` | timestamp drift |
| `20260903003000_t1_append_only_events.sql` | `20260903002354 t1_append_only_events` | timestamp drift |
| `20260903062500_deca_regulatory_document_foundation.sql` | `20260903051911 deca_regulatory_document_foundation` | timestamp drift |
| `20260905054500_deca_regulatory_storage.sql` | `20260905051522 deca_regulatory_storage` | timestamp drift |
| `20260906143000_deca_public_url_lifecycle.sql` | `20260907153004 deca_public_url_lifecycle` | timestamp drift |
| `20260907175000_deca_native_atomic_issuance.sql` | `20260907182639 deca_native_atomic_issuance` | timestamp drift |
| `20260910084703_canonical_fiscal_address.sql` | `20260910094055 canonical_fiscal_address` | timestamp drift |
| — | `20260817212235 cmr_canonical_model_rls_and_hardening` | remote-only in current Git |

## SQL content comparison

`supabase_migrations.schema_migrations.statements` retains the SQL applied by the migration system, but its representation is not uniform: the first three historical rows contain arrays of **8, 20 and 83 separate statements**, while every later row currently contains one SQL string. Joining multi-statement arrays without their original delimiters loses semicolons/formatting, so a raw Git-blob fingerprint is **not valid** for those three rows.

For the **30 single-string standard-history rows**, a Git-object SHA-1 was calculated from the stored SQL and compared with the repository blob SHA, also allowing one final LF because the remote value can omit the file's trailing newline.

Initial byte/content classification for those 30 rows:

- **16 are byte/content-equivalent** to current Git (exactly or trailing-LF-only);
- **13 have a different blob/content representation** from the SQL stored as executed;
- **1 is remote-only** (`20260817212235 cmr_canonical_model_rls_and_hardening`).

The 16 byte/content-equivalent timestamp-drift pairs are:

- `expedition_order_link`
- `cmr_canonical_model`
- `cmr_expeditions_bridge`
- `expeditions_order_id_unique`
- `restore_order_expedition_1to1`
- `harden_tenant_access_function`
- `enable_private_review_access_tokens_rls`
- `adr_classification_foundation`
- `adr_foundation_indexes`
- `address_subdivision_key`
- `allow_party_review_status`
- `customer_master_foundation`
- `platform_telemetry`
- `deca_regulatory_document_foundation`
- `deca_regulatory_storage`
- `canonical_fiscal_address`

### Semantic review of the 13 content-different single-string rows

Review date: 2026-09-11.

Method: each current Git migration was read side-by-side with the SQL string retained for the same logical migration in `supabase_migrations.schema_migrations.statements`. The comparison ignored only SQL comments, whitespace, line breaks and presentation formatting. Identifiers, literals, expressions, statement order, DDL/DML operations, grants, policies, function bodies and transaction semantics were **not** normalized away. A pair was classified equivalent only when no executable statement addition, deletion or behavior change was found.

The earlier result **13/13 semantically equivalent is retracted**. Claude's independent direct recheck against the stored statements found one executable DDL omission in Git, while also confirming six pairs as cosmetic. The six reopened pairs were subsequently rechecked with the literal-safe method documented below rather than inheriting the earlier conclusion.

Directly confirmed semantic equivalents:

- `restrict_tenant_members_writes` — same policy drop/create; formatting only.
- `cmr_access_key_lifecycle` / `add_cmr_access_key_lifecycle` — same columns, comments and partial index; formatting only.
- `cmr_view_sessions` — same table/index/RLS/deny policy; Git adds explanatory comment and line formatting only.
- `remove_legacy_route_service` — same two guarded DELETE statements inside the transaction; Git adds provenance comment only.
- `t1_append_only_events` — same RLS, privilege matrix, mutation guard triggers and comments; Git adds producer/invariant documentation only.
- `deca_public_url_lifecycle` — same legacy-constraint removal, seven-day minimum constraint, column comment and internal-ledger insert; Git adds P0-A commentary only.

Confirmed real drift, repaired source-only in the active branch:

- `tariff_engine_foundation` — remote executed SQL contains `create unique index if not exists tariff_rules_tenant_id_id_key on public.tariff_rules(tenant_id, id);`; current production also has the index. The Git migration omitted it even though `pricing_run_components_rule_fk` later references `(tenant_id, id)`. The exact idempotent statement is restored before the referencing FK. No SQL or migration-history mutation was performed.

### Literal-safe closure and auditable record of the 32 paired comparisons

Recheck date: 2026-09-12/13. Git migration baseline: `2dbe44facc303cfe4703d72a0cf665c36c98d552`, the last commit that changed `supabase/migrations`, already contained by PR #74 and production `main` at `18c19365972fcc4ac187f10848d6f33dbe528cb5`. Remote baseline: a read-only selection of all 33 rows from production `supabase_migrations.schema_migrations.statements`.

The tested comparator in `scripts/sql-provenance.ts` splits statements only on semicolons outside quoted values and comments, then compares lexical tokens in order. It ignores comments, external whitespace and case for unquoted words. It deliberately preserves single-quoted values, quoted identifiers and complete dollar-quoted bodies byte-for-byte. Statement count, statement order, operators, punctuation, identifiers, numbers and literal contents must therefore remain equal. Malformed quoted input fails closed.

This is stricter than the discarded whitespace-strip method: `--` inside a literal is data rather than a comment, whitespace inside a literal is significant, and two adjacent unquoted tokens cannot collapse into the same character stream. The tariff migration is retained as a negative control: removing `tariff_rules_tenant_id_id_key` makes the comparison fail. Synthetic versioned controls also reject removal and permutation of statements, literal whitespace/comment/case changes and a one-byte dollar-body change; the positive control permits only comments and external whitespace.

The machine-readable evidence is `docs/verification/supabase-migration-content-audit-20260912.json`. It is generated by `scripts/generate-supabase-migration-audit.ts` from the read-only query in `scripts/export-supabase-migration-audit.sql`. Its contract makes the previously manual evidence homogeneous and auditable:

- all **32 paired migrations** pass the same literal-safe comparator;
- pairing is explicit: 31 `exact_name` entries plus the single `manual_alias` from `20260819_cmr_access_key_lifecycle.sql` to remote `add_cmr_access_key_lifecycle`;
- `remote_array_elements` records the physical `text[]` granularity from Postgres separately from the Git/remote SQL statement counts produced by the comparator;
- remote payloads travel as Postgres base64 UTF-8 with ordinality, are checked client-side against the per-element MD5 calculated by Postgres and are discarded after generation; the generator removes only real LF (`0x0a`) wrapping and rejects any other whitespace;
- character count, UTF-8 byte count and wrapped/unwrapped base64 lengths are separate fields. The production ledger anchors are 33 rows / 141 array elements, 141,552 characters, 141,582 bytes and 191,387/188,968 wrapped/unwrapped base64 characters. The exact difference is the 2,419 real LF characters inserted by Postgres; three elements retain a final LF before unwrapping;
- Postgres also supplies `md5(statements::text)`, the ordered aggregate `md5(string_agg(md5(element), ',' order by ordinality))` and separate wrapped/unwrapped base64 aggregates. Their exact formulae and scope are recorded; `statements::text` is deliberately not presented as client-reproducible because `text[]::text` applies array escaping;
- each Git and remote statement has a SHA-256 over an ordered JSON serialization of typed tokens, plus a per-migration aggregate. A further SHA-256 binds the capture to the unwrapped ordered base64 sequence, but is explicitly marked non-reproducible from the permanent artifact because the payloads are not retained;
- the permanent JSON contains counts and digests only, never the remote SQL or base64 payload.

Generation can consume the validated JSON array directly from standard input, so the production payload need not be written to disk:

```bash
node --experimental-strip-types scripts/generate-supabase-migration-audit.ts \
  --remote-input - \
  --output docs/verification/supabase-migration-content-audit-20260912.json \
  --captured-at 2026-09-13T02:57:55Z
```

No temporary payload file was created for the final capture.

Local validation on 2026-09-13 passed `npm run typecheck`, the complete 123-test suite, `npm run build` and `git diff --check`. `npm run lint` completed with zero errors and the seven pre-existing warnings outside this change's scope.

Production has 30 rows whose remote `statements` array contains one element and three historical multi-element rows: `customs_core` (8), `mobile_cmr` (20) and `fornexa_operational_core` (83). The latter three also pass element-by-element comparison. For the single-element rows, the higher statement counts below are the comparator's safe split of the retained SQL blob, not Postgres array cardinality.

The three multi-element rows also reproduce the pre-registered transport anchors. Characters and UTF-8 bytes differ where the SQL contains non-ASCII text; wrapped base64 includes the LF inserted by Postgres `encode(..., 'base64')`, while the unwrapped form removes that exact byte only. The generator never calls `trim()`, `trimEnd()`, `rstrip()` or any equivalent operation: it first preserves the wrapped payload byte-for-byte, counts LF, and only then removes literal `0x0a` for canonical base64 decoding.

| Migration | Chars | UTF-8 bytes | Base64 wrapped | Base64 unwrapped | LF | Final-LF ordinals | Elementwise |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| `customs_core` | 1,800 | 1,800 | 2,439 | 2,412 | 27 | — | 8/8 |
| `mobile_cmr` | 4,476 | 4,479 | 6,066 | 5,996 | 70 | 20 | 20/20 |
| `fornexa_operational_core` | 31,500 | 31,506 | 42,647 | 42,132 | 515 | 53, 70 | 83/83 |

Postgres inserts one LF for every 57 payload bytes. Across all rows, `sum(floor(octet_length(element) / 57)) = 2,419`, so `191,387 = 188,968 + 2,419` is a derived invariant rather than an adjusted observation. Exactly three non-empty elements have a byte length divisible by 57 and therefore end in LF: `mobile_cmr` ordinal 20 and `fornexa_operational_core` ordinals 53 and 70, each 114 bytes. The artifact exposes no digest ordered across different migrations; any future ledger-wide digest must order by `(version, ordinality)`.

| Migration | Git statements | Remote statements after safe split | Result |
| --- | ---: | ---: | --- |
| `review_access_token_registry` | 7 | 7 | 7/7 equal |
| `harden_review_token_rpc` | 7 | 7 | 7/7 equal |
| `mobile_trip_access` | 6 | 6 | 6/6 equal |
| `shared_party_addresses` | 11 | 11 | 11/11 equal |
| `shared_party_address_indexes` | 1 | 1 | 1/1 equal |
| `deca_native_atomic_issuance` | 7 | 7 | 7/7 equal |
| `fornexa_operational_core` | 83 | 83 | 83/83 equal |
| `tariff_engine_foundation` | 72 | 72 | 72/72 equal |
| `customs_core` | 8 | 8 | 8/8 equal + elementwise |
| `mobile_cmr` | 20 | 20 | 20/20 equal + elementwise |
| `platform_telemetry` | 35 | 35 | 35/35 equal |
| `adr_classification_foundation` | 57 | 57 | 57/57 equal |
| `cmr_access_key_lifecycle` / `add_cmr_access_key_lifecycle` | 4 | 4 | 4/4 equal; manual alias |

The table lists the independent-review anchors; the JSON contains all 32 entries and all per-statement digests. The generator fails closed unless every pair is equivalent, all published anchors agree, the topology is exactly 31 name matches + 1 alias, two Git-only migrations and one remote-only migration, and the three historical arrays match element by element.

Therefore the current safe conclusion is: all **29 paired single-element rows** are aligned after the source-only repair (16 byte/content matches, 12 previously content-different but executable-token-equivalent pairs and the repaired `tariff_engine_foundation` pair). Together with the three historical multi-element rows, all **32/32 paired Git/standard-history migrations** are literal-safe equivalent. The integration problem remains real because version/history provenance still differs and because of Git-only, remote-only and obsolete-path cases.

## Dual-ledger provenance

Production also contains `public.fornexa_schema_migrations`, an older/internal ledger distinct from `supabase_migrations.schema_migrations`.

This explains at least part of the drift. For example:

- `20260812_local_storage_import` is absent from standard Supabase history but is present in `public.fornexa_schema_migrations`, with an applied timestamp of 2026-08-12 20:31:30 UTC;
- `20260814_cmr_canonical_model`, `20260817_expedition_order_link`, `20260817_cmr_expeditions_bridge` and `20260817_expeditions_order_id_unique` are recorded by their Git-style versions in the internal ledger while standard history records later timestamp-style versions;
- DeCA foundation/storage/lifecycle/native issuance also write internal-ledger versions that differ from the standard versions generated when they were applied remotely.

The two ledgers must not be treated as interchangeable. Future migration governance should use standard Supabase migration history as the deployment source of truth; the internal ledger is historical evidence only unless explicitly retained for product audit purposes.

## Remote-only hardening recovered from standard history

The exact migration `20260817212235 cmr_canonical_model_rls_and_hardening` is not present under that path/name in Git history, but its original SQL is retained in `supabase_migrations.schema_migrations.statements` and was recovered read-only.

Its effects are:

1. create `tenant_isolation` ALL/authenticated policies on:
   - `cmr_attachments`
   - `cmr_clauses`
   - `cmr_expeditions`
   - `cmr_goods_lines`
   - `cmr_parties`
   - `cmr_signatures`
2. enable RLS on `public.fornexa_schema_migrations`;
3. set `search_path=''` on `public.fornexa_check_expedition_delivery_note_order()`.

Production verification on 2026-09-11 confirmed:

- RLS enabled on all six CMR child tables and on `fornexa_schema_migrations`;
- all six `tenant_isolation` policies exist for role `authenticated` with command `ALL`;
- `fornexa_check_expedition_delivery_note_order()` has `search_path=""`.

Therefore the remote-only migration is genuinely applied and its exact source can be preserved from the standard history. **Do not recreate it from memory.**

## Git-only migrations

### `20260812_local_storage_import.sql`

Status: **applied historically, effects verified live, but not registered in standard Supabase history**.

Evidence:

- internal ledger contains `20260812_local_storage_import`;
- `docs/verification/local-storage-import-live-effects-20260911.md` records the read-only catalogue checks;
- production has the expected local-storage import/sync tables, columns/defaults, PK/FK/UNIQUE/CHECK constraints, RLS/policies, indexes and partial tax-ID uniqueness replacement.

This closes the live-effect verification gate. It does **not** authorize a standard-history repair. The fixed pilot-tenant default observed on both tables is tracked separately as multi-tenant technical debt and must not be silently changed inside provenance reconciliation.

### `20260818_cmr_number_sequence_resync.sql`

Status: **not recorded as applied** in either standard history or `public.fornexa_schema_migrations`.

Current production read-only observation:

- `cmr_number_seq.last_value = 11`;
- highest persisted 2026 canonical CMR suffix matching `CMR-26NNNNNN` = 3.

There is currently no evidence that the sequence is behind persisted CMR numbers, but this is **not evidence that the migration ran**. Do not mark it applied by inference. It needs an explicit decision during replay/history reconciliation: either execute it as a legitimate pending idempotent migration after validation, or retire it with documented rationale.

## Obsolete cardinality migration provenance

`public.fornexa_schema_migrations` contains `20260818_fix_order_expedition_cardinality`, applied historically on 2026-08-17. In current Git, `20260818_fix_order_expedition_cardinality.sql.obsolete` contains comments only and is intentionally non-executable.

The active `20260818_restore_order_expedition_1to1.sql` restores the canonical invariant **Pedido 1:1 Expediente** using defensive `DROP INDEX IF EXISTS` and `CREATE UNIQUE INDEX IF NOT EXISTS` operations.

Two consequences:

- current Git does not reproduce the exact historical path that production followed;
- the restore migration is designed to converge to the correct final invariant even when the erroneous migration is absent on a fresh replay.

The restore file currently says the erroneous migration was applied outside Supabase tracking “sin registro en `fornexa_schema_migrations`”; production now does contain such an internal-ledger row. Treat that wording as stale provenance commentary, not as live evidence. Correcting historical migration commentary is outside this docs-only A2 classification change and should not be mixed with replay/history repair.

## Safe reconciliation plan

No production history mutation should happen until these gates are complete:

1. **Land the source-only tariff repair.** Independently review the restored unique index and its ordering before the composite FK. Do not run it against production; the index already exists there.
2. **Preserve the completed literal-safe classification evidence.** The six reopened single-string pairs and all 83 statements of `fornexa_operational_core` are now classified directly against stored SQL. Keep the comparator and its negative controls green while preparing reconciliation.
3. **Preserve remote-only hardening source.** Stage the recovered `20260817212235_cmr_canonical_model_rls_and_hardening` SQL in a non-production reconciliation branch so a fresh database can replay the security hardening.
4. **Classify the two Git-only migrations for replay/history treatment.** `local_storage_import` has its live effects proven but remains absent from standard history; do not align history until replay. `cmr_number_sequence_resync` remains pending/not-applied until explicitly executed or retired.
5. **Fresh replay required.** Run the reconciled set from an empty database/Preview and verify schema, RLS, functions, Pedido↔Expediente 1:1, DeCA/FISCAL invariants, telemetry RPCs and representative tests.
6. **Only after a clean replay**, prepare an explicit history-alignment plan. If `migration repair` is used, each applied/reverted version must be listed and justified; never use a blanket repair.
7. **Re-test Git integration** until the branch no longer reports `MIGRATIONS_FAILED`.
8. **Production changes last.** No migration file renames, standard-history edits or SQL reruns go to production before the replay evidence and independent review are green.

A Supabase development/Preview branch may incur cost and must not be created without explicit user approval after `get_cost` and confirmation.

## Current decision

A2 remains **OPEN / diagnosed**. Production is healthy. The earlier 13/13 semantic-equivalence claim remains retracted because it hid one real DDL omission; that omission is repaired in Git, and the homogeneous machine-readable literal-safe audit now classifies all 32/32 paired migrations without normalizing literal contents. `local_storage_import` live effects remain verified. The next executable step is preparation and independent review of a replay-safe reconciliation branch. The actual Preview/replay remains cost-gated. No production migration or migration-history state was modified during this investigation.
