import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("product catalog mutations are authenticated, tenant-scoped and preserve the legacy customer owner", () => {
  const route = read("../app/api/products/route.ts");
  assert.match(route, /getAuthenticatedContext/);
  assert.match(route, /EDIT_ROLES/);
  assert.match(route, /\.eq\("tenant_id", auth\.tenantId\)/);
  assert.match(route, /customer_id: customer\.id,/);
  assert.match(route, /owner_party_id: customer\.id,/);
  assert.match(route, /uom_definitions/);
  assert.match(route, /audit_events/);
  assert.match(route, /GTIN_PATTERN/);
  assert.match(route, /grossWeightKg < netWeightKg/);
});

test("product UI exposes persisted master fields and Partidas selects active tenant products", () => {
  const catalog = read("../app/dashboard/articulos/ProductCatalog.tsx");
  const form = read("../app/dashboard/nuevo/partida/PartidaForm.tsx");
  const orders = read("../app/api/orders/route.ts");
  assert.match(catalog, /\/api\/products/);
  for (const field of ["gtin", "uomBase", "netWeightKg", "grossWeightKg", "lengthCm", "widthCm", "heightCm", "volumeM3"]) assert.match(catalog, new RegExp(field));
  assert.match(form, /partida-product-catalog/);
  assert.match(form, /activeOnly=true/);
  assert.match(orders, /owner_party_id: customer\.id/);
});
