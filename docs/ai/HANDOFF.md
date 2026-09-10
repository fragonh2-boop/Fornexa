# FORNEXA — Technical handoff

This file is the portable source of truth for resuming FORNEXA work. Verify live GitHub, CI, Supabase, Vercel and Slack state before acting. Historical detail remains available in Git history, `docs/pending-log.md`, verification notes and the public Memorandum.

## Current verified snapshot

- **Updated:** 2026-09-10 09:30 CEST.
- **Repository:** `fragonh2-boop/Fornexa`.
- **Production main:** `5ee1966d395b6b8c3206b18bddf7c478cf2200bd`, squash merge of PR #62.
- **CI:** GitHub Actions run #253 (`34394379972`) completed `success` on that exact production SHA.
- **Vercel production:** deployment `dpl_5SCoG4J42weTaGs2QBFGA9HeZJQv` is `READY`, targets production and carries the same SHA. A runtime query over the last 24 hours returned no warning/error/fatal entries for this deployment at verification time.
- **Supabase production:** DeCA foundations/P0-A/P0-B are deployed. Preserve known migration-provenance differences under A2 and do not rerun already-applied migrations.
- **MMO-1:** PR #38 remains draft and separate from current product delivery work.

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

### 1. DeCA controlled E2E

P0-A and P0-B are already integrated/deployed. The next material gate is a controlled end-to-end DeCA issuance using safe test/non-customer CMR data with canonical FISCAL address data.

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
