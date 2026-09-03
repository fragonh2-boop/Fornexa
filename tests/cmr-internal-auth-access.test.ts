import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync("app/api/cmr/[cmr]/route.ts", "utf8");
const qrRoute = readFileSync("app/api/cmr/[cmr]/qr/route.ts", "utf8");
const authContext = readFileSync("lib/auth-context.ts", "utf8");

test("CMR capability access remains primary", () => {
  assert.ok(route.includes("documentForAccessKey(headerKey)"));
  assert.ok(route.includes("documentForViewSession(sessionToken, cmrNumber)"));
  assert.ok(route.indexOf("documentForAccessKey(headerKey)") < route.indexOf("getAuthenticatedContext()"));
});

test("valid capability for another CMR is rejected before internal fallback", () => {
  assert.ok(route.includes("accessDocument && accessDocument.cmr_number !== cmrNumber"));
  assert.ok(route.includes("status: 403"));
});

test("internal fallback uses only normal authenticated context", () => {
  assert.ok(route.includes('import { getAuthenticatedContext } from "@/lib/auth-context"'));
  assert.ok(route.includes("const authenticated = await getAuthenticatedContext()"));
  assert.ok(!route.includes("getAuthenticatedOrReviewContext"));
});

test("internal lookup is scoped by CMR number and tenant", () => {
  assert.ok(route.includes('.eq("cmr_number", cmrNumber)'));
  assert.ok(route.includes('.eq("tenant_id", authenticated.tenantId)'));
});

test("no auth context and no tenant document share the generic 401 path", () => {
  assert.ok(route.includes("if (!authenticated) return genericUnauthorized()"));
  assert.ok(route.includes("if (!tenantDocument) return genericUnauthorized()"));
});

test("downstream operational reads remain tenant-scoped", () => {
  assert.ok(route.includes('.eq("cmr_id", accessDocument.id).eq("tenant_id", tenantId)'));
});

test("zero or multiple active memberships fail closed", () => {
  assert.ok(authContext.includes('.limit(2)'));
  assert.ok(authContext.includes("memberships.length !== 1"));
  assert.ok(authContext.includes("return null"));
});

test("QR route preserves capability access before tenant-auth fallback", () => {
  assert.ok(qrRoute.includes("documentForAccessKey(queryKey)"));
  assert.ok(qrRoute.includes("documentForViewSession(sessionToken, cmrNumber)"));
  assert.ok(qrRoute.indexOf("documentForAccessKey(queryKey)") < qrRoute.indexOf("getAuthenticatedContext()"));
  assert.ok(qrRoute.includes("data && data.cmr_number !== cmrNumber"));
  assert.ok(qrRoute.includes("status: 403"));
});

test("QR route internal fallback is normal-auth only and tenant scoped", () => {
  assert.ok(qrRoute.includes('import { getAuthenticatedContext } from "@/lib/auth-context"'));
  assert.ok(qrRoute.includes("const authenticated = await getAuthenticatedContext()"));
  assert.ok(!qrRoute.includes("getAuthenticatedOrReviewContext"));
  assert.ok(qrRoute.includes('.eq("cmr_number", cmrNumber)'));
  assert.ok(qrRoute.includes('.eq("tenant_id", authenticated.tenantId)'));
  assert.ok(qrRoute.includes('select("cmr_number,tenant_id,access_key,access_key_expires_at,access_key_revoked_at")'));
});

test("QR route fails closed without authenticated tenant access or public capability", () => {
  assert.ok(qrRoute.includes("if (!authenticated) return genericUnauthorized()"));
  assert.ok(qrRoute.includes("if (!tenantDocument || !internalQrAccessKeyIsActive(tenantDocument)) return genericUnauthorized()"));
});

test("QR route internal fallback rejects revoked, expired or invalid access keys", () => {
  assert.ok(qrRoute.includes("document.access_key_revoked_at"));
  assert.ok(qrRoute.includes("document.access_key_expires_at"));
  assert.ok(qrRoute.includes("Date.parse(document.access_key_expires_at)"));
  assert.ok(qrRoute.includes("expiresAt <= Date.now()"));
});
