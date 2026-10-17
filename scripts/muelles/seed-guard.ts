/**
 * Guard de endpoint para los ejecutores de lotes contra producción.
 *
 * El lote se envía como una transacción con sentencias múltiples, así que necesita
 * el pooler en modo sesión (`:5432`). El pooler transaccional (`:6543`) reparte las
 * sentencias entre conexiones distintas y rompería la atomicidad sin dar error
 * visible: la transacción parecería correcta y el lote quedaría a medias.
 *
 * Se comprueba el valor del endpoint, no se confía en la configuración.
 */

const TRANSACTION_POOLER_PORT = "6543";
const SESSION_POOLER_PORT = "5432";

export type SeedEndpoint = { host: string; port: string };

export function assertSessionModeEndpoint(connectionString: string): SeedEndpoint {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("Endpoint inválido: la cadena de conexión no es una URL válida.");
  }

  const port = url.port || SESSION_POOLER_PORT;

  if (port === TRANSACTION_POOLER_PORT) {
    throw new Error(
      `Aborting: la conexión apunta al pooler transaccional (:${TRANSACTION_POOLER_PORT}). ` +
        `Este lote exige el pooler en modo sesión (:${SESSION_POOLER_PORT}) para que BEGIN/COMMIT cubra todas las sentencias.`,
    );
  }

  if (port !== SESSION_POOLER_PORT) {
    throw new Error(
      `Aborting: puerto ${port} no reconocido. Se exige el pooler en modo sesión (:${SESSION_POOLER_PORT}).`,
    );
  }

  return { host: url.hostname, port };
}
