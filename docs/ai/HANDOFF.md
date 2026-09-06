# FORNEXA — Technical handoff

This file is the portable source of truth for resuming FORNEXA work. Read it together with `docs/pending-log.md` and verify remote state before acting.

## Current verified snapshot

- **Updated:** 2026-09-06 21:02 CEST.
- **Repository:** `fragonh2-boop/Fornexa`.
- **Integrated and deployed:** `main` is at `21fe9819b1d85c9f3b2567d570b41ebd2651b020` (553 commits), the squash merge of PR #53. GitHub Actions CI run `33959140426` succeeded on that exact SHA; both Vercel status checks are successful. Vercel deployment `dpl_4U1Nqeb8X8JkZCAvdHpby462Bmnj` is `READY`, targets production, carries that exact verified GitHub SHA and aliases `fornexasc.com` without alias error.
- **DeCA-2:** PR #51 is integrated. Private PDF artifact intake, immutable versioning, explicit hashed public tokens, QR and a fail-closed FORNEXA resolver are deployed. The production migration list contains `20260905051522 deca_regulatory_storage`; its timestamp differs from the repository filename `20260905054500_deca_regulatory_storage.sql`, so retain it as A2 provenance work rather than rerunning it.
- **Supabase Preview:** the check associated with current `main` (`21fe981`) failed, while GitHub Actions CI succeeded. The branch-preview integration remains unresolved; do not treat a migration-bearing preview as verified.
- **CMR fixes:** PRs #44–#47 are merged and verified in production.
- **Login logo:** PR #39 is merged; `lib/memorandum.ts` records the unclipped logo as Production. Do not reopen the obsolete pending entry.
- **MMO-1:** PR #38 remains draft at `865bee04f4581bb1d64cfd1fbe06941af8cee62a`; CI #187 and canonical preview are green, and Claude reported no MUST blocker.
- **MMO-1 gate:** provider execution is blocked until the seven server-side variables are configured only for the controlled Preview. Production must remain without the activation flag and provider keys.
- **Supabase:** DeCA-1 foundation and T1 append-only foundations are applied. Preserve migration provenance differences under A2; do not rerun applied migrations.

## AI review infrastructure — DeepSeek Slack bot

- **Integrated:** the separate repository `fragonh2-boop/fornexa-ai-reviewer` is at `349bf3bfbfc60b2fc0b24d3294b283189043441e`, the squash merge of PR #5. PRs #2–#5 added contextual-thread ingestion, pagination, stable Slack author identity and correct root detection for parent messages whose `thread_ts` equals `ts`.
- **Review and checks:** DeepSeek independently reviewed PR #5 exact HEAD `5aec0366f3c08fe1b48aa989ac4239b50dc10980` and reported no MUST, SHOULD or NICE findings. That HEAD passed the production build, 11/11 tests, `git diff --check` and `npm audit --omit=dev` with zero vulnerabilities.
- **Deployed:** Render reported `Deploy succeeded` and `Live` for exact integrated SHA `349bf3bfbfc60b2fc0b24d3294b283189043441e`.
- **Slack RPA:** the deployed bot reconstructed the seven authorized onboarding packages from the original thread and returned seven response chunks headed `DEEPSEEK — FASE 0: PREGUNTAS PARA COMPLETAR CONTEXTO`. The response contained 40 questions split into P0/P1/P2, a minimum context package and access questions; it did not emit the prohibited initial product analysis.
- **Access assessment from DeepSeek:** GitHub and Vercel read-only were classified as essential; redacted Supabase and specific Drive documents as useful; additional Slack-thread access as optional and authorization-bound. No new connection has been granted by this assessment.
- **Governance decision:** when Claude is unavailable, GPT will negotiate or request independent review from DeepSeek through authorized Slack messages. DeepSeek remains consultative and read-only; its output is evidence, not proof of merge, deployment, legal compliance or Fran's approval.
- **Remaining gate:** Fran must validate the usefulness and priority of the 40 questions and decide which requested context or connections to provide. Do not infer that validation from successful RPA.

## Recently deployed work awaiting final approval

### CMR print/PDF QR readiness — PR #52

