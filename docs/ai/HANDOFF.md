# FORNEXA — Technical handoff

This file is the portable source of truth for resuming FORNEXA work. Verify live GitHub, CI, Supabase, Vercel and Slack state before acting. Historical detail remains available in Git history, `docs/pending-log.md`, verification notes and the public Memorandum.

## Current verified snapshot

- **Updated:** 2026-09-10 11:50 CEST.
- **Repository:** `fragonh2-boop/Fornexa`.
- **Production main:** `e594b2d0ca40105c3d0c5ce41e735ddf98b21e79`, squash merge of PR #64.
- **CI:** GitHub Actions run #270 (`34462094053`) completed `success` on that exact production SHA.
- **Vercel production:** deployment `dpl_5rMsn1b39JA4GiefVjHPZivvNEpG` is `READY`, targets production, carries the same SHA and serves `fornexasc.com`. A runtime query on the deployment returned no warning/error/fatal entries at verification time.
- **Supabase production:** DeCA foundations/P0-A/P0-B and the canonical FISCAL-address migration `canonical_fiscal_address` are deployed. The new FISCAL partial unique index, bidirectional FISCAL code/type constraint and service-role-only RPC are present. Immediately after rollout there were 0 FISCAL rows, 0 regulatory artifacts and 0 regulatory access tokens, confirming no synthetic business/regulatory data was created by the migration.
- **MMO-1:** PR #38 remains draft and separate from current product delivery work.

## Canonical FISCAL domicile — PR #64 closed in production

PR #64 added a canonical legal/fiscal domicile separate from operational pickup/delivery centers so DeCA does not infer a contractual shipper domicile from operational addresses.

Production rollout was deliberately DB-first: the additive/fail-closed migration was applied before merging the API, then schema/privilege smoke checks passed, PR #64 was squash-merged and the exact main SHA completed CI and Vercel production successfully.

Verified production invariants:

- `code='FISCAL'` if and only if `address_type='FISCAL'`;
- maximum one active FISCAL address per `(tenant_id, party_id)`;
- the pre-existing UNIQUE `(tenant_id, party_id, code) NULLS NOT DISTINCT` prevents duplicate canonical FISCAL codes per party;
- writes serialize per party through `FOR UPDATE` and address mutation + audit event share one database transaction;
- RPC is `SECURITY INVOKER`, executable by `service_role`, not by `authenticated` or `anon`;
- the Web API permits FISCAL edits only to OWNER/ADMIN;
- native DeCA lookup requires the explicitly selected address to be both `FISCAL` and active; no fallback to an operational address exists.

Pre-merge transactional evidence, including the PL/pgSQL ambiguity found and fixed during real execution, remains in `docs/verification/canonical-fiscal-address-20260910.md`.

**Review state:** DeepSeek reviewed final PR HEAD `89b07574e4af2029288abebec59c71f39256891d` and closed all MUST findings. The exact-HEAD Claude handoff did not return before rollout; Fran explicitly instructed GPT to continue, so this is recorded as a governance exception rather than a fabricated Claude approval.

## CMR print integrity — PR #62 closed

PR #62 removed the rigid print clipping introduced by the previous single-page A4 geometry. The production CSS keeps A4 portrait, 9 mm page margins and 192 mm usable width, but uses 279 mm as a minimum rather than a hard maximum and allows content to paginate.

Post-merge browser verification was completed on 2026-09-10 with system Chromium 144 using a controlled synthetic CMR, the production document structure and the exact production print CSS. No customer/production shipment data was used.

- normal fixture: 2 goods lines + 1 ADR line → exactly 1 A4 page;
- extreme fixture: long legal names/addresses, 28 goods lines + 10 ADR lines → exactly 2 A4 pages;
- PDF text extraction confirmed 28/28 goods markers plus ADR, boxes 13–21, signatures 22–24 and footer;
- rendered pages showed no silent clipping or visible text overlap.

Evidence: `docs/verification/cmr-print-overflow-20260910.md`.

