import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { hasValidCmrCustomerSelection, selectedCmrCustomerCodes } from "../lib/cmr-customer-selection.ts";

const source = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const customers = [{ code: "TEST-C01", name: "Cliente uno" }, { code: "TEST-C02", name: "Cliente dos" }];

test("CMR customer selection requires one or more unique codes from the loaded master", () => {
  assert.equal(hasValidCmrCustomerSelection([], customers), false);
  assert.equal(hasValidCmrCustomerSelection(["TEST-C01"], customers), true);
  assert.equal(hasValidCmrCustomerSelection(["TEST-C01", "TEST-C02"], customers), true);
  assert.equal(hasValidCmrCustomerSelection(["FOREIGN-C01"], customers), false);
  assert.equal(hasValidCmrCustomerSelection(["TEST-C01", "FOREIGN-C01"], customers), false);
  assert.equal(hasValidCmrCustomerSelection(["TEST-C01", "TEST-C01"], customers), false);
  assert.equal(hasValidCmrCustomerSelection(["TEST-C01"], []), false);
  assert.deepEqual(selectedCmrCustomerCodes(["TEST-C01", "FOREIGN-C01", "TEST-C02", "TEST-C01"], customers), ["TEST-C01", "TEST-C02"]);
});

test("real CMR customer options require authentication, active customers and a tenant-scoped query", () => {
  const page = source("app/dashboard/epod-cmr/nuevo/page.tsx");
  assert.match(page, /const auth = await getAuthenticatedOrReviewContext\(\);/);
  assert.match(page, /if \(!auth\) redirect\("\/login"\);/);
  assert.match(page, /\.from\("parties"\)/);
  assert.match(page, /\.eq\("tenant_id", auth\.tenantId\)/);
  assert.match(page, /\.eq\("is_customer", true\)/);
  assert.match(page, /\.eq\("status", "ACTIVE"\)/);
  assert.match(page, /<NewCmrWorkspace customers=\{customers\}/);
  assert.match(page, /catch[\s\S]*<NewCmrWorkspace customers=\{\[\]\} customerLoadError/);
  assert.doesNotMatch(page, /simulation|DEMO-|EX-260071|CLI-000146/);
});

test("the CMR form exposes a bounded master selection while production remains empty and failures block emission", () => {
  const workspace = source("app/dashboard/epod-cmr/nuevo/NewCmrWorkspace.tsx");
  assert.match(workspace, /customerIds:\[\]/);
  assert.match(workspace, /: EMPTY_CMR_FORM;/);
  assert.match(workspace, /availableCustomers = simulation \? DEMO_CMR_CUSTOMERS : customers;/);
  assert.match(workspace, /select multiple value=\{form\.customerIds\}/);
  assert.match(workspace, /selectedCmrCustomerCodes\(codes,availableCustomers\)/);
  assert.match(workspace, /!simulation&&customerLoadError/);
  assert.match(workspace, /hasValidCmrCustomerSelection\(form\.customerIds,availableCustomers\)/);
  assert.match(workspace, /if\(missing\.length\|\|issuing\|\|issued\)return;/);
  assert.doesNotMatch(workspace, /\/api\/customers|createSupabase|auth-context/);
  const demo = source("app/demo/epod-cmr/nuevo/page.tsx");
  assert.match(demo, /<NewCmrWorkspace simulation/);
  assert.doesNotMatch(demo, /supabase|auth-context|fetch\(|\/page["']/);
});
