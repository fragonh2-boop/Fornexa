# FORNEXA — Technical handoff

This file is the portable source of truth for resuming FORNEXA work. Verify live GitHub, CI, Supabase, Vercel and Slack state before acting. Historical detail remains available in Git history, `docs/pending-log.md`, verification notes and the public Memorandum.

## Current verified snapshot

- **Updated:** 2026-09-11 12:15 CEST.
- **Repository:** `fragonh2-boop/Fornexa`.
- **Production main:** `18e2340707c563ce0004b031fc4abcfce18ad0ea`, squash merge of PR #70 (A2 provenance diagnosis/backlog).
- **CI:** GitHub Actions run #294 (`34584841276`) completed `success` on that exact production SHA.
- **Vercel production:** deployment `dpl_EmnusGTi1RUBX5YSY4jgH4jaziPF` is `READY`, targets production and carries the same SHA.
- **Supabase production:** project is `ACTIVE_HEALTHY`; integrated Git branch `main` remains `MIGRATIONS_FAILED` because migration provenance/history differs from Git. No production schema/history mutation was performed during A2 analysis.
- **MMO-1:** PR #38 remains draft and isolated from Production.

## TLM-1 network identity privacy — fail-safe deployed, configuration gate still open

PR #68 hardens platform telemetry so an absent hashing secret cannot silently leave a raw IP persisted. PR #69 reconciled the rollout documentation.

Production behavior now is:

- `telemetryNetworkIdentity(headers)` is the single network-identity decision point used by request telemetry and auth telemetry;
- when `FORNEXA_TELEMETRY_HASH_SECRET` is configured and a client IP exists, telemetry carries the raw IP plus HMAC SHA-256;
- when the secret is absent, or no client IP is available, **both `ip` and `ip_hash` are `null`**;
- telemetry remains best-effort and capability URLs continue to be redacted as `/regulatory/d/[token]`;
- no migration or new cron was introduced; existing nullable `ip inet` / `ip_hash text` columns and RPCs are reused.

Verified rollout evidence:

- PR #68 final HEAD `229c4ce3870f63db6fe3f18ff6e52fd0ba7695d2`;
- PR CI #286 `success` exact-HEAD;
- Preview `dpl_D5JurVjg4WQNJoD4eXfTwNsRa2SU` READY exact-HEAD;
- DeepSeek exact-HEAD review: MUST none;
- Claude design review before implementation: MUST none and implementation approved; final exact-HEAD request did not reply before merge, so this is a governance exception and **not** an exact-HEAD Claude approval;
- functional squash merge SHA `c9e9b76550162c9d549803e0b02031d8716bf401`, main CI #287 success and Vercel production READY;
- controlled production GET `/` created a new telemetry row with `ip IS NULL = true` and `ip_hash IS NULL = true` while the dedicated secret remained unconfigured;
- PR #69 documentation closeout is `6a17adcb6bb381b4a788008c44ed8fff199889da`; CI #289 success and Vercel production `dpl_DxCgVXAbKXjiFziGmWHxPbnd6pRM` READY on the same SHA.

**TLM-1 is not closed yet.** Remaining device/configuration gate:

1. configure a dedicated, high-entropy `FORNEXA_TELEMETRY_HASH_SECRET` in Production;
2. configure and verify `FORNEXA_TELEMETRY_OWNER_EMAILS` for the intended OWNER account(s);
3. generate controlled traffic and verify new rows carry raw IP + deterministic 64-hex HMAC only when the secret is present;
4. verify `/internal/telemetry` works for an authorized OWNER and still returns 404 for unauthorized users;
5. preserve the privacy invariant: never persist raw IP without a configured dedicated secret.

The Vercel connector available in the current chat runtime does not expose a safe environment-variable mutation flow used in this project. Do not fabricate a secret or allowlist; finish this gate from a device/session with legitimate configuration access.

Residuals / SHOULDs:

- retention of raw IP remains opportunistic: `platform_telemetry.run_retention_if_due()` runs on capture with a one-hour throttle; it is not a guaranteed scheduler if traffic stops;
- adding `/internal/telemetry` to proxy-level auth resolution would be defense in depth; current Server Component OWNER + allowlist check remains the authoritative gate;
- DeepSeek suggested making `telemetryClientIp` non-exported and complementing source-contract coverage with a behavioral `requestTelemetryPayload` test; neither blocks the deployed fix.