**Residual, non-blocking:** continuation page 2 starts directly with the goods grid and does not repeat the CMR identity/header or the goods-column headings. Track this as a separate print-continuation UX improvement; it is not a data-loss defect.

## DeepSeek independent reviewer

Reviewer repository: `fragonh2-boop/fornexa-ai-reviewer`.

- PRs #6/#7 recovered operational Slack triggers and response deduplication.
- PR #8 added explicit repository-state (`main`) reviews.
- PR #9 added permanent Node 22 CI for tests + TypeScript build.
- PR #10 is merged; reviewer `main` is `6461eb0a16c3b7ffbeff9f558de64ebb945f23e0` and explicitly separates MAIN and PR review protocols so narrative references to historical PRs cannot select the wrong target.
- Reviewer remains independent/read-only for FORNEXA: no merge/deploy authority and no need to expose secrets in review requests.

Operational requests should identify the target explicitly. For repository state, use explicit MAIN semantics (`MODE: MAIN`, `TARGET: main` and exact HEAD). For a PR review, use explicit PR semantics with a standalone PR number and exact HEAD.

## Current priority

### 1. DeCA authenticated controlled E2E

P0-A, P0-B and the canonical FISCAL source-data foundation are now in production. The remaining material gate is an authenticated OWNER/ADMIN end-to-end DeCA issuance using an isolated, explicitly synthetic canonical CMR fixture.

No suitable existing CMR can be reused: the legacy `CMR-E2E-MOBILE-20260819` lacks canonical sender/carrier party relationships and vehicle data, and production currently has no CMR with both canonical sender and carrier party IDs. Do not infer these roles from display strings or retrofit an operational CMR merely to make the test pass.

The current automation environment does not possess a legitimate FORNEXA Web user session. The normal login path is email + password; the first-access/recovery paths create or change a password. Do not reset Fran's credentials, reuse secrets or fabricate an auth user just to automate this gate.

When a legitimate OWNER/ADMIN session is available, execute the E2E through the production HTTP route and verify HTTP 201, native PDF, Storage object, artifact/version/hash/size, capability token hashing, public unauthenticated PDF resolution, downloaded-PDF hash and lifecycle semantics.

Preserve these boundaries:

- issued regulatory PDF artifacts are immutable; corrections create a new version;
- raw public tokens are never persisted, only SHA-256 hashes;
- public resolution remains server-side, tenant-aware and fail-closed;
- artifact retention and public URL lifecycle remain separate;
- do not infer contractual shipper/effective carrier roles from display strings;
- M8 remains an explicit unresolved legal/governance gate and must not be invented or silently closed;
- eCMR authentication/sealing/jurisdiction and operational lifecycle automation remain separate follow-on work;
- do not create a paid Supabase development/preview branch without explicit approval.

### 2. Supabase Preview / A2 provenance

Reconcile the Git-branch Preview integration and the known repository/remote migration-version provenance differences. Do not rerun migrations already applied to production.

### 3. CMR continuation-page polish

Consider repeating document identity and goods-column headings on continuation pages and making the per-page frame visually explicit. Keep this separate from the now-closed clipping/integrity defect.

## Other open work

- MMO-1 controlled Preview execution remains blocked on its dedicated, Preview-only provider configuration and must remain isolated from Production.
- Complete TLM-1 production configuration/verification for owner allowlist and dedicated hash secret.
- Improve recovery-password confirmation contrast.
- Continue ADR 2025 activation, tenant autonomy, Control Tower source-of-truth, critical E2E coverage and stable Mobile distribution according to `lib/memorandum.ts`.

## Governance

- GPT owns implementation/integration work; Claude and DeepSeek provide independent review where appropriate; Fran decides ties.
- Preserve Pedido↔Expediente 1:1 and standard Supabase migration tracking.
- Update `lib/memorandum.ts`, this handoff and `docs/pending-log.md` when material state changes.
- Mirror material handoffs in Slack `#fornexa`.
- Do not claim tested, merged, migrated or deployed without direct evidence.
