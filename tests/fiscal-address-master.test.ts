import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("fiscal address API is tenant-aware, canonical and fail-closed", () => {
  const route = read("../app/api/customers/fiscal-address/route.ts");

  assert.match(route, /const FISCAL_CODE = "FISCAL"/);
  assert.match(route, /getAuthenticatedOrReviewContext\(\)/);
  assert.match(route, /getAuthenticatedContext\(\)/);
  assert.match(route, /\.eq\("tenant_id", auth\.tenantId\)/);
  assert.match(route, /\.eq\("party_id", customer\.id\)/);
  assert.match(route, /\.eq\("address_type", "FISCAL"\)/);
  assert.match(route, /fiscalRows \?\? \[\]\)\.length > 1/);
  assert.match(route, /existingFiscal \?\? \[\]\)\.length > 1/);
  assert.match(route, /reservedCodeRow\.address_type !== "FISCAL"/);
  assert.match(route, /upsert\(values, \{ onConflict: "tenant_id,party_id,code" \}\)/);
  assert.match(route, /address_type: "FISCAL"/);
  assert.match(route, /code: FISCAL_CODE/);
  assert.match(route, /changed_fields: \["fiscal_domicile"\]/);
});

test("review access is read-only and editing remains role-gated", () => {
  const route = read("../app/api/customers/fiscal-address/route.ts");

  assert.match(route, /const EDIT_ROLES = new Set\(\["OWNER", "ADMIN", "OPERATOR"\]\)/);
  assert.match(route, /canEdit: !auth\.isReview && EDIT_ROLES\.has\(auth\.role\.toUpperCase\(\)\)/);
  assert.match(route, /if \(!EDIT_ROLES\.has\(auth\.role\.toUpperCase\(\)\)\)/);
});

test("customer master exposes fiscal domicile separately from operational centers", () => {
  const editor = read("../app/dashboard/registros/[module]/[id]/FiscalAddressEditor.tsx");
  const record = read("../app/dashboard/registros/[module]/[id]/RecordEditor.tsx");

  assert.match(editor, /\/api\/customers\/fiscal-address/);
  assert.match(editor, /Domicilio fiscal \/ legal/);
  assert.match(editor, /separado de centros de carga y descarga/);
  assert.match(editor, /nunca se sustituye automáticamente por una dirección operativa/);
  assert.match(record, /FiscalAddressEditor/);
  assert.match(record, /id!=="nuevo"&&<FiscalAddressEditor id=\{id\}\/>/);
});

test("DeCA continues to require an explicitly selected FISCAL address", () => {
  const deca = read("../app/api/regulatory/cmr/[cmr]/native/route.ts");

  assert.match(deca, /contractual_shipper_address_id/);
  assert.match(deca, /\.eq\("address_type", "FISCAL"\)/);
  assert.match(deca, /El cargador contractual necesita un domicilio FISCAL canónico seleccionado/);
  assert.doesNotMatch(deca, /\.eq\("address_type", "OPERATING"\)/);
});
