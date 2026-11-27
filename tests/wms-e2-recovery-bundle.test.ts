import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { buildE2RecoverySql, C3_BODY_SHA256, C3_SOURCE_SHA256 } from "../scripts/wms/build-e2-recovery.mjs";
import { sha256, stripExteriorTx } from "../scripts/wms/verify-e2-dbfirst-contingency.mjs";

const root = resolve(import.meta.dirname, "..");
const inputs = {
  c3Source: readFileSync(resolve(root, "supabase/migrations/20261019120000_wms_c3_server_load_controls.sql"), "utf8"),
  rollbackSource: readFileSync(resolve(root, "scripts/wms/rollback-wms-e2-core.sql"), "utf8"),
  recoverySource: readFileSync(resolve(root, "scripts/wms/recover-wms-e2-compatible.sql"), "utf8"),
};

test("recovery refuses an unreviewed C3 source or an implicit recovery mode", () => {
  // @ts-expect-error Deliberately exercise the runtime boundary with an invalid mode.
  assert.throws(() => buildE2RecoverySql({ ...inputs, mode: "AUTO" }), /RECOVERY_MODE_INVALID/);
  assert.throws(() => buildE2RecoverySql({ ...inputs, mode: "ROLLBACK", c3Source: inputs.c3Source + "\n-- changed" }), /C3_SOURCE_MISMATCH/);
});

test("both bundles restore only the pinned C3 function and ACL in their operation transaction", () => {
  for (const mode of ["ROLLBACK", "PRESERVE_HU"] as const) {
    const bundle = buildE2RecoverySql({ ...inputs, mode });
    assert.equal(bundle.c3SourceSha256, C3_SOURCE_SHA256);
    assert.equal(bundle.c3BodySha256, C3_BODY_SHA256);
    assert.equal(bundle.effectiveSqlSha256, sha256(bundle.sql));
    const parsed = stripExteriorTx(bundle.sql);
    assert.equal(parsed.totalStatements, parsed.innerStatementCount + 2);
    const action = parsed.innerStatements.find(s => /^create or replace function public\.fornexa_wms_action\(/.test(s));
    assert.ok(action);
    const body = /as \$\$([\s\S]*)\$\$;/.exec(action)?.[1];
    assert.ok(body);
    assert.equal(sha256(body), C3_BODY_SHA256);
    const backfills = parsed.innerStatements.filter(s => /^(?:\s|--[^\n]*(?:\n|$))*(?:update|with)\b/i.test(s));
    assert.deepEqual(backfills, [], "Recovery must not execute top-level reservation or policy backfills from C3");
    const operationStart = mode === "ROLLBACK" ? bundle.sql.indexOf("lock table public.inventory_quants") : bundle.sql.indexOf("E2_RECOVERY_CONFIRM_REQUIRED");
    assert.ok(bundle.sql.indexOf(action) < operationStart, "The exact C3 action must be restored before the operation");
  }
});

test("recovery refuses operation templates that can escape the atomic transaction", () => {
  for (const source of ["select 1;", "begin;\ncommit;\nselect 1;", "begin;\ncommit;\ncommit;",
    "begin;\nselect 1; commit; select 2;\ncommit;", "begin; select 1; /* hidden boundary */ COMMIT AND CHAIN; commit;",
    "begin; -- comment\nrollback; commit;", "begin; /* outer /* nested */ comment */ END; commit;",
    "begin; savepoint partial; commit;", "begin; start transaction; commit;",
    "begin; prepare/* comment */transaction 'escaped'; commit;"]) {
    assert.throws(() => buildE2RecoverySql({ ...inputs, mode: "ROLLBACK", rollbackSource: source }), /RECOVERY_TRANSACTION_INVALID/);
  }
});

test("recovery accepts comments and transaction words confined to SQL literals and bodies", () => {
  const source = "/* preamble */ BEGIN; select 'commit; begin;', \"commit;\"; DO $safe$ BEGIN PERFORM 'rollback;'; END $safe$; COMMIT; -- tail";
  const bundle = buildE2RecoverySql({ ...inputs, mode: "ROLLBACK", rollbackSource: source });
  assert.ok(bundle.sql.includes("DO $safe$ BEGIN PERFORM 'rollback;'; END $safe$;"));
  const escaped = String.raw`begin; select E'quote \' and commit;'; select $é$rollback; ' untouched$é$; commit;`;
  assert.ok(buildE2RecoverySql({ ...inputs, mode: "ROLLBACK", rollbackSource: escaped }).sql.includes("$é$rollback;"));
});

test("recovery rejects transaction boundaries hidden by identifiers, escape strings and continuations", () => {
  const sources = [
    "begin; insert into probe values (1) returning 1 as a$x$; commit; select 1/0 as b$x$; commit;",
    String.raw`begin; insert into probe values (1) returning E'\''; commit; select 1/0, E'\''; commit;`,
    String.raw`begin;
insert into probe values (1) returning E''
'\'';
commit;
select 1/0, E''
'\'';
commit;`,
  ];
  for (const source of sources) {
    assert.throws(() => buildE2RecoverySql({ ...inputs, mode: "ROLLBACK", rollbackSource: source }), /RECOVERY_TRANSACTION_INVALID/);
  }
});
