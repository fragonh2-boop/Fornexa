import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DEMO_CUSTOMERS, DEMO_CUSTOMS_CASES, DEMO_CMR_ROWS } from "../lib/preview-demo-master-lists.ts";

const source = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const views = [
  ["clientes", "CustomersListView"],
  ["aduanas", "CustomsListView"],
  ["epod-cmr", "CmrListView"],
] as const;

test("production and demo render the same pure list views", () => {
  for (const [route, view] of views) {
    const production = source(`app/dashboard/${route}/page.tsx`);
    const demo = source(`app/demo/${route}/page.tsx`);
    assert.match(production, new RegExp(`import ${view} from "\\./${view}"`));
    assert.match(demo, new RegExp(`import ${view} from "\\.\\./\\.\\./dashboard/${route}/${view}"`));
    assert.match(production, new RegExp(`<${view} `));
    assert.match(demo, new RegExp(`<${view} [^>]*basePath="/demo"`));
    assert.doesNotMatch(demo, /supabase|auth-context|\/page["']|fetch\(|getCustomers\(|getCases\(|getDocuments\(/);
  }
});

test("pure list views cannot load or mutate backend data", () => {
  for (const [route, view] of views) {
    const component = source(`app/dashboard/${route}/${view}.tsx`);
    assert.doesNotMatch(component, /createSupabase|supabase-admin|auth-context|fetch\(|localStorage|sessionStorage/);
    assert.doesNotMatch(component, /href=["']\/dashboard/);
    assert.doesNotMatch(component, /`\/dashboard\//);
    assert.match(component, /basePath\?: "\/dashboard" \| "\/demo"/);
  }
});

test("demo grids do not persist browser preferences", () => {
  for (const [route, view] of [views[0], views[2]]) {
    const component = source(`app/dashboard/${route}/${view}.tsx`);
    assert.match(component, /const demo = basePath === "\/demo"/);
    assert.match(component, /persistPreferences=\{!demo\}/);
  }
});

test("master-list fixtures use synthetic ids and exercise active, closed and empty values", () => {
  assert.equal(DEMO_CUSTOMERS.length, 3);
  assert.equal(DEMO_CUSTOMS_CASES.length, 3);
  assert.equal(DEMO_CMR_ROWS.length, 3);
  assert.ok(DEMO_CUSTOMERS.every(item => item.code.startsWith("DEMO-")));
  assert.ok(DEMO_CUSTOMS_CASES.every(item => item.id.startsWith("DEMO-")));
  assert.ok(DEMO_CMR_ROWS.every(item => String(item.cmr).startsWith("DEMO-")));
  assert.ok(DEMO_CUSTOMERS.some(item => item.status === "Inactivo" && item.addresses === 0));
  assert.ok(DEMO_CUSTOMERS.some(item => item.tradeName.length > 70));
  assert.ok(DEMO_CUSTOMS_CASES.some(item => item.status === "Cerrado" && item.mrn === "—"));
  assert.ok(DEMO_CMR_ROWS.some(item => item.firmas === "0/3"));
  assert.ok(DEMO_CMR_ROWS.some(item => item.firmas === "3/3"));
});
