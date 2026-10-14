#!/usr/bin/env node
/**
 * FORNEXA — Dynamic Operational Rollback Generator
 * Generates SQL rollback commands strictly bound to confirmed effective ownership
 * captured in docs/verification/data150-execution-receipt.json.
 *
 * FAIL-CLOSED ENFORCEMENT:
 * Rejects unexecuted, pending, aborted, indeterminate, or unconfirmed receipts.
 * Strictly validates batch_id, tenant_id, execution timestamp, and table key structures.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  generateRollbackSqlFromExecutionReceipt,
  DATA150_TENANT_ID,
  DATA150_BATCH_ID,
  loadReceipt,
  computeSqlSha256,
  sanitizeAndFormatKey,
  sanitizeAndFormatCompositeTuple,
} from "../../lib/data150-loader.ts";
import type { Data150ExecutionReceipt } from "../../lib/data150-loader.ts";

export type ValidatedReceiptPayload = {
  status: "COMMITTED";
  batch_id: string;
  tenant_id: string;
  dataset_hash: string;
  executed_at: string;
  updated_at?: string;
  tables: Data150ExecutionReceipt;
};

/**
 * Validates that an execution receipt represents a genuinely COMMITTED batch
 * with verified batch identity, tenant ownership, timestamps, dataset hash
 * strictly verified against the actual executing SQL file, and key structures
 * strictly validated against authorized schema metadata.
 * Fails closed on ANY ambiguity or invalidity.
 */
