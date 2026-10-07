import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

for (const module of ["clientes", "aduanas", "epod-cmr"]) {
  test(`shared ${module} loader resolves authenticated tenant before service-role reads`, () => {
    const source = read(`app/dashboard/${module}/page.tsx`);
    const guard = source.indexOf("if (!auth) return [];");
    assert.match(source, /const auth = await getAuthenticatedOrReviewContext\(\);/);
    assert.ok(guard >= 0 && guard < source.indexOf("const supabase = createSupabaseAdmin()"));
    assert.match(source, /\.eq\("tenant_id", auth\.tenantId\)/);
  });

  test(`demo ${module} never imports the authenticated production loader`, () => {
    const source = read(`app/demo/${module}/page.tsx`);
    assert.doesNotMatch(source, /getAuthenticatedOrReviewContext|createSupabaseAdmin|\/api\/|from ["'][^"']*dashboard\/[^"']*\/page["']/);
  });
}

test("customer child collections are filtered to the same authenticated tenant", () => {
  const source = read("app/dashboard/clientes/page.tsx");
  for (const relation of ["party_addresses", "orders", "offers"]) {
    assert.ok(source.includes(`.eq("${relation}.tenant_id", auth.tenantId)`));
  }
});

test("CMR expedition codes cannot be read from an embedded foreign tenant", () => {
  const source = read("app/dashboard/epod-cmr/page.tsx");
  assert.ok(source.includes('.eq("cmr_expeditions.expedition.tenant_id", auth.tenantId)'));
});
