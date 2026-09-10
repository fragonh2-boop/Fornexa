# CMR print overflow verification — 2026-09-10

## Scope

Post-merge verification of PR #62 (`CMR: evitar clipping silencioso en impresión A4`) on production `main` SHA `5ee1966d395b6b8c3206b18bddf7c478cf2200bd`.

The verification uses a controlled synthetic CMR with the same document structure and the exact production print CSS from `app/dashboard/epod-cmr/[cmr]/cmr-document.module.css`. No customer or production shipment data is used.

## Production evidence

- PR #62 merged on 2026-09-09.
- GitHub Actions CI #253 (`34394379972`) completed successfully on exact merge SHA `5ee1966d395b6b8c3206b18bddf7c478cf2200bd`.
- Vercel production deployment `dpl_5SCoG4J42weTaGs2QBFGA9HeZJQv` is READY on the same SHA.
- Vercel runtime query for warning/error/fatal events over the following 24 hours returned none.
- DeepSeek reviewed the exact PR HEAD `28b54c53ff7d9a3c9e0ee409412d997936fb9c43` before merge and reported no MUST blocker; its main SHOULD was to verify actual multi-page browser output.

## Chromium print verification

Browser engine: system Chromium 144 driven through Playwright, `page.pdf()` with print media and CSS page size enabled.

### Normal document

Fixture: ordinary party/address values, 2 goods lines and 1 ADR line.

Result:

- 1 page;
- A4 portrait (594.96 × 841.92 pt);
- document height under print CSS: approximately 279 mm;
- header, goods, ADR, boxes 13–21, signatures 22–24 and footer remain visible on the same page;
- no clipping or overlap observed in the rendered page.

### Extreme document

Fixture: long legal names and addresses, long reservations/particular terms, 28 goods lines and 10 ADR lines.

Result:

- 2 A4 pages;
- calculated document height under print CSS: approximately 522.3 mm;
- 28/28 unique goods-line markers are present in extracted PDF text;
- ADR, boxes 13–21, signatures 22–24 and footer are all present;
- visual render shows rows 1–15 on page 1 and continuation rows 16–28 plus ADR, lower boxes, signatures and footer on page 2;
- no silent clipping or visible text overlap observed.

## Residual visual improvement

The second page currently continues the goods grid directly and does not repeat the CMR document header or the goods-column headings. This is not a data-loss or clipping defect and does not block the PR #62 integrity objective, but it should be tracked as a separate print-continuation UX improvement. A future browser-level regression test would also be stronger than source-regex checks for fragmentation behavior.

## Verdict

The integrity objective of PR #62 is verified in production code: a normal CMR preserves the single-page A4 layout, while content that exceeds one page paginates instead of being silently discarded. PR #62 can be recorded as Production, with repeated continuation headers/frame polish kept as a separate non-blocking improvement.
