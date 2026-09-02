# FORNEXA — Technical handoff

This file is the portable source of truth for resuming FORNEXA work from any session or computer. Read it together with `docs/pending-log.md` and verify current remote/deployment state when the required connectors are available.

## Automation snapshot — 2026-09-02

- **Integrated SHA:** `origin/main` is `7449ec9fa3e6873e61298bcc20e3ed4f804bce47` (fetched on 2026-09-02), following the previously observed `362d18e…`.
- **Integrated work:** PR #37 (TLM-1) merged as `1db62220755631eb9f4a64793b1167916f5743f9`; PR #39 (login logo) merged as `7449ec9…`, both on 2026-09-01.
- **GitHub evidence:** both PRs completed `validate`, Vercel Preview Comments and both Vercel preview contexts successfully; Supabase Preview was skipped. PR #34 remains open and its old head is now `CONFLICTING` with `main`.
- **Not verified in this run:** direct production deployment/domain association, Supabase migration history/advisors, runtime telemetry and production settings. Historical claims below are not fresh evidence from this run.
- **Reconciled pending state:** TLM-1 is integrated in Git but still requires its environment configuration and operational/Supabase verification. The logo correction is integrated in Git; only its GitHub CI/preview evidence was rechecked.
- **Next safe action:** rebase/update PR #34 with this documentation, run proportional checks, wait for fresh checks, and do not merge it from this automation.

## Current verified snapshot

- **Updated:** 2026-09-01 20:28 CEST.
- **Repository:** `fragonh2-boop/Fornexa`.
- **Production branch:** `main` includes merge `1db62220755631eb9f4a64793b1167916f5743f9` from PR #37; the current Vercel production deployment is `READY`.
- **PR #36:** removed the duplicated background wordmark, but live browser inspection found that the remaining SVG is still clipped by the inherited `.auth-logo` height and overflow.
- **Active correction branch:** `fix/login-logo-clipping`, based on current `origin/main`.
- **Supabase production:** tariff engine foundation remains applied; Supabase Git branch integration `MIGRATIONS_FAILED` remains a separate unresolved control.

## Latest completed work

### Login logo collision hotfix

- PR #36 removed the inherited background wordmark from the login logo wrapper while preserving the SVG `FornexaLogo` as the single visible mark.
- `lib/memorandum.ts` was updated in the same PR.
- Claude independently verified the full diff and all three checks green.
- PR #36 was squash-merged to `main` as `7e62e6f0…`.

### Login logo clipping follow-up

- Runtime evidence: no `/login` errors in Vercel during the last 24 hours; production serves the intended current commit.
- Browser evidence on the exact production deployment: `.auth-logo` is `360 × 54 px` with `overflow: hidden`, while its SVG is `360 × 161.76 px`.
- Root cause: the login wrapper still reuses the global `.auth-logo` class from `app/brand.css`; PR #36 neutralized the background but did not neutralize inherited height/overflow.
- Prepared change on `fix/login-logo-clipping`: rename the login-only wrapper to `.login-brand-logo`, preserve natural SVG proportions, add a regression test, and avoid changing auth behavior.
- Required before closure: tests, lint, typecheck, build, responsive visual verification, cross-review, merge, production deployment and final production screenshot.

### Codex convergence response — 2026-09-01 20:46 CEST

- **Agreement:** the measured wrapper/SVG mismatch supports the stated root cause. Isolating the login wrapper under `.login-brand-logo` is a narrow frontend/UX correction and does not require backend, auth-flow or data-model changes.
- **Agreement:** the source-level regression test is useful as a guard against reusing `.auth-logo`; it does not replace desktop/mobile browser verification.
- **Resolved objection:** PR #39 is published from `fix/login-logo-clipping`; its CI and both Vercel previews are green. The memorandum now labels the release `Preproducción` until merge, a matching `READY` deployment and production-domain verification are observed.
- **Verified evidence:** 39/39 tests, lint without errors, typecheck and production build pass; the published preview renders wrapper and SVG at `360 × 161.76 px` with no horizontal overflow, and the mobile check at 390 px also shows the complete logo.
- **Open point:** obtain the final cross-review response, merge, and verify the production deployment. Separately reconcile the TLM-1 sections that still say implementation/review is open although PR #37 is already merged and deployed.
- **Proposed closure:** keep the scoped CSS/class change, merge after cross-review, verify one complete proportional logo on production desktop and mobile, and only then promote the memorandum release to `Producción`. Technical direction and preview readiness are converged.

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

1. Validate and cross-review `fix/login-logo-clipping`, then merge and verify `/login` visually in production.
2. Reconcile the TLM-1 handoff/pending state with the already merged PR #37 and deployed migration.
3. Configure and verify the TLM-1 server-only owner allowlist and dedicated IP hash secret.
4. Continue the separate tariff, orders, CMR and Supabase Preview work without mixing it into the logo correction.
