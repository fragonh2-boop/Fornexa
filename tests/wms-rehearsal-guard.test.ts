import assert from "node:assert/strict";
import test from "node:test";
import { expectRpcError } from "../scripts/wms/rehearsal-guard.ts";

const cliente = { query: async () => ({}) } as never;

test("el guard acepta un rechazo con el código esperado", async () => {
  const code = await expectRpcError(cliente, "sp", "WMS_LOT_REQUIRED", async () => {
    throw new Error("WMS_LOT_REQUIRED");
  });
  assert.equal(code, "WMS_LOT_REQUIRED");
});

test("el guard RECHAZA una llamada que tuvo éxito", async () => {
  // Éste es el caso que la versión anterior daba por bueno: el throw interno lo capturaba
  // su propio catch y su mensaje contenía el código esperado.
  await assert.rejects(
    () => expectRpcError(cliente, "sp", "WMS_LOT_REQUIRED", async () => {}),
    /call succeeded/,
  );
});

test("el guard rechaza un error con otro código", async () => {
  await assert.rejects(
    () => expectRpcError(cliente, "sp", "WMS_LOT_REQUIRED", async () => { throw new Error("WMS_OTRA_COSA"); }),
    /Expected 'WMS_LOT_REQUIRED'/,
  );
});