- **Production defect reproduced:** authenticated CMR detail returned 200 while its QR endpoint returned 401 for an expired, non-revoked capability; the browser rendered a broken image. A current non-expiring CMR loaded the QR successfully.
- **Root cause:** the page rendered and invoked `window.print()` without waiting for the QR resource. The QR route correctly preserves expiry/revocation fail-closed behavior and is unchanged.
- **Prepared fix:** print/export remain disabled until `onLoad` confirms the exact QR source; automatic `?print=1` also waits. A failed QR is hidden, replaced by a neutral unavailable state and can be retried with a cache-busted source; the UI no longer claims every network/render failure means expiry. The original behavior of the `Imprimir` button remains separate from PDF-title preparation.
- **Final code verification:** exact PR HEAD `6e9dcaa46b29db9ac5144370e63823c317dfd36b` passed 82/82 web tests, typecheck, lint without errors (seven existing warnings), production build, memorandum gate and `git diff --check`. GitHub CI run `33955568773` and both Vercel checks passed; Supabase Preview was skipped because there is no schema change.
- **Claude convergence:** Claude independently verified the final exact HEAD and reported no MUST. The earlier SHOULD items were consumed by neutral error copy, explicit safe retry and separation of `Imprimir` from PDF-title preparation. The remaining duplicate disabled-cursor CSS rule was classified as NICE only.
- **Codex convergence response:** agreement is complete: backend expiry/revocation remains fail-closed, frontend print/export waits for the exact QR, and the UX distinguishes unavailable state from confirmed expiry with safe retry. There is no evidence-backed objection; the duplicate cursor rule is cosmetic and non-blocking. No technical question remains open between Claude and Codex. Closure is therefore explicit and solid on implementation, deployment and screen-level production RPA; the only remaining acceptance gate is Fran's native print/PDF visual validation. The NICE cleanup can be handled separately without reopening this functional fix.
- **Integrated and deployed:** PR #52 was squash-merged as `58513ba954f2b37e58c9987421951370e5eb3a1d`; CI run `33955972837` passed and the canonical production deployment for that exact SHA is `READY` on `fornexasc.com`.
- **Production RPA:** a current CMR loaded a real 150×150 QR and enabled print/PDF only after load. An expired-capability fixture showed no broken image, kept both actions disabled, rendered `QR no disponible` in the document and returned to that controlled state after explicit retry. Runtime evidence contained no `error`/`fatal` entries during verification. Native browser print/PDF output is not machine-verified.
- **Remaining gate:** Fran must visually validate the native print/PDF output. Keep this item open until that explicit approval; do not infer it from screen-level RPA.

## Deployed work awaiting production RPA

### Login retry after transient client failure — PR #53

- **Observed:** Fran's production screenshot showed the generic client/network login error. Two same-origin login telemetry requests reached Vercel, while Supabase Auth recorded no password-token request for that interval. The public config route responds 200, the project reports healthy and the production-origin CORS preflight succeeds.
- **Root cause confirmed in code:** `lib/supabase/client.ts` cached a rejected initialization promise indefinitely. Once config/network setup failed, every later login attempt in that tab reused the same rejection and could not recover without a reload.
- **Prepared fix:** clear only a rejected client promise so the next submit performs a fresh load; retain successful client caching and provide an actionable, public-safe recovery message. Regression tests require two independent fetch attempts after consecutive transient failures and exactly one fetch across repeated calls after a successful load.
- **Claude convergence:** Claude reviewed exact HEAD `0935458acb9496b5c8bd4d7a68de05d4bcd68b45`, reported **SIN MUST**, and published `respuesta_claude_pr53_login_retry_cliente_transitorio_20260905_1124` in Drive. Its single SHOULD was the missing complementary success-cache test. After that test was added, Claude rereviewed exact HEAD `eeccd500f79fde5984227d14afc24a5cddefde97`, confirmed the SHOULD consumed and again concluded **SIN MUST**. Two remaining NICE observations are non-blocking and pre-existing/scope-only.
- **Preview evidence:** the canonical Preview and GitHub CI for exact PR HEAD `eeccd500f79fde5984227d14afc24a5cddefde97` passed, including both Vercel checks; Supabase Preview was skipped because there is no schema change. Browser RPA loaded `/login` without console errors and an intentionally nonexistent account reached Supabase and produced the specific invalid-credentials path, rather than the generic client/network failure. Direct browser interception of `fetch` is unavailable in this RPA environment, so the same-tab transient retry itself remains verified by the behavioral test.
- **Local verification:** 84/84 tests, typecheck, lint without errors (seven existing warnings), production webpack build and `git diff --check` pass after consuming Claude's SHOULD.
- **Integrated and deployed:** PR #53 was squash-merged as `21fe9819b1d85c9f3b2567d570b41ebd2651b020`. CI run `33959140426` and both Vercel status checks on that SHA are successful. Canonical Vercel deployment `dpl_4U1Nqeb8X8JkZCAvdHpby462Bmnj` is `READY`, targets production, carries exact SHA `21fe981` and aliases `fornexasc.com` without alias error. Its Supabase Preview check failed (rather than being skipped); no schema change is part of this PR, but the unresolved integration remains a platform risk.
- **Preview failure explained:** Fran's failed-login screenshot used `fornexa-oqvccv5up-fornexasc.vercel.app`, not the production domain. Direct readback of that preview's `/api/supabase-config` returned HTTP 500 with both the Supabase URL and public key reported missing. The same endpoint on `fornexasc.com` returned HTTP 200 and `/login` also returned 200. This explains the screenshot without attributing it to the supplied credentials.
- **Not verified:** a successful production sign-in and real access validation have not been observed.
- **Next gate:** retry through `https://fornexasc.com/login` and obtain Fran's real-access validation. If it fails there, investigate that production request separately; do not transfer the preview diagnosis to production without evidence.

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
