import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { isDemoDataAllowed, resolveDeploymentEnvironment } from "../lib/demo-mode.ts";

test("production never allows demo data", () => {
  assert.equal(isDemoDataAllowed({ VERCEL_ENV: "production", NODE_ENV: "production" }), false);
  assert.equal(isDemoDataAllowed({ VERCEL_ENV: "production", NODE_ENV: "development" }), false);
  assert.equal(isDemoDataAllowed({ NEXT_PUBLIC_VERCEL_ENV: "production" }), false);
});

test("preview and local development keep demo data", () => {
  assert.equal(isDemoDataAllowed({ VERCEL_ENV: "preview", NODE_ENV: "production" }), true);
  assert.equal(isDemoDataAllowed({ VERCEL_ENV: "development" }), true);
  assert.equal(isDemoDataAllowed({ NODE_ENV: "development" }), true);
});

test("unknown or missing environments fail closed", () => {
  assert.equal(resolveDeploymentEnvironment({}), "unknown");
  assert.equal(isDemoDataAllowed({}), false);
  assert.equal(isDemoDataAllowed({ NODE_ENV: "production" }), false);
  assert.equal(isDemoDataAllowed({ VERCEL_ENV: "staging", NODE_ENV: "development" }), false);
  assert.equal(isDemoDataAllowed({ NODE_ENV: "test" }), false);
});

test("VERCEL_ENV takes precedence over the public mirror", () => {
  assert.equal(resolveDeploymentEnvironment({ VERCEL_ENV: "production", NEXT_PUBLIC_VERCEL_ENV: "preview" }), "production");
});

const gatedScreens = [
  "app/dashboard/page.tsx",
  "app/dashboard/[module]/page.tsx",
  "app/dashboard/colaboradores/velocity/page.tsx",
  "app/dashboard/integraciones/page.tsx",
];

test("every former atrezzo screen consults the demo gate at request time", () => {
  for (const file of gatedScreens) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.match(source, /isDemoDataAllowed\(\)/, `${file} must call isDemoDataAllowed()`);
    assert.match(source, /export const dynamic = "force-dynamic"/, `${file} must be evaluated per request`);
  }
});

test("demo fixtures are not imported by client bundles directly", () => {
  for (const file of ["app/dashboard/colaboradores/velocity/VelocityClient.tsx", "app/dashboard/integraciones/IntegracionesClient.tsx"]) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /isDemoDataAllowed|process\.env/, `${file} must receive the decision as a prop`);
  }
});

test("every Control Tower query is scoped to the session tenant", () => {
  const source = readFileSync(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8");
  const queries = source.match(/supabase\.from\(/g) ?? [];
  const tenantFilters = source.match(/\.eq\("tenant_id", tenant\)/g) ?? [];
  assert.ok(queries.length >= 2, "expected Control Tower to query Supabase");
  assert.equal(tenantFilters.length, queries.length, "each supabase.from(...) needs its own tenant filter");
  assert.match(source, /if \(!auth\) return EMPTY;/);
});

test("a failed Control Tower read is shown as unavailable, not as zero", () => {
  const source = readFileSync(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8");
  assert.match(source, /return UNAVAILABLE;/);
  assert.match(source, /catch \(error\)/);
});

test("no personal address is prefilled in production forms", () => {
  for (const file of ["app/dashboard/integraciones/EmailWorkspace.tsx", "app/dashboard/registros/[module]/[id]/OfferEmailEditor.tsx"]) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /useState\("[^"]+@[^"]+"\)/, `${file} must not prefill an email address`);
  }
});
