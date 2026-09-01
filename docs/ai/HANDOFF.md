# FORNEXA — Technical handoff

This file is the portable source of truth for resuming FORNEXA work from any session or computer. Read it together with `docs/pending-log.md` and verify current remote/deployment state when the required connectors are available.

## Current verified snapshot

- **Updated:** 2026-09-01 17:20 CEST.
- **Repository:** `fragonh2-boop/Fornexa`.
- **Production branch:** `main` includes merge `7e62e6f01b92f7f4108aae2aebd9d12c61b9c57d` from PR #36.
- **PR #36:** login logo hotfix reviewed independently by Claude; GitHub Actions `validate` and both Vercel checks were green before merge.
- **Active implementation branch:** `feat/tlm1-platform-telemetry`, based on the PR #36 merge.
- **Supabase production:** tariff engine foundation remains applied; Supabase Git branch integration `MIGRATIONS_FAILED` remains a separate unresolved control.

## Latest completed work

### Login logo collision hotfix

- PR #36 removed the inherited background wordmark from the login logo wrapper while preserving the SVG `FornexaLogo` as the single visible mark.
- `lib/memorandum.ts` was updated in the same PR.
- Claude independently verified the full diff and all three checks green.
- PR #36 was squash-merged to `main` as `7e62e6f0…`.

## Work in cross-review / implementation

### TLM-1 — private platform telemetry

Functional decisions are converged between Fran, GPT and Claude:

- Scope: all `fornexasc.com`, including public traffic; not restricted to authenticated sessions.
- Purpose: conventional SaaS web/conversion analytics and platform/security observability, not directed surveillance of a named individual.
- Data boundary: isolated `platform_telemetry` schema, not tenant business data.
- Access: hidden internal route is not security by itself; the panel requires authenticated `OWNER` plus explicit server-side email allowlist.
- Client security: no service-role/secret key in browser code.
- TLM-1 excludes rrweb/DOM replay. It records sanitized request metadata, auth events and path navigation grouped by a first-party session UUID.
- Request capture must be best-effort/asynchronous so telemetry persistence cannot degrade real traffic.
- Minimization: no passwords, auth tokens, arbitrary request bodies, CMR/economic payloads or query-string values; login email is persisted only as a hash.
- Retention: plain IP 7 days; telemetry event metadata 90 days; automatic purge from the first deployment.

Implementation currently prepared on `feat/tlm1-platform-telemetry`:

- `lib/platform-telemetry.ts`: server-only sanitized transport to restricted Supabase RPCs.
- `proxy.ts`: extends the existing Next.js 16 proxy with `waitUntil` best-effort request telemetry while avoiding auth round-trips on ordinary public pages.
- `app/api/telemetry/event/route.ts`: same-origin sanitized page/auth event ingestion; storage errors never fail the visitor request.
- `app/components/TelemetryBridge.tsx`: first-party session UUID and route/dwell events, no DOM content.
- `app/login/page.tsx`: login attempt/success/failure and recovery/first-access events; password is never sent to telemetry.
- `app/internal/telemetry/page.tsx`: unlinked internal panel, OWNER + `FORNEXA_TELEMETRY_OWNER_EMAILS`, returns 404 to unauthorized users.
- `supabase/migrations/20260901_platform_telemetry.sql`: isolated schema, three telemetry tables, locked-down SECURITY DEFINER RPCs, indexes and automatic retention.
- `.env.example`: documents `FORNEXA_TELEMETRY_OWNER_EMAILS` and `FORNEXA_TELEMETRY_HASH_SECRET` as server-only settings.
- `lib/memorandum.ts` and `docs/pending-log.md` updated for the TLM-1 delivery and acceptance criteria.

## Open work

The authoritative acceptance criteria live in `docs/pending-log.md`.

1. Complete Claude review of TLM-1, especially RPC privilege boundaries, proxy performance/failure isolation, retention and owner-only panel authorization.
2. Obtain green GitHub Actions and Vercel preview checks for the TLM-1 PR.
3. Apply and verify the telemetry migration only after review/checks are satisfactory; run Supabase advisors and validate permissions.
4. Configure server-side owner allowlist and hash secret in production environment without exposing either to client bundles.
5. Verify real request/auth/page telemetry and confirm unauthorized `/internal/telemetry` access returns 404.
6. Keep T1 Tariffs, O1 Orders and A2 CMR reconciliation separate from TLM-1.
7. Repair Supabase Git branch integration `MIGRATIONS_FAILED` independently.

## Governance and role split

- GPT owns implementation, code changes, migrations, tests and deployment.
- Claude and other AIs are reviewers/advisers unless Fran explicitly changes that instruction.
- Material cross-review handoffs are mirrored in `/Fornexasc` on Drive and Slack `#fornexa`.
- Do not reopen converged points without new evidence. Opinion-only disagreements get at most two negotiation rounds before escalation to Fran.

## Next safe actions

1. Open the TLM-1 PR and collect CI/Vercel evidence.
2. Send the exact branch/PR and security-sensitive diff to Claude for point-by-point review.
3. Resolve concrete review findings, then merge only with satisfactory evidence.
4. Apply/verify migration, configure production server-only environment, deploy and execute functional access/telemetry checks.
