import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { normalizeAdHocAddress } from "../lib/ad-hoc-address.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("a complete typed address is normalised and keeps the master choice", () => {
  const result = normalizeAdHocAddress({ name: "  Nave 3 ", addressLine1: "Calle  Mayor 12", postalCode: "46001", city: "Valencia", countryCode: "es", saveToMaster: true }, "pickup");
  assert.ok(result.ok);
  assert.deepEqual(result.value, { name: "Nave 3", addressLine1: "Calle Mayor 12", postalCode: "46001", city: "Valencia", countryCode: "ES", saveToMaster: true });
});

test("saving to the master is opt-in", () => {
  const result = normalizeAdHocAddress({ addressLine1: "Rue de Lyon 4", postalCode: "69001", city: "Lyon", countryCode: "FR", saveToMaster: "true" }, "delivery");
  assert.ok(result.ok);
  assert.equal(result.value.saveToMaster, false);
  assert.equal(result.value.name, null);
});

test("incomplete or malformed addresses are rejected with a message per field", () => {
  const result = normalizeAdHocAddress({ addressLine1: "x", postalCode: "", city: "", countryCode: "ESP" }, "delivery");
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.errors.length, 4);
    assert.ok(result.errors.every(error => error.startsWith("Dirección de entrega")));
  }
  assert.equal(normalizeAdHocAddress(null, "pickup").ok, false);
});

test("the order API creates typed addresses for the customer, assigns them only on request and rolls them back", () => {
  const route = read("../app/api/orders/route.ts");
  assert.match(route, /normalizeAdHocAddress\(adHocInputs\[use\], use\)/);
  assert.match(route, /party_id: customerId,\s+address_type: use === "pickup" \? "PICKUP" : "DELIVERY"/);
  assert.match(route, /if \(address\.saveToMaster\) \{[\s\S]*party_address_assignments/);
  assert.equal((route.match(/await discardCreatedAddresses\(\);/g) ?? []).length, 3, "rollback on address, order and line failures");
  assert.match(route, /no ambos/);
});

test("Nueva partida offers a new address in both selectors with an explicit master checkbox", () => {
  const form = read("../app/dashboard/nuevo/partida/PartidaForm.tsx");
  assert.match(form, /\+ Nueva dirección de recogida/);
  assert.match(form, /\+ Nueva dirección de entrega/);
  assert.match(form, /type="checkbox" checked=\{draft\.saveToMaster\}/);
  assert.match(form, /pickupNewAddress: pickupIsNew \? pickupDraft : null/);
});