export function validateExecutionReceiptForRollback(
  parsed: any,
  loaderSqlPath?: string
): ValidatedReceiptPayload {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid receipt: Root payload must be a non-null JSON object.");
  }

  // 1. Status must be strictly COMMITTED:
  if (parsed.status !== "COMMITTED") {
    throw new Error(
      `Cannot generate operational rollback: Receipt status is '${parsed.status || "UNKNOWN"}', expected 'COMMITTED'. ` +
        "Operational rollback strictly requires a confirmed COMMITTED execution receipt."
    );
  }

  // 2. Batch ID must match exactly:
  if (parsed.batch_id !== DATA150_BATCH_ID) {
    throw new Error(
      `Cannot generate operational rollback: Receipt batch_id mismatch. ` +
        `Expected '${DATA150_BATCH_ID}', received '${parsed.batch_id}'.`
    );
  }

  // 3. Tenant ID must match authorized FORNEXA tenant:
  if (parsed.tenant_id !== DATA150_TENANT_ID) {
    throw new Error(
      `Cannot generate operational rollback: Receipt tenant_id mismatch. ` +
        `Expected '${DATA150_TENANT_ID}', received '${parsed.tenant_id}'.`
    );
  }

  // 4. Dataset hash must be a valid 64-char SHA-256 hex string and match the actual executing SQL:
  if (
    !parsed.dataset_hash ||
    typeof parsed.dataset_hash !== "string" ||
    !/^[0-9a-f]{64}$/i.test(parsed.dataset_hash)
  ) {
    throw new Error(
      `Cannot generate operational rollback: Receipt dataset_hash is missing or not a valid 64-character SHA-256 hex string.`
    );
  }

  const actualHash = computeSqlSha256(loaderSqlPath);
  if (parsed.dataset_hash.toLowerCase() !== actualHash.toLowerCase()) {
    throw new Error(
      `Cannot generate operational rollback: Receipt dataset_hash mismatch. ` +
        `Expected actual SQL hash '${actualHash}', received '${parsed.dataset_hash}'. Receipt does not correspond to loader SQL.`
    );
  }

  // 5. Executed timestamp must be a valid ISO timestamp (supports both direct executed_at and reconciled_at):
  const effectiveExecutedAt = parsed.executed_at || parsed.reconciled_at;
  if (!effectiveExecutedAt || typeof effectiveExecutedAt !== "string" || isNaN(Date.parse(effectiveExecutedAt))) {
    throw new Error(
      `Cannot generate operational rollback: Receipt executed_at timestamp is missing or invalid: '${parsed.executed_at || parsed.reconciled_at}'.`
    );
  }

  // 6. Tables map must exist and have at least 1 table:
  if (!parsed.tables || typeof parsed.tables !== "object" || Array.isArray(parsed.tables)) {
    throw new Error("Cannot generate operational rollback: Receipt tables map is missing or invalid.");
  }

  const tableNames = Object.keys(parsed.tables);
  if (tableNames.length === 0) {
    throw new Error("Cannot generate operational rollback: Receipt tables map contains 0 tables.");
  }

  // 7. Load authorized schema baseline metadata to strictly verify tables and PK structures:
  const authorizedMeta = loadReceipt();

  // 8. Validate table structures and key integrity strictly against authorized metadata:
  for (const tableName of tableNames) {
    const entry = parsed.tables[tableName];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`Receipt entry for table '${tableName}' is missing or malformed.`);
    }

    const authTable = authorizedMeta[tableName];
    if (!authTable) {
      throw new Error(
        `Receipt entry for table '${tableName}' is unauthorized: table is not present in authorized schema metadata.`
      );
    }

    if (entry.pk_type !== authTable.pk_type) {
      throw new Error(
        `Receipt entry for table '${tableName}' pk_type mismatch: expected '${authTable.pk_type}', got '${entry.pk_type}'.`
      );
    }

    if (typeof entry.inserted_count !== "number" || entry.inserted_count < 0 || !Number.isInteger(entry.inserted_count)) {
      throw new Error(
        `Receipt entry for table '${tableName}' has invalid inserted_count: ${entry.inserted_count}. Must be non-negative integer.`
      );
    }

    if (!Array.isArray(entry.inserted_keys)) {
      throw new Error(`Receipt entry for table '${tableName}' inserted_keys is not an array.`);
    }

    if (entry.inserted_keys.length !== entry.inserted_count) {
      throw new Error(
        `Receipt entry for table '${tableName}' count mismatch: ` +
          `inserted_count=${entry.inserted_count} vs inserted_keys.length=${entry.inserted_keys.length}.`
      );
    }

    if (entry.pk_type === "composite") {
      const expectedPks = (authTable as any).pks;
      if (
        !Array.isArray(entry.pks) ||
        entry.pks.length !== expectedPks.length ||
        !entry.pks.every((k: string, i: number) => k === expectedPks[i])
      ) {
        throw new Error(
          `Receipt entry for composite table '${tableName}' pks mismatch with authorized schema metadata.`
        );
      }
      for (const pair of entry.inserted_keys) {
        if (!Array.isArray(pair) || pair.length !== entry.pks.length) {
          throw new Error(`Receipt entry for composite table '${tableName}' contains invalid key tuple.`);
        }
        sanitizeAndFormatCompositeTuple(pair);
      }
    } else {
      const expectedPkCol = authTable.pk_type === "single" ? authTable.pk_col : "id";
      if (entry.pk_col !== expectedPkCol) {
        throw new Error(
          `Receipt entry for table '${tableName}' pk_col mismatch: unauthorized pk_col '${entry.pk_col}', expected '${expectedPkCol}'.`
        );
      }
      for (const k of entry.inserted_keys) {
        sanitizeAndFormatKey(k);
      }
    }
  }

  return parsed as ValidatedReceiptPayload;
}

export function generateOperationalRollback(
  customReceiptPath?: string,
  customOutputPath?: string,
  loaderSqlPath?: string
): string {
  const receiptPath =
    customReceiptPath ||
    resolve(process.cwd(), "docs/verification/data150-execution-receipt.json");
  const raw = readFileSync(receiptPath, "utf8");
  const parsed = JSON.parse(raw);

  const validated = validateExecutionReceiptForRollback(parsed, loaderSqlPath);

  const sql = generateRollbackSqlFromExecutionReceipt(
    validated.tables,
    validated.tenant_id
  );

  const outputPath =
    customOutputPath ||
    resolve(process.cwd(), "scripts/data150/data150-rollback.sql");
  writeFileSync(outputPath, sql, "utf8");
  console.log(
    `[ROLLBACK GENERATOR] Dynamic rollback written to ${outputPath} from confirmed execution receipt.`
  );
  return sql;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const customReceipt = process.argv[2];
    const customOutput = process.argv[3];
    const customSql = process.argv[4];
    generateOperationalRollback(customReceipt, customOutput, customSql);
  } catch (err: any) {
    console.error(`[ROLLBACK GENERATOR] ${err.message}`);
    process.exit(1);
  }
}
