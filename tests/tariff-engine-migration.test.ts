import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = "supabase/migrations/20260827164000_tariff_engine_foundation.sql";

test("tariff engine migration creates the composite rule key before referencing it", () => {
  const sql = readFileSync(migrationPath, "utf8");
  const uniqueIndex = sql.indexOf(
    "create unique index if not exists tariff_rules_tenant_id_id_key on public.tariff_rules(tenant_id, id);",
  );
  const compositeForeignKey = sql.indexOf(
    "foreign key (tenant_id, source_rule_id) references public.tariff_rules(tenant_id, id)",
  );

  assert.notEqual(uniqueIndex, -1, "the composite FK target must have a matching unique key");
  assert.notEqual(compositeForeignKey, -1, "the pricing component FK must remain tenant-aware");
  assert.ok(uniqueIndex < compositeForeignKey, "the unique key must exist before the FK is created");
});