## Supabase Preview / A2 provenance — diagnosed, semantic false positives closed

Live read-only reconciliation on 2026-09-11 confirmed:

- Supabase production/preview project status: `ACTIVE_HEALTHY`;
- integrated Git branch `main`: `MIGRATIONS_FAILED`;
- 34 active SQL migrations in Git vs 33 rows in standard `supabase_migrations.schema_migrations`;
- 3 exact version prefixes, 29 logical/name matches with different version prefixes/timestamps, 2 Git-only entries and 1 remote-only entry;
- production also has historical `public.fornexa_schema_migrations`, a second/internal ledger which records several Git-style versions not present in standard history.

For the 30 standard rows stored as one SQL string:

- **16/30 match current Git by byte/content** (exact or trailing-LF-only);
- **13/30 have different blob/content representation**, but manual executable-SQL review now confirms **13/13 are semantically equivalent**; differences are comments/whitespace/line wrapping, not DDL/DML behavior;
- **1/30 is remote-only** (`cmr_canonical_model_rls_and_hardening`).

The first three historical rows are stored as arrays of 8/20/83 statements, so a raw blob hash cannot be compared without reconstructing original delimiters. Manual statement-level checks confirm `customs_core` and `mobile_cmr` are semantically equivalent. `fornexa_operational_core` remains the only name-matched migration whose semantic comparison is still open. Attempts to reconstruct a Git blob with guessed delimiters were rejected because the same method also fails to reproduce the known blobs for the two control migrations.

Special cases remain:

- `20260812_local_storage_import.sql`: absent from standard history but present in the internal ledger as historically applied. Its live effects are now verified read-only against production: expected tables/columns/defaults, constraints, RLS/policies, indexes and the partial tax-ID uniqueness replacement are present. Evidence: `docs/verification/local-storage-import-live-effects-20260911.md`. This does **not** authorize standard-history alignment without replay.
- `20260818_cmr_number_sequence_resync.sql`: absent from both ledgers. Current sequence is 11 while the highest persisted 2026 canonical CMR suffix is 3; there is no current evidence of invariant violation, but the migration **must not be marked applied by inference**.
- standard-history-only `20260817212235 cmr_canonical_model_rls_and_hardening`: exact SQL recovered from `supabase_migrations.schema_migrations.statements`. Production confirms its six CMR `tenant_isolation` policies, RLS on the internal ledger and `search_path=''` on `fornexa_check_expedition_delivery_note_order()` are still active.
- `20260818_fix_order_expedition_cardinality` appears in the internal ledger but its current Git file is `.sql.obsolete` comments only. The active restore migration is defensive/idempotent and converges to the canonical Pedido↔Expediente 1:1 invariant, but current Git no longer reproduces production's exact historical path.

Full map and safe plan: `docs/verification/supabase-migration-provenance-20260911.md`.

**Do not** rename historical migration files on `main`, rerun applied SQL, use blanket `migration repair`, edit standard migration history or create a Supabase development/Preview branch yet. The next gates are:

1. finish canonical statement-by-statement comparison of `fornexa_operational_core`;
2. prepare a non-production reconciliation branch preserving the recovered remote-only hardening source and explicitly classifying both Git-only migrations;
3. replay from an empty DB/Preview;
4. verify schema/RLS/functions/cardinalities/DeCA/telemetry invariants;
5. only then propose explicit per-version history alignment and re-test Git integration.

A Supabase Preview/development branch may incur cost; use `get_cost` and obtain explicit user approval before creating one.

## CMR continuation identity and headers — closed in production

PR #66 closed continuation-page context and clipping-related integrity. Goods boxes 6–12 use semantic table markup with a real `thead`; print repeats CMR identity and goods headings on each page containing goods.

