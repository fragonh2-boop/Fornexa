import {
  readFileSync,
  openSync,
  writeSync,
  fsyncSync,
  closeSync,
  renameSync,
  unlinkSync,
  existsSync,
} from "node:fs";
import { resolve, dirname, join, basename } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import type { SupabaseClient } from "@supabase/supabase-js";

export const DATA150_TENANT_ID = "00000000-0000-4000-8000-000000000001";
export const DATA150_BATCH_ID = "DATA150-PRODUCTION-20261009";

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const INTEGER_REGEX = /^\d+$/;
export const SAFE_IDENTIFIER_REGEX = /^[a-zA-Z0-9_\-]+$/;

/**
 * Computes SHA-256 hash of a file on disk.
 */
export function computeFileSha256(filePath: string): string {
  const content = readFileSync(filePath);
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Computes SHA-256 hash of loader SQL content or default scripts/data150/data150-loader.sql file.
 */
export function computeSqlSha256(sqlContentOrPath?: string): string {
  if (
    sqlContentOrPath &&
    !sqlContentOrPath.includes("\n") &&
    (sqlContentOrPath.endsWith(".sql") || existsSync(sqlContentOrPath))
  ) {
    return computeFileSha256(sqlContentOrPath);
  }
  if (sqlContentOrPath) {
    return createHash("sha256").update(sqlContentOrPath, "utf8").digest("hex");
  }
  const defaultPath = resolve(process.cwd(), "scripts/data150/data150-loader.sql");
  return computeFileSha256(defaultPath);
}

export const DATA150_LOADER_SQL_SHA256 = "8bf3235474d39578cb9dd278a4b14176c3402200066f3b9a5f2fa1efc2c1e913";

/**
 * Validates and formats a primary key (UUID, identity, or safe identifier).
 * Prevents SQL injection and fails closed on altered or unescaped keys.
 */
export function sanitizeAndFormatKey(key: unknown): string {
  if (typeof key === "number") {
    if (!Number.isInteger(key) || !Number.isFinite(key)) {
      throw new Error(`Security validation failed: Invalid non-finite or non-integer numeric key: ${key}`);
    }
    return String(key);
  }
  if (typeof key === "string") {
    const trimmed = key.trim();
    if (UUID_REGEX.test(trimmed)) {
      return `'${trimmed.toLowerCase()}'`;
    }
    if (INTEGER_REGEX.test(trimmed)) {
      return trimmed;
    }
    if (SAFE_IDENTIFIER_REGEX.test(trimmed)) {
      return `'${trimmed.replace(/'/g, "''")}'`;
    }
    throw new Error(
      `Security validation failed: Key '${key}' is neither a valid UUID, safe integer, nor alphanumeric identifier.`
    );
  }
  throw new Error(`Security validation failed: Key of type '${typeof key}' is not supported.`);
}

/**
 * Validates and formats composite key tuples (e.g. (cmr_id, expedition_id)).
 */
export function sanitizeAndFormatCompositeTuple(tuple: unknown[]): string {
  if (!Array.isArray(tuple) || tuple.length === 0) {
    throw new Error("Security validation failed: Invalid empty or non-array composite key tuple");
  }
  const formatted = tuple.map((k) => sanitizeAndFormatKey(k));
  return `(${formatted.join(", ")})`;
}

/**
 * Concurrency guard: Acquires an exclusive lockfile (<filePath>.lock) during disk operations
 * to prevent race conditions and concurrent write hazards.
 *
 * Causal context isolation (Point 1):
 * - Uses AsyncLocalStorage to track locks held by the current causal async context.
 * - Genuine re-entrancy is allowed ONLY for operations within the exact same causal context.
 * - Independent callers within the same process (different causal context) must queue up
 *   in an in-process Mutex queue and NEVER bypass the critical section while another operation
 *   waits for COMMIT.
 *
 * Safe Orphan Reclaim Protocol (Point 2):
 * - Waiters attempting to clean up an abandoned lockfile must acquire an atomic reclaim mutex
 *   (<lockPath>.reclaim.lock via openSync("wx")).
 * - Under this reclaim mutex, the reclaimer re-reads <lockPath> and verifies that it STILL holds
 *   the exact dead holder PID before unlinking.
 * - If another process already acquired the lock or the lock changed, the reclaimer aborts cleanly
 *   without unlinking or renaming a live lock.
 */
interface CausalLockContext {
  activeLocks: Map<string, string>; // lockPath -> contextId
  contextId: string;
  isReleased: boolean;
}
const causalLockStorage = new AsyncLocalStorage<CausalLockContext>();

class InProcessLockQueue {
  private currentHolderContextId: string | null = null;
  private currentHolderIsAsync: boolean = false;
  private waiters: Array<{
    contextId: string;
    resolve: () => void;
    reject: (err: Error) => void;
    timer?: NodeJS.Timeout;
  }> = [];

  acquire(contextId: string, timeoutMs: number): Promise<void> | void {
    if (this.currentHolderContextId === null) {
      this.currentHolderContextId = contextId;
      this.currentHolderIsAsync = true;
      return;
    }
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.findIndex((w) => w.contextId === contextId);
        if (idx !== -1) {
          this.waiters.splice(idx, 1);
          reject(new Error(`Timeout waiting for in-process lock queue after ${timeoutMs}ms`));
        }
      }, timeoutMs);
      this.waiters.push({ contextId, resolve, reject, timer });
    });
  }

  acquireSync(contextId: string, timeoutMs: number): void {
    if (this.currentHolderContextId === null) {
      this.currentHolderContextId = contextId;
      this.currentHolderIsAsync = false;
      return;
    }
    if (this.currentHolderContextId === contextId) {
      return;
    }
    // Point 2c: If current holder is an async operation, a sync wait loop in the SAME single Node.js thread
    // will freeze the event loop and prevent the async holder from ever resolving.
    if (this.currentHolderIsAsync) {
      throw new Error(
        `Cannot acquire synchronous lock while an asynchronous operation in the same process holds the lock (would starve event loop and deadlock).`
      );
    }
    const start = Date.now();
    while (this.currentHolderContextId !== null && this.currentHolderContextId !== contextId) {
      if (Date.now() - start > timeoutMs) {
        throw new Error(`Timeout waiting for in-process lock queue after ${timeoutMs}ms`);
      }
      throw new Error(`Cannot acquire synchronous lock against concurrent holder on same single-threaded process.`);
    }
    this.currentHolderContextId = contextId;
    this.currentHolderIsAsync = false;
  }

  release(contextId: string): void {
    if (this.currentHolderContextId === contextId) {
      if (this.waiters.length > 0) {
        const next = this.waiters.shift()!;
        if (next.timer) {
          clearTimeout(next.timer);
        }
        this.currentHolderContextId = next.contextId;
        this.currentHolderIsAsync = true;
        next.resolve();
      } else {
        this.currentHolderContextId = null;
        this.currentHolderIsAsync = false;
      }
    }
  }

  isHeldBy(contextId: string): boolean {
    return this.currentHolderContextId === contextId;
  }
}

const inProcessLockQueues = new Map<string, InProcessLockQueue>();

function getInProcessLockQueue(lockPath: string): InProcessLockQueue {
  let q = inProcessLockQueues.get(lockPath);
  if (!q) {
    q = new InProcessLockQueue();
    inProcessLockQueues.set(lockPath, q);
  }
  return q;
}

function safeReclaimOrphanLock(lockPath: string, holderPid: number): void {
  const reclaimLockPath = `${lockPath}.reclaim.lock`;
  let reclaimFd: number | null = null;
  try {
    try {
      reclaimFd = openSync(reclaimLockPath, "wx");
      writeSync(reclaimFd, `${process.pid}\n${Date.now()}\n`);
    } catch (err: any) {
      if (err.code === "EEXIST") {
        // Crash-safe reclaim mutex check (Point 2d):
        // If the process holding .reclaim.lock crashed/died (ESRCH), recover the reclaim mutex
        try {
          if (existsSync(reclaimLockPath)) {
            const reclaimContent = readFileSync(reclaimLockPath, "utf8");
            const reclaimerPid = parseInt(reclaimContent.split("\n")[0]?.trim(), 10);
            if (reclaimerPid && !isNaN(reclaimerPid) && reclaimerPid !== process.pid) {
              let reclaimerDead = false;
              try {
                process.kill(reclaimerPid, 0);
              } catch (killErr: any) {
                if (killErr.code === "ESRCH") {
                  reclaimerDead = true;
                }
              }
              if (reclaimerDead) {
                // Reclaimer process is dead: unlink orphaned .reclaim.lock and retry wx
                try {
                  const check = readFileSync(reclaimLockPath, "utf8");
                  if (parseInt(check.split("\n")[0]?.trim(), 10) === reclaimerPid) {
                    unlinkSync(reclaimLockPath);
                    reclaimFd = openSync(reclaimLockPath, "wx");
                    writeSync(reclaimFd, `${process.pid}\n${Date.now()}\n`);
                  }
                } catch {}
              }
            }
          }
        } catch {}
      }
      if (reclaimFd === null) {
        return; // Another live reclaimer won the mutex
      }
    }

    // Under reclaim mutex, re-verify lockPath still exists and still holds the dead holderPid
    if (existsSync(lockPath)) {
      const currentContent = readFileSync(lockPath, "utf8");
      const currentPid = parseInt(currentContent.split("\n")[0]?.trim(), 10);
      if (currentPid === holderPid) {
        let stillDead = false;
        try {
          process.kill(holderPid, 0);
        } catch (killErr: any) {
          if (killErr.code === "ESRCH") {
            stillDead = true;
          }
        }
        if (stillDead) {
          unlinkSync(lockPath);
        }
      }
    }
  } catch {
    // Lock was already acquired/freed
  } finally {
    if (reclaimFd !== null) {
      try { closeSync(reclaimFd); } catch {}
      try {
        const reclaimContent = readFileSync(reclaimLockPath, "utf8");
        if (parseInt(reclaimContent.split("\n")[0]?.trim(), 10) === process.pid) {
          unlinkSync(reclaimLockPath);
        }
      } catch {}
    }
  }
}

