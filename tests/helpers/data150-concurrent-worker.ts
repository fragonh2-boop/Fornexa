import { writeFileSync, existsSync } from "node:fs";
import { recordExecutionReceiptFromReturning, withFileLock } from "../../lib/data150-loader.ts";

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const role = process.argv[2]; // 'H' (Holder) or 'C' (Contender)
  const barrierPath = process.argv[3];
  const receiptPath = process.argv[4];
  const readyPath = process.argv[5];
  const contentionSignalPath = process.argv[6];

  const dummySql = "BEGIN;\nINSERT INTO public.tariff_zones (id) VALUES ('1') RETURNING id;\nCOMMIT;";

  // Signal ready
  writeFileSync(readyPath, `${process.pid}`);

  // Wait for parent barrier to coordinate start
  const startWait = Date.now();
  while (!existsSync(barrierPath)) {
    if (Date.now() - startWait > 10000) {
      throw new Error(`Worker ${role} timed out waiting for barrier`);
    }
    await sleep(20);
  }

  if (role === "H") {
    // Worker H: Holder - acquires lock, writes staging receipt, holds lock during simulated DB execution, commits & marks COMMITTED
    const payloadH: Record<string, Record<string, any>[]> = {
      tariff_zones: [{ id: "7c596a00-ee8a-5ed0-a529-c05c3a541ea3" }],
      parties: [{ id: "00000000-0000-4000-8000-000000000010" }],
    };

    await withFileLock(receiptPath, async () => {
      // Signal to contender that holder is actively inside the lock
      writeFileSync(contentionSignalPath, `HOLDING_${process.pid}`);

      // 1. Stage in-flight receipt pre-commit
      recordExecutionReceiptFromReturning(payloadH, {
        targetPath: receiptPath,
        persistToFile: true,
        status: "IN_TRANSACTION_PRE_COMMIT",
        loaderSql: dummySql,
        attemptId: "attempt-H",
      });

      // 2. Simulate database transaction execution while holding lock
      await sleep(350);

      // 3. Commit and mark COMMITTED
      recordExecutionReceiptFromReturning(payloadH, {
        targetPath: receiptPath,
        persistToFile: true,
        status: "COMMITTED",
        loaderSql: dummySql,
        attemptId: "attempt-H",
      });
    });

    console.log(JSON.stringify({ role: "H", pid: process.pid, success: true }));
    process.exit(0);
  } else if (role === "C") {
    // Worker C: Contender - waits until Holder signals lock is held, attempts acquisition observing contention, then executes disjoint batch
    const payloadC: Record<string, Record<string, any>[]> = {
      tariff_zones: [{ id: "7c596a00-ee8a-5ed0-a529-c05c3a541ea4" }],
      party_addresses: [{ id: "00000000-0000-4000-8000-000000000020" }],
    };

    // Wait until holder is actively holding the lock
    const startHoldingWait = Date.now();
    while (!existsSync(contentionSignalPath)) {
      if (Date.now() - startHoldingWait > 10000) {
        throw new Error("Contender timed out waiting for holder to acquire lock");
      }
      await sleep(15);
    }

    const startAcquire = Date.now();
    let contentionWaitMs = 0;

    await withFileLock(receiptPath, async () => {
      contentionWaitMs = Date.now() - startAcquire;

      // Stage and commit contender's disjoint payload
      recordExecutionReceiptFromReturning(payloadC, {
        targetPath: receiptPath,
        persistToFile: true,
        status: "IN_TRANSACTION_PRE_COMMIT",
        loaderSql: dummySql,
        attemptId: "attempt-C",
      });

      await sleep(50);

      recordExecutionReceiptFromReturning(payloadC, {
        targetPath: receiptPath,
        persistToFile: true,
        status: "COMMITTED",
        loaderSql: dummySql,
        attemptId: "attempt-C",
      });
    });

    console.log(JSON.stringify({ role: "C", pid: process.pid, contentionWaitMs, success: true }));
    process.exit(0);
  } else {
    throw new Error(`Unknown worker role: ${role}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
