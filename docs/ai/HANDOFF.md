# FORNEXA — Technical handoff

This file is the portable source of truth for resuming FORNEXA work from any session or computer. Read it together with `docs/pending-log.md` and verify current remote/deployment state when the required connectors are available.

## Current verified snapshot

- **Updated:** 2026-08-27 17:23 CEST.
- **Repository:** `fragonh2-boop/Fornexa`; production branch `main` at 515 commits.
- **Production commit observed:** `d042a5ad5375375f77ad7d3704835dcf78081ef5`.
- **Production status observed:** Vercel `READY` for the current `main`, including its latest redeployment.
- **Product versions:** Web `0.1.0`; Mobile `0.7.0` (`versionCode` 8).
- **Evidence checked:** Git/GitHub history and commit statuses, recent Vercel deployments, Supabase migration and branch state.

## Latest completed work

### Responsive login layout

- Commits `f219673` and `d042a5a` added login-specific responsive sizing and loaded those styles from the login layout.
- Both commits are integrated in `main`; Vercel production deployments were observed `READY`.
- No GitHub Actions run or direct test result was found for these commits. Do not treat the login as visually verified from this snapshot.

### Customer master and worldwide addresses

- The deployed customer master persists fiscal, commercial and operational data, contacts, services, blocks and versioned rates with tenant isolation and auditability.
- Worldwide country and subdivision catalogs remain active for addresses, with postal consistency checks where the postal system supports them.

## Database and deployment state

- No new Supabase migration followed the deployed customer-master migration; the production migration list is unchanged from the previous snapshot.
- The Supabase project is healthy, but its Git branch integration reports `MIGRATIONS_FAILED`. This also prevents treating a skipped Supabase Preview as an approved control.
- The current production deployment corresponds to `d042a5a`; the memorandum update in PR `#31` remains preview-only.

## Open work

The authoritative details and acceptance criteria live in `docs/pending-log.md`.

1. Improve and visually verify the password-recovery confirmation contrast on desktop and mobile, then deploy it.
2. Update memorandum PR `#31` onto current `main` and obtain an approved Supabase control or an explicit release decision before merging.

## Unintegrated or unverified work

- PR `#31` is open and unmerged. Its Vercel preview is successful, but its branch is behind current `main`, GitHub does not report it mergeable, and Supabase Preview is not approved.
- The primary local checkout contains pre-existing user changes and is 26 commits behind `origin/main`; it was not modified by this review.
- This handoff update is prepared on branch `codex/handoff-2026-08-27` and is not authoritative on `main` until its pull request is merged.

## Next safe actions

1. Review and merge the handoff pull request after its Markdown-only controls pass.
2. Fix the recovery-message contrast separately and verify WCAG AA plus desktop/mobile production rendering.
3. Rebase or recreate PR `#31` from current `main`, rerun its full memorandum controls, and resolve the Supabase integration failure before release.
