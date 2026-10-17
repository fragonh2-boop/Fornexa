import assert from "node:assert/strict";

/**
 * Guard del ensayo: comprueba que una llamada que DEBE fallar falla de verdad.
 *
 * ── Por qué esto vive en un módulo aparte ──────────────────────────────────────────
 * Porque es lo único que separa «he probado 30 rechazos» de «he ejecutado 30 veces algo».
 * La versión anterior lanzaba el throw de «no falló» DENTRO del try, así que el catch lo
 * capturaba y su mensaje —`Expected X but call succeeded`— contenía el código esperado:
 * `assert.ok(msg.includes(expectedCode))` pasaba y una llamada exitosa se registraba como
 * rechazo validado. El recibo podía decir 30/30 sin haber probado ninguno.
 *
 * Se detecta el éxito FUERA del try y se exige que el error esperado aparezca en el mensaje.
 * Tiene su propio test (`tests/wms-rehearsal-guard.test.ts`) con el caso negativo.
 */
export async function expectRpcError(
  client: any,
  spName: string,
  expectedCode: string,
  fn: () => Promise<any>,
): Promise<string> {
  await client.query(`SAVEPOINT ${spName}`);

  // La detección de «no falló» se hace FUERA del try. Si el throw de éxito vive dentro,
  // el catch lo captura y su mensaje («Expected X but call succeeded») contiene el código
  // esperado, así que `msg.includes(expectedCode)` pasa y una llamada exitosa se registra
  // como rechazo validado. El ensayo no puede dar por bueno lo que no ha probado.
  let failure: unknown;
  let failed = false;
  try {
    await fn();
  } catch (caught) {
    failed = true;
    failure = caught;
  }

  await client.query(`ROLLBACK TO SAVEPOINT ${spName}`);
  await client.query(`RELEASE SAVEPOINT ${spName}`);

  assert.ok(failed, `Expected ${expectedCode} but call succeeded`);
  const msg = String((failure as { message?: string } | undefined)?.message ?? failure);
  assert.ok(
    msg.includes(expectedCode),
    `Expected '${expectedCode}', got '${msg}'`,
  );
  return expectedCode;
}
