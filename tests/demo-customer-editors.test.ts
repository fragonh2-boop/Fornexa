import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const root = "app/dashboard/registros/[module]/[id]/";
const world = source(`${root}ClientMasterEditorWorld.tsx`);
const submasters = source(`${root}CustomerSubmasters.tsx`);
const fiscal = source(`${root}FiscalAddressEditor.tsx`);
const services = source("app/components/EntityServicesManager.tsx");

function guardedBeforeFetch(section: string, label: string) {
  const guard = section.indexOf("if (simulation");
  const fetch = section.indexOf("fetch(");
  assert.ok(guard >= 0 && fetch >= 0 && guard < fetch, `${label}: explicit simulation guard must precede fetch`);
  assert.match(section.slice(guard, fetch), /return/, `${label}: simulation must terminate before fetch`);
}

test("all nested customer editors default to live behavior and do not use browser storage", () => {
  for (const component of [world, submasters, fiscal, services]) {
    assert.match(component, /simulation = false/);
    assert.doesNotMatch(component, /localStorage|sessionStorage/);
  }
});

test("simulation skips customer geography, users, company and address read effects", () => {
  for (const path of ["/api/geography", "/api/tenant/users", "/api/customers?customerCode", "/api/customers/addresses?customerCode"]) {
    const fetch = world.indexOf(`fetch(\"${path}`) >= 0 ? world.indexOf(`fetch(\"${path}`) : world.indexOf(`fetch(\`${path}`);
    assert.ok(fetch >= 0, `missing fetch ${path}`);
    const effect = world.lastIndexOf("useEffect(() => {", fetch);
    assert.ok(effect >= 0, `${path}: missing effect`);
    guardedBeforeFetch(world.slice(effect, world.indexOf("}, [", fetch)), path);
  }
});

test("simulation terminates every customer lookup and save entry point before network calls", () => {
  const markers = ["const loadSubdivisions = useCallback", "async function saveCustomer", "async function resolvePostal", "async function saveAddress"];
  for (const marker of markers) {
    const start = world.indexOf(marker);
    assert.ok(start >= 0, marker);
    const nextFetch = world.indexOf("fetch(", start);
    assert.ok(nextFetch >= 0, `${marker}: missing guarded network call`);
    guardedBeforeFetch(world.slice(start, nextFetch + 6), marker);
  }
  assert.match(world, /const routeBase = simulation \? "\/demo" : basePath/);
  assert.doesNotMatch(world, /href=["']\/dashboard|router\.replace\(`\/dashboard/);
});

test("nested contacts, tariff, fiscal and service calls have their own simulation guards", () => {
  for (const [component, marker] of [
    [submasters, "useEffect(() => {"], [submasters, "async function saveContacts"],
    [submasters, "async function createTariff"], [fiscal, "useEffect(() => {"],
    [fiscal, "async function save("], [services, "useEffect(() => {"], [services, "async function save()"],
  ]) {
    const start = component.indexOf(marker);
    assert.ok(start >= 0, marker);
    const nextFetch = component.indexOf("fetch(", start);
    assert.ok(nextFetch >= 0, marker);
    guardedBeforeFetch(component.slice(start, nextFetch + 6), marker);
  }
  assert.match(fiscal, /No se ha guardado ni validado para documentos regulatorios/);
});
