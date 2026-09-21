# FORNEXA — Technical handoff

This file is the portable source of truth for resuming FORNEXA work. Verify live GitHub, CI, Supabase, Vercel and Slack state before acting. Historical detail remains available in Git history, `docs/pending-log.md`, verification notes and the public Memorandum.

## Current verified snapshot

- **Updated:** 2026-09-21 CEST. GitHub `main`, PR #81 and the Vercel Preview credential boundary were rechecked; deployment runtime and Supabase findings retain their original capture dates unless stated otherwise.
- **Repository:** `fragonh2-boop/Fornexa`.
- **Current main:** `844a2ef45641fe2194dc4226baee3478ab36752c`, a docs-only reconciliation of the current handoff and pending governance ratification.
- **CI/status evidence:** `validate` and both Vercel commit status contexts are `success` on `844a2ef`; Supabase Preview is `skipped`.
- **Current directly verified production deployment:** Vercel deployment `dpl_3HW4AvnwySPnSaJVutop3xRJXyZB` is `READY`, targeted production and carries exact SHA `844a2ef45641fe2194dc4226baee3478ab36752c`. This verification inspected deployment state, not runtime logs.
- **Browser smoke:** the public home and `/dashboard` rendered in the connected Edge session; dashboard screenshot inspected. An existing signed-in session was available, but OWNER/ADMIN authorization and DeCA issuance were not verified. No business records or credentials were changed.
- **PR #74 review:** DeepSeek reviewed final HEAD `27294f973d433d0b95c0fd867f1e33bbad473a91`: MUST none, MERGE yes. Claude's earlier review is historical corroboration, not approval of this amended final HEAD. Four nonblocking DeepSeek clarifications are being captured on `codex/a2-audit-closeout`; that follow-up is not part of the production SHA above.
- **Follow-up validation:** 123/123 tests, typecheck, lint (0 errors / 7 pre-existing warnings), build and diff-check passed locally on September 14. The first sandboxed build could not fetch Google Fonts; the network-authorized retry passed. No generator behavior, historical artifact or migration SQL changed.
- **Supabase production:** project is `ACTIVE_HEALTHY`; integrated Git branch `main` remains `MIGRATIONS_FAILED` because migration provenance/history differs from Git. No production schema/history mutation was performed during A2 analysis.
- **A2 source repair:** PR #72 is merged and deployed; PR #73 reconciled that rollout's documentation. Claude reviewed PR #73 exact HEAD `528b96576da8affb5c8b83d56cb7879ef52c2aa9` with MUST none; DeepSeek did not respond to #73 and is not counted as its approval.
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

## Supabase Preview / A2 provenance — diagnosed, one real source drift confirmed

Live read-only reconciliation on 2026-09-11 confirmed:

- Supabase production/preview project status: `ACTIVE_HEALTHY`;
- integrated Git branch `main`: `MIGRATIONS_FAILED`;
- 34 active SQL migrations in Git vs 33 rows in standard `supabase_migrations.schema_migrations`;
- 3 exact version prefixes, 29 logical/name matches with different version prefixes/timestamps, 2 Git-only entries and 1 remote-only entry;
- production also has historical `public.fornexa_schema_migrations`, a second/internal ledger which records several Git-style versions not present in standard history.

For the 30 standard rows stored as one SQL string:

- **16/30 match current Git by byte/content** (exact or trailing-LF-only);
- **13/30 have different blob/content representation**: 12 are now directly confirmed executable-token/semantic equivalents and 1 (`tariff_engine_foundation`) contained real DDL drift repaired source-only;
- **1/30 is remote-only** (`cmr_canonical_model_rls_and_hardening`).

Claude's independent Git-vs-stored-statements recheck found that production's executed `tariff_engine_foundation` includes `tariff_rules_tenant_id_id_key`, while the Git migration omitted it. Production is healthy because the unique index already exists there. PR #72 restored the exact idempotent statement in current `main` before `pricing_run_components_rule_fk` and added a source-order regression test. The rollout executed no SQL and mutated no migration history; it repairs reproducibility of the versioned source only.

