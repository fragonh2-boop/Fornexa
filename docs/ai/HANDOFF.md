# FORNEXA — Technical handoff

This file is the portable source of truth for resuming FORNEXA work. Verify live GitHub, CI, Supabase, Vercel and Slack state before acting. Historical detail remains available in Git history, `docs/pending-log.md`, verification notes and the public Memorandum.

## 2026-10-07 — Catálogo maestro P0 (sustituye a PR #89)

- **Origen:** PR #89 (GPT/Codex, `91e8009`) estaba abierta desde el 4 de octubre sobre `573bee8`, con dos MUST de vigilancia. Fran asignó a Claude llevarla a producción. El código de aplicación se toma íntegro de #89; la documentación se rehace sobre `main` actual para evitar conflictos. La PR #91 (demo de preview, GPT) sigue apilada sobre #89 y deberá rebasarse.
- **MUST 1 — referencias a productos sin empresa:** `order_lines`, `product_packagings`, `product_hazmat_assignments`, `inventory_quants` e `inventory_movements` apuntaban solo a `products(id)`. Migración `20261007160000_products_tenant_scoped_references.sql`: índice único `products(tenant_id, id)` y claves foráneas compuestas `(tenant_id, product_id)`, conservando ON DELETE. Las seis tablas tenían 0 filas en producción al comprobarlo.
- **MUST 2 — política de escritura en `products`:** se resuelve como decisión explícita, no como añadido: los clientes solo tienen SELECT (`tenant_read`) y todas las escrituras pasan por `/api/products` y `/api/orders` con rol y empresa comprobados en servidor. Una política ALL ampliaría el acceso; queda documentado en un `COMMENT ON TABLE`.
- **Corrección heredada:** el patrón HTML del GTIN estaba doblemente escapado y rechazaba GTIN numéricos válidos en el navegador (detectado en PR #91).
- **Verificación local:** suite 133/136; los 3 fallos se reproducen en `main` (dependencias no instalables en el entorno). Nuevos tests: patrón GTIN real con flag `v` y claves compuestas en la migración. Typecheck, lint y build: autoridad en el CI.
- **Revisión de `6676f6d`:** Gemini MERGE YES (0 MUST). DeepSeek MERGE NO: (1) «sexta tabla» = malentendido (6 tablas = `products` + 5 referenciantes; `pg_constraint` muestra exactamente 5 FK hacia `products`), ahora explícito en la migración; (2) comprobación previa de huérfanos añadida antes de cualquier ADD CONSTRAINT, ejecutada en solo lectura contra producción sin hallazgos; (3) PUT ya no puede cambiar el cliente propietario (409). Además: concurrencia optimista por `revision_number` y registro del fallo de auditoría.
- **Cierre:** sobre `f2ce890`, Gemini MERGE YES (0 MUST) y DeepSeek 0 MUST, con YES condicionado a aplicación transaccional y a revalidación en el momento de aplicar; ambas se cumplen (`apply_migration` transaccional con la comprobación previa dentro). Migración aplicada en producción con el contenido exacto del archivo (sha256 `4103e1db…722a`); `pg_constraint` muestra las 5 FK compuestas con su ON DELETE; versión registrada en `fornexa_schema_migrations`. PR #93 integrada por squash como `e0b9404`; Vercel producción `READY` con ese SHA. PR #89 cerrada como sustituida.
- **Pendiente:** prueba autenticada en producción (alta de un artículo y selección en Nueva partida). La PR #91 debe rebasarse sobre `main`.

## 2026-10-07 — Producción sin datos ficticios (preview conserva la demo)

- **Petición de Fran:** producción no debe mostrar datos ficticios; preview debe conservar datos de demostración para demos.
- **Auditoría previa (solo lectura, producción `573bee8`):** Control Tower, Decision Center, Colaboradores (y su ficha Velocity) e Integraciones renderizaban datos escritos en el código. Partidas, Expediciones, Viajes, Clientes, ePOD/CMR y Aduanas ya leían Supabase. En Supabase hay 149 clientes (147 importados del sistema anterior) y solo registros operativos de prueba de agosto.
- **Cambio:** `lib/demo-mode.ts` decide con `VERCEL_ENV` (o `NODE_ENV=development` fuera de Vercel); cualquier otro valor se trata como producción. Las pantallas afectadas se evalúan por petición (`force-dynamic`). En producción: Control Tower lee recuentos y últimos registros del tenant; Decision Center, Integraciones y el módulo genérico muestran estados vacíos; `/dashboard/colaboradores/velocity` devuelve 404. Los datos de Integraciones se movieron a `demo-fixtures.ts`, cargado solo en preview.
- **Verificación local:** `tests/demo-mode.test.ts` 6/6. La suite completa da 126/129; los 3 fallos se reproducen igual en `main` sin el cambio (dependencias no instalables en el entorno). Typecheck, lint y build no se pudieron ejecutar localmente (registro npm bloqueado): la autoridad es el CI de la PR.
- **Revisión sobre `81db80e`:** Gemini MERGE YES, 0 MUST. DeepSeek retiró sus 3 MUST de verificación (aislamiento por tenant confirmado leyendo `auth-context`, `supabase-admin` y `viajes/[id]`) y pidió quitar el correo personal precargado en el formulario de Integraciones (M-1).
- **Segundo commit (respuesta a la revisión):** sin direcciones precargadas en Integraciones ni en el envío de ofertas; el distintivo «Resend conectado» pasa a ser descriptivo; Control Tower muestra «—» y un aviso si falla la lectura (antes podía parecer un cero real) y captura errores de configuración sin tumbar la página; los enlaces de viajes de la demo apuntan al listado. Tests 9/9, incluido un contrato de filtro `tenant_id` por consulta.
- **Verificado para M-2:** `app/dashboard/registros/[module]/[id]/RecordEditor.tsx` (`GenericRecordEditor`) lee y escribe `localStorage`; solo clientes y ofertas existentes usan API.
- **Cierre:** Gemini y DeepSeek MERGE YES con 0 MUST sobre el HEAD exacto `8f43ccd2aa0e6369f822d22d8d422394b7e498a4`; CI `validate` success. PR #90 integrada por squash como `bc707c836c0f39e07d84d1f2e39e120057ab6434`. Vercel producción `READY` para ese SHA, con alias `fornexasc.com` sin error.
- **Verificación funcional:** Fran confirmó visualmente el 7 de octubre (16:06 CEST), con su sesión, que producción ya no muestra datos ficticios. La demo en preview no se ha comprobado con sesión tras el merge. Sin cambios de base de datos.
- **Decisión para Fran:** `lib/email-service.ts` usa como respuesta por defecto un correo personal si no existe `EMAIL_REPLY_TO`; no es visible en pantalla y no se ha cambiado.
- **Riesgo residual:** las pantallas que guardan solo en el navegador (Importar Excel, fichas genéricas de colaboradores/almacenes/ofertas) siguen sin persistir en Supabase; no muestran datos ficticios, pero no son datos reales compartidos.

## 2026-10-03 — Master Data Foundation & WMS: production schema verified

- **Integrated source:** PR #86 is merged on `main` at `79dfc42b9cdc9d356e5b977d25121a113de67cea`. PR #87 versioned the trigger-function hardening and was squash-merged as `081a728457c9f157384f77455ca39997e65e5dcf`; its `validate` check is `success` (GitHub Actions run `37076161324`). Supabase Preview failed by connection timeout, not by a reported SQL error. A paid Supabase branch was requested but is unavailable on the current plan.
- **Applied to production:** `20261002233000_master_data_foundation` was executed atomically after live prerequisite checks and explicit authorization. The internal FORNEXA ledger contains its canonical version.
- **Live schema evidence:** all eleven new tables exist, each has RLS enabled and the `tenant_isolation` policy for `authenticated`: `companies`, `party_roles`, `carrier_profiles`, `uom_definitions`, `uom_conversions`, `product_packagings`, `warehouse_zones`, `warehouse_bins`, `inventory_quants`, `inventory_movements` and `external_identifiers`. All expected `parties`, `products` and `order_lines` columns are present; the movement-duration trigger is registered. Seed counts are one company, ten UOM definitions and six conversions.
- **Security correction:** the production check exposed the new trigger function as a direct `SECURITY DEFINER` RPC. A narrow follow-up revokes `EXECUTE` from `PUBLIC`, `anon` and `authenticated`; direct invocation is now false for both client-facing roles while the trigger remains registered. `service_role` retains its server-only database privilege, and the repository has no direct RPC use of this trigger function. `supabase/migrations/20261002234000_harden_movement_duration_execute.sql` records the same correction for replayable source.
- **Deployment evidence:** Vercel production deployment `dpl_BZ5ixvg4fZgmXRaRY4bUHpP8ksTQ` is `READY` for `081a728457c9f157384f77455ca39997e65e5dcf`, aliases `fornexasc.com`, and the public home returned HTTP 200.
- **Migration-history boundary:** the standard Supabase ledger recorded service-assigned entries `master_data_foundation` and `harden_movement_duration_execute`; the older provenance divergence and `MIGRATIONS_FAILED` integration state remain unresolved. No historical entry was renamed, repaired or inferred.
- **Remaining verification boundary:** no authenticated product workflow was exercised in this run. DeepSeek reviewed exact PR #87 HEAD `c267cd0883523d4cc607c804d7a112cb6bd201f9` with `MERGE YES` and no MUST findings; Gemini did not respond and is not counted as approval.

## 2026-10-02 Master Data Foundation & WMS Structure (Sprint P0/P1)

- **Branch:** `codex/master-data-foundation`.
- **Scope:** Implementation of benchmark-aligned Master Data and WMS physical/logical movement infrastructure:
  1. **Product Catalog (`products`, `product_packagings`, `uom_definitions`, `uom_conversions`)**: packaging hierarchy (units -> boxes -> pallets), unit conversions, dimensions, weights, ADR/hazardous and temperature control flags, and backward-compatible linkage to `order_lines.product_id`.
  2. **Carrier Compliance & Onboarding (`carrier_profiles`, enriched `parties`)**: carrier qualification status, insurance policy number, insurance carrier, coverage amount, insurance expiry date (for dispatch-prevention checks), transport license (tarjeta de transporte), and GLN/EORI/parent company attributes on `parties`.
  3. **Multi-Company / Multi-Society (`companies`, `party_roles`, `external_identifiers`)**: separation of legal entities under tenants with individual tax IDs, functional currencies, and fiscal addresses; normalized `party_roles` per company with validity periods; and universal cross-reference `external_identifiers` mapping internal IDs to SAP, Business Central, Oracle OTM, and external WMS systems.
  4. **WMS Physical & Logical Structure (`warehouse_zones`, `warehouse_bins`, `inventory_quants`, `inventory_movements`)**: physical bin locations (aisle, rack, shelf, position, bin type, weight/volume limits), inventory on hand per bin/batch/expiry (`inventory_quants`), and complete hourly and duration traceability for internal movements (`requested_at`, `started_at`, `completed_at`, `duration_seconds`, `operator_id`).
- **Migration:** `supabase/migrations/20261002233000_master_data_foundation.sql`.
- **Security & RLS:** All 11 new tables have Row-Level Security enabled with `tenant_isolation` policy using `public.fornexa_has_tenant_access(tenant_id)` and automated `updated_at` triggers.

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

- Supabase production/preview project status: `ACTIVE_HEALTHY`;
- integrated Git branch `main`: `MIGRATIONS_FAILED`;
- 34 active SQL migrations in Git vs 33 rows in standard `supabase_migrations.schema_migrations`;
- 3 exact version prefixes, 29 logical/name matches with different version prefixes/timestamps, 2 Git-only entries and 1 remote-only entry;
- production also has historical `public.fornexa_schema_migrations`, a second/internal ledger which records several Git-style versions not present in standard history.

For the 30 standard rows stored as one SQL string:

- **16/30 match current Git by byte/content** (exact or trailing-LF-only);
- **13/30 have different blob/content representation**: 12 are now directly confirmed executable-token/semantic equivalents and 1 (`tariff_engine_foundation`) contained real DDL drift repaired source-only;
- **1/30 is remote-only** (`cmr_canonical_model_rls_and_hardening`).

Claude's independent Git-vs-stored-statements recheck found that production's executed `tariff_engine_foundation` includes `tariff_rules_tenant_id_id_key`, while the Git migration omitted it. Production is healthy because the unique index already exists there. PR #72 restored the exact idempotent statement in current `main` before `pricing_run_components_rule_fk` and added a source-order regression test. The rollout executed no SQL and mutated no migration history; it repairs reproducibility of the versioned source only.

A literal-safe read-only comparison on 2026-09-12/13 now covers all **32/32 paired Git/standard-history migrations** with the same method. Pairing is explicit (31 exact names + one manual alias), the three historical arrays match element by element, and independent-review anchors include 72/72, 8/8, 20/20, 35/35, 57/57, 4/4 and 83/83. The tested method ignores only comments, external whitespace and unquoted case while preserving literals, quoted identifiers and dollar bodies byte-for-byte; synthetic negative controls and the removed tariff index fail comparison. Machine-readable evidence in `docs/verification/supabase-migration-content-audit-20260912.json` now separates physical cardinality, comparator statements, characters, UTF-8 bytes and wrapped/unwrapped base64 lengths; it hard-gates 2,419 wrapping LF and the three final-LF elements (mobile CMR ordinal 20; operational core ordinals 53 and 70), records exact server-side digest formulae and labels whether each control is reproducible from the permanent artifact. The final capture was streamed without a temporary payload file and stores no remote SQL/base64 payload. This closes content classification, not migration provenance/history.

**Evidence boundary:** 32/32 describes the recorded capture, not a fresh check of production. Offline tests regenerate Git-side digests and compare recorded remote digests; remote SQL is not retained, so the remote side cannot be independently reconstructed/recomputed from the artifact. `remote_array_text_md5_postgres` is copied server evidence, not client-recomputed. Renewing remote verification requires an authorized read-only capture. The baseline is the last migration-changing commit at capture, not current application HEAD; fixture failures require review/regeneration rather than an automatic claim of production drift.

Special cases remain:

- `20260812_local_storage_import.sql`: absent from standard history but present in the internal ledger as historically applied. Its live effects are now verified read-only against production: expected tables/columns/defaults, constraints, RLS/policies, indexes and the partial tax-ID uniqueness replacement are present. Evidence: `docs/verification/local-storage-import-live-effects-20260911.md`. This does **not** authorize standard-history alignment without replay.
- `20260818_cmr_number_sequence_resync.sql`: absent from both ledgers. Current sequence is 11 while the highest persisted 2026 canonical CMR suffix is 3; there is no current evidence of invariant violation, but the migration **must not be marked applied by inference**.
- standard-history-only `20260817212235 cmr_canonical_model_rls_and_hardening`: exact SQL recovered from `supabase_migrations.schema_migrations.statements`. Production confirms its six CMR `tenant_isolation` policies, RLS on the internal ledger and `search_path=''` on `fornexa_check_expedition_delivery_note_order()` are still active.
- `20260818_fix_order_expedition_cardinality` appears in the internal ledger but its current Git file is `.sql.obsolete` comments only. The active restore migration is defensive/idempotent and converges to the canonical Pedido↔Expediente 1:1 invariant, but current Git no longer reproduces production's exact historical path.

Full map and safe plan: `docs/verification/supabase-migration-provenance-20260911.md`.

**Do not** rename historical migration files on `main`, rerun applied SQL, use blanket `migration repair`, edit standard migration history or create a Supabase development/Preview branch yet. The next gates are:

1. prepare a non-production reconciliation branch preserving the recovered remote-only hardening source and explicitly classifying both Git-only migrations;
2. obtain cost and explicit approval for a Supabase Preview/development branch;
3. replay from an empty DB/Preview;
4. verify schema/RLS/functions/cardinalities/DeCA/telemetry invariants;
5. only then propose explicit per-version history alignment and re-test Git integration.

A Supabase Preview/development branch may incur cost; use `get_cost` and obtain explicit user approval before creating one.

## CMR continuation identity and headers — closed in production

PR #66 closed continuation-page context and clipping-related integrity. Goods boxes 6–12 use semantic table markup with a real `thead`; print repeats CMR identity and goods headings on each page containing goods.

- functional production SHA: `f7bfa5701a0b27d83cf63a77c2e036377a37b2c9`;
- CI #282 success and Vercel production READY on that SHA;
- manual Chromium 144.0.7559.96 synthetic evidence: normal 2 lines → 1 page; 42 lines → 3 pages/42 of 42; long-row case → 3 pages/42 of 42/no blank page; 80 lines → 4 pages/80 of 80;
- residual only: optional physical frame polish on continuation pages. Do not reopen no-clipping, integrity or repeated-header work.

Evidence: `docs/verification/cmr-continuation-headers-20260910.md` and `scripts/verify-cmr-continuation-print.py`.

### CMR physical continuation-page frame — prepared, not integrated or deployed

The frame is repeated per page fragment by keeping the existing `.paper` border and adding
`-webkit-box-decoration-break: clone; box-decoration-break: clone` inside `@media print`.
`@page` carries no `border`. The choice is driven by failure behaviour, not appearance: this
form is strictly additive, so an engine without support renders exactly what it renders today,
while `@page { border }` would require removing the `.paper` border and degrades to no frame at
all on any engine that ignores the descriptor. The product requirement is normal operation on
the four main browsers, so the mechanism with a guaranteed floor was chosen.

- **Risk:** high, because it affects CMR/PDF output, even though the change is CSS-only and does
  not touch data, QR readiness, signatures, the semantic table, repeated headings, page breaks,
  geometry or overflow.
- **Measured evidence:** `docs/verification/cmr-continuation-frame-20260919.md`. The harness now
  verifies the frame by pixel inspection on every page; all four fixtures pass with four closed
  sides, and the negative control without the change fails with the top edge missing on
  continuation pages. Page counts are identical with and without the change.
- **Verification boundary:** Chromium 141 verified. **Firefox and Safari are unverified** — they
  cannot be executed in the verification environment. The additive design is what makes that
  acceptable, not an assumption about their support.
- **Known limitation:** on the last page the frame closes at the end of the content rather than
  at the foot of the sheet. A full-sheet frame there would need a `position: fixed` overlay,
  which is not additive; deferred.
- **Next safe action:** independent exact-HEAD review, then CI/Preview, then explicit merge
  authorisation.

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

## Backlog by execution context

### Requires another device/session or explicit cost approval

- TLM-1 production env configuration: dedicated hash secret + OWNER allowlist + controlled access/hash verification.
- DeCA authenticated OWNER/ADMIN E2E.
- CMR/PDF native acceptance with a real QR.
- Supabase paid Preview/development branch for A2 replay: cost must be obtained and explicitly approved before creation.
- Claude exact-HEAD review where the available Slack workflow does not return a response; never convert a non-response into approval.

### Executable from current tooling

- A2: prepare replay-safe reconciliation without touching production history. Homogeneous literal-safe classification is complete and machine-auditable for all 32/32 paired migrations, the source-only tariff-index repair is merged, and `local_storage_import` live-effect verification is closed and evidenced.
- Multi-tenant debt: audit every producer of `local_storage_imports` / `local_storage_sync_runs`; both tables still default missing `tenant_id` to the historical pilot UUID. Treat removal of that default as a dedicated post-A2 schema change with tests, not as provenance repair.
- eCMR design/implementation work that does not depend on the blocked authenticated DeCA E2E: signer identity/authentication model, evidence, integrity/sealing, jurisdiction and lifecycle boundaries.
- ADR 2025 source verification/import preparation.
- Control Tower replacement of demo metrics with tenant-aware traceable sources.
- Mobile stable-channel planning and CI/distribution hardening.
- Optional CMR continuation-page physical-frame polish.

### Other backlog

- MMO-1: Preview-only, isolated provider configuration; Production must remain without temporary flags/keys.
- Tenant autonomy and critical E2E coverage remain open product work.

## DeepSeek independent reviewer

Reviewer repository: `fragonh2-boop/fornexa-ai-reviewer`. Reviewer remains independent/read-only: no merge/deploy authority and no need for secrets.

Use explicit target semantics:

- repository review: `MODE: MAIN`, `TARGET: main`, exact `HEAD`;
- PR review: `MODE: PR`, a standalone line such as `PR #74`, and a separate exact `HEAD: <sha>` line; omit numeric `TARGET` (the parser reserves TARGET for `main`);
- canonical trigger: `DEEPSEEK — ACCIÓN REQUERIDA`.

Send actionable requests as channel-root messages and verify their formatting after sending. DeepSeek may answer in separate root messages: search by reviewer author as well as reading the request thread. Do not interpret a quiet request thread as no response.

## Governance

GPT owns implementation/integration work; Claude and DeepSeek provide independent review where appropriate; Fran decides ties. Preserve Pedido/Expediente 1:1 and standard Supabase migration tracking. Update lib/memorandum.ts, this handoff and docs/pending-log.md when material state changes. Mirror material handoffs in Slack #fornexa. Do not claim tested, merged, migrated, configured or deployed without direct evidence.

Risk-based review is recorded in `14d9429` as a technical proposal agreed by Claude, GPT and DeepSeek; **Fran's explicit ratification or correction remains pending.** Until then, it must not be used to retroactively justify direct commits or bypass branch-protection decisions. The proposal defines low risk as documentation, code comments, or UI/copy text only, and none of supabase/migrations, auth/RLS/Storage routes, PDF/CMR/DeCA generation, or capability tokens. A single independent reviewer, Claude or DeepSeek, whichever responds, confirms MERGE YES/NO against the exact HEAD; no re-auditing files already reviewed in a prior PR on the same change, and no new full round per incremental commit unless scope changes. A PR touching any file outside this allowlist is high risk by default, even if described as docs.

High risk: everything else, explicitly including auth, RLS, money/tariffs, migrations, legal signatures/documents such as CMR/DeCA, tenant isolation, Storage privacy, DeCA/capability-token lifecycle, PDF/CMR integrity, and atomicity/race conditions. Full reinforced review continues unchanged: independent Claude and DeepSeek review, exact-HEAD, CI/Vercel/Supabase verification, MUST/SHOULD/NICE verdict.

Non-response is never approval, at either risk level, see the PR 68 and 73 precedents, both logged as governance exceptions and not approvals; a reviewer's silence must be logged as such and never counted as MERGE YES. Closed audits stay closed unless new evidence appears, see the A2 tariff_engine_foundation drift found after that audit had already been marked complete; reopening requires citing the specific new evidence, not re-litigating what was already reviewed.

Acceptance criteria and edge cases such as long text or addresses, high-volume records, and empty or malformed API responses must be specified in the implementation request before work starts, not discovered during review. Each PR should state its own risk level, low or high, in its description for auditability. The verdict must stay traceable to the exact PR and SHA it covers; migrate the formal record to GitHub reviews and comments progressively so it does not depend on Slack alone.

Reviewer reliability, 2026-09-14/15: fornexa-ai-reviewer crashed on a malformed DeepSeek API response and left a review lock stuck for about 22 hours. Fixed in PR 11, squash cac13c5: validated API responses, per-call timeout, ownership-tokened recoverable locks, and a non-terminal REVISION FALLIDA Slack notice on real failures. Claude reviewed exact HEAD 3df112767abfdede9af4900c9e12133c3e8e58bc, MUST none, MERGE yes, merged it and redeployed manually; a clean restart was confirmed.

Operational invariants apply while ratification remains pending: every verdict must name the full 40-character reviewed SHA, and any new commit invalidates that verdict. Deployment must remain bound to the same reviewed SHA and fixed target, revalidate repository HEAD and required checks immediately before starting, and verify terminal platform state and production health before declaring success.

Preserve a recoverable AI checkpoint containing branch, exact SHA, PR, checks actually run, stated risk class, open findings and next authorized action. Mirror material checkpoints in Slack `#fornexa` without credentials.
