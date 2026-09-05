# FORNEXA — DeCA-2 private artifact + controlled public access

## Scope

This increment extends the DeCA-1 production foundation without deciding M8 applicability, the final native DeCA PDF template, eCMR signing/authentication or the operational lifecycle policy.

## Contract implemented

1. `regulatory-documents` is a private Supabase Storage bucket, restricted to `application/pdf` and 5 MB.
2. Internal artifact intake uses only `getAuthenticatedContext()`; REVIEW context is excluded.
3. Intake is initially restricted to `OWNER` / `ADMIN`, tenant-scoped by `cmr_number + tenant_id`, and never publishes the document implicitly.
4. PDF bytes are stored with `upsert:false`; each correction becomes a new immutable `regulatory_document_artifacts` version linked by `supersedes_artifact_id`.
5. SHA-256 and byte size are persisted with the issued artifact.
6. Public access is a separate explicit operation. `public_until` is mandatory and must be future-dated; `service_completed_at`, when supplied, preserves the existing maximum seven-day post-completion constraint.
7. Public tokens are 32 random bytes encoded base64url. Only their SHA-256 is persisted. The raw token is returned once to the issuer.
8. QR resolves to the FORNEXA route `/regulatory/d/{token}` — never directly to a public/signed Storage URL.
9. The public route is fail-closed: malformed, unknown, future, expired, deactivated or lifecycle-invalid tokens return the same unavailable response.
10. Before serving the private PDF the route verifies byte size and SHA-256 against the immutable artifact record.
11. Responses are no-store and PDF delivery uses `nosniff` plus restrictive CSP.

## Explicitly not closed here

- M8 applicability / exemptions / field matrix.
- Native PDF composition from canonical CMR data; current intake accepts an already-rendered PDF and labels metadata `regulatory_template_status: pending_m8_validation`.
- Automatic derivation of `service_completed_at` and `public_until` from operational events.
- eCMR reliable authentication/signature and jurisdiction matrix.
- A2 migration provenance reconciliation.

## Validation required before merge

- CI green on exact HEAD, including memorandum gate, typecheck, lint, build, tests and Mobile.
- Canonical Vercel Preview READY on exact HEAD.
- Independent Claude review focused on public-capability security, tenant isolation, token lifecycle, Storage privacy, integrity verification, route semantics and migration safety.
- Supabase migration must not be applied to production before the code/review gates are green.
- After approval and merge: apply migration with Supabase migration tooling, verify bucket is private/PDF-only/5 MB, verify deployment READY, then perform controlled E2E with non-production/test CMR data before promoting Memorandum status to Producción.
