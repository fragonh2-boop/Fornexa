# FORNEXA — Technical handoff

This file is the portable source of truth for resuming FORNEXA work. Read it together with `docs/pending-log.md` and verify remote state before acting.

## Current verified snapshot

- **Updated:** 2026-09-05 09:46 CEST.
- **Repository:** `fragonh2-boop/Fornexa`.
- **Production:** `main` at `f030f23468de6b9089ca36c7e429e8c1335485e3` (551 commits). GitHub Actions CI run `33946697109` succeeded on that exact SHA. The canonical Vercel `fornexa` production deployment is `READY`, carries that exact SHA and aliases `fornexasc.com`.
- **DeCA-2:** PR #51 is integrated. Private PDF artifact intake, immutable versioning, explicit hashed public tokens, QR and a fail-closed FORNEXA resolver are deployed. The production migration list contains `20260905051522 deca_regulatory_storage`; its timestamp differs from the repository filename `20260905054500_deca_regulatory_storage.sql`, so retain it as A2 provenance work rather than rerunning it.
- **Supabase Preview:** the check associated with current `main` reports failure, although the GitHub CI workflow itself is successful. The branch-preview integration remains unresolved; do not treat a migration-bearing preview as verified.
- **CMR fixes:** PRs #44–#47 are merged and verified in production.
- **Login logo:** PR #39 is merged; `lib/memorandum.ts` records the unclipped logo as Production. Do not reopen the obsolete pending entry.
- **MMO-1:** PR #38 remains draft at `865bee04f4581bb1d64cfd1fbe06941af8cee62a`; CI #187 and canonical preview are green, and Claude reported no MUST blocker.
- **MMO-1 gate:** provider execution is blocked until the seven server-side variables are configured only for the controlled Preview. Production must remain without the activation flag and provider keys.
- **Supabase:** DeCA-1 foundation and T1 append-only foundations are applied. Preserve migration provenance differences under A2; do not rerun applied migrations.

## Active unintegrated work

### CMR print/PDF QR readiness — PR #52

- **Production defect reproduced:** authenticated CMR detail returned 200 while its QR endpoint returned 401 for an expired, non-revoked capability; the browser rendered a broken image. A current non-expiring CMR loaded the QR successfully.
- **Root cause:** the page rendered and invoked `window.print()` without waiting for the QR resource. The QR route correctly preserves expiry/revocation fail-closed behavior and is unchanged.
- **Prepared fix:** print/export remain disabled until `onLoad` confirms the exact QR source; automatic `?print=1` also waits. A rejected QR is hidden and replaced by an explicit renewal notice, so a broken QR cannot enter the PDF.
- **Local verification:** 81/81 web tests passed, including three new readiness regressions; typecheck passed; lint passed with seven pre-existing warnings and no errors; production build passed after network access allowed Next.js to fetch Manrope. No schema or production data changed.
- **State:** branch `codex/persistent-fornexa-handoff-20260905`; not merged, not deployed and not yet reviewed by Claude or visually verified on an exact-head Preview.
- **Next gate:** push the exact HEAD to PR #52, require CI + canonical Preview `READY`, obtain Claude review, then run RPA on both a valid and expired-capability CMR. Merge/deploy only after those gates; final closure still requires Fran's visual approval.

## Current priority

### DeCA — native PDF and regulatory completion

Build on the deployed canonical `cmr_documents` model, `regulatory_document_artifacts`, `regulatory_document_access_tokens` and the private `regulatory-documents` bucket.

Preserve these boundaries:

- issued PDF artifacts are immutable and corrections create a new version;
- raw public tokens are never persisted, only SHA-256 hashes;
- token resolution is server-only and tenant data never crosses boundaries;
- artifact retention and public URL lifecycle remain separate;
- public access must fail closed for missing, inactive, premature or expired tokens;
- M8 scope/exemptions, operational `service_completed_at/public_until`, eCMR authentication/sealing and A2 provenance remain explicit pending decisions.
- A controlled E2E with non-production/test CMR data remains required before promoting DeCA-2 in the public memorandum beyond Preproducción.

## Backlog requiring Fran

### MMO-1 controlled Preview execution

Before a single controlled run on `public_code`, configure only for Preview on branch `feat/multi-model-orchestrator`:

- `FORNEXA_AI_REVIEW_ENABLED=true`
- `OPENAI_API_KEY`, `FORNEXA_OPENAI_MODEL`
- `ANTHROPIC_API_KEY`, `FORNEXA_ANTHROPIC_MODEL`
- `DEEPSEEK_API_KEY`, `FORNEXA_DEEPSEEK_MODEL`

After the run: inspect sanitized evidence, remove the temporary route/page/flag, rerun CI and preview, obtain final independent review, then merge only if all gates pass.

## Other open work

- Reconcile and repair the failing Supabase Git branch preview; include the DeCA-2 repository/remote migration-version discrepancy in A2 provenance work and do not rerun the applied migration.
- Complete TLM-1 production configuration/verification for owner allowlist and dedicated hash secret.
- Improve recovery-password confirmation contrast.
- Continue ADR 2025 activation, tenant autonomy, Control Tower source-of-truth, critical E2E coverage and stable Mobile distribution per `lib/memorandum.ts`.

## Governance

- GPT owns implementation; Claude reviews security-sensitive or material changes.
- Preserve Pedido↔Expediente 1:1 and standard Supabase migration tracking.
- Update `lib/memorandum.ts`, this handoff and `docs/pending-log.md` with material changes.
- Mirror material handoffs in Slack `#fornexa`.
- Do not claim tested, merged or deployed without direct evidence.
