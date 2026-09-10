import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("fiscal address API is tenant-aware and writes through the atomic RPC", () => {
  const route = read("../app/api/customers/fiscal-address/route.ts");

  assert.match(route, /const EDIT_ROLES = new Set\(\["OWNER", "ADMIN"\]\)/);
  assert.match(route, /getAuthenticatedOrReviewContext\(\)/);
  assert.match(route, /getAuthenticatedContext\(\)/);
  assert.match(route, /\.eq\("tenant_id", auth\.tenantId\)/);
  assert.match(route, /\.eq\("party_id", customer\.id\)/);
  assert.match(route, /\.eq\("address_type", "FISCAL"\)/);
  assert.match(route, /\.eq\("is_active", true\)/);
  assert.match(route, /fiscalRows \?\? \[\]\)\.length > 1/);
  assert.match(route, /\.rpc\("fornexa_upsert_canonical_fiscal_address"/);
  assert.match(route, /p_tenant_id: auth\.tenantId/);
  assert.match(route, /p_party_id: customer\.id/);
  assert.match(route, /p_actor_user_id: auth\.userId/);
  assert.match(route, /error\.code === "23505" \|\| error\.code === "22023"/);
  assert.doesNotMatch(route, /\.upsert\(values/);
  assert.doesNotMatch(route, /from\("audit_events"\)\.insert/);
});

test("canonical FISCAL migration enforces uniqueness, canonical code and atomic audit", () => {
  const migration = read("../supabase/migrations/20260910084703_canonical_fiscal_address.sql");

  assert.match(migration, /create unique index if not exists party_addresses_one_active_fiscal_per_party_idx/);
  assert.match(migration, /where address_type = 'FISCAL' and is_active/);
  assert.match(migration, /party_addresses_reserved_fiscal_code_check/);
  assert.match(migration, /where \(code is not distinct from 'FISCAL'\) <> \(address_type = 'FISCAL'\)/);
  assert.match(migration, /check \(\(code is not distinct from 'FISCAL'\) = \(address_type = 'FISCAL'\)\)/);
  assert.match(migration, /create or replace function public\.fornexa_upsert_canonical_fiscal_address/);
  assert.match(migration, /security invoker/);
  assert.match(migration, /for update/);
  assert.match(migration, /from public\.parties as p/);
  assert.match(migration, /where p\.id = p_party_id/);
  assert.match(migration, /update public\.party_addresses as pa/);
  assert.match(migration, /returning pa\.\* into v_persisted/);
  assert.match(migration, /insert into public\.audit_events/);
  assert.match(migration, /array\['fiscal_domicile'\]::text\[\]/);
  assert.match(migration, /revoke execute on function public\.fornexa_upsert_canonical_fiscal_address[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.fornexa_upsert_canonical_fiscal_address[\s\S]*to service_role/);
});

test("review access is read-only and canonical legal data is OWNER ADMIN only", () => {
  const route = read("../app/api/customers/fiscal-address/route.ts");
  const editor = read("../app/dashboard/registros/[module]/[id]/FiscalAddressEditor.tsx");

  assert.match(route, /const EDIT_ROLES = new Set\(\["OWNER", "ADMIN"\]\)/);
  assert.doesNotMatch(route, /"OPERATOR"/);
  assert.match(route, /canEdit: !auth\.isReview && EDIT_ROLES\.has\(auth\.role\.toUpperCase\(\)\)/);
  assert.match(route, /if \(!EDIT_ROLES\.has\(auth\.role\.toUpperCase\(\)\)\)/);
  assert.match(editor, /Su edición queda limitada a OWNER y ADMIN/);
});

test("customer master exposes fiscal domicile separately from operational centers", () => {
  const editor = read("../app/dashboard/registros/[module]/[id]/FiscalAddressEditor.tsx");
  const record = read("../app/dashboard/registros/[module]/[id]/RecordEditor.tsx");

  assert.match(editor, /\/api\/customers\/fiscal-address/);
  assert.match(editor, /Domicilio fiscal \/ legal/);
  assert.match(editor, /separado de centros de carga y descarga/);
  assert.match(editor, /nunca se sustituye automáticamente por una dirección operativa/);
  assert.doesNotMatch(editor, /subdivisionKey/);
  assert.match(record, /FiscalAddressEditor/);
  assert.match(record, /id!=="nuevo"&&<FiscalAddressEditor id=\{id\}\/>/);
});

test("DeCA requires an explicitly selected active FISCAL address", () => {
  const deca = read("../app/api/regulatory/cmr/[cmr]/native/route.ts");

  assert.match(deca, /contractual_shipper_address_id/);
  assert.match(deca, /\.eq\("address_type", "FISCAL"\)/);
  assert.match(deca, /\.eq\("is_active", true\)/);
  assert.match(deca, /El cargador contractual necesita un domicilio FISCAL canónico seleccionado/);
  assert.doesNotMatch(deca, /\.eq\("address_type", "OPERATING"\)/);
});
