# Password recovery confirmation contrast — 2026-09-10

## Scope

Static verification of the current FORNEXA recovery/first-access confirmation styling. No auth behavior, credentials, Supabase configuration or production data was changed.

Production code inspected on `main` baseline `a78a8fc01f23ef8cb583fda15df13d68c713cd28`:

- `app/login/page.tsx` renders the recovery/first-access success confirmation with `auth-message auth-message-success`.
- `app/reset-password/page.tsx` uses the same success class after a password is updated/created.
- `app/globals.css` defines `.auth-message-success { color:#14532d; background:#ecfdf3; border-color:#86c99a; }`.

## Contrast calculation

Foreground: `#14532d`.
Background: `#ecfdf3`.

Using the WCAG relative-luminance contrast formula, the resulting text/background ratio is **8.64:1**.

WCAG 2.2 Success Criterion 1.4.3 requires at least **4.5:1** for normal-size text at Level AA. The current confirmation styling therefore exceeds AA and also exceeds the **7:1** Level AAA text threshold for normal text.

Normative reference: https://www.w3.org/TR/WCAG22/#contrast-minimum

## Decision

The historical pending item to “improve recovery-password confirmation contrast” is already satisfied by the current shipped style. Changing the colors merely to close the pending item would create unnecessary visual churn. Close the item by evidence instead of altering product code.

This verification is deterministic for the declared solid foreground/background pair. A future browser/device visual audit remains useful for broader layout, zoom, font rendering and responsive behavior, but it is not required to establish the color contrast ratio itself.
