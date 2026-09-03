# CMR internal authenticated access — 2026-09-03

## Context
`GET /api/cmr/[cmr]` previously required a per-document capability (`x-fornexa-key`) or its derived view-session cookie even for authenticated internal users. This caused legitimate users to receive 401 when opening CMRs visible in their own tenant list if the current browser did not hold that capability.

## Contract implemented
- Preserve capability access as the primary path.
- Reject a valid capability belonging to another CMR with 403 before any fallback.
- Fallback only through `getAuthenticatedContext()`; never `getAuthenticatedOrReviewContext()`.
- Resolve internal access by `cmr_number + tenant_id`.
- Keep downstream operational reads tenant-scoped.
- Return a generic 401 when there is no valid internal tenant context or the requested CMR is absent from that tenant, avoiding a cross-tenant existence oracle.
- `getAuthenticatedContext()` already returns null for zero or multiple active memberships; this case must remain a generic 401 rather than become a 500.

## Validation expected before merge
- Capability access still works.
- View-session access still works.
- Authenticated same-tenant user can open without browser-local capability state.
- Cross-tenant user cannot open.
- Unauthenticated request without capability cannot open.
- REVIEW token does not grant internal CMR access.
- Zero or multiple active memberships return generic 401.
- Canonical projection and event reads remain unchanged.

## Governance
Auth/API/multi-tenancy sensitive. No merge or production deployment until CI is green and Claude independently reviews the actual HEAD/diff. No database migration is required.
