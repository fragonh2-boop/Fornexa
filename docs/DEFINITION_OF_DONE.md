# FORNEXA definition of done

Use this checklist for every functional delivery.

- [ ] Scope and affected surfaces are identified.
- [ ] Implementation and migrations are complete.
- [ ] Tests, type checks, lint, and production build pass where applicable.
- [ ] Tenant isolation, permissions, and public-data exposure have been reviewed.
- [ ] `lib/memorandum.ts` records the milestone or updates the current focus without confidential details.
- [ ] Memorandum date and commit coverage are current.
- [ ] Commit is pushed to the intended branch.
- [ ] Required CI checks pass.
- [ ] Production deployment is `READY` and references the intended commit SHA.
- [ ] `fornexasc.com` resolves to that production deployment and the affected flow is verified.
- [ ] Final handoff names the commit, checks, deployment, and remaining risks.

The automated memorandum gate is intentionally narrower than this checklist: it prevents functional changes from landing without the memorandum file, while the remaining items require evidence during closeout.
