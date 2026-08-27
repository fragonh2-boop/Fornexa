# FORNEXA — Technical handoff

This file is the portable source of truth for resuming FORNEXA work from any session or computer. Read it together with `docs/pending-log.md` and verify current remote/deployment state when the required connectors are available.

## Current verified snapshot

- **Updated:** 2026-08-27 22:42 CEST.
- **Repository:** `fragonh2-boop/Fornexa`; production branch `main` at 517 commits.
- **Production commit observed:** `ccff1cd7e5c0308d5dd86a073f4661d029b4ea2b`.
- **Production status observed:** Vercel `READY` for the current `main` commit.
- **Product versions:** Web `0.1.0`; Mobile `0.7.0` (`versionCode` 8).
- **Evidence checked:** Git/GitHub history and commit statuses, recent Vercel deployments, Supabase migration and branch state.

## Latest completed work

### Tariff engine foundation

- Commit `d917235` added the tenant-isolated tariff engine schema for tariffs, zones, scales and surcharges.
- Supabase production records `tariff_engine_foundation` as applied; the repository migration is `20260827164000_tariff_engine_foundation.sql`.
- Vercel production for this commit was observed `READY` before the subsequent closeout-policy deployment.

### Mandatory memorandum closeout

- Commit `ccff1cd` added repository-wide completion rules, a definition-of-done checklist and a CI gate that requires functional deliveries to update `lib/memorandum.ts`.
- The public memorandum is current through 517 commits and already includes the tariff foundation, making memorandum PR `#31` obsolete.
- Vercel production for `ccff1cd` was observed `READY`.

### Responsive login layout

- Commits `f219673` and `d042a5a` added login-specific responsive sizing and loaded those styles from the login layout.
- Both commits are integrated in `main`; Vercel production deployments were observed `READY`.
- No GitHub Actions run or direct test result was found for these commits. Do not treat the login as visually verified from this snapshot.

### Customer master and worldwide addresses

- The deployed customer master persists fiscal, commercial and operational data, contacts, services, blocks and versioned rates with tenant isolation and auditability.
- Worldwide country and subdivision catalogs remain active for addresses, with postal consistency checks where the postal system supports them.

## Database and deployment state

- Supabase production includes `tariff_engine_foundation`; the project is healthy.
- The Supabase Git branch integration still reports `MIGRATIONS_FAILED` even though its preview project is healthy. Treat branch-preview controls as unresolved until this status is repaired and verified.
- The current Vercel production deployment corresponds to `ccff1cd` and is `READY`.

## Open work

The authoritative details and acceptance criteria live in `docs/pending-log.md`.

1. Improve and visually verify the password-recovery confirmation contrast on desktop and mobile, then deploy it.
2. Diagnose and repair the Supabase Git branch integration status `MIGRATIONS_FAILED`, then verify a migration-bearing preview.

## Unintegrated or unverified work

- PR `#31` is superseded by the memorandum content already integrated in `main`; it should remain closed rather than be rebased or merged.
- The primary local checkout contains pre-existing user changes and is behind `origin/main`; it was not modified by this review.
- This handoff update is prepared on branch `codex/handoff-2026-08-27` and is not authoritative on `main` until its pull request is merged.

## Next safe actions

1. Review and merge the handoff pull request after its Markdown-only controls pass.
2. Fix the recovery-message contrast separately and verify WCAG AA plus desktop/mobile production rendering.
3. Repair the Supabase branch integration and prove that a migration-bearing preview passes before relying on that control.
