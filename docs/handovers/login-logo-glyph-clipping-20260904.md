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
- Track the new regression explicitly in `docs/pending-log.md` and the public Memorandum as Preproducción.

## Required validation

1. GitHub CI green on the exact HEAD.
2. Canonical `fornexa` Preview READY on the exact HEAD.
3. Visual check of `/login` on desktop, tablet and mobile; confirm no clipping of the final `A` and no new disproportion/spacing regression.
4. Independent Claude review of the exact HEAD/diff as UX cross-review.
5. Merge only after the evidence above is satisfactory; then verify canonical production READY and repeat the visual symptom check.

No database, auth, API, multi-tenancy or migration change is involved.