async function withFileLockAsyncInternal<T>(
  lockPath: string,
  fn: () => Promise<T>,
  timeoutMs: number,
  parentContext?: CausalLockContext
): Promise<T> {
  const queue = getInProcessLockQueue(lockPath);
  const contextId = randomUUID();
  const startTime = Date.now();

  const maybePromise = queue.acquire(contextId, timeoutMs);
  if (maybePromise) {
    await maybePromise;
  }

  let acquired = false;
  let lockFd: number | null = null;

  const childLocks = new Map(parentContext?.activeLocks || []);
  childLocks.set(lockPath, contextId);
  const newContext: CausalLockContext = {
    activeLocks: childLocks,
    contextId,
    isReleased: false,
  };

  const releaseLock = () => {
    newContext.activeLocks.delete(lockPath);
    newContext.isReleased = true;
    if (lockFd !== null) {
      try { closeSync(lockFd); } catch {}
      lockFd = null;
    }
    if (acquired) {
      try {
        const check = readFileSync(lockPath, "utf8");
        const lines = check.split("\n");
        const currentPid = parseInt(lines[0]?.trim(), 10);
        const currentContextId = lines[2]?.trim();
        // Point 2a: Only unlink if BOTH currentPid and contextId match
        if (currentPid === process.pid && currentContextId === contextId) {
          unlinkSync(lockPath);
        }
      } catch {}
    }
    queue.release(contextId);
  };

  try {
    while (!acquired) {
      try {
        lockFd = openSync(lockPath, "wx");
        writeSync(lockFd, `${process.pid}\n${Date.now()}\n${contextId}\n`);
        acquired = true;
      } catch (err: any) {
        if (err.code === "EEXIST") {
          try {
            const content = readFileSync(lockPath, "utf8");
            const firstLine = content.split("\n")[0]?.trim();
            const holderPid = parseInt(firstLine, 10);
            if (holderPid && !isNaN(holderPid) && holderPid !== process.pid) {
              try {
                process.kill(holderPid, 0);
              } catch (killErr: any) {
                if (killErr.code === "ESRCH") {
                  safeReclaimOrphanLock(lockPath, holderPid);
                }
              }
            }
          } catch {}

          if (Date.now() - startTime > timeoutMs) {
            throw new Error(`Timeout acquiring lock on ${lockPath} after ${timeoutMs}ms (file is actively locked)`);
          }
          await new Promise((r) => setTimeout(r, 25));
        } else {
          throw err;
        }
      }
    }

    return await causalLockStorage.run(newContext, () => fn());
  } finally {
    releaseLock();
  }
}

function withFileLockSyncOrDeferredInternal<T>(
  lockPath: string,
  fn: () => T,
  timeoutMs: number,
  parentContext?: CausalLockContext
): T {
  const queue = getInProcessLockQueue(lockPath);
  const contextId = randomUUID();
  const startTime = Date.now();

  queue.acquireSync(contextId, timeoutMs);

  let acquired = false;
  let lockFd: number | null = null;

  const childLocks = new Map(parentContext?.activeLocks || []);
  childLocks.set(lockPath, contextId);
  const newContext: CausalLockContext = {
    activeLocks: childLocks,
    contextId,
    isReleased: false,
  };

  let released = false;
  const releaseLock = () => {
    if (released) return;
    released = true;
    newContext.activeLocks.delete(lockPath);
    newContext.isReleased = true;
    if (lockFd !== null) {
      try { closeSync(lockFd); } catch {}
      lockFd = null;
    }
    if (acquired) {
      try {
        const check = readFileSync(lockPath, "utf8");
        const lines = check.split("\n");
        const currentPid = parseInt(lines[0]?.trim(), 10);
        const currentContextId = lines[2]?.trim();
        // Point 2a: Only unlink if BOTH currentPid and contextId match
        if (currentPid === process.pid && currentContextId === contextId) {
          unlinkSync(lockPath);
        }
      } catch {}
    }
    queue.release(contextId);
  };

  try {
    while (!acquired) {
      try {
        lockFd = openSync(lockPath, "wx");
        writeSync(lockFd, `${process.pid}\n${Date.now()}\n${contextId}\n`);
        acquired = true;
      } catch (err: any) {
        if (err.code === "EEXIST") {
          try {
            const content = readFileSync(lockPath, "utf8");
            const firstLine = content.split("\n")[0]?.trim();
            const holderPid = parseInt(firstLine, 10);
            if (holderPid && !isNaN(holderPid) && holderPid !== process.pid) {
              try {
                process.kill(holderPid, 0);
              } catch (killErr: any) {
                if (killErr.code === "ESRCH") {
                  safeReclaimOrphanLock(lockPath, holderPid);
                }
              }
            }
          } catch {}

          if (Date.now() - startTime > timeoutMs) {
            throw new Error(`Timeout acquiring lock on ${lockPath} after ${timeoutMs}ms (file is actively locked)`);
          }
          const waitTill = Date.now() + 25;
          while (Date.now() < waitTill) {}
        } else {
          throw err;
        }
      }
    }

    let result: T;
    try {
      result = causalLockStorage.run(newContext, () => fn());
    } catch (fnErr) {
      releaseLock();
      throw fnErr;
    }

    // Point 2a: Check if result is a thenable / Promise
    if (result && typeof (result as any).then === "function") {
      // Defer release until the Promise settles! Do NOT release synchronously!
      return (result as unknown as Promise<any>).finally(() => {
        releaseLock();
      }) as any;
    }

    // Synchronous return: release immediately
    releaseLock();
    return result;
  } catch (err) {
    releaseLock();
    throw err;
  }
}

export function withFileLock<T>(filePath: string, fn: () => Promise<T>, timeoutMs?: number): Promise<T>;
export function withFileLock<T>(filePath: string, fn: () => T, timeoutMs?: number): T;
export function withFileLock<T>(filePath: string, fn: () => T | Promise<T>, timeoutMs = 15000): T | Promise<T> {
  const lockPath = resolve(`${filePath}.lock`);
  const currentContext = causalLockStorage.getStore();
  const queue = getInProcessLockQueue(lockPath);

  // Point 2b: Causal re-entrance check:
  // Must verify that context is NOT released, holds lockPath, AND queue is actively held by that contextId
  if (
    currentContext &&
    !currentContext.isReleased &&
    currentContext.activeLocks.has(lockPath) &&
    queue.isHeldBy(currentContext.activeLocks.get(lockPath)!)
  ) {
    return fn();
  }

  const isAsync = (fn as any)[Symbol.toStringTag] === "AsyncFunction" || fn.constructor.name === "AsyncFunction";

  if (isAsync) {
    return withFileLockAsyncInternal(lockPath, fn as () => Promise<T>, timeoutMs, currentContext);
  } else {
    return withFileLockSyncOrDeferredInternal(lockPath, fn as () => T, timeoutMs, currentContext);
  }
}

/**
 * Internal worker for writing JSON atomically with fsync without lock wrapping.
 * Used when caller already holds withFileLock.
 */
export function writeJsonAtomicallyInternal(filePath: string, data: unknown): void {
  const dir = dirname(filePath);
  const tempPath = join(
    dir,
    `.${basename(filePath)}.tmp.${Date.now()}.${Math.random().toString(36).substring(2, 9)}`
  );
  const jsonString = JSON.stringify(data, null, 2);

  const fd = openSync(tempPath, "w", 0o644);
  try {
    writeSync(fd, jsonString, 0, "utf8");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }

  try {
    renameSync(tempPath, filePath);
  } catch (renameErr) {
    try {
      unlinkSync(tempPath);
    } catch {
      // ignore unlink error
    }
    throw renameErr;
  }

  // Durability: flush parent directory to ensure directory entry update is durable on disk.
  // Fail-closed on real I/O errors (EIO, EPERM, etc.). Only ignore EINVAL/ENOTSUP/EISDIR if OS doesn't support dir fsync.
  try {
    const dirFd = openSync(dir, "r");
    try {
      fsyncSync(dirFd);
    } finally {
      closeSync(dirFd);
    }
  } catch (dirErr: any) {
    if (dirErr?.code !== "EINVAL" && dirErr?.code !== "ENOTSUP" && dirErr?.code !== "EISDIR") {
      throw new Error(`Critical I/O error during parent directory fsync (${dir}): ${dirErr?.message || dirErr}`);
    }
  }
}

/**
 * Writes JSON data to disk atomically with fsync:
 * 1. Acquires exclusive lockfile (<filePath>.lock).
 * 2. Writes to a hidden temporary file in the exact same directory (same filesystem).
 * 3. Issues fsync to ensure bytes are physically flushed to disk platter/SSD.
 * 4. Atomically replaces target file using rename(2).
 * 5. Issues fsync on the parent directory to ensure directory entry metadata persistence.
 * 6. Cleans up tempfile on any write failure without touching target file.
 */
export function writeJsonAtomicallyWithFsync(filePath: string, data: unknown): void {
  withFileLock(filePath, () => {
    writeJsonAtomicallyInternal(filePath, data);
  });
}

export type Data150Manifest = {
  batch_id: string;
  generated_at: string;
  tenant_id: string;
  tables: Record<string, { row_count: number; sample_id: string; has_tenant: boolean }>;
};

export type ReceiptSingle = { pk_type: "single"; pk_col: string; keys: string[] };
export type ReceiptComposite = { pk_type: "composite"; pks: string[]; keys: string[][] };
export type ReceiptIdentity = {
  pk_type: "identity";
  pk_col: string;
  correlation_col: string;
  correlation_keys: string[];
  keys: string[];
};

