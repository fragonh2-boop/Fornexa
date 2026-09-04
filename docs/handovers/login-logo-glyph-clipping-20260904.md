# FORNEXA — login logo glyph clipping regression

## Context

On 2026-09-04 Fran supplied a production screenshot showing the lower-right stroke of the final `A` in the `4NXA` login mark clipped. This is a new rendering defect, not a reopening of the historical wrapper clipping fixed by PR #39.

## Root cause

`app/components/FornexaLogo.tsx` used `viewBox="10 0 378.33 170"` and text rendered through the fallback stack `Arial, Helvetica, sans-serif`. The login wrapper already allowed overflow, but the root `<svg>` itself did not. Font metrics can vary by browser/OS, so a slightly wider fallback glyph can cross the SVG viewport and be clipped internally.

## Fix

- Expand the root SVG viewBox to `10 0 400 170`.
- Set `overflow="visible"` on the root SVG as a second boundary defense.
- Add `tests/ux-visual-guards.test.ts` to protect SVG margin/overflow and existing CMR print chrome exclusion.
- Add `docs/ux/UX_AUDIT_PROTOCOL.md` so visual PRs require deployed visual evidence and representative breakpoints; green typecheck/lint/tests/build alone are not sufficient UX closure.
- Track the new regression explicitly in `docs/pending-log.md` and the public Memorandum.

## Validation contract

1. GitHub CI green on the exact HEAD.
2. Canonical `fornexa` Preview READY on the exact HEAD.
3. Visual check of `/login` on representative browser viewport(s); confirm no clipping of the final `A` and no new disproportion/spacing regression.
4. Independent technical cross-review of the root cause and remediation direction.
5. Merge only after the evidence above is satisfactory; then verify canonical production READY and repeat the production smoke/evidence checks.

## Production closure

- Independent Claude review identified the root SVG viewport as the clipping boundary and recommended widening the viewBox and/or declaring root SVG overflow; the implemented remediation follows that direction.
- Exact PR HEAD `caea2d10f1ae0bc380cc404ae95f0c7c6c42d8c2` passed GitHub Actions CI #191.
- Canonical Preview `dpl_Dxwvx87JkYMAtXpnWUt5VjSrSkVc` reached READY on that exact HEAD and `/login` served the corrected SVG.
- Fran visually validated the exact Preview with `correcto`, closing the real visual gate.
- PR #49 was squash-merged into `main` as `c450862f6262f8f3f864f2d744c20e0b1fb43b73`.
- Canonical production deployment `dpl_9HkCv3bVwypBSL3QkVtsV2GSDovH` reached READY on that exact merge SHA with alias `fornexasc.com`.
- Production `https://fornexasc.com/login` returns HTTP 200 and serves `viewBox="10 0 400 170"` plus `overflow="visible"` on the root SVG.
- Production runtime logs for that deployment contain no `error` or `fatal` entries in the post-deploy verification window.
- A complementary raster before/after render showed the final `A` complete with additional right-side margin. Automated full-browser screenshot tooling was unavailable in the execution runtime, so this complementary render was not used as a substitute for Fran's real-browser Preview validation.

No database, auth, API, multi-tenancy or migration change is involved. The regression is closed in production; `docs/ux/UX_AUDIT_PROTOCOL.md` remains the permanent visual-evidence gate for future UX work.
