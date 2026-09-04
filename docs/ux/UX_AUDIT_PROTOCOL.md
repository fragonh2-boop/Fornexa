# FORNEXA — UX audit protocol

Visual changes are not considered closed by typecheck, lint, unit tests or build alone. Any change that can alter layout, typography, SVG rendering, responsive behavior, printing or visible interaction must carry explicit visual evidence before production closure.

## Mandatory evidence for visual PRs

1. Verify the affected surface on the exact current Preview deployment, not a stale branch or local assumption.
2. Check at least desktop (>=1440 px), tablet (~900-1100 px) and mobile (~390-430 px) when the surface is responsive.
3. Inspect clipping/overflow, text wrapping, font fallback, focus/hover states, empty/error states and primary actions relevant to the change.
4. For SVG/brand work, verify the SVG's own viewport/overflow boundary; parent CSS alone is not sufficient evidence.
5. For print/PDF surfaces, verify a real print/PDF render and confirm dashboard chrome is absent where required.
6. Record the Preview deployment/SHA plus the observed result in the PR/handoff. A source-only assertion can protect a known invariant but does not replace visual evidence.
7. A user screenshot showing a regression overrides an earlier “Producción” UX status until the new defect is diagnosed and closed with fresh evidence.

## Current high-risk UX watchlist

- `/login`: FORNEXA SVG logo, typography fallback and responsive two-column/single-column transition.
- CMR detail: QR rendering and internal/public access states.
- CMR print/PDF: A4 document only, no dashboard sidebar or chrome.
- Password recovery: confirmation-message contrast / WCAG AA.

## Closure rule

A visual issue moves to **Producción / cerrado** only after code/test gates are green, the canonical deployment is READY, and visual evidence on the deployed SHA confirms the reported symptom is absent. If browser automation is unavailable, the item remains visually unverified rather than being inferred from source code alone.