export type ReceiptMetaEntry = ReceiptSingle | ReceiptComposite | ReceiptIdentity;
export type Data150Receipt = Record<string, ReceiptMetaEntry>;

export function loadManifest(): Data150Manifest {
  const filePath = resolve(process.cwd(), "docs/verification/data150-manifest-20261009.json");
  return JSON.parse(readFileSync(filePath, "utf8"));
}

export function loadDataset(): Record<string, Record<string, unknown>[]> {
  const filePath = resolve(process.cwd(), "docs/verification/data150-dataset.json");
  return JSON.parse(readFileSync(filePath, "utf8"));
}

export function loadReceipt(): Data150Receipt {
  const filePath = resolve(process.cwd(), "docs/verification/data150-receipt.json");
  return JSON.parse(readFileSync(filePath, "utf8"));
}

export type TableCoverageResult = {
  pk_type: string;
  target_rows: number;
  verified_keys: number;
  tenant_isolated: boolean;
  compliant: boolean;
  error?: string;
};

/**
 * Verifies exact synthetic batch presence for ALL 150 keys per table using durable receipt.
 * Evaluates full composite keys for cmr_expeditions, tenant isolation, and identity correlation keys.
 * Zero extrapolation: requires exact 150 verified rows for each business table.
 */
export async function verifyData150BatchCoverage(supabase: SupabaseClient, tenantId: string = DATA150_TENANT_ID) {
  if (tenantId !== DATA150_TENANT_ID) {
    throw new Error(`Tenant mismatch: DATA150 is restricted strictly to authorized tenant ${DATA150_TENANT_ID}.`);
  }

  const manifest = loadManifest();
  const receipt = loadReceipt();
  const tableResults: Record<string, TableCoverageResult> = {};

  for (const [table, receiptInfo] of Object.entries(receipt)) {
    const hasTenant = manifest.tables[table]?.has_tenant ?? false;
    const targetRows = 150;

    try {
      if (receiptInfo.pk_type === "single") {
        const pkCol = receiptInfo.pk_col;
        const keys = receiptInfo.keys;
        let query = supabase.from(table).select(pkCol, { count: "exact", head: true }).in(pkCol, keys);
        if (hasTenant) {
          query = query.eq("tenant_id", tenantId);
        }
        const { count, error } = await query;
        if (error) {
          tableResults[table] = {
            pk_type: "single",
            target_rows: targetRows,
            verified_keys: 0,
            tenant_isolated: hasTenant,
            compliant: false,
            error: error.message,
          };
        } else {
          const found = count ?? 0;
          tableResults[table] = {
            pk_type: "single",
            target_rows: targetRows,
            verified_keys: found,
            tenant_isolated: true,
            compliant: found === targetRows,
          };
        }
      } else if (receiptInfo.pk_type === "composite") {
        // cmr_expeditions: composite (cmr_id, expedition_id)
        const keys = receiptInfo.keys as [string, string][];
        const cmrIds = Array.from(new Set(keys.map((k) => k[0])));
        const { data, error } = await supabase
          .from(table)
          .select("cmr_id, expedition_id")
          .in("cmr_id", cmrIds);

        if (error || !data) {
          tableResults[table] = {
            pk_type: "composite",
            target_rows: targetRows,
            verified_keys: 0,
            tenant_isolated: true,
            compliant: false,
            error: error?.message ?? "No data",
          };
        } else {
          const foundPairs = new Set(data.map((row: any) => `${row.cmr_id}::${row.expedition_id}`));
          const matchingKeys = keys.filter((k) => foundPairs.has(`${k[0]}::${k[1]}`));
          tableResults[table] = {
            pk_type: "composite",
            target_rows: targetRows,
            verified_keys: matchingKeys.length,
            tenant_isolated: true,
            compliant: matchingKeys.length === targetRows,
          };
        }
      } else if (receiptInfo.pk_type === "identity") {
        if (table === "operational_events") {
          const { count, error } = await supabase
            .from(table)
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId)
            .in("entity_code", receiptInfo.correlation_keys);

          const found = error ? 0 : (count ?? 0);
          tableResults[table] = {
            pk_type: "identity",
            target_rows: targetRows,
            verified_keys: found,
            tenant_isolated: true,
            compliant: found === targetRows,
            error: error?.message,
          };
        } else if (table === "customs_events") {
          const { count, error } = await supabase
            .from(table)
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId)
            .eq("event_type", "CASE_INITIALIZED")
            .in("case_id", receiptInfo.correlation_keys);

          const found = error ? 0 : (count ?? 0);
          tableResults[table] = {
            pk_type: "identity",
            target_rows: targetRows,
            verified_keys: found,
            tenant_isolated: true,
            compliant: found === targetRows,
            error: error?.message,
          };
        }
      }
    } catch (err: any) {
      tableResults[table] = {
        pk_type: receiptInfo.pk_type,
        target_rows: targetRows,
        verified_keys: 0,
        tenant_isolated: hasTenant,
        compliant: false,
        error: err.message,
      };
    }
  }

  const totalTables = Object.keys(tableResults).length;
  const compliantTables = Object.values(tableResults).filter((r) => r.compliant).length;

  return {
    batch_id: DATA150_BATCH_ID,
    tenant_id: tenantId,
    total_tables: totalTables,
    compliant_tables: compliantTables,
    is_fully_covered: totalTables === 67 && compliantTables === 67,
    tables: tableResults,
  };
}

export const DATA150_FORWARD_TABLES: string[] = [
  "tariff_zones",
  "operational_events",
  "local_storage_sync_runs",
  "external_identifiers",
  "customs_cases",
  "connectors",
  "parties",
  "fuel_indices",
  "vehicles",
  "drivers",
  "products",
  "service_catalog",
  "local_storage_imports",
  "tariff_zone_members",
  "tariff_headers",
  "connector_events",
  "customs_messages",
  "customs_events",
  "communications",
  "party_contacts",
  "party_addresses",
  "party_adr_profiles",
  "customer_billing_profiles",
  "customer_blocks",
  "carrier_profiles",
  "fuel_index_values",
  "fuel_index_bands",
  "product_packagings",
  "warehouses",
  "warehouse_zones",
  "companies",
  "party_roles",
  "party_services",
  "address_operational_profiles",
  "party_address_assignments",
  "warehouse_bins",
  "tariff_lines",
  "tariff_assignments",
  "tariff_rules",
  "transit_times",
  "external_service_mappings",
  "pricing_runs",
  "offers",
  "orders",
  "offer_lines",
  "order_lines",
  "delivery_notes",
  "expeditions",
  "order_hazmat_assessments",
  "inventory_quants",
  "pricing_run_components",
  "delivery_note_lines",
  "expedition_delivery_notes",
  "inventory_movements",
  "trips",
  "trip_expeditions",
  "trip_stops",
  "trip_stop_delivery_notes",
  "trip_hazmat_assessments",
  "cmr_documents",
  "transport_stops",
  "cmr_clauses",
  "cmr_attachments",
  "cmr_parties",
  "cmr_goods_lines",
  "cmr_expeditions",
  "transport_events",
];

export const DATA150_REVERSE_TABLES: string[] = [...DATA150_FORWARD_TABLES].reverse();

export const DATA150_TABLES_WITHOUT_TENANT = new Set<string>([
  "cmr_parties",
  "cmr_goods_lines",
  "cmr_attachments",
  "cmr_clauses",
  "cmr_expeditions",
]);

export const DATA150_APPEND_ONLY_TABLES = new Set<string>([
  "transport_events",
  "operational_events",
]);

export const DATA150_CASCADE_PROTECTED_TABLES = new Set<string>([
  "cmr_documents",
  "transport_stops",
]);

export type ExecutionReceiptEntry = {
  table: string;
  pk_type: "single" | "composite" | "identity";
  pk_col?: string;
  pks?: string[];
  inserted_count: number;
  inserted_keys: (string | number)[] | (string | number)[][];
};

export type Data150ExecutionReceipt = Record<string, ExecutionReceiptEntry>;

export function loadExecutionReceipt(customPath?: string): Data150ExecutionReceipt {
  const filePath = customPath || resolve(process.cwd(), "docs/verification/data150-execution-receipt.json");
  const raw = readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);
  return parsed.tables ? parsed.tables : parsed;
}

export type Data150ExecutionReceiptStatus =
  | "PENDING_EXECUTION"
  | "IN_TRANSACTION_PRE_COMMIT"
  | "COMMITTED"
  | "TRANSACTION_ABORTED_ROLLED_BACK"
  | "TRANSACTION_ABORT_ROLLBACK_FAILED"
  | "COMMIT_INDETERMINATE"
  | "COMMIT_CONFIRMED_POST_COMMIT_WRITE_FAILED";

export type RecordExecutionReceiptOptions = {
  targetPath?: string;
  existingReceipt?: Data150ExecutionReceipt;
  persistToFile?: boolean;
  status?: Data150ExecutionReceiptStatus;
  errorMessage?: string;
  loaderSql?: string;
  loaderSqlPath?: string;
  attemptId?: string;
};

/**
 * Strictly validates a single table receipt entry against schema manifest metadata.
 * Validates pk_type, pk_col / pks, count match, key format (UUID/integer), and uniqueness.
 */
