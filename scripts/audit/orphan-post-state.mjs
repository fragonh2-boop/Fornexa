import assert from 'node:assert/strict';

export function assertEmptySearchPath(setting, functionName) {
  assert.equal(setting, 'search_path=""', `${functionName} must have an explicitly empty search_path`);
}

// Read the catalog after the unmodified migration has run. Creating these
// columns in the platform fixture would bypass ADD COLUMN IF NOT EXISTS.
export async function verifyCustomsTenantColumns(query) {
  const verified = [];
  for (const table of ['customs_messages', 'customs_events']) {
    const definition = await query(`
      SELECT data_type || ':' || is_nullable || ':' || column_default
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='${table}' AND column_name='tenant_id';
    `);
    assert.equal(definition, "uuid:NO:'00000000-0000-4000-8000-000000000001'::uuid", `${table}.tenant_id type, nullability and default`);
    const foreignKeys = await query(`
      SELECT count(*) FROM pg_constraint
      WHERE conrelid='public.${table}'::regclass AND contype='f' AND convalidated
        AND conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='public.${table}'::regclass AND attname='tenant_id')]
        AND confrelid='public.tenants'::regclass
        AND confkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='public.tenants'::regclass AND attname='id')]
        AND confdeltype='r';
    `);
    assert.equal(foreignKeys, '1', `${table}.tenant_id must reference tenants(id) ON DELETE RESTRICT`);
    verified.push({ table, type: 'uuid', nullable: false, default_seed: true, tenant_foreign_key_delete_restrict: true });
  }
  return verified;
}
