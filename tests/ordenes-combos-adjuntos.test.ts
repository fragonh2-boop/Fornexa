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
  const editor = source("app/dashboard/partidas/[id]/OrderEditorWorkspace.tsx");
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