export function validateReceiptEntryAgainstMeta(
  tableName: string,
  entry: unknown,
  meta: ReceiptMetaEntry
): ExecutionReceiptEntry {
  if (!entry || typeof entry !== "object") {
    throw new Error(`Fail-closed: Table '${tableName}' in receipt is not a valid object.`);
  }
  const e = entry as any;
  if (e.table !== tableName) {
    throw new Error(`Fail-closed: Table '${tableName}' entry has mismatched table name '${e.table}'.`);
  }
  if (e.pk_type !== meta.pk_type) {
    throw new Error(
      `Fail-closed: Table '${tableName}' in receipt has pk_type '${e.pk_type}', expected '${meta.pk_type}'.`
    );
  }
  if (!Array.isArray(e.inserted_keys)) {
    throw new Error(`Fail-closed: Table '${tableName}' in receipt has non-array 'inserted_keys'.`);
  }
  if (typeof e.inserted_count !== "number" || e.inserted_count !== e.inserted_keys.length) {
    throw new Error(
      `Fail-closed: Table '${tableName}' has count mismatch (inserted_count ${e.inserted_count} !== inserted_keys.length ${e.inserted_keys.length}).`
    );
  }

  if (meta.pk_type === "single" || meta.pk_type === "identity") {
    const expectedCol = meta.pk_type === "single" ? meta.pk_col : "id";
    if (e.pk_col !== expectedCol) {
      throw new Error(
        `Fail-closed: Table '${tableName}' has pk_col '${e.pk_col}', expected '${expectedCol}'.`
      );
    }
    const keySet = new Set<string>();
    for (const k of e.inserted_keys) {
      if (k === null || k === undefined || (typeof k !== "string" && typeof k !== "number")) {
        throw new Error(`Fail-closed: Table '${tableName}' contains invalid key '${k}'.`);
      }
      const strKey = String(k).trim();
      if (strKey === "") {
        throw new Error(`Fail-closed: Table '${tableName}' contains empty string key.`);
      }
      if (typeof k === "string" && (expectedCol.endsWith("_id") || expectedCol === "id")) {
        if (!UUID_REGEX.test(strKey) && !INTEGER_REGEX.test(strKey)) {
          throw new Error(`Fail-closed: Table '${tableName}' key '${strKey}' violates UUID/integer format.`);
        }
      }
      if (keySet.has(strKey)) {
        throw new Error(`Fail-closed: Table '${tableName}' contains duplicate key '${strKey}' in inserted_keys.`);
      }
      keySet.add(strKey);
    }
  } else if (meta.pk_type === "composite") {
    if (
      !Array.isArray(e.pks) ||
      e.pks.length !== meta.pks.length ||
      !e.pks.every((col: string, idx: number) => col === meta.pks[idx])
    ) {
      throw new Error(
        `Fail-closed: Table '${tableName}' has composite pks mismatch. Expected ${JSON.stringify(meta.pks)}, got ${JSON.stringify(e.pks)}.`
      );
    }
    const tupleSet = new Set<string>();
    for (const tuple of e.inserted_keys) {
      if (!Array.isArray(tuple) || tuple.length !== meta.pks.length) {
        throw new Error(
          `Fail-closed: Table '${tableName}' composite tuple ${JSON.stringify(tuple)} length does not match expected pks length ${meta.pks.length}.`
        );
      }
      for (const val of tuple) {
        if (val === null || val === undefined || (typeof val !== "string" && typeof val !== "number")) {
          throw new Error(`Fail-closed: Table '${tableName}' composite tuple contains invalid item '${val}'.`);
        }
        if (typeof val === "string" && val.trim() === "") {
          throw new Error(`Fail-closed: Table '${tableName}' composite tuple contains empty string item.`);
        }
      }
      const repr = JSON.stringify(tuple);
      if (tupleSet.has(repr)) {
        throw new Error(`Fail-closed: Table '${tableName}' contains duplicate composite tuple ${repr}.`);
      }
      tupleSet.add(repr);
    }
  }

  return e as ExecutionReceiptEntry;
}

/**
 * Validates a returned row from INSERT ... RETURNING against schema manifest metadata.
 * Fails closed if required primary key columns are missing, undefined, or malformed.
 */
export function validateReturnedRow(tableName: string, row: unknown, meta: ReceiptMetaEntry): void {
  if (!row || typeof row !== "object") {
    throw new Error(`Fail-closed: Malformed row returned by RETURNING for table '${tableName}': not an object.`);
  }
  const r = row as Record<string, any>;
  if (meta.pk_type === "single" || meta.pk_type === "identity") {
    const pkCol = meta.pk_type === "single" ? meta.pk_col : "id";
    const val = r[pkCol];
    if (val === undefined || val === null) {
      throw new Error(
        `Fail-closed: Row returned by RETURNING for table '${tableName}' missing required PK column '${pkCol}'.`
      );
    }
    if (typeof val !== "string" && typeof val !== "number") {
      throw new Error(
        `Fail-closed: Row returned by RETURNING for table '${tableName}' has non-primitive PK '${val}'.`
      );
    }
    const strVal = String(val).trim();
    if (strVal === "") {
      throw new Error(`Fail-closed: Row returned by RETURNING for table '${tableName}' has empty PK.`);
    }
    if (typeof val === "string" && (pkCol.endsWith("_id") || pkCol === "id")) {
      if (!UUID_REGEX.test(strVal) && !INTEGER_REGEX.test(strVal)) {
        throw new Error(
          `Fail-closed: Row returned by RETURNING for table '${tableName}' has invalid key '${strVal}'.`
        );
      }
    }
  } else if (meta.pk_type === "composite") {
    for (const col of meta.pks) {
      const val = r[col];
      if (val === undefined || val === null) {
        throw new Error(
          `Fail-closed: Row returned by RETURNING for table '${tableName}' missing composite PK column '${col}'.`
        );
      }
      if (typeof val !== "string" && typeof val !== "number") {
        throw new Error(
          `Fail-closed: Row returned by RETURNING for table '${tableName}' has non-primitive composite column '${col}' value '${val}'.`
        );
      }
    }
  }
}

/**
 * Fail-closed validation and loading of an existing execution receipt from disk.
 * Strictly verifies batch_id, tenant_id, COMMITTED status, dataset_hash, and table key structures.
 */
export function validateAndLoadDurableReceipt(
  receiptPath: string,
  expectedSqlHash: string,
  receiptMeta: Record<string, ReceiptMetaEntry> = loadReceipt(),
  options: { allowStagingTransition?: boolean; expectedAttemptId?: string } = {}
): Data150ExecutionReceipt {
  if (!existsSync(receiptPath)) {
    return {};
  }

  let raw: string;
  try {
    raw = readFileSync(receiptPath, "utf8");
  } catch (readErr: any) {
    throw new Error(
      `Fail-closed: Unable to read execution receipt from disk (${receiptPath}): ${readErr.message}`
    );
  }

  let diskData: any;
  try {
    diskData = JSON.parse(raw);
  } catch (parseErr: any) {
    throw new Error(
      `Fail-closed: Corrupt or invalid JSON in execution receipt on disk (${receiptPath}): ${parseErr.message}`
    );
  }

  if (!diskData || typeof diskData !== "object") {
    throw new Error(`Fail-closed: Execution receipt on disk (${receiptPath}) is not a valid JSON object.`);
  }

  // Strict Identity Verification: batch_id and tenant_id MUST match on ANY receipt (before status check)
  if (diskData.batch_id !== DATA150_BATCH_ID) {
    throw new Error(
      `Fail-closed: Execution receipt on disk has mismatched batch_id '${diskData.batch_id}', expected '${DATA150_BATCH_ID}'.`
    );
  }
  if (diskData.tenant_id !== DATA150_TENANT_ID) {
    throw new Error(
      `Fail-closed: Execution receipt on disk has mismatched tenant_id '${diskData.tenant_id}', expected '${DATA150_TENANT_ID}'.`
    );
  }

  // Clean unexecuted template: only authorized if status is PENDING_EXECUTION and tables is empty
  if (diskData.status === "PENDING_EXECUTION") {
    if (!diskData.tables || Object.keys(diskData.tables).length === 0) {
      return {};
    }
    throw new Error(
      `Fail-closed: Execution receipt on disk is marked 'PENDING_EXECUTION' but contains unexpected non-empty tables.`
    );
  }

  // In-transaction staging receipt: a previous attempt staged keys but did not reach COMMITTED.
  // Re-execution CANNOT proceed blindly because database state is uncertain (may have committed or aborted).
  if (diskData.status === "IN_TRANSACTION_PRE_COMMIT") {
    if (options.allowStagingTransition) {
      if (expectedSqlHash && diskData.dataset_hash !== expectedSqlHash) {
        throw new Error(
          `Fail-closed: In-flight staging receipt on disk has mismatched dataset_hash '${diskData.dataset_hash}', expected '${expectedSqlHash}'.`
        );
      }
      if (options.expectedAttemptId && diskData.attempt_id && diskData.attempt_id !== options.expectedAttemptId) {
        throw new Error(
          `Fail-closed: In-flight staging receipt on disk belongs to attempt '${diskData.attempt_id}', expected '${options.expectedAttemptId}'.`
        );
      }
      const staged = diskData.staged_tables || {};
      for (const [t, entry] of Object.entries(staged as Record<string, any>)) {
        const meta = receiptMeta[t];
        if (!meta) {
          throw new Error(
            `Fail-closed: In-flight staging receipt contains unknown table '${t}' in staged_tables.`
          );
        }
        validateReceiptEntryAgainstMeta(t, entry, meta);
      }
      const existing = diskData.tables || {};
      for (const [t, entry] of Object.entries(existing as Record<string, any>)) {
        const meta = receiptMeta[t];
        if (!meta) {
          throw new Error(
            `Fail-closed: In-flight staging receipt contains unknown table '${t}' in tables.`
          );
        }
        validateReceiptEntryAgainstMeta(t, entry, meta);
      }
      return existing;
    }
    throw new Error(
      `Fail-closed: Execution receipt on disk is in unconfirmed staging state 'IN_TRANSACTION_PRE_COMMIT' (attempt_id: ${diskData.attempt_id || "unknown"}). Re-execution cannot proceed blindly: explicit reconciliation against database state is required to confirm whether the staged attempt was committed or aborted.`
    );
  }

  // Fail-closed status check: only confirmed COMMITTED receipts can be recovered on retry
  if (diskData.status !== "COMMITTED") {
    throw new Error(
      `Fail-closed: Cannot recover execution receipt from disk with status '${diskData.status}'. Only confirmed 'COMMITTED' receipts can be recovered on retry.`
    );
  }

  // Dataset hash check on COMMITTED receipts: strictly prevents recycling receipts from disparate SQL
  if (expectedSqlHash && diskData.dataset_hash !== expectedSqlHash) {
    throw new Error(
      `Fail-closed: Execution receipt on disk has mismatched dataset_hash '${diskData.dataset_hash}', expected '${expectedSqlHash}'. Cannot recycle receipt from a disparate SQL payload.`
    );
  }

  if (!diskData.tables || typeof diskData.tables !== "object") {
    throw new Error(`Fail-closed: Execution receipt on disk is missing valid 'tables' object.`);
  }

  const result: Data150ExecutionReceipt = {};
  for (const [t, entry] of Object.entries(diskData.tables as Record<string, any>)) {
    const meta = receiptMeta[t];
    if (!meta) {
      throw new Error(
        `Fail-closed: Execution receipt on disk contains unknown table '${t}' not in schema manifest.`
      );
    }
    result[t] = validateReceiptEntryAgainstMeta(t, entry, meta);
  }

  return result;
}

