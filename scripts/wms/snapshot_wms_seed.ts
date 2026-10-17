/**
 * Extractor del snapshot de producción para el lote DATA150-WMS (fase 4). BORRADOR.
 *
 * ── Qué hace y qué NO hace ─────────────────────────────────────────────────────────
 * SOLO LEE. No escribe, no abre transacción y no toca nada: recoge los identificadores
 * reales que el generador necesita para no inventarse referencias, y los deja en un
 * fichero que después consume `generate_wms_seed.py`.
 *
 * ── Por qué existe ────────────────────────────────────────────────────────────────
 * El generador es determinista y está probado, pero necesita ids de verdad: un almacén, un
 * muelle para las descargas en curso, huecos donde ubicar, artículos, un propietario y los
 * 150 quants históricos de DATA150. Inventarlos violaría claves ajenas; leerlos a mano
 * invita a equivocarse. Esto lo hace reproducible y deja constancia de lo que se leyó.
 *
 * ── Regla ─────────────────────────────────────────────────────────────────────────
 * Si falta cualquier pieza, FALLA en voz alta. Un snapshot incompleto que se completa con
 * valores por defecto produce un lote que parece válido y no lo es.
 *
 * Uso:
 *   node --experimental-strip-types scripts/wms/snapshot_wms_seed.ts > snap.json
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { assertSessionModeEndpoint } from "../muelles/seed-guard.ts";

const require = createRequire(import.meta.url);

function loadPg(): { Client: new (config: unknown) => any } {
  try {
    return require("pg");
  } catch {
    const override = process.env.FORNEXA_PG_MODULE;
    if (override) return require(override);
    throw new Error("No se encontró 'pg': instala dependencias o define FORNEXA_PG_MODULE.");
  }
}

const { Client } = loadPg();

type Snapshot = {
  captured_at: string;
  tenant_id: string;
  warehouses: { id: string; code: string }[];
  paths: {
    unchecked_dock: string;
    bins: string[];
    products: string[];
    owner_party_id: string;
  };
  borrowed_ids: { inventory_quants: string[] };
};

function require_(rows: any[], what: string): any[] {
  if (!rows.length) {
    throw new Error(
      `snapshot incompleto: no hay ${what}. Sin eso el lote no se puede construir con referencias reales.`,
    );
  }
  return rows;
}

async function main(): Promise<void> {
  const connStr = process.env.FORNEXA_PRODUCTION_DB_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? "";
  if (!connStr) throw new Error("Falta FORNEXA_PRODUCTION_DB_URL (o POSTGRES_URL_NON_POOLING).");
  const endpoint = assertSessionModeEndpoint(connStr);
  const client = new Client({ connectionString: connStr, statement_timeout: 30000 });

  await client.connect();
  try {
    // Sólo lectura explícita: si alguna consulta intentara escribir, esto la abortaría.
    await client.query("set transaction read only");

    const tenants = require_(
      (await client.query(`select id from public.tenants order by created_at limit 2`)).rows,
      "tenants",
    );
    if (tenants.length !== 1) {
      // El ensayo de E1 construye su propio tenant B; si aquí hubiera más de uno, las
      // referencias dejarían de ser deterministas.
      throw new Error(`se esperaba exactamente 1 tenant y hay ${tenants.length}`);
    }
    const tenantId = tenants[0].id;

    const warehouses = require_(
      (await client.query(`select id, code from public.warehouses where tenant_id = $1 order by code`, [tenantId])).rows,
      "almacenes",
    );

    // Los muelles NO son huecos: viven en `warehouse_docks`, y `handling_units.current_dock_id`
    // apunta allí. Buscarlos como bins de tipo DOCK_STAGE devolvía cero en producción —el lote
    // se habría construido sin descargas en curso o, peor, con un bin cualquiera como muelle.
    const docks = require_(
      (
        await client.query(
          `select id from public.warehouse_docks
            where tenant_id = $1 and status = 'ACTIVE'
            order by code limit 1`,
          [tenantId],
        )
      ).rows,
      "muelles activos (warehouse_docks) para las descargas en curso",
    );

    const binsRes = await client.query(
      `select id from public.warehouse_bins
        where tenant_id = $1 and bin_type = 'PALLET_RACK' and not is_blocked
        order by bin_code limit 6`,
      [tenantId],
    );
    const bins = binsRes.rows;
    if (!bins.length) {
      // Diagnóstico en vez de un «no hay huecos» a secas: los tipos que SÍ existen permiten
      // decidir sin abrir otra conexión. Un fallo que no dice qué hay obliga a adivinar.
      const tipos = await client.query(
        `select bin_type, count(*)::int as n from public.warehouse_bins
          where tenant_id = $1 group by bin_type order by n desc`,
        [tenantId],
      );
      throw new Error(
        `snapshot incompleto: no hay huecos PALLET_RACK no bloqueados. Tipos disponibles: ${JSON.stringify(
          tipos.rows,
        )}`,
      );
    }

    const products = require_(
      (
        await client.query(
          `select id from public.products where tenant_id = $1 and status = 'ACTIVE' order by sku limit 4`,
          [tenantId],
        )
      ).rows,
      "artículos activos",
    );

    const parties = require_(
      (await client.query(`select id from public.parties where tenant_id = $1 order by code limit 1`, [tenantId])).rows,
      "propietarios (parties)",
    );

    const legacy = require_(
      (
        await client.query(
          `select id from public.inventory_quants
            where tenant_id = $1 and flow_state is null
            order by id limit 200`,
          [tenantId],
        )
      ).rows,
      "quants históricos de DATA150 con flow_state NULL",
    );
    if (legacy.length !== 150) {
      // Si no son 150, o la carga de DATA150 cambió o alguien tocó el stock. En ambos casos
      // el lote no debe construirse sobre una suposición.
      throw new Error(`se esperaban 150 quants históricos y hay ${legacy.length}`);
    }

    const snapshot: Snapshot = {
      captured_at: new Date().toISOString(),
      tenant_id: tenantId,
      warehouses: warehouses.map((w: any) => ({ id: w.id, code: w.code })),
      paths: {
        unchecked_dock: docks[0].id,
        bins: bins.map((b: any) => b.id),
        products: products.map((p: any) => p.id),
        owner_party_id: parties[0].id,
      },
      borrowed_ids: { inventory_quants: legacy.map((q: any) => q.id) },
    };

    const out = resolve(process.cwd(), "snap.json");
    writeFileSync(out, `${JSON.stringify(snapshot, null, 2)}\n`, "utf-8");
    console.log(
      JSON.stringify(
        {
          status: "SNAPSHOT_OK",
          endpoint,
          file: out,
          warehouses: snapshot.warehouses.length,
          bins: snapshot.paths.bins.length,
          products: snapshot.paths.products.length,
          borrowed_quants: snapshot.borrowed_ids.inventory_quants.length,
        },
        null,
        2,
      ),
    );
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error("ERROR:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
