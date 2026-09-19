# CMR continuation-page physical frame — measured evidence (2026-09-19)

## What changed

`app/dashboard/epod-cmr/[cmr]/cmr-document.module.css`, inside `@media print`, on `.paper`:

```
border:1px solid #000;                       (unchanged, kept)
-webkit-box-decoration-break:clone;          (added)
box-decoration-break:clone;                  (added)
```

`@page` is untouched and carries no `border`.

## Why this mechanism and not `@page { border }`

Three mechanisms were measured on the same fixture with Chromium 141.0.7390.37 headless
(Playwright `page.pdf`, `prefer_css_page_size`), rasterised at 150 dpi and checked by pixel:

| mechanism | pages 1–2 | last page |
| --- | --- | --- |
| `@page { border }` | full frame | full frame |
| `box-decoration-break: clone` on `.paper` | full frame | frame closes at end of content |
| `position: fixed` overlay | full frame | full frame |

All three work in Chromium. They differ in what happens on an engine that does **not**
implement them:

- `@page { border }` requires removing the border from `.paper`. An engine that ignores the
  descriptor then prints the CMR with **no frame at all** — worse than the current state.
  MDN still documents `border` on `@page` as implemented by no user agent; that is stale for
  Chromium (verified below) but gives no basis to assume Gecko or WebKit paint it.
- `box-decoration-break: clone` is **strictly additive**: `.paper` keeps its existing border,
  so an engine without support renders exactly what it renders today, and an engine with
  support repeats the border on every page fragment. It cannot regress any browser.

The product requirement is normal operation across the four main browsers, so the mechanism
with a guaranteed floor was chosen over the one with the better best case.

Known limitation: on the last page the frame closes where the content ends rather than at the
foot of the sheet. A full-sheet frame on the last page would require the `position: fixed`
overlay, which is not additive (combined with the `.paper` border it draws a double line in
Chromium) and is therefore deferred pending cross-engine confirmation.

## Chromium is stale in MDN, confirmed by two controls

- **Colour control:** `@page{border:4px solid #ff0000}` produced a red line at 8.97 mm. No
  element in the fixture is red, so the paint can only come from the page box.
- **Position control:** with `margin:25mm` the same red line moved to 24.89 mm, tracking the
  page-box margin.

This only establishes Chromium. Firefox and WebKit could not be executed in the verification
environment (npm registry and both Playwright CDNs are blocked by egress policy, and no
`firefox-esr` package is available), so they remain unverified — which is precisely why the
additive mechanism was chosen.

## Harness result

`scripts/verify-cmr-continuation-print.py` now checks the frame by pixel inspection on every
page (four sides closed), in addition to its existing page, marker, repeated-heading and
blank-page checks.

```
Chromium 141.0.7390.37
normal:      rows=2  pages=1 goods_pages=[1]          frame=OK 4 lados en 1 pag; alturas mm=[278.9]
42:          rows=42 pages=3 goods_pages=[1, 2]       frame=OK 4 lados en 3 pag; alturas mm=[279.1, 279.1, 71.8]
42-longrow:  rows=42 pages=3 goods_pages=[1, 2, 3]    frame=OK 4 lados en 3 pag; alturas mm=[279.1, 279.1, 126.0]
80:          rows=80 pages=4 goods_pages=[1, 2, 3, 4] frame=OK 4 lados en 4 pag; alturas mm=[279.1, 279.1, 279.1, 175.9]
```

**Negative control.** With the `.paper` change reverted and the frame check kept, the harness
fails as it should, reporting the top edge missing on the continuation pages:

```
AssertionError: 42: marco fisico incompleto o ausente en paginas [2, 3] ->
  [{'top': True,  ... 'height_mm': 102.6},
   {'top': False, ... 'height_mm': 264.3},
   {'top': False, ... 'height_mm': 71.5}]
```

## Two defects found in the harness itself

1. **False failure from PDF text extraction.** On `main`, before any change, the harness failed
   with `42: missing markers [11]`. The goods line is not missing: the extracted text reads
   `MK-1 1 11 PAL Mercancía de prueba 1 1 STAT-11 111 kg 1.1 m³` — Chromium's kerning splits the
   digit pair, so `\bMK-11\b` does not match. The row, its statistical number, weight and volume
   are all present. The check now normalises whitespace and tolerates spacing between digits.
2. **No total-integrity invariant.** A per-marker regex that can be defeated by kerning also
   gives weak assurance about what it passes. A count of goods lines (one `PAL` per line) was
   added, which is immune to digit kerning.

## Pagination varies by Chromium version — unresolved

The 42-row fixture renders as **3 pages** on Chromium 141 here. PR #78 reported 2 pages on
Chrome 153, and the PR #66 evidence recorded 3 pages on Chromium 144. The page count of this
fixture is therefore version-dependent and should not be quoted as a fixed expectation. This
change does not alter pagination: the page counts are identical with and without it.

## Boundaries

No migration, no Supabase change, no deployment, no configuration change. Firefox and Safari
are unverified. No claim of operational CMR acceptance is made.