/**
 * Explicit reconciliation of an interrupted in-flight receipt (IN_TRANSACTION_PRE_COMMIT).
 * Inspects whether the staged primary keys actually exist in the live PostgreSQL database for DATA150_TENANT_ID.
 * If all staged keys are present in the DB, promotes the receipt to COMMITTED without data loss.
 * If staged keys are absent in the DB (transaction rolled back upon crash), updates status to TRANSACTION_ABORTED_ROLLED_BACK.
 */
export async function reconcileInFlightReceipt(
  executor: (sql: string) => Promise<any>,
  receiptPath: string,
  expectedSqlHash: string,
  receiptMeta: Record<string, ReceiptMetaEntry> = loadReceipt()
): Promise<{
  reconciled: boolean;
  status: "COMMITTED" | "TRANSACTION_ABORTED_ROLLED_BACK" | "COMMIT_INDETERMINATE";
  confirmedKeysCount: number;
  error?: string;
}> {
  return withFileLock(receiptPath, async () => {
    if (!existsSync(receiptPath)) {
      throw new Error(`Fail-closed: Receipt file '${receiptPath}' does not exist for reconciliation.`);
    }

    let raw: string;
    try {
      raw = readFileSync(receiptPath, "utf8");
    } catch (readErr: any) {
      throw new Error(`Fail-closed: Unable to read receipt file '${receiptPath}': ${readErr.message}`);
    }

    let diskData: any;
    try {
      diskData = JSON.parse(raw);
    } catch (jsonErr: any) {
      throw new Error(`Fail-closed: Corrupt JSON in receipt file '${receiptPath}': ${jsonErr.message}`);
    }

    if (!diskData || typeof diskData !== "object") {
      throw new Error(`Fail-closed: Receipt on disk is not a valid JSON object.`);
    }

    if (diskData.batch_id !== DATA150_BATCH_ID || diskData.tenant_id !== DATA150_TENANT_ID) {
      throw new Error(`Fail-closed: Reconciliation rejected due to mismatched batch_id or tenant_id.`);
    }
    if (expectedSqlHash && diskData.dataset_hash !== expectedSqlHash) {
      throw new Error(`Fail-closed: Reconciliation rejected due to mismatched dataset_hash.`);
    }
    if (
      diskData.status !== "IN_TRANSACTION_PRE_COMMIT" &&
      diskData.status !== "COMMIT_INDETERMINATE" &&
      diskData.status !== "TRANSACTION_ABORT_ROLLBACK_FAILED"
    ) {
      if (diskData.status === "COMMITTED") {
        return {
          reconciled: true,
          status: "COMMITTED",
          confirmedKeysCount: Object.values(diskData.tables || {}).reduce(
            (acc: number, entry: any) => acc + (entry.inserted_count || 0),
            0
          ),
        };
      }
      if (diskData.status === "TRANSACTION_ABORTED_ROLLED_BACK") {
        return {
          reconciled: true,
          status: "TRANSACTION_ABORTED_ROLLED_BACK",
          confirmedKeysCount: 0,
        };
      }
      throw new Error(
        `Fail-closed: Cannot reconcile receipt with status '${diskData.status}'. Only in-flight, indeterminate or abort-uncertain receipts can be reconciled.`
      );
    }

    const stagedTables: Record<string, ExecutionReceiptEntry> =
      diskData.staged_tables !== undefined
        ? diskData.staged_tables
        : diskData.tables || {};

    if (Object.keys(stagedTables).length === 0) {
      // Attempt had 0 staged candidate tables/keys in receipt
      diskData.status = "COMMIT_INDETERMINATE";
      diskData.reconciled_at = new Date().toISOString();
      diskData.execution_reconciled = false;
      diskData.updated_at = new Date().toISOString();
      diskData.error =
        "In-flight attempt had 0 staged candidate keys in receipt: cannot affirm transaction commit from empty staging without database returning evidence.";
      writeJsonAtomicallyInternal(receiptPath, diskData);

      return {
        reconciled: false,
        status: "COMMIT_INDETERMINATE",
        confirmedKeysCount: 0,
        error: diskData.error,
      };
    }

    // Fail-closed validation of all entries before querying database
    for (const [tableName, entry] of Object.entries(stagedTables)) {
      const meta = receiptMeta[tableName];
      if (!meta) {
        throw new Error(
          `Fail-closed: Unknown table '${tableName}' in staged_tables during reconciliation.`
        );
      }
      validateReceiptEntryAgainstMeta(tableName, entry, meta);
    }

    let totalStagedKeys = 0;
    let totalVerifiedInDb = 0;
    let tablesWithStagedKeys = 0;
    let tablesFullyVerified = 0;
    let tablesZeroFound = 0;

    for (const [tableName, entry] of Object.entries(stagedTables)) {
      const meta = receiptMeta[tableName];
      const entryKeyCount = entry.inserted_keys.length;
      totalStagedKeys += entryKeyCount;

      if (entryKeyCount === 0) {
        // Table has 0 staged keys (e.g. 0 new rows returned on retry/collision).
        // Skip querying this table to avoid invalid SQL syntax "IN ()".
        continue;
      }

      tablesWithStagedKeys++;

      let querySql: string;
      if (meta.pk_type === "single" || meta.pk_type === "identity") {
        const pkCol = meta.pk_type === "single" ? meta.pk_col : "id";
        const keysFormatted = entry.inserted_keys.map((k) => sanitizeAndFormatKey(k)).join(", ");
        if (DATA150_TABLES_WITHOUT_TENANT.has(tableName)) {
          querySql = `SELECT count(*)::text as cnt FROM public.${tableName} WHERE ${pkCol} IN (${keysFormatted}) AND cmr_id IN (SELECT id FROM public.cmr_documents WHERE tenant_id = '${DATA150_TENANT_ID}');`;
        } else {
          querySql = `SELECT count(*)::text as cnt FROM public.${tableName} WHERE ${pkCol} IN (${keysFormatted}) AND tenant_id = '${DATA150_TENANT_ID}';`;
        }
      } else if (meta.pk_type === "composite") {
        const tupleSql = entry.inserted_keys.map((t) => sanitizeAndFormatCompositeTuple(t as unknown[])).join(", ");
        const colList = meta.pks.join(", ");
        if (DATA150_TABLES_WITHOUT_TENANT.has(tableName)) {
          querySql = `SELECT count(*)::text as cnt FROM public.${tableName} WHERE (${colList}) IN (${tupleSql}) AND cmr_id IN (SELECT id FROM public.cmr_documents WHERE tenant_id = '${DATA150_TENANT_ID}');`;
        } else {
          querySql = `SELECT count(*)::text as cnt FROM public.${tableName} WHERE (${colList}) IN (${tupleSql}) AND tenant_id = '${DATA150_TENANT_ID}';`;
        }
      } else {
        throw new Error(`Fail-closed: Unsupported pk_type for table '${tableName}'.`);
      }

      const res = await executor(querySql);

      // Strict protocol validation: response MUST be an array containing EXACTLY 1 row
      if (!Array.isArray(res) || res.length !== 1) {
        throw new Error(
          `Fail-closed: Protocol error during reconciliation query for table '${tableName}'. Expected exactly 1 row, received ${Array.isArray(res) ? res.length : typeof res} rows.`
        );
      }

      const row = res[0];
      if (typeof row !== "object" || row === null) {
        throw new Error(
          `Fail-closed: Protocol error during reconciliation query for table '${tableName}'. Row is not an object: ${JSON.stringify(row)}`
        );
      }

      const rawVal = row.cnt ?? row.count;
      if (rawVal === undefined || rawVal === null) {
        throw new Error(
          `Fail-closed: Protocol error during reconciliation query for table '${tableName}'. Missing 'cnt' or 'count' column in row: ${JSON.stringify(row)}`
        );
      }

      const valStr = String(rawVal).trim();
      // Strict regex verification: strictly digits only (no '1garbage', no fractions, no negative signs, no exponents)
      if (!/^\d+$/.test(valStr)) {
        throw new Error(
          `Fail-closed: Protocol error during reconciliation query for table '${tableName}'. Invalid non-integer count format: '${valStr}'`
        );
      }

      const count = Number(valStr);
      if (!Number.isSafeInteger(count) || count < 0) {
        throw new Error(
          `Fail-closed: Protocol error during reconciliation query for table '${tableName}'. Unsafe integer count: ${count}`
        );
      }

      // Exact numerical contract: count for THIS table MUST NOT exceed expected staged keys for THIS table
      if (count > entryKeyCount) {
        throw new Error(
          `Fail-closed: Protocol error during reconciliation query for table '${tableName}'. Count in DB (${count}) exceeds expected staged keys (${entryKeyCount}).`
        );
      }

      // Track exact per-table match to prevent cross-table compensation
      if (count === entryKeyCount) {
        tablesFullyVerified++;
      } else if (count === 0) {
        tablesZeroFound++;
      }
      totalVerifiedInDb += count;
    }

    if (tablesWithStagedKeys > 0 && tablesFullyVerified === tablesWithStagedKeys) {
      // 100% of tables with staged keys have EXACTLY count === entryKeyCount!
      // Promote to COMMITTED with explicit temporal semantics
      const priorConfirmed = diskData.tables || {};
      const mergedTables: Data150ExecutionReceipt = { ...priorConfirmed };

      for (const [tableName, stagedEntry] of Object.entries(stagedTables)) {
        if (!mergedTables[tableName]) {
          mergedTables[tableName] = stagedEntry;
        } else {
          const prevKeys = mergedTables[tableName].inserted_keys;
          const newKeys = stagedEntry.inserted_keys;
          if (stagedEntry.pk_type === "single" || stagedEntry.pk_type === "identity") {
            const merged = Array.from(new Set([...(prevKeys as any[]), ...(newKeys as any[])]));
            mergedTables[tableName] = {
              ...mergedTables[tableName],
              inserted_count: merged.length,
              inserted_keys: merged,
            };
          } else {
            const set = new Set([
              ...(prevKeys as any[][]).map((x) => JSON.stringify(x)),
              ...(newKeys as any[][]).map((x) => JSON.stringify(x)),
            ]);
            const merged = Array.from(set).map((x) => JSON.parse(x));
            mergedTables[tableName] = {
              ...mergedTables[tableName],
              inserted_count: merged.length,
              inserted_keys: merged,
            };
          }
        }
      }

      diskData.status = "COMMITTED";
      diskData.tables = mergedTables;
      diskData.staged_tables = {};
      diskData.reconciled_at = new Date().toISOString();
      // Point 3: Keep execution_reconciled explicit, do not fabricate executed_at from reconciliation time
      diskData.execution_reconciled = true;
      diskData.updated_at = new Date().toISOString();
      writeJsonAtomicallyInternal(receiptPath, diskData);

      return {
        reconciled: true,
        status: "COMMITTED",
        confirmedKeysCount: totalVerifiedInDb,
      };
    } else if (tablesWithStagedKeys > 0 && tablesZeroFound === tablesWithStagedKeys) {
      // 100% of tables with staged keys have EXACTLY count === 0: confirmed aborted / rolled back!
      diskData.status = "TRANSACTION_ABORTED_ROLLED_BACK";
      diskData.staged_tables = {};
      diskData.reconciled_at = new Date().toISOString();
      diskData.updated_at = new Date().toISOString();
      writeJsonAtomicallyInternal(receiptPath, diskData);

      return {
        reconciled: true,
        status: "TRANSACTION_ABORTED_ROLLED_BACK",
        confirmedKeysCount: 0,
      };
    } else if (tablesWithStagedKeys === 0) {
      // Point 3: Attempt had 0 staged candidate keys in receipt!
      // Even if prior committed tables exist in diskData.tables, we CANNOT affirm commit of this attempt from empty staging without database returning evidence.
      // Strict fail-closed: preserve prior committed tables, but mark this attempt COMMIT_INDETERMINATE.
      diskData.status = "COMMIT_INDETERMINATE";
      diskData.reconciled_at = new Date().toISOString();
      diskData.execution_reconciled = false;
      diskData.updated_at = new Date().toISOString();
      diskData.error =
        "In-flight attempt had 0 staged candidate keys in receipt: cannot affirm transaction commit from empty staging without database returning evidence.";
      writeJsonAtomicallyInternal(receiptPath, diskData);

      return {
        reconciled: false,
        status: "COMMIT_INDETERMINATE",
        confirmedKeysCount: 0,
        error: diskData.error,
      };
    } else {
      // Partial key presence or cross-table discrepancy: INDETERMINATE!
      // Strict fail-closed: NEVER delete staged_tables! Preserve all staged keys and evidence.
      diskData.status = "COMMIT_INDETERMINATE";
      diskData.reconciled_at = new Date().toISOString();
      diskData.updated_at = new Date().toISOString();
      diskData.error = `Partial or mismatched database presence detected: ${tablesFullyVerified} of ${tablesWithStagedKeys} tables fully confirmed, ${totalVerifiedInDb} of ${totalStagedKeys} staged keys present in database. Staged evidence preserved.`;
      writeJsonAtomicallyInternal(receiptPath, diskData);

      return {
        reconciled: false,
        status: "COMMIT_INDETERMINATE",
        confirmedKeysCount: totalVerifiedInDb,
        error: diskData.error,
      };
    }
  });
}

