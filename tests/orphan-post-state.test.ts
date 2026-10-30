import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { assertEmptySearchPath, verifyCustomsTenantColumns } from '../scripts/audit/orphan-post-state.mjs';

test('Recovered customs migration creates the full tenant column contract; catalog checks reject weakened definitions', async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`create table public.tenants(id uuid primary key);
      create table public.customs_messages(id uuid primary key);
      create table public.customs_events(id uuid primary key);`);
    const migration = readFileSync('supabase/migrations/20260812_fornexa_operational_core.sql', 'utf8');
    const statements = migration.match(/alter table public\.customs_(?:messages|events)\s+add column if not exists tenant_id[^;]+;/g);
    assert.equal(statements?.length, 2);
    await db.exec(statements!.join('\n'));
    const query = async (sql: string) => {
      const row = (await db.query(sql)).rows[0] as Record<string, unknown> | undefined;
      return row ? String(Object.values(row)[0]) : '';
    };
    assert.equal((await verifyCustomsTenantColumns(query)).length, 2);
    for (const table of ['customs_messages', 'customs_events']) {
      const mutations = [
        ['nullable', `alter table ${table} alter column tenant_id drop not null`],
        ['wrong default', `alter table ${table} alter column tenant_id set default '00000000-0000-4000-8000-000000000002'::uuid`],
        ['missing FK', `alter table ${table} drop constraint ${table}_tenant_id_fkey`],
        ['wrong delete action', `alter table ${table} drop constraint ${table}_tenant_id_fkey;
          alter table ${table} add foreign key (tenant_id) references tenants(id) on delete cascade`],
      ];
      for (const [label, sql] of mutations) {
        await t.test(`${table}: rejects ${label}`, async () => {
          await db.exec('begin');
          try {
            await db.exec(sql);
            await assert.rejects(verifyCustomsTenantColumns(query));
          } finally {
            await db.exec('rollback');
          }
        });
      }
    }
  } finally {
    await db.close();
  }
});

test('Search path hardening requires an explicitly empty value', () => {
  assert.doesNotThrow(() => assertEmptySearchPath('search_path=""', 'test_rpc'));
  for (const setting of ['', 'search_path=', 'search_path=public', 'search_path=pg_catalog,public']) {
    assert.throws(() => assertEmptySearchPath(setting, 'test_rpc'));
  }
});
