import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync("app/api/cmr/[cmr]/route.ts", "utf8");
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
