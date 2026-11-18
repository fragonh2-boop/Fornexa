import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { assertEmptySearchPath, assertLoopbackAndDisposable, verifyCustomsTenantColumns } from '../scripts/audit/orphan-post-state.mjs';

const disposableTargets = [
  ['127.0.0.1', 'fornexa_apply_test'],
  ['127.0.0.1', 'fornexa_orphan_pg17_test'],
  ['localhost', 'fornexa_apply_test'],
  ['localhost', 'fornexa_orphan_pg17_test'],
  ['::1', 'fornexa_apply_test'],
  ['::1', 'fornexa_orphan_pg17_test'],
] as const;

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

test('Destructive orphan harness only accepts a loopback host and a disposable database', () => {
  for (const [host, database] of disposableTargets) {
    assert.doesNotThrow(() => assertLoopbackAndDisposable(host, database));
  }
  for (const host of ['db.example.supabase.co', '10.0.0.5', '', undefined]) {
    assert.throws(() => assertLoopbackAndDisposable(host, 'fornexa_apply_test'), /not loopback/);
  }
  for (const database of ['postgres', 'fornexa', 'FORNEXA_APPLY_TEST', '', undefined]) {
    assert.throws(() => assertLoopbackAndDisposable('127.0.0.1', database), /disposable allowlist/);
  }
});

test('Orphan harness checks its target before spawning psql', () => {
  const source = readFileSync('scripts/audit/verify-orphan-recovery-pg17.mjs', 'utf8');
  const body = source.split('function runPsql(sql, dbName = PGDATABASE) {')[1];
  assert.ok(body, 'runPsql must exist');
  assert.match(body, /^\s*assertLoopbackAndDisposable\(PGHOST, dbName\);/, 'the guard must be the first statement of runPsql');
  assert.equal(source.match(/spawnSync\("psql", \[\s*"-h"/g)?.length, 1, 'psql with a host may only be spawned from runPsql');
});

test('Orphan harness isolates the effective psql target from inherited connection and startup settings', () => {
  const probeScript = `
    import { mock } from 'node:test';
    mock.module('node:child_process', {
      namedExports: {
        spawnSync(command, args, options = {}) {
          if (args[0] === '--version') {
            return { status: 0, stdout: 'psql (PostgreSQL) 17.0' };
          }
          console.log('ORPHAN_PSQL_PROBE:' + JSON.stringify({
            command,
            args,
            hostaddr: options.env.PGHOSTADDR ?? null,
            service: options.env.PGSERVICE ?? null,
            serviceFile: options.env.PGSERVICEFILE ?? null,
            passwordPreserved: options.env.PGPASSWORD === process.env.PGPASSWORD,
            parentHostaddr: process.env.PGHOSTADDR,
            parentService: process.env.PGSERVICE,
            parentServiceFile: process.env.PGSERVICEFILE,
          }));
          return { status: 1, stderr: 'EXPECTED_PROBE_STOP' };
        },
      },
    });
    await import('./scripts/audit/verify-orphan-recovery-pg17.mjs');
  `;

  for (const [host, database] of disposableTargets) {
    const result = spawnSync(process.execPath, [
      '--experimental-test-module-mocks', '--input-type=module', '-e', probeScript,
    ], {
      encoding: 'utf8',
      timeout: 10_000,
      env: {
        ...process.env,
        CI: 'true',
        PGHOST: host,
        PGPORT: '5432',
        PGUSER: 'postgres',
        PGDATABASE: database,
        PGPASSWORD: 'synthetic-local-probe-password',
        PGHOSTADDR: '203.0.113.17',
        PGSERVICE: 'inherited-service',
        PGSERVICEFILE: 'inherited-service.conf',
        PSQLRC: 'ignored-startup.psql',
      },
    });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /EXPECTED_PROBE_STOP/);
    const output = result.stdout.split('\n').find((line) => line.startsWith('ORPHAN_PSQL_PROBE:'));
    assert.ok(output, result.stdout + result.stderr);
    const probe = JSON.parse(output.slice('ORPHAN_PSQL_PROBE:'.length));
    assert.equal(probe.command, 'psql');
    assert.equal(probe.hostaddr, null);
    assert.equal(probe.service, null);
    assert.equal(probe.serviceFile, null);
    assert.ok(probe.args.includes('-X'));
    assert.equal(probe.args[probe.args.indexOf('-h') + 1], host);
    assert.equal(probe.args[probe.args.indexOf('-d') + 1], database);
    assert.equal(probe.passwordPreserved, true);
    assert.equal(probe.parentHostaddr, '203.0.113.17');
    assert.equal(probe.parentService, 'inherited-service');
    assert.equal(probe.parentServiceFile, 'inherited-service.conf');
  }
});
