# FORNEXA — Technical handoff

This file is the portable source of truth for resuming FORNEXA work. Read it together with `docs/pending-log.md` and verify remote state before acting.

## Current verified snapshot

- **Updated:** 2026-09-04 13:55 CEST.
- **Repository:** `fragonh2-boop/Fornexa`.
- **Production:** `main` at `bb5e70edf8a84c86aaf7dcfcf5fa3988c59f7ec4`; latest GitHub CI on main succeeded and the canonical Vercel project `fornexa` is READY.
- **CMR fixes:** PRs #44–#47 are merged and verified in production.
- **Login logo:** PR #39 is merged; `lib/memorandum.ts` records the unclipped logo as Production. Do not reopen the obsolete pending entry.
- **MMO-1:** PR #38 remains draft at `865bee04f4581bb1d64cfd1fbe06941af8cee62a`; CI #187 and canonical preview are green, and Claude reported no MUST blocker.
- **MMO-1 gate:** provider execution is blocked until the seven server-side variables are configured only for the controlled Preview. Production must remain without the activation flag and provider keys.
- **Supabase:** DeCA-1 foundation and T1 append-only foundations are applied. Preserve migration provenance differences under A2; do not rerun applied migrations.

## Current priority

### DeCA — PDF/QR engine and public access

Build on the canonical `cmr_documents` model and the existing `regulatory_document_artifacts` / `regulatory_document_access_tokens` tables.

Preserve these boundaries:

- issued PDF artifacts are immutable and corrections create a new version;
- raw public tokens are never persisted, only SHA-256 hashes;
- token resolution is server-only and tenant data never crosses boundaries;
- artifact retention and public URL lifecycle remain separate;
- public access must fail closed for missing, inactive, premature or expired tokens;
- M8 scope/exemptions, operational `service_completed_at/public_until`, eCMR authentication/sealing and A2 provenance remain explicit pending decisions.

## Backlog requiring Fran

### MMO-1 controlled Preview execution

Before a single controlled run on `public_code`, configure only for Preview on branch `feat/multi-model-orchestrator`:

- `FORNEXA_AI_REVIEW_ENABLED=true`
- `OPENAI_API_KEY`, `FORNEXA_OPENAI_MODEL`
- `ANTHROPIC_API_KEY`, `FORNEXA_ANTHROPIC_MODEL`
- `DEEPSEEK_API_KEY`, `FORNEXA_DEEPSEEK_MODEL`

After the run: inspect sanitized evidence, remove the temporary route/page/flag, rerun CI and preview, obtain final independent review, then merge only if all gates pass.

## Other open work

- Reconcile and repair Supabase Git branch preview `MIGRATIONS_FAILED`.
- Complete TLM-1 production configuration/verification for owner allowlist and dedicated hash secret.
- Improve recovery-password confirmation contrast.
- Continue ADR 2025 activation, tenant autonomy, Control Tower source-of-truth, critical E2E coverage and stable Mobile distribution per `lib/memorandum.ts`.

## Governance

- GPT owns implementation; Claude reviews security-sensitive or material changes.
- Preserve Pedido↔Expediente 1:1 and standard Supabase migration tracking.
- Update `lib/memorandum.ts`, this handoff and `docs/pending-log.md` with material changes.
- Mirror material handoffs in Slack `#fornexa`.
- Do not claim tested, merged or deployed without direct evidence.
