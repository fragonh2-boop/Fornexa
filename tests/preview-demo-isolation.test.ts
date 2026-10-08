import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import * as guards from "../lib/preview-demo.ts";

const source = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

function before(text: string, earlier: string, later: string) {
  const first = text.indexOf(earlier), second = text.indexOf(later);
  assert.ok(first >= 0, `missing ${earlier}`);
  assert.ok(second >= 0, `missing ${later}`);
  assert.ok(first < second, `${earlier} must precede ${later}`);
}

function section(file: string, start: string, end?: string) {
  const text = source(file), first = text.indexOf(start);
  assert.ok(first >= 0, `${file}: missing ${start}`);
  const last = end ? text.indexOf(end, first + start.length) : text.length;
  assert.ok(last > first, `${file}: missing ending marker ${end}`);
  return text.slice(first, last);
}

function guardBefore(text: string, guard: string, operation: string) {
  before(text, guard, operation);
  assert.match(text.slice(text.indexOf(guard), text.indexOf(operation)), /return\b/, "guard must terminate before operation");
}

function filesIn(relative: string): string[] {
  return readdirSync(new URL(`../${relative}/`, import.meta.url), { withFileTypes: true }).flatMap(entry => {
    const file = `${relative}/${entry.name}`;
    return entry.isDirectory() ? filesIn(file) : [file];
  });
}

test("public demo access requires exact server Preview environment and explicit opt-in", () => {
  const cases: [Record<string, string | undefined>, boolean][] = [
    [{ VERCEL_ENV: "preview", FORNEXA_PREVIEW_DEMO: "1", NODE_ENV: "production" }, true],
    [{ VERCEL_ENV: "preview", FORNEXA_PREVIEW_DEMO: "1" }, true],
    [{ VERCEL_ENV: "preview" }, false],
    [{ VERCEL_ENV: "preview", FORNEXA_PREVIEW_DEMO: "0" }, false],
    [{ VERCEL_ENV: "preview", FORNEXA_PREVIEW_DEMO: "true" }, false],
    [{ VERCEL_ENV: "production", FORNEXA_PREVIEW_DEMO: "1", NODE_ENV: "development" }, false],
    [{ VERCEL_ENV: "development", FORNEXA_PREVIEW_DEMO: "1" }, false],
    [{ NODE_ENV: "development", FORNEXA_PREVIEW_DEMO: "1" }, false],
    [{ NEXT_PUBLIC_VERCEL_ENV: "preview", FORNEXA_PREVIEW_DEMO: "1" }, false],
    [{ VERCEL_ENV: "staging", FORNEXA_PREVIEW_DEMO: "1" }, false],
    [{ VERCEL_ENV: "Preview", FORNEXA_PREVIEW_DEMO: "1" }, false],
    [{ VERCEL_ENV: "preview ", FORNEXA_PREVIEW_DEMO: "1" }, false],
    [{ VERCEL_ENV: "preview", NEXT_PUBLIC_FORNEXA_PREVIEW_DEMO: "1" }, false],
    [{}, false],
  ];
  for (const [env, expected] of cases) assert.equal(guards.isPreviewDemoEnabled(env), expected, JSON.stringify(env));
});

test("demo path boundary never matches authenticated routes or similar prefixes", () => {
  for (const path of ["/demo", "/demo/", "/demo/nuevo/partida", "/demo/viajes/DEMO-VJ-001"]) assert.equal(guards.isPreviewDemoPath(path), true, path);
  for (const path of [null, undefined, "", "/", "/dashboard", "/dashboard/demo", "/demonstration", "/demo-other", "/demo%2Fpartidas", "/Demo", "/api/demo", "/api/products"]) assert.equal(guards.isPreviewDemoPath(path), false, String(path));
});

test("only GET and HEAD enter opted-in demo; other methods are denied without affecting live routes", () => {
  const enabled = { VERCEL_ENV: "preview", FORNEXA_PREVIEW_DEMO: "1" };
  for (const path of ["/demo", "/demo/articulos", "/demo/epod-cmr/DEMO-CMR-001"]) {
    for (const method of ["GET", "HEAD"]) assert.equal(guards.previewDemoRequestStatus(path, method, enabled), 200);
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS", "TRACE", "get"]) assert.equal(guards.previewDemoRequestStatus(path, method, enabled), 405);
    for (const method of ["GET", "HEAD", "POST"]) {
      assert.equal(guards.previewDemoRequestStatus(path, method, {}), 404);
      assert.equal(guards.previewDemoRequestStatus(path, method, { VERCEL_ENV: "production", FORNEXA_PREVIEW_DEMO: "1" }), 404);
    }
  }
  for (const path of ["/dashboard", "/dashboard/nuevo/partida", "/api/orders", "/api/cmr", "/demo-other"]) {
    for (const method of ["GET", "POST"]) assert.equal(guards.previewDemoRequestStatus(path, method, enabled), null);
  }
});