A literal-safe read-only comparison on 2026-09-12/13 now covers all **32/32 paired Git/standard-history migrations** with the same method. Pairing is explicit (31 exact names + one manual alias), the three historical arrays match element by element, and independent-review anchors include 72/72, 8/8, 20/20, 35/35, 57/57, 4/4 and 83/83. The tested method ignores only comments, external whitespace and unquoted case while preserving literals, quoted identifiers and dollar bodies byte-for-byte; synthetic negative controls and the removed tariff index fail comparison. Machine-readable evidence in `docs/verification/supabase-migration-content-audit-20260912.json` now separates physical cardinality, comparator statements, characters, UTF-8 bytes and wrapped/unwrapped base64 lengths; it hard-gates 2,419 wrapping LF and the three final-LF elements (mobile CMR ordinal 20; operational core ordinals 53 and 70), records exact server-side digest formulae and labels whether each control is reproducible from the permanent artifact. The final capture was streamed without a temporary payload file and stores no remote SQL/base64 payload. This closes content classification, not migration provenance/history.

**Evidence boundary:** 32/32 describes the recorded capture, not a fresh check of production. Offline tests regenerate Git-side digests and compare recorded remote digests; remote SQL is not retained, so the remote side cannot be independently reconstructed/recomputed from the artifact. `remote_array_text_md5_postgres` is copied server evidence, not client-recomputed. Renewing remote verification requires an authorized read-only capture. The baseline is the last migration-changing commit at capture, not current application HEAD; fixture failures require review/regeneration rather than an automatic claim of production drift.

Special cases remain:

- `20260812_local_storage_import.sql`: absent from standard history but present in the internal ledger as historically applied. Its live effects are now verified read-only against production: expected tables/columns/defaults, constraints, RLS/policies, indexes and the partial tax-ID uniqueness replacement are present. Evidence: `docs/verification/local-storage-import-live-effects-20260911.md`. This does **not** authorize standard-history alignment without replay.
- `20260818_cmr_number_sequence_resync.sql`: absent from both ledgers. Current sequence is 11 while the highest persisted 2026 canonical CMR suffix is 3; there is no current evidence of invariant violation, but the migration **must not be marked applied by inference**.
- standard-history-only `20260817212235 cmr_canonical_model_rls_and_hardening`: exact SQL recovered from `supabase_migrations.schema_migrations.statements`. Production confirms its six CMR `tenant_isolation` policies, RLS on the internal ledger and `search_path=''` on `fornexa_check_expedition_delivery_note_order()` are still active.
- `20260818_fix_order_expedition_cardinality` appears in the internal ledger but its current Git file is `.sql.obsolete` comments only. The active restore migration is defensive/idempotent and converges to the canonical Pedido↔Expediente 1:1 invariant, but current Git no longer reproduces production's exact historical path.

Full map and safe plan: `docs/verification/supabase-migration-provenance-20260911.md`.

**Do not** rename historical migration files on `main`, rerun applied SQL, use blanket `migration repair`, edit standard migration history or create a Supabase development/Preview branch yet. The next gates are:

1. prepare a non-production reconciliation branch preserving the recovered remote-only hardening source and explicitly classifying both Git-only migrations;
2. obtain cost and explicit approval for a Supabase Preview/development branch;
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

- A2: prepare replay-safe reconciliation without touching production history. Homogeneous literal-safe classification is complete and machine-auditable for all 32/32 paired migrations, the source-only tariff-index repair is merged, and `local_storage_import` live-effect verification is closed and evidenced.
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
- PR review: `MODE: PR`, a standalone line such as `PR #74`, and a separate exact `HEAD: <sha>` line; omit numeric `TARGET` (the parser reserves TARGET for `main`);
- canonical trigger: `DEEPSEEK — ACCIÓN REQUERIDA`.

Send actionable requests as channel-root messages and verify their formatting after sending. DeepSeek may answer in separate root messages: search by reviewer author as well as reading the request thread. Do not interpret a quiet request thread as no response.

## Governance

GPT owns implementation/integration work; Claude and DeepSeek provide independent review where appropriate; Fran decides ties. Preserve Pedido/Expediente 1:1 and standard Supabase migration tracking. Update lib/memorandum.ts, this handoff and docs/pending-log.md when material state changes. Mirror material handoffs in Slack #fornexa. Do not claim tested, merged, migrated, configured or deployed without direct evidence.

