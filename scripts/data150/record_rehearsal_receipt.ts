#!/usr/bin/env node
/**
 * FORNEXA — Rehearsal Execution Receipt Stager
 * Receives raw returned rows from PostgreSQL RETURNING clauses and writes
 * the confirmed, typed execution receipt with atomic fsync.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  recordExecutionReceiptFromReturning,
} from "../../lib/data150-loader.ts";
import { validateExecutionReceiptForRollback } from "./generate_rollback_from_receipt.ts";

function main() {
  const inputJsonPath = process.argv[2];
  const targetReceiptPath = process.argv[3];

  if (!inputJsonPath || !targetReceiptPath) {
    console.error("Usage: node record_rehearsal_receipt.ts <input_returned_rows.json> <target_receipt.json>");
    process.exit(1);
  }

  const raw = readFileSync(resolve(process.cwd(), inputJsonPath), "utf8");
  const returnedByTable = JSON.parse(raw);

  recordExecutionReceiptFromReturning(returnedByTable, {
    targetPath: resolve(process.cwd(), targetReceiptPath),
    persistToFile: true,
    status: "COMMITTED",
  });

  // Self-validate receipt
  const rawWritten = readFileSync(resolve(process.cwd(), targetReceiptPath), "utf8");
  const parsedWritten = JSON.parse(rawWritten);
  const validated = validateExecutionReceiptForRollback(parsedWritten);

  console.log(`[RECEIPT STAGER] Successfully staged and validated execution receipt with ${Object.keys(validated.tables).length} tables.`);
}

main();
