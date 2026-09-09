# CMR overflow — current state

- FORNEXA production `main`: `d4e1d15bf53d518aa1f3c2ca606a2a0a3dfc52ce`.
- PR #59 and #60 are already in production.
- DeepSeek reviewer communication was revalidated on 2026-09-09 with `MODE: MAIN` / `TARGET: main` after Render was redeployed on reviewer SHA `6461eb0a16c3b7ffbeff9f558de64ebb945f23e0`.
- Current work is limited to preventing silent CMR print clipping when real content exceeds the first A4 sheet.
- Branch: `fix/cmr-print-overflow-safety`.
- Do not mix this change with DeCA E2E, eCMR, MMO-1, auth closeout, or Supabase Preview reconciliation.