Risk-based review is recorded in `14d9429` as a technical proposal agreed by Claude, GPT and DeepSeek; **Fran's explicit ratification or correction remains pending.** Until then, it must not be used to retroactively justify direct commits or bypass branch-protection decisions. The proposal defines low risk as documentation, code comments, or UI/copy text only, and none of supabase/migrations, auth/RLS/Storage routes, PDF/CMR/DeCA generation, or capability tokens. A single independent reviewer, Claude or DeepSeek, whichever responds, confirms MERGE YES/NO against the exact HEAD; no re-auditing files already reviewed in a prior PR on the same change, and no new full round per incremental commit unless scope changes. A PR touching any file outside this allowlist is high risk by default, even if described as docs.

High risk: everything else, explicitly including auth, RLS, money/tariffs, migrations, legal signatures/documents such as CMR/DeCA, tenant isolation, Storage privacy, DeCA/capability-token lifecycle, PDF/CMR integrity, and atomicity/race conditions. Full reinforced review continues unchanged: independent Claude and DeepSeek review, exact-HEAD, CI/Vercel/Supabase verification, MUST/SHOULD/NICE verdict.

Non-response is never approval, at either risk level, see the PR 68 and 73 precedents, both logged as governance exceptions and not approvals; a reviewer's silence must be logged as such and never counted as MERGE YES. Closed audits stay closed unless new evidence appears, see the A2 tariff_engine_foundation drift found after that audit had already been marked complete; reopening requires citing the specific new evidence, not re-litigating what was already reviewed.

Acceptance criteria and edge cases such as long text or addresses, high-volume records, and empty or malformed API responses must be specified in the implementation request before work starts, not discovered during review. Each PR should state its own risk level, low or high, in its description for auditability. The verdict must stay traceable to the exact PR and SHA it covers; migrate the formal record to GitHub reviews and comments progressively so it does not depend on Slack alone.

Reviewer reliability, 2026-09-14/15: fornexa-ai-reviewer crashed on a malformed DeepSeek API response and left a review lock stuck for about 22 hours. Fixed in PR 11, squash cac13c5: validated API responses, per-call timeout, ownership-tokened recoverable locks, and a non-terminal REVISION FALLIDA Slack notice on real failures. Claude reviewed exact HEAD 3df112767abfdede9af4900c9e12133c3e8e58bc, MUST none, MERGE yes, merged it and redeployed manually; a clean restart was confirmed.


## Provider parity checkpoint — 2026-09-19

Reviewer PR https://github.com/fragonh2-boop/fornexa-ai-reviewer/pull/12 merged exact HEAD `11bdb9f49f4ac1d53b43dd36cefdbb18a7719120` as reviewer main `8eeccc621fd311b62e835204fda960b7f0aa21f7` on 2026-09-21. Its CI passed. The merge provides the shared GPT/Claude/Gemini code path; activation remains unverified and is a separate operational gate.

Risk remains HIGH. Preserve the Governance section above: exact full HEAD, MUST/SHOULD/NICE, independent reinforced review, no self-review and no silence-as-approval. Gemini parity does not ratify or change the risk policy. See the reviewer repository for its operational protocol; do not copy sensitive configuration into this public repository.

This Fornexa branch only records the cross-repository handoff and changes no application behavior.


### Claude continuity reconciliation — 2026-09-19 follow-up

Claude later published an exact-HEAD assessment of `11bdb9f49f4ac1d53b43dd36cefdbb18a7719120`. Activation remains pending; the risk policy and pending ratification are unchanged.

### Pending-work cleanup — 2026-09-20

Slack was reviewed through 12:39 CEST and open GitHub PRs were reconciled. `main` remained `844a2ef45641fe2194dc4226baee3478ab36752c`; no production/Supabase mutation was performed. The active queue is now the short prioritized section at the top of `docs/pending-log.md`; older entries remain as reference evidence.

The highest-priority product defect is CMR issuance with preloaded demo parties, vehicle data and ADR values. A fresh form can appear complete and persist fabricated legal-document data, while ADR inheritance still depends on localStorage and omits canonical `label_codes`. Split remediation into: (1) remove demo defaults and block incomplete issuance; (2) wire ADR from the canonical order/expedition snapshot after verifying the applicable official ADR source. Treat both as high-risk CMR/ADR integrity work.

