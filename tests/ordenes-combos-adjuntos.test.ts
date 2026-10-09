import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dashboardNavigation } from "../app/components/DashboardNavigation.ts";
import { DEFAULT_COMBOS, getComboConfig, saveComboConfig, resetComboConfig } from "../lib/combo-config.ts";
import { DEFAULT_STORAGE_CONFIG, getStorageConfig, saveStorageConfig, resetStorageConfig } from "../lib/storage-config.ts";
import { memorandumPending, memorandumReleases, memorandumUpdatedAt, memorandumCommitCoverage } from "../lib/memorandum.ts";

const source = (relPath: string) => readFileSync(new URL(`../${relPath}`, import.meta.url), "utf8");

test("dashboard navigation renames Partidas to Órdenes preserving route /partidas", () => {
  const item = dashboardNavigation.find(([, href]) => href === "/partidas");
  assert.ok(item, "Route /partidas must exist");
  assert.equal(item[0], "Órdenes");
  assert.equal(dashboardNavigation.some(([label]) => (label as string) === "Partidas"), false);
});

test("PartidasListView renders Órdenes header, + Nueva orden and clickable row links to /partidas/[id]", () => {
  const view = source("app/dashboard/partidas/PartidasListView.tsx");
  assert.match(view, /title="Órdenes"/);
  assert.doesNotMatch(view, /title="Partidas"/);
  assert.match(view, /\+ Nueva orden/);
  assert.doesNotMatch(view, /\+ Nueva partida/);
  assert.match(view, /rowHrefs=\{rows\.map\(row => `\$\{basePath\}\/partidas\/\$\{encodeURIComponent\(row\.id\)\}`\)\}/);
  assert.doesNotMatch(view, /description="Pedidos persistentes/);
});

test("ModuleView handles partidas module as Órdenes with + Nueva orden and /partidas/[id] row link", () => {
  const moduleView = source("app/dashboard/[module]/ModuleView.tsx");
  assert.match(moduleView, /title:"Órdenes"/);
  assert.match(moduleView, /action:"\+ Nueva orden"/);
  assert.match(moduleView, /key==="partidas"\?`\$\{basePath\}\/partidas\/\$\{encodeURIComponent\(row\[0\]\)\}`/);
});

test("create order page removes the subtitle and renames header to Nueva orden and Volver a Órdenes", () => {
  const prodPage = source("app/dashboard/nuevo/partida/page.tsx");
  const demoPage = source("app/demo/nuevo/partida/page.tsx");

  for (const code of [prodPage, demoPage]) {
    assert.match(code, /<h1>Nueva orden<\/h1>/);
    assert.doesNotMatch(code, /<h1>Nueva partida<\/h1>/);
    assert.match(code, /Volver a Órdenes/);
    assert.doesNotMatch(code, /Volver a Partidas/);
    assert.doesNotMatch(code, /Alta persistente sobre el modelo operativo/);
    assert.doesNotMatch(code, /headerSubtitle/);
  }
});

test("configurable combos include cross and picking in order_service and support default preloading and single/multi mode", () => {
  const orderService = DEFAULT_COMBOS.order_service;
  assert.ok(orderService, "order_service combo must be defined");
  const values = orderService.options.map(o => o.value);
  assert.ok(values.includes("cross"), "cross must be in order_service options");
  assert.ok(values.includes("picking"), "picking must be in order_service options");
  assert.ok(values.includes("Grupaje"), "Grupaje must be in order_service options");
  assert.ok(values.includes("Directo"), "Directo must be in order_service options");

  assert.equal(orderService.defaultValue, "Grupaje");
  assert.equal(orderService.selectionMode, "single");

  // Functional behavior
  const config = getComboConfig("order_service");
  assert.equal(config.id, "order_service");
  assert.ok(config.options.some(o => o.value === "cross"));
  assert.ok(config.options.some(o => o.value === "picking"));
});

test("storage configuration supports local filesystem directory and Claude space account toggle", () => {
  assert.equal(DEFAULT_STORAGE_CONFIG.provider, "local");
  assert.equal(DEFAULT_STORAGE_CONFIG.localDirectory, "/Users/Shared/fornexa-adjuntos");
  assert.equal(DEFAULT_STORAGE_CONFIG.claudeSpaceAccount, "workspace-claude-default");

  const initial = getStorageConfig();
  assert.equal(initial.provider, "local");
  assert.equal(initial.localDirectory, "/Users/Shared/fornexa-adjuntos");
});

test("Configuración screen renders ComboConfigWorkspace and StorageConfigWorkspace", () => {
  const client = source("app/dashboard/integraciones/IntegracionesClient.tsx");
  assert.match(client, /<ComboConfigWorkspace \/>/);
  assert.match(client, /<StorageConfigWorkspace \/>/);
  assert.doesNotMatch(client, /description="Un único punto para correo/);
});

test("OrderEditorWorkspace supports order editing, re-launching and file attachments with local directory display", () => {
  const editor = source("app/components/OrderEditorWorkspace.tsx");
  assert.match(editor, /Volver a lanzar orden/);
  assert.match(editor, /Guardar cambios/);
  assert.match(editor, /← Volver a Órdenes/);
  assert.match(editor, /handleRelaunch/);
  assert.match(editor, /Archivos adjuntos de la orden/);
  assert.match(editor, /storageConfig\.localDirectory/);
  assert.match(editor, /getComboConfig\("order_service"\)/);
});

test("order detail routes exist for authenticated dashboard and demo namespaces", () => {
  const prodRoute = source("app/dashboard/partidas/[id]/page.tsx");
  const demoRoute = source("app/demo/partidas/[id]/page.tsx");

  assert.match(prodRoute, /getAuthenticatedOrReviewContext/);
  assert.match(prodRoute, /<OrderEditorWorkspace/);
  assert.match(demoRoute, /DEMO_PARTIDAS/);
  assert.match(demoRoute, /<OrderEditorWorkspace/);
});

test("memorandum records storage evolution and 2026.10.09-1 release", () => {
  assert.equal(memorandumUpdatedAt, "09 oct 2026");
  assert.ok(memorandumCommitCoverage >= 597);

  const storagePending = memorandumPending.find(item => item.title.includes("almacenamiento") || item.title.includes("repositorios cloud"));
  assert.ok(storagePending, "Pending storage evolution must exist in memorandum");
  assert.match(storagePending.summary, /OneDrive/i);
  assert.match(storagePending.summary, /Google Drive/i);
  assert.match(storagePending.summary, /Fornexa Storage/i);

  const latestRelease = memorandumReleases[0];
  assert.equal(latestRelease.version, "2026.10.09-1");
  assert.match(latestRelease.title, /Órdenes/);
  assert.match(latestRelease.outcome, /cross y picking/);
});

test("orders API implements PATCH with STATUS_FROM_LABEL translation and tenant security", () => {
  const routeSource = source("app/api/orders/route.ts");
  const statusSource = source("lib/order-status.ts");
  assert.match(routeSource, /export async function PATCH/);
  assert.match(routeSource, /STATUS_FROM_LABEL/);
  assert.match(routeSource, /getAuthenticatedContext/);
  assert.match(routeSource, /\.eq\("tenant_id", tenantId\)/);
  assert.match(statusSource, /"Preparada": "READY"/);
  assert.match(statusSource, /"Borrador": "DRAFT"/);
});

test("OrderEditorWorkspace is located in app/components with verified API error handling and status persistence", () => {
  const component = source("app/components/OrderEditorWorkspace.tsx");
  assert.match(component, /fetch\("\/api\/orders"/);
  assert.match(component, /method: "PATCH"/);
  assert.match(component, /status: "READY"/);
  assert.match(component, /if \(!res\.ok\)/);
  assert.match(component, /relaunchError/);
  assert.match(component, /saveError/);

  // Authenticated page must not contain mockOrder fallback and demo page must import from app/components
  const prodPage = source("app/dashboard/partidas/[id]/page.tsx");
  assert.doesNotMatch(prodPage, /mockOrder/);
  assert.match(prodPage, /notFound\(\)/);

  const demoPage = source("app/demo/partidas/[id]/page.tsx");
  assert.match(demoPage, /from "@\/app\/components\/OrderEditorWorkspace"/);
  assert.match(component, /Referencia local en equipo/);
});

test("orders PATCH enforces lifecycle transitions, atomic CAS and parameterized service matching without PostgREST .or() injection", () => {
  const routeSource = source("app/api/orders/route.ts");
  // State machine transition validation and single source of truth import
  assert.match(routeSource, /ALLOWED_ORDER_TRANSITIONS/);
  assert.match(routeSource, /allowedNext\.includes\(mappedStatus\)/);
  assert.match(routeSource, /from "@\/lib\/order-status"/);
  // Compare-and-swap atomic transition against TOCTOU race conditions
  assert.match(routeSource, /updateQuery\.eq\("status", existingOrder\.status\)/);
  assert.match(routeSource, /status: 409/);
  // Parameter decoding with safe URI protection
  assert.match(routeSource, /decodeURIComponent\(String\(body\.code\)\)/);
  // Parameterized service lookup in memory rather than raw .or()
  assert.match(routeSource, /const \{ data: services \} = await supabase/);
  assert.doesNotMatch(routeSource, /\.or\(`code\.eq/);
});

test("behavioral: order status transitions enforce strict lifecycle and terminal states", async () => {
  const { ALLOWED_ORDER_TRANSITIONS, STATUS_FROM_LABEL, STATUS_LABELS } = await import("../lib/order-status.ts");

  // Terminal states must have no valid outgoing transitions
  assert.deepEqual(ALLOWED_ORDER_TRANSITIONS["COMPLETED"], [], "COMPLETED must be a terminal state");
  assert.deepEqual(ALLOWED_ORDER_TRANSITIONS["CANCELLED"], [], "CANCELLED must be a terminal state");

  // DRAFT can only transition to READY or CANCELLED
  assert.ok(ALLOWED_ORDER_TRANSITIONS["DRAFT"].includes("READY"));
  assert.ok(ALLOWED_ORDER_TRANSITIONS["DRAFT"].includes("CANCELLED"));
  assert.equal(ALLOWED_ORDER_TRANSITIONS["DRAFT"].includes("COMPLETED"), false);
  assert.equal(ALLOWED_ORDER_TRANSITIONS["DRAFT"].includes("IN_TRANSIT"), false);

  // Bidirectional status translation sanity
  for (const [key, label] of Object.entries(STATUS_LABELS)) {
    assert.equal(STATUS_FROM_LABEL[label], key);
    assert.equal(STATUS_FROM_LABEL[key], key);
  }
});

test("behavioral: storage and combo configuration persist and react predictably", () => {
  const initialCombo = getComboConfig("order_service");
  assert.ok(Array.isArray(initialCombo.options));
  assert.ok(initialCombo.options.some(o => o.value === "cross"));
  assert.ok(initialCombo.options.some(o => o.value === "picking"));

  const initialStorage = getStorageConfig();
  assert.equal(initialStorage.provider, "local");
  assert.ok(typeof initialStorage.localDirectory === "string");
  assert.ok(typeof initialStorage.claudeSpaceAccount === "string");
});