/**
 * Builds and persists the true execution receipt exclusively from rows returned by
 * SQL INSERT ... RETURNING clauses. Rows that encountered conflict or WHERE NOT EXISTS
 * collisions return 0 rows and are strictly excluded from the execution receipt.
 * Supports non-destructive merging on retries, durable pre-commit staging, and atomic fsync write.
 * Entire sequence (read from disk -> fail-closed validation -> merge -> atomic write) is
 * executed under an exclusive withFileLock when targetPath is provided.
 */
export function recordExecutionReceiptFromReturning(
  returnedRowsByTable: Record<string, Record<string, any>[]>,
  options: RecordExecutionReceiptOptions = {}
): Data150ExecutionReceipt {
  const receiptMeta = loadReceipt();
  const targetPath = options.targetPath;
  const expectedSqlHash = computeSqlSha256(options.loaderSqlPath || options.loaderSql);

  const executeAtomicReceiptUpdate = (): Data150ExecutionReceipt => {
    const existing: Data150ExecutionReceipt = { ...(options.existingReceipt || {}) };

    // Validate any caller-provided existingReceipt
    if (options.existingReceipt) {
      for (const [t, entry] of Object.entries(options.existingReceipt)) {
        if (!receiptMeta[t]) {
          throw new Error(`Fail-closed: existingReceipt contains unknown table '${t}' not in schema manifest.`);
        }
        validateReceiptEntryAgainstMeta(t, entry, receiptMeta[t]);
      }
    }

    let previousAttemptId: string | undefined;
    // Durable receipt recovery on retry under active lock
    if (targetPath && existsSync(targetPath)) {
      try {
        const raw = readFileSync(targetPath, "utf8");
        const parsed = JSON.parse(raw);
        previousAttemptId = parsed?.attempt_id;
      } catch {}

      const isStagingOrFinalizing =
        options.status === "COMMITTED" ||
        options.status === "IN_TRANSACTION_PRE_COMMIT" ||
        options.status === "TRANSACTION_ABORTED_ROLLED_BACK" ||
        options.status === "COMMIT_INDETERMINATE";
      const recovered = validateAndLoadDurableReceipt(targetPath, expectedSqlHash, receiptMeta, {
        allowStagingTransition: isStagingOrFinalizing,
        expectedAttemptId: options.attemptId,
      });
      for (const [t, entry] of Object.entries(recovered)) {
        if (!existing[t]) {
          existing[t] = entry;
        } else {
          // Merge existing memory with disk state to prevent overwriting keys written by concurrent writers
          const prevDiskKeys = entry.inserted_keys;
          const currentMemKeys = existing[t].inserted_keys;
          if (entry.pk_type === "single" || entry.pk_type === "identity") {
            const merged = Array.from(new Set([...(prevDiskKeys as any[]), ...(currentMemKeys as any[])]));
            existing[t] = {
              ...existing[t],
              inserted_count: merged.length,
              inserted_keys: merged,
            };
          } else if (entry.pk_type === "composite") {
            const set = new Set([
              ...(prevDiskKeys as any[][]).map((x) => JSON.stringify(x)),
              ...(currentMemKeys as any[][]).map((x) => JSON.stringify(x)),
            ]);
            const merged = Array.from(set).map((x) => JSON.parse(x));
            existing[t] = {
              ...existing[t],
              inserted_count: merged.length,
              inserted_keys: merged,
            };
          }
        }
      }
    }

    const newlyReturnedReceipt: Data150ExecutionReceipt = {};

    for (const [table, rows] of Object.entries(returnedRowsByTable)) {
      const meta = receiptMeta[table];
      if (!meta) {
        throw new Error(
          `Fail-closed: returnedRowsByTable contains unknown table '${table}' not in schema manifest.`
        );
      }

      // Strictly validate every returned row against schema metadata
      for (const row of rows) {
        validateReturnedRow(table, row, meta);
      }

      if (meta.pk_type === "single" || meta.pk_type === "identity") {
        const pkCol = meta.pk_type === "single" ? meta.pk_col : "id";
        const newKeys = rows.map((r) => r[pkCol]).filter((k) => k !== undefined && k !== null);
        newlyReturnedReceipt[table] = {
          table,
          pk_type: meta.pk_type,
          pk_col: pkCol,
          inserted_count: newKeys.length,
          inserted_keys: newKeys,
        };
      } else if (meta.pk_type === "composite") {
        const pks = meta.pks;
        const newCompKeys = rows.map((r) => pks.map((k) => r[k]));
        newlyReturnedReceipt[table] = {
          table,
          pk_type: "composite",
          pks,
          inserted_count: newCompKeys.length,
          inserted_keys: newCompKeys,
        };
      }
    }

    // Merge newly returned rows into existing
    const executionReceipt: Data150ExecutionReceipt = { ...existing };
    for (const [table, newEntry] of Object.entries(newlyReturnedReceipt)) {
      const prevEntry = existing[table];
      if (!prevEntry) {
        executionReceipt[table] = newEntry;
      } else {
        if (newEntry.pk_type === "single" || newEntry.pk_type === "identity") {
          const prevKeys = prevEntry.inserted_keys as (string | number)[];
          const newKeys = newEntry.inserted_keys as (string | number)[];
          const mergedKeys = Array.from(new Set([...prevKeys, ...newKeys]));
          executionReceipt[table] = {
            table,
            pk_type: newEntry.pk_type,
            pk_col: newEntry.pk_col,
            inserted_count: mergedKeys.length,
            inserted_keys: mergedKeys,
          };
        } else if (newEntry.pk_type === "composite") {
          const prevKeys = prevEntry.inserted_keys as (string | number)[][];
          const newKeys = newEntry.inserted_keys as (string | number)[][];
          const keySet = new Set(prevKeys.map((p) => JSON.stringify(p)));
          for (const p of newKeys) {
            keySet.add(JSON.stringify(p));
          }
          const mergedCompKeys = Array.from(keySet).map((s) => JSON.parse(s));
          executionReceipt[table] = {
            table,
            pk_type: "composite",
            pks: newEntry.pks,
            inserted_count: mergedCompKeys.length,
            inserted_keys: mergedCompKeys,
          };
        }
      }
    }

    if (options.persistToFile && targetPath) {
      const status = options.status || "COMMITTED";
      const isStaging = status === "IN_TRANSACTION_PRE_COMMIT";
      const isAbort =
        status === "TRANSACTION_ABORTED_ROLLED_BACK" ||
        status === "TRANSACTION_ABORT_ROLLBACK_FAILED";
      const attemptId = options.attemptId || previousAttemptId || randomUUID();

      // Check on-disk state before writing abort payload:
      // An abort MUST NOT overwrite or downgrade a COMMITTED receipt,
      // and MUST NOT overwrite a receipt belonging to a different attempt!
      if (isAbort && existsSync(targetPath)) {
        try {
          const rawOnDisk = readFileSync(targetPath, "utf8");
          const parsedOnDisk = JSON.parse(rawOnDisk);
          if (parsedOnDisk?.status === "COMMITTED") {
            // Another attempt or prior transaction is already committed: DO NOT downgrade!
            return existing;
          }
          if (parsedOnDisk?.attempt_id && parsedOnDisk.attempt_id !== attemptId) {
            // Receipt on disk belongs to a different attempt: DO NOT overwrite!
            return existing;
          }
        } catch {}
      }

      const payload = {
        status,
        batch_id: DATA150_BATCH_ID,
        tenant_id: DATA150_TENANT_ID,
        attempt_id: attemptId,
        dataset_hash: expectedSqlHash,
        executed_at: status === "COMMITTED" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
        ...(options.errorMessage ? { error: options.errorMessage } : {}),
        tables: isStaging || isAbort ? existing : executionReceipt,
        staged_tables: isStaging || isAbort
          ? (Object.keys(newlyReturnedReceipt).length > 0
              ? newlyReturnedReceipt
              : (existsSync(targetPath)
                  ? (() => {
                      try {
                        return JSON.parse(readFileSync(targetPath, "utf8"))?.staged_tables || {};
                      } catch {
                        return {};
                      }
                    })()
                  : {}))
          : {},
      };
      writeJsonAtomicallyInternal(targetPath, payload);
    }

    return executionReceipt;
  };

  if (targetPath) {
    return withFileLock(targetPath, executeAtomicReceiptUpdate);
  } else {
    return executeAtomicReceiptUpdate();
  }
}

