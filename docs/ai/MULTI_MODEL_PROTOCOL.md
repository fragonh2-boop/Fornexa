# FORNEXA — Multi-model review protocol

## Purpose

Use independent model providers as a controlled engineering review system without creating a three-way voting loop.

## Roles

- **GPT / OpenAI — implementer and integration owner.** Owns implementation, evidence collection, consolidation and final technical handoff.
- **Claude / Anthropic — architecture reviewer.** Reviews architecture, security, regressions, maintainability and operational coherence.
- **DeepSeek — technical red team.** Looks for edge cases, unsafe assumptions, data integrity issues, privilege errors, concurrency and performance failure modes.

Reviewer models do not directly modify production state. GPT remains the integration node unless Fran explicitly changes governance.

## Evidence and convergence

Repository state, tests, CI, migration history, official specifications and observed production behavior outrank model opinion. Objective defects are verified and corrected. Risks become checks where practical. Opinion-only disagreements get at most two rounds; unresolved defensible options after round 2 are escalated to Fran.

## Review packet and data governance

Every outbound review packet carries task/objective, repository/commit/PR reference, changed files, bounded diff, checks, constraints/questions and an explicit data classification.

Outbound provider execution is **fail-closed**: the packet must be explicitly classified `public_code`. `unknown`, confidential, customer/provider or personal-data packets are blocked. A sensitive-material detector runs before provider payload construction and blocks detected credentials/tokens/private keys. Prompt construction also redacts detected secret-like material defensively.

DeepSeek must not receive business-confidential, customer/provider or personal data unless a later explicit policy decision plus legal/data-residency review authorizes it.

## Provider safety controls

Provider keys/models remain server-side environment configuration and never use `NEXT_PUBLIC_`. Provider execution is poisoned with `server-only` and retains a runtime server guard as defense in depth. Calls use bounded timeout, at most one retry for transient/network failures, and hard-bounded output tokens for OpenAI, Anthropic and DeepSeek. Provider transport errors do not include raw response bodies.

Every run carries `requestId`, `runId` and `opinionRound`; each normalized provider review records provider/model/role plus those correlation fields. `opinionRound` is programmatically restricted to 1 or 2.

## Activation boundary

The provider-neutral orchestration core remains server-only. PR #38 also contains a **temporary controlled Preview-only activation surface** solely for the first governed manual run: an internal page and POST route that are fail-closed unless `FORNEXA_AI_REVIEW_ENABLED=true`, `VERCEL_ENV=preview`, and the exact PR branch is deployed. The route additionally requires an authenticated `OWNER`, a same-origin POST, accepts no caller-supplied review packet, and uses only a fixed `public_code` packet with sanitized output.

This temporary Preview surface is not authorized for production and must be disabled and removed before merge. No GitHub webhook, scheduler, autonomous PR trigger, or production provider-key activation is authorized by MMO-1.

The repository also includes a manual operator command, `pnpm ai:review -- <packet.json>`, which is a validation-only dry run by default and never prints credential values. Provider calls require the additional explicit `--execute` flag. The command has no network listener, scheduler, webhook or autonomous trigger.
