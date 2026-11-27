import assert from 'node:assert/strict';

// This harness runs DROP DATABASE and DROP SCHEMA public CASCADE. It may only ever target a
// disposable database on a loopback host, so every psql call is checked before it is spawned.
export const LOOPBACK_HOSTS = Object.freeze(['127.0.0.1', 'localhost', '::1']);
export const DISPOSABLE_DATABASES = Object.freeze(['fornexa_apply_test', 'fornexa_orphan_pg17_test']);

export function assertLoopbackAndDisposable(host, dbName) {
  const h = typeof host === 'string' ? host.trim().toLowerCase() : '';
  if (!LOOPBACK_HOSTS.includes(h)) {
    throw new Error(`[SECURITY_FATAL] Host '${host}' is not loopback (${LOOPBACK_HOSTS.join(', ')}). Refusing destructive harness.`);
  }
  if (typeof dbName !== 'string' || !DISPOSABLE_DATABASES.includes(dbName)) {
    throw new Error(`[SECURITY_FATAL] Database '${dbName}' is not in the disposable allowlist (${DISPOSABLE_DATABASES.join(', ')}). Refusing destructive harness.`);
  }
}

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