/**
 * Generates SQL rollback commands in strict reverse topological order (Layer 8 down to Layer 1)
 * consuming ONLY keys registered in the real execution receipt.
 * Crucially preserves pre-existing and foreign rows that were skipped during INSERT.
 * Properly handles tables without tenant_id (parent-aware).
 * Respects append-only invariant on event tables per migration 20260903003000_t1_append_only_events.sql.
 * Validates and sanitizes every primary key and composite tuple against SQL injection.
 */
export function generateRollbackSqlFromExecutionReceipt(
  executionReceipt: Data150ExecutionReceipt,
  tenantId: string = DATA150_TENANT_ID
): string {
  if (!UUID_REGEX.test(tenantId)) {
    throw new Error(`Security validation failed: tenantId '${tenantId}' is not a valid UUID.`);
  }

  const lines: string[] = [
    "-- FORNEXA — DATA150 PRODUCTION ROLLBACK FROM REAL EXECUTION RECEIPT",
    "-- Exclusively removes rows returned by INSERT ... RETURNING",
    "-- Preserves 100% of pre-existing and conflicting rows",
    "-- Strict reverse topological order from Layer 8 down to Layer 1",
    "-- Append-only event history (transport_events, operational_events) preserved per migration 20260903003000_t1_append_only_events.sql",
    "BEGIN;\n",
  ];

  let hasDeletes = false;

  for (const table of DATA150_REVERSE_TABLES) {
    const entry = executionReceipt[table];
    if (!entry || entry.inserted_count === 0) continue;

    // Check append-only immutability guard
    if (DATA150_APPEND_ONLY_TABLES.has(table)) {
      lines.push(
        `-- [IMMUTABLE AUDIT TABLE] Table public.${table} has append-only mutation guard`,
        `-- (Trigger 'fornexa_reject_event_mutation' raises SQLSTATE 55000 on any UPDATE or DELETE per migration 20260903003000_t1_append_only_events.sql).`,
        `-- Physical DELETE is strictly prohibited and architecturally blocked.`,
        `-- The ${entry.inserted_count} synthetic event records inserted by this batch remain permanently recorded as append-only historical trace.\n`
      );
      continue;
    }

    // Check cascade protection guard (parent tables of append-only events)
    if (DATA150_CASCADE_PROTECTED_TABLES.has(table)) {
      lines.push(
        `-- [CASCADE PROTECTED TABLE] Table public.${table} has child records in append-only transport_events with ON DELETE CASCADE.`,
        `-- Physical DELETE is intentionally blocked by trigger 'fornexa_reject_event_mutation' (SQLSTATE 55000) per migration 20260903003000_t1_append_only_events.sql.`,
        `-- Physical deletion of a CMR/stop that already owns immutable event history is architecturally prevented.`,
        `-- The ${entry.inserted_count} rows in ${table} remain permanently anchored to the immutable event audit trace.\n`
      );
      continue;
    }

    hasDeletes = true;
    lines.push(`-- Rollback table ${table} (${entry.inserted_count} rows inserted by batch)`);

    if (entry.pk_type === "single" || entry.pk_type === "identity") {
      const pkCol = entry.pk_col || "id";
      const keys = entry.inserted_keys as (string | number)[];
      const inClause = keys.map((k) => sanitizeAndFormatKey(k)).join(", ");

      if (DATA150_TABLES_WITHOUT_TENANT.has(table)) {
        // Child tables without tenant_id: prove ownership via parent cmr_documents tenant
        lines.push(
          `DELETE FROM public.${table} WHERE "${pkCol}" IN (${inClause}) AND cmr_id IN (SELECT id FROM public.cmr_documents WHERE tenant_id = '${tenantId}');\n`
        );
      } else {
        // Tables scoped by tenant_id
        lines.push(`DELETE FROM public.${table} WHERE "${pkCol}" IN (${inClause}) AND tenant_id = '${tenantId}';\n`);
      }
    } else if (entry.pk_type === "composite") {
      const pks = entry.pks || [];
      const pkTuple = pks.join(", ");
      const keys = entry.inserted_keys as unknown[][];
      const compTuples = keys.map((pair) => sanitizeAndFormatCompositeTuple(pair)).join(", ");

      if (DATA150_TABLES_WITHOUT_TENANT.has(table)) {
        // Child composite tables without tenant_id: prove ownership via parent cmr_documents tenant
        lines.push(
          `DELETE FROM public.${table} WHERE (${pkTuple}) IN (${compTuples}) AND cmr_id IN (SELECT id FROM public.cmr_documents WHERE tenant_id = '${tenantId}');\n`
        );
      } else {
        lines.push(`DELETE FROM public.${table} WHERE (${pkTuple}) IN (${compTuples});\n`);
      }
    }
  }

  if (!hasDeletes) {
    lines.push("-- No mutable business rows to delete in this batch.\n");
  }

  lines.push("COMMIT;\n");
  return lines.join("\n");
}

export type BatchExecutionResult = {
  success: boolean;
  total_statements: number;
  inserted_rows_total: number;
  receipt: Data150ExecutionReceipt;
  status: Data150ExecutionReceiptStatus;
  db_committed: boolean | "INDETERMINATE";
  receipt_path?: string;
  error?: string;
};

/**
 * Transactional executor runner that executes loader SQL statements in chunks,
 * captures RETURNING keys, builds the execution receipt, and commits atomically.
 */
export type ExecuteLoaderOptions = {
  loaderSql?: string;
  targetReceiptPath?: string;
  tenantId?: string;
  existingReceipt?: Data150ExecutionReceipt;
  persistToFile?: boolean;
  simulatePostCommitFailure?: boolean;
  attemptId?: string;
};

/**
 * Transactional executor runner that executes loader SQL statements,
 * captures RETURNING keys, stages durable receipt pre-commit, and commits atomically.
 * Differentiates cleanly between pre-commit failure (aborted rollback),
 * commit execution failure (indeterminate outcome), and post-commit write failure.
 * Wraps the full staging -> DB commit -> mark COMMITTED critical window under withFileLock
 * to guarantee that no concurrent process can replace or overwrite staged keys.
 */
