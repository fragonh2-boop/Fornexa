# FORNEXA — Technical handoff

This file is the portable source of truth for resuming FORNEXA work. Verify live GitHub, CI, Supabase, Vercel and Slack state before acting. Historical detail remains available in Git history, `docs/pending-log.md`, verification notes and the public Memorandum.

## 2026-10-02 Master Data Foundation & WMS Structure (Sprint P0/P1)

- **Branch:** `codex/master-data-foundation`.
- **Scope:** Implementation of benchmark-aligned Master Data and WMS physical/logical movement infrastructure:
  1. **Product Catalog (`products`, `product_packagings`, `uom_definitions`, `uom_conversions`)**: packaging hierarchy (units -> boxes -> pallets), unit conversions, dimensions, weights, ADR/hazardous and temperature control flags, and backward-compatible linkage to `order_lines.product_id`.
  2. **Carrier Compliance & Onboarding (`carrier_profiles`, enriched `parties`)**: carrier qualification status, insurance policy number, insurance carrier, coverage amount, insurance expiry date (for dispatch-prevention checks), transport license (tarjeta de transporte), and GLN/EORI/parent company attributes on `parties`.
  3. **Multi-Company / Multi-Society (`companies`, `party_roles`, `external_identifiers`)**: separation of legal entities under tenants with individual tax IDs, functional currencies, and fiscal addresses; normalized `party_roles` per company with validity periods; and universal cross-reference `external_identifiers` mapping internal IDs to SAP, Business Central, Oracle OTM, and external WMS systems.
  4. **WMS Physical & Logical Structure (`warehouse_zones`, `warehouse_bins`, `inventory_quants`, `inventory_movements`)**: physical bin locations (aisle, rack, shelf, position, bin type, weight/volume limits), inventory on hand per bin/batch/expiry (`inventory_quants`), and complete hourly and duration traceability for internal movements (`requested_at`, `started_at`, `completed_at`, `duration_seconds`, `operator_id`).
- **Migration:** `supabase/migrations/20261002233000_master_data_foundation.sql`.
- **Security & RLS:** All 12 new tables have Row-Level Security enabled with `tenant_isolation` policy using `public.fornexa_has_tenant_access(tenant_id)` and automated `updated_at` triggers.

## 2026-09-23 production redeploy

- **Evidence:** Vercel deployment `dpl_9DhZEjq4VYjTaViW9qLeZfjkWRSK` was created through the project dashboard as a fresh Production build of existing `main` commit `844a2ef45641fe2194dc4226baee3478ab36752c`. The existing build cache and project Ignore Build Step were not used. Vercel reported `READY` and assigned `fornexasc.com` without alias error; the public home page loaded in a browser.
- **Scope:** no application source, database migration, environment variable or Git `main` change was made for this redeploy. The new build uses the latest project settings; it does not include the separate Gemini reviewer PR #20, which remains unmerged and disabled by default.
- **Checks:** Vercel deployment state, exact source SHA, production target, domain alias and public home render were checked. No authenticated flow, runtime log sweep, local tests, lint or type check was performed for this unchanged source redeploy.
- **Follow-up:** independently review and activate the Gemini deployment path only after Slack identity separation and dedicated credentials. The earlier verified snapshot below is historical where it conflicts with this newer deployment evidence.

## Current verified snapshot

- **Updated:** 2026-09-24 CEST. GitHub `main`, CI and commit-status evidence rechecked; deployment target/runtime and Supabase findings retain their original capture dates unless stated otherwise.
- **Repository:** `fragonh2-boop/Fornexa`.
- **Current main:** `52e727817c80c0643b3b2e25ad259a5a77ee1214`, the squash merge of PR #84 (CMR print typography and QR size). Snapshot taken 2026-09-24 12:20 UTC; a later docs-only commit may sit on top of it.

### CMR printed document legibility — deployed and confirmed

PR #84 raised the printed CMR from 4.35 pt body text and a 7.5 mm QR module area to 7.5 pt body text and a 22 mm QR box, inside `@media print` only. Measured evidence in `docs/verification/cmr-print-typography-20260924.md`. Deployment `dpl_711uusj2gQhd4K5JZzKhCXaZYjBp` is READY on the merge SHA with `fornexasc.com` reassigned, and Fran confirmed on a real printout that the QR scans and the layout is acceptable. Firefox and Safari remain unverified: they cannot be executed in the verification environment.
- **CI/status evidence:** `validate` is `success` and both Vercel commit status contexts are `success` on `14d9429`; Supabase Preview is `failure`. This run did not independently read a Vercel deployment target or runtime logs for `14d9429`, so do not describe that commit as production `READY` from this evidence alone.
- **Last directly recorded production deployment:** `dpl_9UvQg7bM1SnDUT8ZwjyKoQG5Ef5d` was `READY`, targeted production, carried `660f13fc931d96ec75d47ef59b1bb58be6c554cc` and aliased `fornexasc.com`. No warning/error/fatal runtime entries were returned for 21:46–22:01 UTC on September 13; this is a bounded observation, not an assurance of zero errors.
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

- **project is `ACTIVE_HEALTHY`:** auth, storage, database and edge functions respond normally in production;
- **integrated Git branch `main` is `MIGRATIONS_FAILED`:** Git contains 34 active migrations; `supabase_migrations.schema_migrations` contains 33; only 3 timestamps match Git; 29 migrations share base names and logic under different timestamps; 2 are Git-only; 1 is remote-only;
- **one real source drift detected and repaired:** production table `tariff_rules` includes the unique index `tariff_rules_tenant_id_id_key`, which was missing from the Git migration `20260827164000_tariff_engine_foundation.sql`. This index is required by the compound foreign key on `pricing_run_components`. PR #72 restored the index in Git; PR #73 reconciled documentation;
- **32/32 shared migration pairs classified:** all single-element and multi-element pairs share identical executable logic under literal-safe comparison;
- **reconciliation gate:** a clean replay in non-production remains required before aligning the production migration history table with Git.

## Active PR and branch status

| Branch | PR | Head commit | Purpose | Status |
|---|---|---|---|---|
| `main` | — | `987b265` | Production branch | Active |
| `codex/a2-audit-closeout` | — | `2bb604e` | Capture nonblocking A2 review clarifications | Draft |
| `agent/fix-fornexa-mobile-android-ux` | #38 | `f10462d` | Mobile driver app UI consolidation | Draft |
