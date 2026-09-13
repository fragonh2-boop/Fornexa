import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  compareSqlSources,
  digestSqlStatements,
  serializeSqlTokens,
  splitSqlStatements,
  tokenizeSql,
} from "../scripts/sql-provenance.ts";
import { sqlProvenanceControls } from "./fixtures/sql-provenance-controls.ts";

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

test("signed exponents are numeric only when followed by exponent digits", () => {
  assert.deepEqual(
    tokenizeSql("1e-5 1E+10 1.5e-3").map(({ kind, value }) => [kind, value]),
    [
      ["number", "1e-5"],
      ["number", "1e+10"],
      ["number", "1.5e-3"],
    ],
  );

  assert.deepEqual(
    tokenizeSql("5-1 5 - -1 select 1--x\n1e 1e- x1e5 a.b1e5 $1").map(
      ({ kind, value }) => [kind, value],
    ),
    [
      ["number", "5"],
      ["operator", "-"],
      ["number", "1"],
      ["number", "5"],
      ["operator", "-"],
      ["operator", "-"],
      ["number", "1"],
      ["word", "select"],
      ["number", "1"],
      ["number", "1"],
      ["word", "e"],
      ["number", "1"],
      ["word", "e"],
      ["operator", "-"],
      ["word", "x1e5"],
      ["word", "a"],
      ["punctuation", "."],
      ["word", "b1e5"],
      ["parameter", "$1"],
    ],
  );
});

test("typed token serialization prevents cross-kind digest collisions", () => {
  const literal = serializeSqlTokens(tokenizeSql("select '1';"));
  const number = serializeSqlTokens(tokenizeSql("select 1;"));
  assert.notEqual(literal, number);
  assert.notEqual(
    digestSqlStatements(["select '1';"]).statementDigests[0],
    digestSqlStatements(["select 1;"]).statementDigests[0],
  );
});

test("versioned synthetic controls fail closed on executable changes", () => {
  for (const control of sqlProvenanceControls) {
    assert.equal(
      compareSqlSources(control.gitSql, control.remoteSql).equivalent,
      control.equivalent,
      control.name,
    );
  }
});