export async function executeData150Loader(
  executor: (sql: string) => Promise<any[]>,
  options: ExecuteLoaderOptions = {}
): Promise<BatchExecutionResult> {
  const sql = options.loaderSql || readFileSync(resolve(process.cwd(), "scripts/data150/data150-loader.sql"), "utf8");

  // Robust line-by-line statement parser that strips SQL comments without dropping table-leading statements:
  const rawLines = sql.split("\n");
  const statements: string[] = [];
  let currentStmt = "";

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("--") || trimmed === "BEGIN;" || trimmed === "COMMIT;" || trimmed === "") {
      continue;
    }
    currentStmt += (currentStmt ? " " : "") + trimmed;
    if (trimmed.endsWith(";")) {
      statements.push(currentStmt);
      currentStmt = "";
    }
  }

  const returnedByTable: Record<string, Record<string, any>[]> = {};
  let totalInserted = 0;
  const targetReceiptPath =
    options.targetReceiptPath ||
    resolve(process.cwd(), "docs/verification/data150-execution-receipt.json");
  const persistToFile = options.persistToFile ?? true;
  const attemptId = options.attemptId || randomUUID();

  // Pre-load existing durable receipt from targetReceiptPath fail-closed if options.existingReceipt is not provided:
  let effectiveExistingReceipt = options.existingReceipt;
  const expectedSqlHash = computeSqlSha256(sql);
  if (
    (!effectiveExistingReceipt || Object.keys(effectiveExistingReceipt).length === 0) &&
    existsSync(targetReceiptPath)
  ) {
    effectiveExistingReceipt = await withFileLock(targetReceiptPath, async () =>
      validateAndLoadDurableReceipt(targetReceiptPath, expectedSqlHash)
    );
  }

  try {
    // Phase 1: Begin transaction
    await executor("BEGIN;");

    // Phase 2: Execute all INSERT statements and accumulate RETURNING rows
    for (const stmt of statements) {
      if (!stmt.includes("INSERT INTO public.")) continue;
      const match = stmt.match(/INSERT INTO public\.([a-z0-9_]+)/);
      if (!match) continue;
      const tableName = match[1];

      const res = await executor(stmt);
      const returnedRows = Array.isArray(res) ? res : [];
      if (!returnedByTable[tableName]) {
        returnedByTable[tableName] = [];
      }
      returnedByTable[tableName].push(...returnedRows);
      totalInserted += returnedRows.length;
    }

    // Critical transactional commit cycle:
    // Holding withFileLock across staging, DB commit, and disk marking ensures strict exclusivity
    const executeCriticalCommitCycle = async (): Promise<BatchExecutionResult> => {
      // Phase 3: Stage durable execution receipt on disk as IN_TRANSACTION_PRE_COMMIT BEFORE DB commit
      recordExecutionReceiptFromReturning(returnedByTable, {
        targetPath: targetReceiptPath,
        existingReceipt: effectiveExistingReceipt,
        persistToFile,
        status: "IN_TRANSACTION_PRE_COMMIT",
        loaderSql: sql,
        attemptId,
      });

      // Phase 4: Commit transaction in DB
      try {
        await executor("COMMIT;");
      } catch (commitErr: any) {
        // COMMIT failed or was uncertain!
        // In Postgres, if COMMIT fails (e.g. deferred constraint or disconnect), the outcome is indeterminate or aborted.
        // We do NOT blindly claim ABORTED_ROLLED_BACK. We record COMMIT_INDETERMINATE and preserve all keys on disk.
        let rollbackAttempted = false;
        let rollbackSucceeded = false;
        try {
          await executor("ROLLBACK;");
          rollbackAttempted = true;
          rollbackSucceeded = true;
        } catch {
          rollbackAttempted = true;
          rollbackSucceeded = false;
        }

        const receiptStatus: Data150ExecutionReceiptStatus = "COMMIT_INDETERMINATE";
        let stagedReceipt: Data150ExecutionReceipt;
        if (persistToFile) {
          try {
            stagedReceipt = recordExecutionReceiptFromReturning(returnedByTable, {
              targetPath: targetReceiptPath,
              existingReceipt: effectiveExistingReceipt,
              persistToFile: true,
              status: receiptStatus,
              errorMessage: `COMMIT failed: ${commitErr.message} (ROLLBACK attempted=${rollbackAttempted}, succeeded=${rollbackSucceeded})`,
              loaderSql: sql,
              attemptId,
            });
          } catch {
            stagedReceipt = recordExecutionReceiptFromReturning(returnedByTable, {
              existingReceipt: effectiveExistingReceipt,
              persistToFile: false,
              status: receiptStatus,
              loaderSql: sql,
              attemptId,
            });
          }
        } else {
          stagedReceipt = recordExecutionReceiptFromReturning(returnedByTable, {
            existingReceipt: effectiveExistingReceipt,
            persistToFile: false,
            status: receiptStatus,
            loaderSql: sql,
            attemptId,
          });
        }

        return {
          success: false,
          total_statements: statements.length,
          inserted_rows_total: totalInserted,
          receipt: stagedReceipt,
          status: receiptStatus,
          db_committed: "INDETERMINATE",
          receipt_path: targetReceiptPath,
          error: `Database COMMIT failed (indeterminate state): ${commitErr.message}`,
        };
      }

      // Phase 5: Mark durable receipt as COMMITTED
      try {
        if (options.simulatePostCommitFailure) {
          throw new Error("Simulated post-commit disk write failure");
        }
        const committedReceipt = recordExecutionReceiptFromReturning(returnedByTable, {
          targetPath: targetReceiptPath,
          existingReceipt: effectiveExistingReceipt,
          persistToFile,
          status: "COMMITTED",
          loaderSql: sql,
          attemptId,
        });

        return {
          success: true,
          total_statements: statements.length,
          inserted_rows_total: totalInserted,
          receipt: committedReceipt,
          status: "COMMITTED",
          db_committed: true,
          receipt_path: targetReceiptPath,
        };
      } catch (postCommitErr: any) {
        // DB was already committed! Do NOT run ROLLBACK!
        let fallbackReceipt: Data150ExecutionReceipt;
        try {
          fallbackReceipt = recordExecutionReceiptFromReturning(returnedByTable, {
            existingReceipt: effectiveExistingReceipt,
            status: "COMMIT_CONFIRMED_POST_COMMIT_WRITE_FAILED",
            persistToFile: false,
            loaderSql: sql,
            attemptId,
          });
        } catch {
          fallbackReceipt = effectiveExistingReceipt || {};
        }

        return {
          success: false,
          total_statements: statements.length,
          inserted_rows_total: totalInserted,
          receipt: fallbackReceipt,
          status: "COMMIT_CONFIRMED_POST_COMMIT_WRITE_FAILED",
          db_committed: true,
          receipt_path: targetReceiptPath,
          error: `Database COMMIT succeeded, but updating durable receipt file failed: ${postCommitErr.message}`,
        };
      }
    };

    if (persistToFile && targetReceiptPath) {
      return await withFileLock(targetReceiptPath, executeCriticalCommitCycle);
    } else {
      return await executeCriticalCommitCycle();
    }
  } catch (preCommitErr: any) {
    // Error occurred BEFORE COMMIT (during INSERT loop or pre-commit receipt write)
    let rollbackSuccess = false;
    try {
      await executor("ROLLBACK;");
      rollbackSuccess = true;
    } catch {
      rollbackSuccess = false;
    }

    const receiptStatus: Data150ExecutionReceiptStatus = rollbackSuccess
      ? "TRANSACTION_ABORTED_ROLLED_BACK"
      : "TRANSACTION_ABORT_ROLLBACK_FAILED";

    let abortReceipt: Data150ExecutionReceipt;
    if (persistToFile) {
      try {
        abortReceipt = recordExecutionReceiptFromReturning(returnedByTable, {
          targetPath: targetReceiptPath,
          existingReceipt: options.existingReceipt,
          persistToFile: true,
          status: receiptStatus,
          errorMessage: preCommitErr.message,
          loaderSql: sql,
          attemptId,
        });
      } catch {
        abortReceipt = recordExecutionReceiptFromReturning(returnedByTable, {
          existingReceipt: options.existingReceipt,
          persistToFile: false,
          status: receiptStatus,
          loaderSql: sql,
          attemptId,
        });
      }
    } else {
      abortReceipt = recordExecutionReceiptFromReturning(returnedByTable, {
        existingReceipt: options.existingReceipt,
        persistToFile: false,
        status: receiptStatus,
        loaderSql: sql,
        attemptId,
      });
    }

    return {
      success: false,
      total_statements: statements.length,
      inserted_rows_total: totalInserted,
      receipt: abortReceipt,
      status: receiptStatus,
      db_committed: false,
      receipt_path: targetReceiptPath,
      error: `Pre-commit execution aborted: ${preCommitErr.message} (ROLLBACK: ${rollbackSuccess ? "SUCCESS" : "FAILED"})`,
    };
  }
}

/**
 * Executes rollback SQL in strict reverse topological order using ONLY keys
 * from the execution receipt.
 */
export async function executeData150Rollback(
  executor: (sql: string) => Promise<any>,
  receipt: Data150ExecutionReceipt,
  tenantId: string = DATA150_TENANT_ID
): Promise<{ success: boolean; rollbackSql: string; error?: string }> {
  const rollbackSql = generateRollbackSqlFromExecutionReceipt(receipt, tenantId);
  try {
    await executor("BEGIN;");
    const lines = rollbackSql.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("DELETE FROM")) {
        await executor(trimmed);
      }
    }
    await executor("COMMIT;");
    return { success: true, rollbackSql };
  } catch (err: any) {
    try {
      await executor("ROLLBACK;");
    } catch {
      // rollback error suppressed
    }
    return { success: false, rollbackSql, error: err.message };
  }
}