test("proxy terminates demo requests before telemetry, auth or cookie work; server layout fails closed", () => {
  const proxy = source("proxy.ts");
  const demoBlock = section("proxy.ts", "const demoStatus =", "// TLM-1:");
  assert.match(demoBlock, /if \(demoStatus !== null\)/);
  assert.match(demoBlock, /return noStore\(response\)/);
  assert.match(demoBlock, /Allow", "GET, HEAD"/);
  assert.match(demoBlock, /X-Robots-Tag", "noindex, nofollow"/);
  assert.match(demoBlock, /Referrer-Policy", "no-referrer"/);
  assert.doesNotMatch(demoBlock, /cookies|createServerClient|callTelemetryRpc|isValidReviewToken/);
  before(proxy, "return noStore(response);", "event.waitUntil(");
  before(proxy, "return noStore(response);", "await isValidReviewToken");
  before(proxy, "return noStore(response);", "createServerClient(url, key");
  assert.match(proxy, /Cache-Control", "private, no-cache, no-store/);
  const layout = source("app/demo/layout.tsx");
  before(layout, "if (!isPreviewDemoEnabled()) notFound();", "return (");
  assert.match(layout, /export const dynamic = "force-dynamic"/);
  assert.doesNotMatch(layout, /LocalStorageMigrator|DashboardSidebar\b|getAuthenticated|createSupabase|cookies\(/);
  assert.match(source("app/dashboard/layout.tsx"), /if \(!auth\) redirect\("\/login"\)/);
});

test("demo route modules and fixtures never load operational server pages, credentials or persistence", () => {
  const demoFiles = filesIn("app/demo").filter(file => /\.tsx$/.test(file));
  const fixtureFiles = filesIn("lib").filter(file => /\/(?:preview-demo-(?!isolation)|demo-operational-)[^/]+\.ts$/.test(file));
  assert.ok(demoFiles.length >= 20);
  assert.ok(fixtureFiles.length >= 8);
  for (const file of [...demoFiles, ...fixtureFiles]) {
    const text = source(file);
    assert.doesNotMatch(text, /\bfetch\s*\(|\b(?:localStorage|sessionStorage)\s*\.|\bcookies\s*\(|\bprocess\.env|\bgetAuthenticated(?:OrReview)?Context\s*\(|\bcreate(?:Server|Supabase|Admin)Client\s*\(/, file);
    assert.doesNotMatch(text, /from ["'][^"']*(?:auth-context|supabase\/(?:server|admin|client)|dashboard\/[^"']*\/page)["']/, file);
    assert.doesNotMatch(text, /href=["']\/dashboard|redirect\(["']\/dashboard|router\.(?:push|replace)\(["']\/dashboard/, file);
  }
  for (const file of demoFiles.filter(file => file.endsWith("/page.tsx"))) {
    const text = source(file);
    const syntax = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    for (const statement of syntax.statements) {
      if (ts.isExportDeclaration(statement)) {
        assert.ok(statement.exportClause && ts.isNamedExports(statement.exportClause), `${file}: unexpected page re-export`);
        if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
          for (const exported of statement.exportClause.elements) assert.equal(exported.name.text, "default", `${file}: custom named page re-export`);
        }
      }
      if (!ts.canHaveModifiers(statement)) continue;
      const modifiers = ts.getModifiers(statement) ?? [];
      if (!modifiers.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue;
      assert.ok(modifiers.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword), `${file}: custom named page export`);
    }
    if (/params: Promise</.test(text)) assert.match(text, /await params/, `${file}: Next params must be awaited`);
    if (/searchParams: Promise</.test(text)) assert.match(text, /await searchParams/, `${file}: Next searchParams must be awaited`);
  }
});

test("client telemetry and preference storage terminate in demo before browser persistence", () => {
  const telemetry = source("app/components/TelemetryBridge.tsx");
  guardBefore(section("app/components/TelemetryBridge.tsx", "useEffect(() => {", "}, [pathname]);"), "if (isPreviewDemoPath(pathname))", "sessionId()");
  guardBefore(telemetry.slice(telemetry.indexOf("}, [pathname]);")), "if (isPreviewDemoPath(window.location.pathname))", "sessionId()");
  guardBefore(section("app/components/TelemetryBridge.tsx", "const onPageHide =", "window.addEventListener"), "if (isPreviewDemoPath(window.location.pathname))", "send({");
  const bridge = source("app/components/LocalStorageSyncBridge.tsx");
  guardBefore(bridge, 'if (window.location.pathname === "/demo"', "Storage.prototype.setItem");
  const grid = source("app/components/DataGrid.tsx");
  assert.match(grid, /persistPreferences = true/);
  for (const operation of ["localStorage.getItem", "localStorage.setItem"]) {
    const effectStart = grid.lastIndexOf("useEffect(() => {", grid.indexOf(operation));
    guardBefore(grid.slice(effectStart, grid.indexOf(operation) + operation.length), "if (!persistPreferences) return;", operation);
  }
  for (const view of ["partidas/PartidasListView", "expediciones/ExpedicionesListView", "viajes/ViajesListView", "clientes/CustomersListView", "epod-cmr/CmrListView", "viajes/[id]/TripDetailView", "[module]/ModuleView"]) {
    assert.match(source(`app/dashboard/${view}.tsx`), /persistPreferences=\{(?:!demo|!isSimulation|basePath !== "\/demo")\}/, view);
  }
});

test("catalog and new-partida demo branches terminate every operational request", () => {
  guardBefore(section("app/dashboard/articulos/ProductCatalog.tsx", "const loadCatalog =", "useEffect("), "if (initialDemoCatalog)", "fetch(");
  guardBefore(section("app/dashboard/articulos/ProductCatalog.tsx", "async function save(", "return <div"), "if (initialDemoCatalog)", "fetch(");
  const partida = "app/dashboard/nuevo/partida/PartidaForm.tsx";
  guardBefore(section(partida, "const code = customer?.code;", "}, [customer?.code, demoData]"), "if (demoData)", "fetch(");
  for (const [start, end] of [["async function lookupArticle", "async function searchHazmat"], ["async function searchHazmat", "function chooseHazmat"], ["async function submit", "return <form"]]) {
    guardBefore(section(partida, start, end), "if (demoData)", "fetch(");
  }
  assert.match(source(partida), /const basePath = demoData \? "\/demo" : "\/dashboard"/);
});

test("Excel and generic record simulation guards precede both reads and writes", () => {
  for (const [file, start, end] of [
    ["app/dashboard/importar/ImportWorkspace.tsx", "function importRows()", "return <main"],
    ["app/dashboard/registros/[module]/[id]/RecordEditor.tsx", "function save(e:", "return <main"],
  ]) {
    const body = section(file, start, end);
    for (const operation of ["localStorage.getItem", "localStorage.setItem"]) guardBefore(body, "if(simulation)", operation);
  }
  const editor = source("app/dashboard/registros/[module]/[id]/RecordEditor.tsx");
  guardBefore(section("app/dashboard/registros/[module]/[id]/RecordEditor.tsx", "function GenericRecordEditor", "function save(e:"), "if(simulation)return;", "localStorage.getItem");
  assert.match(editor, /if\(!simulation&&module==="ofertas-tarifas"/);
  assert.match(editor, /<EntityServicesManager[^>]*simulation=\{simulation\}/);
  const adr = section("app/dashboard/registros/[module]/[id]/RecordEditor.tsx", "function CustomerAdrSettings", "function GenericRecordEditor");
  guardBefore(adr.slice(adr.indexOf("useEffect("), adr.indexOf("function toggleClass")), "if(simulation)", "fetch(");
  guardBefore(adr.slice(adr.indexOf("async function save()")), "if(simulation)", "fetch(");
});

test("CMR simulation cannot emit, read drafts, share keys, load audit or poll a document", () => {
  const fresh = "app/dashboard/epod-cmr/nuevo/NewCmrWorkspace.tsx";
  for (const [start, end, operation] of [
    ["function inheritFromExpeditions", "function applyExpeditionInput", "localStorage.getItem"],
    ["function saveDraft", "async function emit", "localStorage.getItem"],
    ["async function emit", "async function shareQr", "fetch("],
    ["async function shareQr", "async function sendEmail", "navigator.share"],
    ["async function sendEmail", "async function openAudit", "fetch("],
    ["async function openAudit", "return <main", "fetch("],
  ]) guardBefore(section(fresh, start, end), "if(simulation)", operation);
  const document = "app/dashboard/epod-cmr/[cmr]/CmrDocumentWorkspace.tsx";
  const effect = section(document, "useEffect(()=>{", "},[cmr,sharedKey,demoData]);");
  for (const operation of ["localStorage.getItem", "fetch(", "window.setInterval"]) guardBefore(effect, "if(demoData)return;", operation);
  const workspace = source(document);
  assert.match(workspace, /\[isLive,setIsLive\]=useState\(false\)/);
  assert.match(workspace, /const qrSrc=isLive\?/);
  assert.match(workspace, /const qrState=demoData\?"error"/);
  assert.match(workspace, /if\(!doc\|\|!isLive\|\|qrState!=="ready"\)return;window\.print/);
  assert.match(workspace, /demoData\?"\/demo\/epod-cmr":"\/dashboard\/epod-cmr"/);
  assert.match(source("app/demo/epod-cmr/[cmr]/page.tsx"), /if \(!demoData\) notFound\(\)/);
  assert.doesNotMatch(source("lib/preview-demo-cmr-document.ts"), /(?:cmrKey|accessKey|token|qrUrl|qrPayload):/);
});

test("new expedition, new trip and mobile access explicitly guard simulation before network and clipboard", () => {
  for (const form of ["expedicion/ExpeditionForm", "viaje/TripForm"]) {
    const text = source(`app/dashboard/nuevo/${form}.tsx`);
    assert.match(text, /simulation = false/);
    assert.match(text, /const isSimulation = simulation \|\| basePath === "\/demo"/);
    guardBefore(text.slice(text.indexOf("async function submit")), "if (isSimulation)", "fetch(");
    assert.match(text, /const returnBasePath = isSimulation \? "\/demo" : basePath/);
  }
  const mobile = "app/dashboard/viajes/[id]/MobileAccessPanel.tsx";
  for (const [start, end, operation] of [
    ["async function refresh", "useEffect", "fetch("],
    ["async function issue", "async function revoke", "fetch("],
    ["async function revoke", "async function copyAccess", "fetch("],
    ["async function copyAccess", "const active =", "navigator.clipboard"],
  ]) guardBefore(section(mobile, start, end), "if (simulation)", operation);
  assert.match(source(mobile), /if \(!simulation\) void refresh\(\)/);
  assert.match(source(mobile), /if \(simulation \|\| !issuedToken\)/);
  assert.match(source("app/demo/viajes/[id]/page.tsx"), /\.find\(item => item\.code === id\)/);
  assert.match(source("app/demo/viajes/[id]/page.tsx"), /if \(!trip\) notFound\(\)/);
});

test("live route wrappers do not opt into simulated data or bypass authenticated loaders", () => {
  for (const file of [
    "app/dashboard/articulos/page.tsx", "app/dashboard/nuevo/partida/page.tsx",
    "app/dashboard/nuevo/expedicion/page.tsx", "app/dashboard/nuevo/viaje/page.tsx",
    "app/dashboard/viajes/[id]/page.tsx", "app/dashboard/epod-cmr/[cmr]/page.tsx",
    "app/dashboard/epod-cmr/nuevo/page.tsx", "app/dashboard/importar/page.tsx",
  ]) {
    const text = source(file);
    assert.doesNotMatch(text, /(?:preview-demo-|demo-operational-)|\binitialDemoCatalog=|\bdemoData=|\bsimulation(?:=|\s*\/?>)/, file);
  }
  const newCmr = source("app/dashboard/epod-cmr/nuevo/NewCmrWorkspace.tsx");
  assert.match(newCmr, /const startingForm: FormState = simulation \?[^\n]+ : EMPTY_CMR_FORM/);
  for (const file of ["app/dashboard/nuevo/expedicion/page.tsx", "app/dashboard/nuevo/viaje/page.tsx", "app/dashboard/viajes/[id]/page.tsx"]) {
    const text = source(file);
    assert.match(text, /getAuthenticatedOrReviewContext\(\)/, file);
    assert.match(text, /\.eq\("tenant_id", auth\.tenantId\)/, file);
  }
});