- functional production SHA: `f7bfa5701a0b27d83cf63a77c2e036377a37b2c9`;
- CI #282 success and Vercel production READY on that SHA;
- manual Chromium 144.0.7559.96 synthetic evidence: normal 2 lines → 1 page; 42 lines → 3 pages/42 of 42; long-row case → 3 pages/42 of 42/no blank page; 80 lines → 4 pages/80 of 80;
- residual only: optional physical frame polish on continuation pages. Do not reopen no-clipping, integrity or repeated-header work.

Evidence: `docs/verification/cmr-continuation-headers-20260910.md` and `scripts/verify-cmr-continuation-print.py`.

## Canonical FISCAL domicile / DeCA foundation — deployed

PR #64 added the canonical legal/fiscal domicile separate from operational pickup/delivery addresses. Production invariants remain:

- `code='FISCAL'` iff `address_type='FISCAL'`;
- one canonical FISCAL row per party and at most one active FISCAL;
- writes serialize per party and address mutation + audit share one transaction;
- RPC is service-role only; Web edit is OWNER/ADMIN;
- native DeCA requires the explicitly selected address to be active FISCAL; no operational-address fallback.

Evidence: `docs/verification/canonical-fiscal-address-20260910.md`.

### DeCA authenticated controlled E2E — device/session backlog

The remaining material DeCA gate needs a legitimate authenticated OWNER/ADMIN browser session. Do not reset credentials, reuse secrets, fabricate auth users, cookies or JWTs to make it pass.

When such a session is available, use an isolated synthetic canonical CMR fixture and verify HTTP 201, native PDF, private Storage object, artifact/version/hash/size, capability token persisted only as SHA-256, public unauthenticated resolution, downloaded-PDF hash and lifecycle semantics.

Keep separate:

- M8 remains unresolved legal/governance state;
- eCMR signing/auth/jurisdiction remains a follow-on block;
- automatic operational lifecycle remains separate from the already deployed minimum lifecycle semantics.

## Backlog by execution context

### Requires another device/session or explicit cost approval

- TLM-1 production env configuration: dedicated hash secret + OWNER allowlist + controlled access/hash verification.
- DeCA authenticated OWNER/ADMIN E2E.
- CMR/PDF native acceptance with a real QR.
- Supabase paid Preview/development branch for A2 replay: cost must be obtained and explicitly approved before creation.
- Claude exact-HEAD review where the available Slack workflow does not return a response; never convert a non-response into approval.

### Executable from current tooling

- A2: finish `fornexa_operational_core` canonical comparison; prepare replay-safe reconciliation without touching production history. `local_storage_import` live-effect verification is already closed and evidenced.
- Multi-tenant debt: audit every producer of `local_storage_imports` / `local_storage_sync_runs`; both tables still default missing `tenant_id` to the historical pilot UUID. Treat removal of that default as a dedicated post-A2 schema change with tests, not as provenance repair.
- eCMR design/implementation work that does not depend on the blocked authenticated DeCA E2E: signer identity/authentication model, evidence, integrity/sealing, jurisdiction and lifecycle boundaries.
- ADR 2025 source verification/import preparation.
- Control Tower replacement of demo metrics with tenant-aware traceable sources.
- Mobile stable-channel planning and CI/distribution hardening.
- Optional CMR continuation-page physical-frame polish.

### Other backlog

- MMO-1: Preview-only, isolated provider configuration; Production must remain without temporary flags/keys.
- Tenant autonomy and critical E2E coverage remain open product work.

## DeepSeek independent reviewer

Reviewer repository: `fragonh2-boop/fornexa-ai-reviewer`. Reviewer remains independent/read-only: no merge/deploy authority and no need for secrets.

Use explicit target semantics:

- repository review: `MODE: MAIN`, `TARGET: main`, exact `HEAD`;
- PR review: `MODE: PR`, standalone PR number and exact `HEAD`;
- canonical trigger: `DEEPSEEK — ACCIÓN REQUERIDA`.

## Governance

- GPT owns implementation/integration work; Claude and DeepSeek provide independent review where appropriate; Fran decides ties.
- Preserve Pedido↔Expediente 1:1 and standard Supabase migration tracking.
- Update `lib/memorandum.ts`, this handoff and `docs/pending-log.md` when material state changes.
- Mirror material handoffs in Slack `#fornexa`.
- Do not claim tested, merged, migrated, configured or deployed without direct evidence.
