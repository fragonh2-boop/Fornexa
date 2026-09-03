import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("customer and service editors persist through authenticated APIs", () => {
  const customer = read("../app/dashboard/registros/[module]/[id]/ClientMasterEditorWorld.tsx");
  const services = read("../app/components/EntityServicesManager.tsx");
  assert.match(customer, /fetch\("\/api\/customers"/);
  assert.doesNotMatch(customer, /localStorage|getCustomer\(/);
  assert.match(services, /\/api\/customers\/services/);
  assert.doesNotMatch(services, /localStorage|serviceCatalog/);
});

test("customer foundation migration creates typed and tenant-isolated submasters", () => {
  const migration = read("../supabase/migrations/20260825203000_customer_master_foundation.sql");
  for (const table of ["customer_billing_profiles", "customer_blocks", "address_operational_profiles", "tariff_headers", "tariff_lines", "tariff_assignments"]) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
    assert.match(migration, new RegExp(`'${table}'`));
  }
  assert.match(migration, /enable row level security/);
  assert.match(migration, /pricing_snapshot jsonb not null/);
});

test("order creation records pricing and requires confirmation for customer warnings", () => {
  const orders = read("../app/api/orders/route.ts");
  const form = read("../app/dashboard/nuevo/partida/PartidaForm.tsx");
  assert.match(orders, /customer_blocks/);
  assert.match(orders, /confirmationRequired: true/);
  assert.match(orders, /pricing_snapshot: pricingSnapshot/);
  assert.match(form, /acknowledgedCustomerWarnings/);
});

test("legacy customer prototype is removed and obsolete customer wording is closed", () => {
  assert.equal(existsSync(new URL("../lib/customer-master.ts", import.meta.url)), false);
  assert.equal(existsSync(new URL("../app/dashboard/nuevo/[tipo]/page.tsx", import.meta.url)), false);
  const customer = read("../app/dashboard/registros/[module]/[id]/ClientMasterEditorWorld.tsx");
  const memorandum = read("../lib/memorandum.ts");
  assert.doesNotMatch(customer, /Incluye prefijo internacional|cliente can[oó]nic|maestro can[oó]nic/i);
  assert.doesNotMatch(memorandum, /cliente can[oó]nic|maestro can[oó]nic/i);
});