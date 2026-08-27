# FORNEXA agent rules

These rules apply to every automated or human-assisted change in this repository.

## Mandatory closeout

A task that changes application behavior, data models, migrations, infrastructure, dependencies, or the mobile application is not complete until all of the following are true:

1. The relevant tests, type checks, lint checks, and production build pass.
2. `lib/memorandum.ts` is updated in the same change with a concise public-safe milestone or an accurate update to the current focus.
3. The memorandum date and commit coverage are current.
4. The change is committed and pushed.
5. The production deployment is `READY`, its commit SHA matches the intended commit, and the production domain resolves to that deployment.
6. The final report states the commit, checks performed, deployment status, and any remaining risk.

Never claim completion before this closeout is verified. Do not bypass or weaken `.github/workflows/ci.yml` or `scripts/check-memorandum-update.mjs` to make a change pass.

The public memorandum must not expose credentials, internal identifiers, personal data, tenant IDs, deployment IDs, or security-sensitive implementation details.
