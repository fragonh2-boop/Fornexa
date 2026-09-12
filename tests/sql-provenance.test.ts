import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  compareSqlSources,
  splitSqlStatements,
  tokenizeSql,
} from "../scripts/sql-provenance.ts";

test("comparison ignores only comments, external whitespace and unquoted case", () => {
  const gitSql = `
    CREATE /* outer /* nested */ comment */ TABLE public.sample (
      id bigint PRIMARY KEY,
      label text
    );
    -- presentation-only note
    GRANT SELECT ON public.sample TO authenticated;
  `;
  const remote = [
    "create table public.sample(id bigint primary key,label text);",
    "grant select on public.sample to authenticated",
  ];

  assert.deepEqual(compareSqlSources(gitSql, remote), {
    equivalent: true,
    gitStatementCount: 2,
    remoteStatementCount: 2,
    matchedStatementCount: 2,
    firstMismatch: null,
  });
});

test("literal content and quoted identifiers remain byte-sensitive", () => {
  assert.equal(compareSqlSources("select 'a b';", ["select 'ab';"]).equivalent, false);
  assert.equal(compareSqlSources('select "Mixed Case";', ['select "mixed case";']).equivalent, false);
});

test("Postgres string prefixes remain attached to their literals", () => {
  assert.equal(compareSqlSources("select E'line\\n';", ["select e'line\\n';"]).equivalent, true);
  assert.equal(compareSqlSources("select E'line\\n';", ["select E 'line\\n';"]).equivalent, false);
  assert.equal(compareSqlSources("select U&'d\\0061t';", ["select u&'d\\0061t';"]).equivalent, true);
});

test("comment markers inside literals remain executable content", () => {
  const comparison = compareSqlSources("select '-- keep me';", ["select '-- change me';"]);
  assert.equal(comparison.equivalent, false);
  assert.equal(comparison.firstMismatch?.firstToken?.gitKind, "single_quoted");
});

test("dollar-quoted bodies are preserved byte-for-byte", () => {
  const gitSql = "create function f() returns void language plpgsql as $$ begin null; end $$;";
  const remoteSql = "create function f() returns void language plpgsql as $$begin null; end$$;";
  assert.equal(compareSqlSources(gitSql, [remoteSql]).equivalent, false);
});

test("statement splitting ignores semicolons inside quoted values and function bodies", () => {
  const sql = "select ';'; create function f() returns text language sql as $$ select ';'; $$; select 3;";
  assert.equal(splitSqlStatements(sql).length, 3);
});

test("remote statement arrays and single SQL groups compare the same way", () => {
  const gitSql = "create table a(id bigint); create table b(id bigint);";
  assert.equal(compareSqlSources(gitSql, ["create table a(id bigint)", "create table b(id bigint)"]).equivalent, true);
  assert.equal(compareSqlSources(gitSql, [gitSql]).equivalent, true);
});

test("the comparator detects the restored tariff index as executable drift", () => {
  const sql = readFileSync(
    "supabase/migrations/20260827164000_tariff_engine_foundation.sql",
    "utf8",
  );
  const requiredIndex =
    "create unique index if not exists tariff_rules_tenant_id_id_key on public.tariff_rules(tenant_id, id);";
  const oldSource = sql.replace(requiredIndex, "");

  assert.equal(compareSqlSources(sql, [sql]).equivalent, true);
  assert.equal(compareSqlSources(oldSource, [sql]).equivalent, false);
});

test("malformed quoted input fails closed", () => {
  assert.throws(() => tokenizeSql("select 'unterminated"), SyntaxError);
  assert.throws(() => splitSqlStatements("select /* unterminated"), SyntaxError);
});
