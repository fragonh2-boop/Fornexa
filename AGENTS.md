# FORNEXA agent protocol

These instructions apply to every agent working in this repository.

## Session start

Before making changes:

1. Verify the repository, remote, current branch, `HEAD`, and working-tree status.
2. Read `docs/ai/HANDOFF.md` and `docs/pending-log.md`.
3. When network access is available, compare the local state with `origin/main` before treating it as current.
4. Treat repository history, merged pull requests, CI results, database migration history, and verified production deployments as stronger evidence than conversation memory.

## Persistent handoff

Any session that changes FORNEXA code, schema, configuration, product behavior, deployment state, or public documentation must update `docs/ai/HANDOFF.md` before it ends. Include the handoff update in the same pull request or commit whenever possible.

Keep the handoff concise and operational. Record:

- update time and the evidence used;
- branch, commit, and pull request where relevant;
- what changed and the user-visible or technical result;
- migrations, tests, type checks, lint, builds, and end-to-end checks actually run;
- deployment identifier, environment, and observed status when a deployment occurred;
- blockers, decisions, unfinished work, and the next safe action;
- any local or remote work that exists but is not merged or deployed.

Do not claim that work is merged, deployed, tested, or verified without direct evidence. Never store secrets, tokens, credentials, private URLs, personal data, or exploitable security details in the handoff.

## Pending work

Use `docs/pending-log.md` as the persistent task register:

- add new confirmed work under `OPEN`;
- move an item to `DONE` only after implementation and the required verification/deployment are complete;
- preserve useful acceptance criteria and evidence;
- reconcile the `OPEN` section with the summary in `docs/ai/HANDOFF.md`.

## Summary requests

When asked for the latest FORNEXA status, last steps, recent changes, or pending work:

1. Read `docs/ai/HANDOFF.md` and `docs/pending-log.md`.
2. Inspect recent Git history and current status.
3. If connectors are available and freshness matters, verify `origin/main`, relevant pull requests, CI, Supabase migrations, and the production deployment.
4. Clearly distinguish completed, merged, deployed, pending, and locally uncommitted work.
