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

test("the GTIN field accepts numeric GTINs in the browser", () => {
  const catalog = read("../app/dashboard/articulos/ProductCatalog.tsx");
  const attribute = catalog.match(/pattern="([^"]+)"/)?.[1];
  assert.ok(attribute, "GTIN input must declare a pattern");
  // Browsers compile the attribute as an anchored RegExp with the v flag.
  const browserPattern = new RegExp(`^(?:${attribute})$`, "v");
  for (const valid of ["12345678", "123456789012", "1234567890123", "12345678901234"]) assert.ok(browserPattern.test(valid), valid);
  for (const invalid of ["1234567", "123456789", "\\d12345678"]) assert.ok(!browserPattern.test(invalid), invalid);
});

test("every reference to products is tenant-scoped at database level", () => {
  const sql = read("../supabase/migrations/20261007160000_products_tenant_scoped_references.sql");
  assert.match(sql, /unique index if not exists products_tenant_id_id_key on public\.products\(tenant_id, id\)/);
  for (const table of ["order_lines", "product_packagings", "product_hazmat_assignments", "inventory_quants", "inventory_movements"]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} drop constraint if exists ${table}_product_id_fkey;`));
    assert.match(sql, new RegExp(`alter table public\\.${table} add constraint ${table}_product_tenant_fk\\s+foreign key \\(tenant_id, product_id\\) references public\\.products\\(tenant_id, id\\)`));
  }
});

test("the migration refuses to run over rows that would break tenant scoping", () => {
  const sql = read("../supabase/migrations/20261007160000_products_tenant_scoped_references.sql");
  const precheck = sql.indexOf("$precheck$");
  assert.ok(precheck > 0, "precheck block required");
  assert.ok(precheck < sql.indexOf("add constraint"), "precheck must run before any new constraint");
  assert.match(sql, /p\.tenant_id = t\.tenant_id/);
});

test("article edits cannot move ownership and detect concurrent saves", () => {
  const route = read("../app/api/products/route.ts");
  assert.match(route, /before\.customer_id !== customer\.id/);
  assert.match(route, /\.eq\("revision_number", Number\(before\?\.revision_number \?\? 1\)\)/);
  assert.match(route, /PGRST116/);
  assert.match(route, /auditError/);
});
