import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { activeDashboardHref, createDashboardHref, dashboardHref, dashboardNavigation, isPlusShortcut } from "../app/components/DashboardNavigation.ts";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("demo and authenticated layouts retain the same shell without importing auth into demo", () => {
  const real = source("app/dashboard/layout.tsx");
  const demo = source("app/demo/layout.tsx");
  for (const layout of [real, demo]) {
    assert.match(layout, /<div className=\{styles\.frame\}>/);
    assert.match(layout, /<div className=\{styles\.stage\}>/);
    assert.match(layout, /import styles from "(?:\.\/|\.\.\/dashboard\/)layout\.module\.css"/);
  }
  assert.match(real, /if \(!auth\) redirect\("\/login"\);/);
  assert.match(demo, /if \(!isPreviewDemoEnabled\(\)\) notFound\(\);/);
  assert.doesNotMatch(demo, /getAuthenticated|createSupabase|LocalStorageMigrator/);
  assert.match(source("app/components/DashboardSidebar.tsx"), /<DashboardSidebarView sessionAction=/);
  const demoSidebar = source("app/demo/DemoSidebar.tsx");
  assert.match(demoSidebar, /<DashboardSidebarView basePath="\/demo"/);
  assert.doesNotMatch(demoSidebar, /supabase|createClient|signOut\(|\/dashboard["'`]/);
  const common = source("app/components/DashboardSidebarView.tsx");
  assert.match(common, /dashboardNavigation\.map\(/);
  assert.match(common, /const demo = basePath === "\/demo";/);
  assert.match(common, /prefetch=\{demo \? false : undefined\}/);
  assert.doesNotMatch(common, /supabase|auth-context|createClient|signOut\(/);
});

test("Control Tower uses one render view and never loads operational data from the demo", () => {
  const production = source("app/dashboard/page.tsx");
  const demo = source("app/demo/page.tsx");
  for (const page of [production, demo]) assert.match(page, /<ControlTowerView data=/);
  assert.match(demo, /illustrative basePath="\/demo"/);
  assert.doesNotMatch(demo, /getAuthenticated|createSupabase|getRealOverview|fetch\(|localStorage/);
  const view = source("app/components/ControlTowerView.tsx");
  assert.doesNotMatch(view, /fetch\(|localStorage|createSupabase|auth-context|process\.env/);
  assert.doesNotMatch(view, /href=["']\/dashboard/);
  assert.match(view, /dashboardHref\(basePath, suffix\)/);
  assert.match(view, /data\.readError && <p role="alert"/);
  assert.match(view, /data\.parts\.length === 0/);
  assert.match(view, /data\.shipments\.length === 0/);
  assert.match(view, /data\.trips\.length === 0/);
  assert.match(view, /const prefetch = basePath === "\/demo" \? false : undefined;/);
});

test("production and demo use the same fifteen-module navigation hierarchy", () => {
  assert.equal(dashboardNavigation.length, 15);
  assert.equal(new Set(dashboardNavigation.map(([, suffix]) => suffix)).size, 15);
  assert.deepEqual(dashboardNavigation.map(([label]) => label), ["Control Tower", "Decision Center", "Partidas", "Expediciones", "Viajes", "Aduanas", "Ofertas y tarifas", "Clientes", "Artículos", "Colaboradores", "Almacenes", "Tracking", "ePOD & CMR", "Integraciones", "Informes"]);
  for (const [, suffix] of dashboardNavigation) {
    assert.equal(dashboardHref("/demo", suffix), dashboardHref("/dashboard", suffix).replace(/^\/dashboard/, "/demo"));
  }
});

test("nested records and creation routes retain the correct active module in both namespaces", () => {
  for (const basePath of ["/dashboard", "/demo"] as const) {
    for (const [path, active] of [["/registros/clientes/DEMO-001", "/clientes"], ["/registros/ofertas-tarifas/nuevo", "/ofertas-tarifas"], ["/nuevo/partida", "/partidas"], ["/nuevo/expedicion", "/expediciones"], ["/nuevo/viaje", "/viajes"], ["/viajes/DEMO-001", "/viajes"], ["/epod-cmr/nuevo", "/epod-cmr"], ["/articulos", "/articulos"]]) {
      assert.equal(activeDashboardHref(`${basePath}${path}`, basePath), `${basePath}${active}`);
    }
    assert.equal(activeDashboardHref("/demographic/partidas", basePath), basePath);
  }
});

test("the plus shortcut only opens creation routes in its own namespace", () => {
  for (const basePath of ["/dashboard", "/demo"] as const) {
    assert.equal(createDashboardHref(`${basePath}/partidas`, `${basePath}/partidas`, basePath), `${basePath}/nuevo/partida`);
    assert.equal(createDashboardHref(`${basePath}/registros/clientes/DEMO-001`, `${basePath}/clientes`, basePath), `${basePath}/registros/clientes/nuevo`);
    assert.equal(createDashboardHref(`${basePath}/epod-cmr`, `${basePath}/epod-cmr`, basePath), `${basePath}/epod-cmr/nuevo`);
    assert.equal(createDashboardHref(`${basePath}/nuevo/partida`, `${basePath}/partidas`, basePath), null);
    assert.equal(createDashboardHref(`${basePath}/registros/clientes/nuevo`, `${basePath}/clientes`, basePath), null);
    assert.equal(createDashboardHref(`${basePath}/articulos`, `${basePath}/articulos`, basePath), null);
  }
  assert.equal(createDashboardHref("/demo/partidas", "/dashboard/partidas", "/demo"), null);
});

test("plus shortcut preserves modifier and numpad handling", () => {
  const plain = { key: "+", code: "Equal", altKey: false, ctrlKey: false, metaKey: false, shiftKey: true };
  assert.equal(isPlusShortcut(plain), true);
  for (const modifier of ["altKey", "ctrlKey", "metaKey"] as const) assert.equal(isPlusShortcut({ ...plain, [modifier]: true }), false);
  assert.equal(isPlusShortcut({ ...plain, code: "NumpadAdd", shiftKey: false }), true);
  assert.equal(isPlusShortcut({ ...plain, code: "NumpadAdd" }), false);
  assert.equal(isPlusShortcut({ ...plain, key: "-", code: "Minus" }), false);
});
