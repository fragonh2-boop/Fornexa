import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { canUseAddress, hasOperationalUse, normalizeCustomerAssignments, normalizeCustomerRouteCode } from "../lib/address-master.ts";

test("keeps the current customer assigned and removes duplicates", () => {
  assert.deepEqual(normalizeCustomerAssignments("cli-000006", ["CLI-000006", "cli-000007", ""]), ["CLI-000006", "CLI-000007"]);
});

test("requires at least one operational use", () => {
  assert.equal(hasOperationalUse(false, false), false);
  assert.equal(hasOperationalUse(true, false), true);
});

test("shared addresses remain selectable by customer and operation", () => {
  const assignments = [
    { customerCode: "CLI-000006", useForPickup: true, useForDelivery: true },
    { customerCode: "CLI-000007", useForPickup: false, useForDelivery: true },
  ];
  assert.equal(canUseAddress(assignments, "CLI-000006", "pickup"), true);
  assert.equal(canUseAddress(assignments, "CLI-000007", "pickup"), false);
  assert.equal(canUseAddress(assignments, "CLI-000007", "delivery"), true);
});

test("partida uses explicit empty selections and aligned controls", () => {
  const form = readFileSync(new URL("../app/dashboard/nuevo/partida/PartidaForm.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/dashboard/nuevo/partida/partida-form.module.css", import.meta.url), "utf8");
  assert.match(form, /<option value="" disabled>Seleccionar<\/option>/);
  assert.doesNotMatch(form, /placeholder="REC-001"|placeholder="ENT-001"/);
  assert.match(styles, /height:46px;min-height:46px/);
  assert.match(styles, /grid-template-rows:auto 46px auto/);
  assert.match(form, /#control-adr/);
  assert.match(form, /#direcciones/);
});

test("partida excludes legacy coverage identifiers from services", () => {
  const page = readFileSync(new URL("../app/dashboard/nuevo/partida/page.tsx", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../supabase/migrations/20260825101500_remove_legacy_route_service.sql", import.meta.url), "utf8");
  assert.match(page, /\.neq\("service_type", "LEGACY"\)/);
  assert.match(migration, /SRV-FR-69800/);
});

test("keeps canonical customer IDs when opening their configuration", () => {
  assert.equal(normalizeCustomerRouteCode("CLI-000006"), "CLI-000006");
  assert.equal(normalizeCustomerRouteCode("cli-000006"), "CLI-000006");
});
