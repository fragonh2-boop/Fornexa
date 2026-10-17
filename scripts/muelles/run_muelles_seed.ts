#!/usr/bin/env node
/**
 * FORNEXA — Production MUELLES-V1 Synthetic Seed Runner
 * TASK_ID: MUELLES-SEED-20261017
 *
 * Guarantees:
 * 1. Dedicated single pg.Client over POSTGRES_URL_NON_POOLING (session mode).
 * 2. Zero leaked credentials in stdout/stderr/files.
 * 3. Fixed tenant: 00000000-0000-4000-8000-000000000001.
 * 4. Supports --dry-run-rehearsal (executes full loader inside BEGIN...ROLLBACK on live schema to prove 0 constraint/EXCLUDE errors before committing).
 * 5. Supports --confirm-production (executes atomic BEGIN...COMMIT, verifies 2,031 RETURNING rows across 6 tables, and writes durable receipt).
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Client } = require("/private/tmp/fornexa-gemini-data150/node_modules/pg");

const EXPECTED_TENANT_ID = "00000000-0000-4000-8000-000000000001";
const EXPECTED_Counts: Record<string, number> = {
  warehouse_zones: 450,
  warehouse_docks: 800,
  dock_appointment_rules: 450,
  dock_policies: 150,
  dock_appointments: 150,
  transport_events: 31,
};

function resolveConnectionString(): string {
  if (process.env.POSTGRES_URL_NON_POOLING) {
    return process.env.POSTGRES_URL_NON_POOLING.trim();
  }
  const candidateFiles = [
    resolve(process.cwd(), ".env.production.local"),
    resolve(process.cwd(), ".env.local"),
  ];
  for (const envFile of candidateFiles) {
    if (existsSync(envFile)) {
      const content = readFileSync(envFile, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("POSTGRES_URL_NON_POOLING=")) {
          let val = trimmed.slice("POSTGRES_URL_NON_POOLING=".length).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (val) return val;
        }
      }
    }
  }
  throw new Error("Missing POSTGRES_URL_NON_POOLING in environment or .env.production.local");
}

function sha256File(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

async function main() {
  const args = process.argv.slice(2);
  const isRehearsal = args.includes("--dry-run-rehearsal");
  const isConfirmProd = args.includes("--confirm-production");

  if (!isRehearsal && !isConfirmProd) {
    throw new Error("Specify either --dry-run-rehearsal or --confirm-production");
  }

  const rootDir = process.cwd();
  const manifestPath = resolve(rootDir, "docs/verification/muelles-seed-manifest.json");
  const receiptPath = resolve(rootDir, "docs/verification/muelles-seed-execution-receipt.json");
  const loaderPath = resolve(rootDir, "scripts/muelles/muelles-seed-loader.sql");
  const rollbackPath = resolve(rootDir, "scripts/muelles/muelles-seed-rollback.sql");

  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  const receipt = JSON.parse(readFileSync(receiptPath, "utf-8"));

  if (receipt.status !== "PENDING_EXECUTION") {
    throw new Error(`Aborting: receipt status is '${receipt.status}', expected 'PENDING_EXECUTION'`);
  }

  const actualLoaderHash = sha256File(loaderPath);
  const actualRollbackHash = sha256File(rollbackPath);
  if (actualLoaderHash !== manifest.loader_sql_sha256) {
    throw new Error(`Loader SHA-256 mismatch: ${actualLoaderHash} !== ${manifest.loader_sql_sha256}`);
  }
  if (actualRollbackHash !== manifest.rollback_sql_sha256) {
    throw new Error(`Rollback SHA-256 mismatch: ${actualRollbackHash} !== ${manifest.rollback_sql_sha256}`);
  }

  const connStr = resolveConnectionString();
  const urlObj = new URL(connStr);
  urlObj.searchParams.delete("sslmode");

  const client = new Client({
    connectionString: urlObj.toString(),
    ssl: { rejectUnauthorized: false },
    statement_timeout: 60000,
  });

  await client.connect();
  try {
    // 1. Preflight checks
    const tablesCountRes = await client.query(
      `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
    );
    const migRes = await client.query(
      `SELECT count(*)::int AS n, max(version) AS max_ver FROM supabase_migrations.schema_migrations`
    );
    const ownerRes = await client.query(
      `SELECT tm.user_id, tm.role, tm.status FROM public.tenant_members tm JOIN auth.users u ON u.id = tm.user_id WHERE tm.tenant_id = $1 AND tm.status = 'ACTIVE' AND tm.role IN ('OWNER', 'ADMIN') ORDER BY CASE tm.role WHEN 'OWNER' THEN 1 ELSE 2 END, tm.created_at ASC LIMIT 1`,
      [EXPECTED_TENANT_ID]
    );

    const targetTables = Object.keys(EXPECTED_Counts);
    const countsBefore: Record<string, number> = {};
    for (const t of targetTables) {
      const r = await client.query(`SELECT count(*)::int AS n FROM public.${t} WHERE tenant_id = $1`, [
        EXPECTED_TENANT_ID,
      ]);
      countsBefore[t] = r.rows[0].n;
    }

    if (
      countsBefore.warehouse_docks > 1 ||
      countsBefore.dock_appointment_rules !== 0 ||
      countsBefore.dock_policies !== 0 ||
      countsBefore.dock_appointments !== 0
    ) {
      throw new Error(
        `Preflight failed: unexpected pre-existing dock rows before load: ${JSON.stringify(countsBefore)}`
      );
    }
    if (countsBefore.warehouse_zones !== 150) {
      throw new Error(
        `Preflight failed: expected 150 existing DATA150 warehouse_zones, got ${countsBefore.warehouse_zones}`
      );
    }
    if (!ownerRes.rows[0]?.user_id) {
      throw new Error("Preflight failed: no active OWNER/ADMIN found for tenant");
    }

    // Parse statements from loader SQL (excluding BEGIN; and COMMIT;)
    const rawSql = readFileSync(loaderPath, "utf-8");
    const lines = rawSql
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("--") && l !== "BEGIN;" && l !== "COMMIT;");

    await client.query("BEGIN");
    const insertedIdsByTable: Record<string, string[]> = {
      warehouse_zones: [],
      warehouse_docks: [],
      dock_appointment_rules: [],
      dock_policies: [],
      dock_appointments: [],
      transport_events: [],
    };

    try {
      // First statement is the DO $$ ... END $$; block
      const doBlockEndIdx = lines.findIndex((l) => l === "END $$;");
      const doBlockSql = lines.slice(0, doBlockEndIdx + 1).join("\n");
      await client.query(doBlockSql);

      const insertStatements = lines.slice(doBlockEndIdx + 1);
      const BATCH_SIZE = 100;
      for (let i = 0; i < insertStatements.length; i += BATCH_SIZE) {
        const chunk = insertStatements.slice(i, i + BATCH_SIZE);
        const tableNames = chunk.map((stmt) => {
          const match = /^INSERT INTO public\.(\w+)\s/i.exec(stmt);
          if (!match) {
            throw new Error(`Unexpected statement in loader: ${stmt.slice(0, 60)}`);
          }
          return match[1];
        });
        const res = await client.query(chunk.join("\n"));
        const resArray = Array.isArray(res) ? res : [res];
        for (let j = 0; j < resArray.length; j++) {
          const r = resArray[j];
          const tableName = tableNames[j];
          if (r && r.rows && r.rows.length === 1 && r.rows[0].id) {
            insertedIdsByTable[tableName].push(r.rows[0].id);
          }
        }
      }

      // Verify exact counts inside transaction
      for (const [t, expectedCount] of Object.entries(EXPECTED_Counts)) {
        const actual = insertedIdsByTable[t].length;
        if (actual !== expectedCount) {
          throw new Error(
            `Count mismatch inside transaction for ${t}: expected ${expectedCount}, got ${actual}`
          );
        }
      }

      if (isRehearsal) {
        // Also test the compensation rollback inside rehearsal before rolling back everything!
        const rbSql = readFileSync(rollbackPath, "utf-8")
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith("--") && l !== "BEGIN;" && l !== "COMMIT;");
        for (let i = 0; i < rbSql.length; i += BATCH_SIZE) {
          const rbChunk = rbSql.slice(i, i + BATCH_SIZE);
          await client.query(rbChunk.join("\n"));
        }
        const postRbDocks = await client.query(
          `SELECT count(*)::int AS n FROM public.warehouse_docks WHERE tenant_id = $1`,
          [EXPECTED_TENANT_ID]
        );
        const postRbZones = await client.query(
          `SELECT count(*)::int AS n FROM public.warehouse_zones WHERE tenant_id = $1`,
          [EXPECTED_TENANT_ID]
        );
        const postRbApts = await client.query(
          `SELECT status, count(*)::int AS n FROM public.dock_appointments WHERE tenant_id = $1 GROUP BY status`,
          [EXPECTED_TENANT_ID]
        );
        await client.query("ROLLBACK");
        console.log(
          JSON.stringify(
            {
              mode: "DRY_RUN_REHEARSAL_ROLLED_BACK",
              public_tables: tablesCountRes.rows[0].n,
              migrations: migRes.rows[0],
              owner_user_id: ownerRes.rows[0].user_id,
              counts_before: countsBefore,
              rehearsal_inserted_counts: Object.fromEntries(
                Object.entries(insertedIdsByTable).map(([k, v]) => [k, v.length])
              ),
              rehearsal_compensation_rollback_verified: {
                warehouse_docks_after_rollback: postRbDocks.rows[0].n,
                warehouse_zones_after_rollback: postRbZones.rows[0].n,
                dock_appointments_after_rollback: postRbApts.rows,
              },
              status: "REHEARSAL_PASSED_ZERO_CHANGES_COMMITTED",
            },
            null,
            2
          )
        );
        return;
      }

      // Production execution: COMMIT
      await client.query("COMMIT");

      const countsAfter: Record<string, number> = {};
      for (const t of targetTables) {
        const r = await client.query(`SELECT count(*)::int AS n FROM public.${t} WHERE tenant_id = $1`, [
          EXPECTED_TENANT_ID,
        ]);
        countsAfter[t] = r.rows[0].n;
      }

      const finalReceipt = {
        status: "COMMITTED",
        batch_id: manifest.batch_id,
        tenant_id: EXPECTED_TENANT_ID,
        loader_sql_sha256: actualLoaderHash,
        rollback_sql_sha256: actualRollbackHash,
        executed_at: new Date().toISOString(),
        total_rows_inserted: Object.values(insertedIdsByTable).reduce((acc, arr) => acc + arr.length, 0),
        counts_before: countsBefore,
        counts_after: countsAfter,
        tables: Object.fromEntries(
          Object.entries(insertedIdsByTable).map(([k, ids]) => [
            k,
            {
              inserted_count: ids.length,
              ids,
            },
          ])
        ),
      };

      writeFileSync(receiptPath, JSON.stringify(finalReceipt, null, 2) + "\n", "utf-8");
      console.log(
        JSON.stringify(
          {
            mode: "PRODUCTION_COMMITTED",
            status: finalReceipt.status,
            executed_at: finalReceipt.executed_at,
            total_rows_inserted: finalReceipt.total_rows_inserted,
            counts_before: countsBefore,
            counts_after: countsAfter,
            receipt_sha256: sha256File(receiptPath),
            rollback_sha256: actualRollbackHash,
          },
          null,
          2
        )
      );
    } catch (innerErr) {
      await client.query("ROLLBACK").catch(() => {});
      throw innerErr;
    }
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error("ERROR:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
