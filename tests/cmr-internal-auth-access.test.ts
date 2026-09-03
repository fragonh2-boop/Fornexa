import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("app/api/cmr/[cmr]/route.ts", "utf8");
const authContext = readFileSync("lib/auth-context.ts", "utf8");

describe("CMR internal authenticated access contract", () => {
  it("keeps capability access as the primary path", () => {
    expect(route).toContain("documentForAccessKey(headerKey)");
    expect(route).toContain("documentForViewSession(sessionToken, cmrNumber)");
    expect(route.indexOf("documentForAccessKey(headerKey)")).toBeLessThan(route.indexOf("getAuthenticatedContext()"));
  });

  it("rejects a valid capability for another CMR before internal fallback", () => {
    expect(route).toContain("accessDocument && accessDocument.cmr_number !== cmrNumber");
    expect(route).toContain("status: 403");
  });

  it("uses only normal authenticated context for the internal fallback", () => {
    expect(route).toContain('import { getAuthenticatedContext } from "@/lib/auth-context"');
    expect(route).toContain("const authenticated = await getAuthenticatedContext()");
    expect(route).not.toContain("getAuthenticatedOrReviewContext");
  });

  it("scopes the internal document lookup by CMR number and tenant", () => {
    expect(route).toContain('.eq("cmr_number", cmrNumber)');
    expect(route).toContain('.eq("tenant_id", authenticated.tenantId)');
  });

  it("returns the same generic 401 for no auth context and no tenant document", () => {
    expect(route).toContain("if (!authenticated) return genericUnauthorized()");
    expect(route).toContain("if (!tenantDocument) return genericUnauthorized()");
  });

  it("keeps downstream operational reads tenant-scoped", () => {
    expect(route).toContain('.eq("cmr_id", accessDocument.id).eq("tenant_id", tenantId)');
  });

  it("treats zero or multiple active memberships as no authenticated tenant context", () => {
    expect(authContext).toContain('.limit(2)');
    expect(authContext).toContain("memberships.length !== 1");
    expect(authContext).toContain("return null");
  });
});
