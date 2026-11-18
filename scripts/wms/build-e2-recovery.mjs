// Builds an atomic operator bundle; never connects to a database.
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const C3_SOURCE_SHA256 = "deb9cb2f2f375084d01985785ce59b485b8c0a8887d3f445d8d7ab311d907f46";
export const C3_BODY_SHA256 = "45b5ac3b4132e408d46d5b39bd6c39b2e7abcc4dd56eaa3629f1692e90dd0c64";
const hash = (text) => createHash("sha256").update(text, "utf8").digest("hex");

export function extractC3Restore(source) {
  if (hash(source) !== C3_SOURCE_SHA256) throw new Error("C3_SOURCE_MISMATCH: review the new baseline before recovery");
  const statements = [...source.matchAll(/^create or replace function public\.fornexa_wms_action\([\s\S]*?^\$\$;/gm)];
  if (statements.length !== 1) throw new Error("C3_FUNCTION_AMBIGUOUS");
  const statement = statements[0][0];
  const body = /as \$\$([\s\S]*)\$\$;$/.exec(statement)?.[1];
  if (body === undefined || hash(body) !== C3_BODY_SHA256) throw new Error("C3_BODY_MISMATCH");
  // These are the exact action ACL statements from the pinned C3 migration.
  const acl = [
    "revoke all on function public.fornexa_wms_action(uuid, uuid, text, jsonb, text) from public, anon, authenticated;",
    "grant execute on function public.fornexa_wms_action(uuid, uuid, text, jsonb, text) to service_role;",
  ];
  if (!acl.every((sql) => source.includes(sql))) throw new Error("C3_ACL_MISMATCH");
  return { sql: [statement, ...acl].join("\n"), sourceSha256: C3_SOURCE_SHA256, bodySha256: C3_BODY_SHA256 };
}

function transactionBody(source) {
  const begins = [...source.matchAll(/^begin;[ \t]*$/gim)];
  const commits = [...source.matchAll(/^commit;[ \t]*$/gim)];
  if (begins.length !== 1 || commits.length !== 1 || begins[0].index >= commits[0].index
      || source.slice(commits[0].index + commits[0][0].length).trim()) {
    throw new Error("RECOVERY_TRANSACTION_INVALID");
  }
  return source.slice(begins[0].index + begins[0][0].length, commits[0].index).trim();
}

export function buildE2RecoverySql({ mode, c3Source, rollbackSource, recoverySource }) {
  if (mode !== "ROLLBACK" && mode !== "PRESERVE_HU") throw new Error("RECOVERY_MODE_INVALID");
  const restore = extractC3Restore(c3Source);
  const selected = mode === "ROLLBACK" ? rollbackSource : recoverySource;
  if (typeof selected !== "string") throw new Error("RECOVERY_SCRIPT_REQUIRED");
  const body = transactionBody(selected);
  const sql = `begin;\nset local lock_timeout = '5s';\nset local statement_timeout = '60s';\n${restore.sql}\n\n${body}\n\ncommit;\n`;
  return { sql, mode, c3SourceSha256: restore.sourceSha256, c3BodySha256: restore.bodySha256,
    operationSourceSha256: hash(selected), effectiveSqlSha256: hash(sql) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, output] = process.argv.slice(2);
  if (!output) throw new Error("Usage: node scripts/wms/build-e2-recovery.mjs ROLLBACK|PRESERVE_HU /path/bundle.sql");
  const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
  const [c3Source, rollbackSource, recoverySource] = await Promise.all([
    readFile(resolve(root, "supabase/migrations/20261019120000_wms_c3_server_load_controls.sql"), "utf8"),
    readFile(resolve(root, "scripts/wms/rollback-wms-e2-core.sql"), "utf8"),
    readFile(resolve(root, "scripts/wms/recover-wms-e2-compatible.sql"), "utf8"),
  ]);
  const bundle = buildE2RecoverySql({ mode, c3Source, rollbackSource, recoverySource });
  await writeFile(resolve(output), bundle.sql, { flag: "wx" });
  const manifest = { ...bundle };
  delete manifest.sql;
  await writeFile(resolve(output) + ".json", JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify(manifest));
}