The highest-priority platform blocker is production-privileged credentials targeted to Vercel Preview. Draft branches can execute server code before merge, so merge review cannot contain that exposure. Remove production Supabase/Postgres privileged credentials from Preview or isolate Preview completely before enabling automated implementation. Do not record secret values in Git or Slack.

Immediate containment was applied and rechecked in Vercel on 2026-09-20: project `fornexa` now uses the Ignored Build Step behavior **Only build production**, with command `if [ "$VERCEL_ENV" == "production" ]; then exit 1; else exit 0; fi`. Project `fornexa-app`, the intended unprivileged Preview builder, had no project environment variables at inspection time. This stops new Preview builds in the privileged project; it does not revoke credentials already embedded in existing Preview deployments.

End-to-end evidence on PR #80 commit `b0be398cdbdb4e664ca2e0985e9833978762b574`: GitHub `validate` passed; `Vercel – fornexa` reported `Canceled by Ignored Build Step`; `Vercel – fornexa-app` completed successfully; Supabase Preview was skipped. This closes the new-build containment check only.

The audit exposed no secret values, but initially confirmed that the `fornexa` project targeted production-capable Supabase/Postgres credentials to **All Environments**, including database URL/password material, Supabase secret/service-role/JWT material and public connection settings. `RESEND_API_KEY` also targeted Preview.

Preview cleanup was completed on 2026-09-21 after Fran's explicit approval. The initial UI inventory showed 226 retained Preview deployments; the final API reconciliation found 227 `target=null` records after including cancellation records created during containment verification. All were removed from the privileged `fornexa` project. A six-page post-delete API enumeration returned 82 deployments, all `target=production`, and zero Preview records. Current production `dpl_3HW4AvnwySPnSaJVutop3xRJXyZB` remained `READY` at exact SHA `844a2ef45641fe2194dc4226baee3478ab36752c`; no deployment from `fornexa-app` was selected or deleted.

Environment scoping was completed on 2026-09-21. `NEXT_PUBLIC_APP_URL`, all 16 Supabase/Postgres variables and all three mail variables now target **Production only**. The branch-scoped `OPENAI_API_KEY` and `FORNEXA_OPENAI_MODEL` left by the closed multi-model Preview were removed. A fresh inventory returned 20 variables, all Production-only; no value was read or copied. The CLI link step created a temporary local `.env.local` automatically, and that file was deleted immediately without inspection.

The P0 remains open only for provider-side credential rotation and proof after rotation. Existing runnable Preview artifacts are removed, new privileged Preview builds are blocked and no Preview/Development scope remains in `fornexa`; canceled metadata records generated by future branch pushes may still appear and contain no built artifact. Current production remained `READY` at `844a2ef45641fe2194dc4226baee3478ab36752c` after the scope change.

CMR remediation is prepared in draft PR #81 at exact HEAD `6a0cf5a4a43b224380b32ead8cb870296f66eb32`. It removes the fabricated initial CMR values, preserves the API invariant that issuance without an expedition fails with 422, and restores complete real-data input paths: Customer ID and ADR are editable, current and legacy customer aliases share one normalizer, and stale ADR detail is cleared when ADR is changed to No or undeclared. Local validation passed 130 tests, typecheck, lint with no errors, build, diff-check and the Memorandum gate. GitHub `validate`, the unprivileged Vercel Preview and Preview Comments are green on that exact HEAD; Supabase Preview is skipped and the privileged project reports its ignored-build rule. The deployed screen redirects to authenticated access, so no credential-free visual interaction was claimed.

The earlier Claude finding about read-only Customer ID/ADR controls and incompatible `clienteId` / `cliente` aliases is addressed in this HEAD. Because that changes the reviewed scope, fresh reinforced Claude and DeepSeek verdicts must cover this exact full SHA before merge. ADR label capture and canonical `hazmat_entries.label_codes` propagation remain separate because the current ADR edition is not active. No merge or production promotion was performed.

Gemini code is incorporated in reviewer main, but activation evidence remains incomplete. No deploy was performed from this task.

Repository cleanup: obsolete/superseded PRs #13, #38, #54 and #55 were closed with reasons. PR #77 was closed because it asserted unverified ratification and conflicted with #80. PR #79 remains open and ready for Fran's merge-or-close decision after two favorable exact-HEAD reviews; its pixel harness is manual evidence and is not executed by CI. PR #80 remains the single documentation consolidation branch. No PR was merged or deployed during cleanup.
