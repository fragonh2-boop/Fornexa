import assert from "node:assert/strict";
import test from "node:test";
import { expectRpcError } from "../scripts/wms/rehearsal-guard.ts";

function createMockClient() {
  const queries: string[] = [];
  return {
    queries,
    client: {
      query: async (sql: string) => {
        queries.push(sql);
        return {};
      },
    } as never,
  };
}

test("el guard acepta un rechazo con el código esperado y registra savepoint/rollback", async () => {
  const { client, queries } = createMockClient();
  const code = await expectRpcError(client, "sp_test_1", "WMS_LOT_REQUIRED", async () => {
    throw new Error("WMS_LOT_REQUIRED");
  });
  assert.equal(code, "WMS_LOT_REQUIRED");
  assert.deepEqual(queries, [
    "SAVEPOINT sp_test_1",
    "ROLLBACK TO SAVEPOINT sp_test_1",
    "RELEASE SAVEPOINT sp_test_1",
  ]);
});

test("el guard RECHAZA una llamada que tuvo éxito y limpia el savepoint", async () => {
  // Éste es el caso que la versión anterior daba por bueno: el throw interno lo capturaba
  // su propio catch y su mensaje contenía el código esperado.
  const { client, queries } = createMockClient();
  await assert.rejects(
    () => expectRpcError(client, "sp_test_2", "WMS_LOT_REQUIRED", async () => {}),
    /call succeeded/,
  );
  assert.deepEqual(queries, [
    "SAVEPOINT sp_test_2",
    "ROLLBACK TO SAVEPOINT sp_test_2",
    "RELEASE SAVEPOINT sp_test_2",
  ]);
});

test("el guard rechaza un error con otro código completamente distinto", async () => {
  const { client } = createMockClient();
  await assert.rejects(
    () => expectRpcError(client, "sp_test_3", "WMS_LOT_REQUIRED", async () => { throw new Error("WMS_OTRA_COSA"); }),
    /Expected exact error code 'WMS_LOT_REQUIRED'/,
  );
});

test("el guard rechaza un error que contiene el código como subcadena o prefijo (igualdad estricta)", async () => {
  const { client } = createMockClient();
  await assert.rejects(
    () => expectRpcError(client, "sp_test_4", "WMS_LOT_REQUIRED", async () => { throw new Error("WMS_LOT_REQUIRED_EXTRA"); }),
    /Expected exact error code 'WMS_LOT_REQUIRED'/,
  );
});
