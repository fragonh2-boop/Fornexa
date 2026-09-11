# FORNEXA — Technical handoff

This file is the portable source of truth for resuming FORNEXA work. Verify live GitHub, CI, Supabase, Vercel and Slack state before acting. Historical detail remains available in Git history, `docs/pending-log.md`, verification notes and the public Memorandum.

## Current verified snapshot

- **Updated:** 2026-09-11 09:35 CEST.
- **Repository:** `fragonh2-boop/Fornexa`.
- **Production main:** `c9e9b76550162c9d549803e0b02031d8716bf401`, squash merge of PR #68.
- **CI:** GitHub Actions run #287 completed `success` on that exact production SHA, including memorandum gate, Web typecheck/lint/tests/build and Mobile typecheck.
- **Vercel production:** deployment `dpl_FFpT54jAjjeZVek6z81bHNdzQHjK` is `READY`, targets production, carries the same SHA and serves `fornexasc.com`. Runtime query returned no warning/error/fatal entries in the checked window.
- **Supabase production:** DeCA foundations/P0-A/P0-B and canonical FISCAL remain deployed. PR #68 made no database/schema changes.
- **MMO-1:** PR #38 remains draft and isolated from Production.

## TLM-1 network identity privacy — PR #68 deployed, configuration gate still open

PR #68 hardens platform telemetry so an absent hashing secret cannot silently leave a raw IP persisted.

Production behavior now is:

- `telemetryNetworkIdentity(headers)` is the single network-identity decision point used by request telemetry and auth telemetry;
- when `FORNEXA_TELEMETRY_HASH_SECRET` is configured and a client IP exists, telemetry carries the raw IP plus HMAC SHA-256;
- when the secret is absent, or no client IP is available, **both `ip` and `ip_hash` are `null`**;
- telemetry remains best-effort and capability URLs continue to be redacted as `/regulatory/d/[token]`;
- no migration or new cron was introduced; existing nullable `ip inet` / `ip_hash text` columns and RPCs are reused.

Verified rollout evidence:

- PR #68 final HEAD `229c4ce3870f63db6fe3f18ff6e52fd0ba7695d2`;
- PR CI #286 `success` exact-HEAD;
- Preview `dpl_D5JurVjg4WQNJoD4eXfTwNsRa2SU` READY exact-HEAD with no warning/error/fatal in the checked runtime window;
- DeepSeek exact-HEAD review: MUST none;
- Claude design review before implementation: MUST none and implementation approved; the final exact-HEAD request had not replied before merge, so this is recorded as a governance exception and **not** as an exact-HEAD Claude approval;
- Fran explicitly instructed GPT to proceed;
- squash merge production SHA `c9e9b76550162c9d549803e0b02031d8716bf401`;
- main CI #287 `success` on that SHA;
- Vercel production `dpl_FFpT54jAjjeZVek6z81bHNdzQHjK` READY on the same SHA and serving `fornexasc.com`;
- controlled production GET `/` after deployment created a new `platform_telemetry.telemetry_requests` row with `ip IS NULL = true` and `ip_hash IS NULL = true`, directly confirming the fail-safe behavior while the dedicated secret remains unconfigured.

**TLM-1 is not closed yet.** Remaining product/configuration gate:

1. configure a dedicated, high-entropy `FORNEXA_TELEMETRY_HASH_SECRET` in Production;
2. configure and verify `FORNEXA_TELEMETRY_OWNER_EMAILS` for the intended OWNER account(s);
3. generate controlled traffic and verify new rows carry raw IP + a deterministic 64-hex HMAC only when the secret is present;
4. verify `/internal/telemetry` works for an authorized OWNER and still returns 404 for unauthorized users;
5. preserve the privacy invariant: never persist raw IP without a configured dedicated secret.

Residuals / SHOULDs:

- retention of raw IP remains opportunistic: `platform_telemetry.run_retention_if_due()` runs on capture with a one-hour throttle; it is not a guaranteed scheduler if traffic stops;
- adding `/internal/telemetry` to proxy-level auth resolution would be defense in depth; current Server Component OWNER + allowlist check remains the authoritative gate;
- final secret configuration should use a strong dedicated value; do not reuse application, Supabase or auth secrets;
- DeepSeek suggested making `telemetryClientIp` non-exported and complementing source-contract coverage with a behavioral `requestTelemetryPayload` test; neither is a blocker for the deployed fix.

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

## Supabase Preview / A2 provenance

Production is healthy, but the Git integration has been observed as `MIGRATIONS_FAILED`. Diagnostic map from 2026-09-10:

- 34 active SQL migrations in Git vs 33 rows in standard Supabase migration history;
- 29 logical equivalents have different timestamps/versions;
- 2 repo-only entries and 1 remote-only entry;
- repository also contains duplicated active timestamp families around 20260812/17/18/19.

Do **not** rerun applied migrations or use `migration repair` blindly. First perform a controlled replay/Preview and establish exact equivalence/provenance. Do not create a paid Supabase branch without explicit approval.

## Other backlog

- Password-recovery success-message contrast was rechecked: current success colors already exceed WCAG AA; close documentation only, no color change needed.
- CMR native/PDF acceptance with a real QR remains device-dependent acceptance, separate from synthetic print integrity.
- ADR 2025 activation: verify/import official source and packaging/rules before enabling regulatory calculation.
- Control Tower: continue replacing demo metrics with tenant-aware traceable operational data.
- Mobile: establish stable promotion/distribution channel.
- MMO-1: Preview-only, isolated provider configuration; Production must remain without its temporary flags/keys.
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
