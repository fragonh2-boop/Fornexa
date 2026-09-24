# CMR print typography and QR size — measured evidence (2026-09-24)

## Origin

Fran shared a real exported CMR (`CMR-26000003`, pilot expedition `EX-PILOTO-260809-04`)
and reported small type and a small, crowded QR. This document records what was measured on
that file, not an impression of it.

## What the real export actually contained

Measured with `pdfplumber` on the PDF Fran provided (A4, 209.9 × 297.0 mm, one page):

| element | size in the real export |
| --- | --- |
| box body text (names, addresses, goods description) | **4.35 pt** |
| box labels (`1 EXPEDIDOR`, `16 TRANSPORTISTA`, …) | 4.27 pt |
| goods table column headers and continuation identity row | **3.60 pt** |
| goods row cells | 4.12 pt |
| box numbers | 4.50 pt |
| document title | 6.75 pt |
| CMR number | 9.00 pt |

Those values are the direct consequence of the `@media print` block: `5.8px` at 96 dpi is
4.35 pt, `4.8px` is 3.60 pt. They were chosen to force the whole form onto one A4 sheet, but
the sheet was not full — every box was mostly empty space.

QR, measured by pixel inspection of the rasterised page (200 dpi): the dark module area was
**7.5 mm wide**, inside the 10 mm box declared by `.documentNumber img`, with its top edge
1.3 mm below the document frame (frame at 9.0 mm, QR modules starting at 10.3 mm). A 10 mm
box in a header cell of roughly the same height is what makes it read as stuck to the frame.

## What this change does

Only the `@media print` block changes. Everything outside it is byte-identical, verified by
comparing the file before and after with `difflib`.

| element | before | after |
| --- | --- | --- |
| box body text | 5.8px → 4.35 pt | **10px → 7.50 pt** |
| box labels | 5.7px → 4.27 pt | 8px → 6.00 pt |
| goods headers / identity row | 4.8px → 3.60 pt | 7.5px → 5.62 pt |
| goods row cells | 5.5px → 4.12 pt | 9px → 6.75 pt |
| signature state / footer | 5.5px / 4.8px | 8px / 7px |
| QR box | 10 × 10 mm, 1.5 mm from the edge | **22 × 22 mm, 2 mm from the edge** |
| header right column | 44 mm | 56 mm, `min-height: 27 mm` |
| signature band | 32 mm | 36 mm |

Paddings grow proportionally so the larger type does not touch the box rules, and the
document number gets `white-space: nowrap` so a longer CMR number cannot wrap under the QR.

## Verification performed

A faithful static replica of the document was rendered with headless Chromium 141
(`page.pdf`, `prefer_css_page_size`) against the production stylesheet, first unmodified and
then patched.

- **Replica fidelity:** the unmodified render reproduces the real export's font sizes exactly
  — 3.60 / 4.12 / 4.27 / 4.35 / 6.75 / 9.00 pt — which is what makes the comparison meaningful.
- **After the change:** body 7.50 pt, labels 6.00 pt, goods 6.75 pt, title 10.50 pt; QR dark
  module area measured at **20.2 mm** by pixel inspection.
- **Pagination:** still one A4 page for this document, with the available white space absorbing
  the larger type. The continuation machinery from PR #66/#79 is untouched.

## Boundaries

Chromium only; Firefox and Safari were not executed. No data, no API, no migration and no
QR payload changed — this is presentation geometry inside `@media print`. The printed result
should be confirmed on a real printer before it is treated as operationally accepted.
