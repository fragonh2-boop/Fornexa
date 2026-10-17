#!/usr/bin/env python3
"""
Generador del lote sintético DATA150-WMS (fase 4). BORRADOR, no ejecutado.

Produce de forma determinista los registros de los seis escenarios de Fran y el
manifiesto que el runner comparará. No se conecta a ninguna base de datos: lee una
foto de los identificadores prestados de DATA150 y escribe ficheros.

Diseño:

  entrada   snapshot.json  — ids prestados de DATA150 (warehouses, bins, products, trips)
  salida    wms-seed-dataset.json, wms-seed-manifest.json

Reglas que este script garantiza y que el test comprueba:

  1. Determinismo. Los ids se derivan de sha1(batch_id|tabla|índice) con formato UUIDv5,
     de modo que dos ejecuciones producen el mismo lote byte a byte y el rollback
     puede enumerar sin ambigüedad.
  2. Procedencia. Toda fila lleva marca en un campo propio: `WMS-TEST-` en códigos de
     HU y `LOT-WMS-` en lotes. Fue el residual de Muelles (600 de 2.031 sin marca).
  3. Dominios. Los estados salen del CHECK real de la migración 20261017110000, no de
     una lista escrita a mano aquí.
  4. No injerencia. Los ids prestados se copian tal cual y se registran aparte; el lote
     nunca los modifica y el runner comprueba su hash antes y después.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from typing import Any

BATCH_ID = "MUELLES-WMS-E1-20261017"  # se fija al abrir la fase, no antes

# Dominios copiados del CHECK de la migración real (20261017110000_wms_e1_core.sql).
FLOW_STATES = (
    "STAGING_UNCHECKED", "STAGING_CHECKED", "STORED", "RESERVED",
    "PICKED_STAGED", "LOADED", "QUARANTINE", "DAMAGED",
)
HU_STATES = (
    "STAGING_UNCHECKED", "STAGING_CHECKED", "STORED",
    "PICKED_STAGED", "LOADED", "QUARANTINE", "DAMAGED",
)
TASK_STATES = ("PROPOSED", "READY", "ASSIGNED", "IN_PROGRESS", "DONE", "REJECTED", "CANCELLED")
RESERVATION_STATES = ("HELD", "ALLOCATED", "PICKED", "RELEASED", "CANCELLED")

# Reparto de los 150 registros de escenario, con la entrega que los cubre (§8).
SCENARIOS: tuple[dict[str, Any], ...] = (
    {"id": 1, "name": "descargas_en_curso",        "count": 20, "delivery": "E1"},
    {"id": 2, "name": "playa_chequeada_y_sin",     "count": 30, "delivery": "E1"},
    {"id": 3, "name": "pallets_almacenados",       "count": 40, "delivery": "E1"},
    {"id": 4, "name": "reposiciones_pendientes",   "count": 20, "delivery": "E2"},
    {"id": 5, "name": "picking_y_pallet_completo", "count": 25, "delivery": "E1"},
    {"id": 6, "name": "expedicion_sin_etiqueta",   "count": 15, "delivery": "E1"},
)


def deterministic_uuid(*parts: object) -> str:
    """UUIDv5-like derivado de sha1: mismo lote -> mismos ids, sin azar."""
    digest = hashlib.sha1("|".join(str(p) for p in parts).encode("utf-8")).hexdigest()
    h = digest[:32]
    return f"{h[0:8]}-{h[8:12]}-5{h[13:16]}-{h[16:20]}-{h[20:32]}"


def hu_code(scenario: int, index: int) -> str:
    return f"WMS-TEST-S{scenario:02d}-{index:03d}"


def batch_marker(scenario: int, index: int) -> str:
    return f"LOT-WMS-S{scenario:02d}-{index:03d}"


@dataclass
class Seed:
    dataset: dict[str, list[dict[str, Any]]] = field(default_factory=dict)
    borrowed: dict[str, list[str]] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)
    scenario_rows: dict[int, int] = field(default_factory=dict)

    def add(self, table: str, row: dict[str, Any]) -> None:
        self.dataset.setdefault(table, []).append(row)


def plan(snapshot: dict[str, Any], deliveries: tuple[str, ...] = ("E1",)) -> Seed:
    """Construye las filas. No escribe ni conecta: devuelve la estructura."""
    seed = Seed()
    tenant = snapshot.get("tenant_id")
    browsers = snapshot.get("warehouses") or []
    if not tenant or not browsers:
        raise SystemExit("snapshot incompleto: hacen falta tenant_id y al menos un warehouse")
    if not snapshot.get("paths", {}).get("unchecked_dock"):
        raise SystemExit("snapshot incompleto: falta un muelle para las descargas en curso")
    if not snapshot.get("paths", {}).get("bins"):
        # Los escenarios 3, 4 y 5 generan pallets STORED y la migración impone
        # hu_stored_needs_bin: sin bins, el lote violaría el CHECK.
        raise SystemExit("snapshot incompleto: hacen falta bins para los pallets almacenados")

    # Se registran los ids prestados para que el runner compruebe su hash después.
    for key, values in (snapshot.get("borrowed_ids") or {}).items():
        seed.borrowed[key] = list(values)

    warehouse_id = browsers[0]["id"]
    dock_id = snapshot["paths"]["unchecked_dock"]

    # Política raíz del almacén con los 27 parámetros de WmsBehaviorPolicyParams.
    # Sin ella no hay política efectiva y rechazos como WMS_LOT_REQUIRED no se pueden provocar.
    seed.add("warehouse_behavior_policies", {
        "id": deterministic_uuid(BATCH_ID, "warehouse_behavior_policies", warehouse_id),
        "tenant_id": tenant, "warehouse_id": warehouse_id, "owner_party_id": None,
        "scope": "WAREHOUSE", "product_id": None, "category_code": None,
        "policy_version": 1, "superseded_at": None,
        "params": {
            "capture_lot_on_receipt": True, "capture_expiry_on_receipt": True,
            "require_qa_check": True, "allowed_bin_types": ["PALLET_RACK", "SHELVING", "BULK_FLOOR"],
            "putaway_strategy": "CONSOLIDATE", "allow_mixed_lots_in_bin": False,
            "allow_mixed_skus_in_bin": False, "max_pallets_per_bin": 4,
            "capture_lot_on_pick": True, "rotation": "FEFO",
            "min_remaining_shelf_life_days": 0, "forbid_picking_unlocated": True,
            "partial_pick_allowed": True, "replenishment_trigger": "MIN_MAX",
            "min_qty": 10, "max_qty": 100, "consolidation": "BY_BATCH",
            "top_off_threshold": 50, "require_label_scan_on_load": True,
            "weight_tolerance_pct": 5, "volume_tolerance_pct": 5,
            "require_state_control_on_load": True, "allow_cross_dock": False,
            "require_resource_certification": True, "max_lift_height_m": 8,
            "max_weight_kg": 1200,
        },
    })

    # Recursos: uno válido y uno inutilizable, para que REJ-15 sea provocable.
    for code, rtype, status, certs, lift in (
        ("WMS-TEST-RES-RETRACTIL", "REACH_TRUCK", "AVAILABLE", ["FORKLIFT"], 8),
        ("WMS-TEST-RES-TRANSPALETA", "PALLET_TRUCK", "AVAILABLE", [], 0.2),
        ("WMS-TEST-RES-MANTENIMIENTO", "FORKLIFT", "MAINTENANCE", [], 4),
    ):
        seed.add("warehouse_resources", {
            "id": deterministic_uuid(BATCH_ID, "warehouse_resources", code),
            "tenant_id": tenant, "warehouse_id": warehouse_id,
            "code": code, "name": code, "resource_type": rtype, "status": status,
            "certifications": certs, "max_lift_height_m": lift or None,
            "max_weight_kg": 1200, "is_active": status != "MAINTENANCE",
        })

    # Hasta que E2 exista (replenishment_rules + wms_proposals), cargar el escenario 4
    # dejaría tareas de reposición sin la tabla que las sostiene. Por defecto, solo E1.
    selected = [sc for sc in SCENARIOS if sc["delivery"] in deliveries]
    if not selected:
        raise SystemExit(f"ninguna entrega seleccionada: {deliveries}")
    skipped = [sc["id"] for sc in SCENARIOS if sc["delivery"] not in deliveries]

    for scenario in selected:
        for index in range(1, scenario["count"] + 1):
            hu_id = deterministic_uuid(BATCH_ID, "handling_units", scenario["id"], index)
            quant_id = deterministic_uuid(BATCH_ID, "inventory_quants", scenario["id"], index)
            bin_id = snapshot["paths"].get("bins", [None])[index % max(1, len(snapshot["paths"].get("bins", [1])))]
            product_id = snapshot["paths"]["products"][index % len(snapshot["paths"]["products"])]

            # Estado por escenario, tomado de los dominios reales.
            hu_state, flow_state, task_state = _state_for(scenario["id"], index)
            assert hu_state in HU_STATES, f"estado de HU fuera de dominio: {hu_state}"
            assert flow_state in FLOW_STATES, f"flow_state fuera de dominio: {flow_state}"

            seed.scenario_rows[scenario["id"]] = seed.scenario_rows.get(scenario["id"], 0) + 1
            seed.add("handling_units", {
                "id": hu_id, "tenant_id": tenant, "warehouse_id": warehouse_id,
                "code": hu_code(scenario["id"], index), "code_type": "LPN",
                "hu_type": "PALLET", "state": hu_state,
                "current_bin_id": bin_id if flow_state == "STORED" else None,
                "current_dock_id": dock_id if flow_state.startswith("STAGING") else None,
                "owner_party_id": snapshot["paths"].get("owner_party_id"),
            })
            seed.add("handling_unit_contents", {
                "id": deterministic_uuid(BATCH_ID, "handling_unit_contents", scenario["id"], index),
                "tenant_id": tenant, "handling_unit_id": hu_id, "product_id": product_id,
                "batch_number": batch_marker(scenario["id"], index),
                "quantity": 10 + index, "uom": "UN",
            })
            seed.add("inventory_quants", {
                "id": quant_id, "tenant_id": tenant, "warehouse_id": warehouse_id,
                "bin_id": bin_id, "product_id": product_id, "hu_id": hu_id,
                "batch_number": batch_marker(scenario["id"], index),
                "quantity_on_hand": 10 + index, "uom": "UN",
                "stock_status": "AVAILABLE", "flow_state": flow_state,
            })
            if task_state:
                seed.add("warehouse_tasks", {
                    "id": deterministic_uuid(BATCH_ID, "warehouse_tasks", scenario["id"], index),
                    "tenant_id": tenant, "warehouse_id": warehouse_id,
                    "task_type": _task_type(scenario["id"]), "state": task_state,
                    "hu_id": hu_id, "product_id": product_id,
                    "idempotency_key": f"{BATCH_ID}-S{scenario['id']:02d}-{index:03d}",
                })
            if scenario["id"] == 5:
                seed.add("stock_reservations", {
                    "id": deterministic_uuid(BATCH_ID, "stock_reservations", scenario["id"], index),
                    "tenant_id": tenant, "quant_id": quant_id, "hu_id": hu_id,
                    "batch_number": batch_marker(scenario["id"], index),
                    "quantity": 5, "uom": "UN", "status": "ALLOCATED",
                })
    return seed


def _state_for(scenario: int, index: int) -> tuple[str, str, str | None]:
    """Escenario -> (estado HU, flow_state del quant, estado de tarea)."""
    if scenario == 1:
        return "STAGING_UNCHECKED", "STAGING_UNCHECKED", "IN_PROGRESS"   # descarga en curso
    if scenario == 2:
        # mitad chequeada, mitad sin chequear
        return (("STAGING_UNCHECKED", "STAGING_UNCHECKED", None) if index % 2
                else ("STAGING_CHECKED", "STAGING_CHECKED", None))
    if scenario == 3:
        return "STORED", "STORED", None                                   # almacenado
    if scenario == 4:
        return "STORED", "STORED", "PROPOSED"                             # reposición pendiente (E2)
    if scenario == 5:
        return "STORED", "STORED", "READY"                                # picking pendiente
    return "PICKED_STAGED", "PICKED_STAGED", "READY"                      # 6: sin etiqueta


def _task_type(scenario: int) -> str:
    return {1: "RECEIVE_CHECK", 4: "REPLENISH", 5: "PICK", 6: "LOAD"}.get(scenario, "PUTAWAY")


def manifest(seed: Seed) -> dict[str, Any]:
    return {
        "batch_id": BATCH_ID,
        "total_rows": sum(len(rows) for rows in seed.dataset.values()),
        "by_table": {table: len(rows) for table, rows in sorted(seed.dataset.items())},
        "by_delivery": {
            delivery: sum(seed.scenario_rows.get(sc["id"], 0)
                          for sc in SCENARIOS if sc["delivery"] == delivery)
            for delivery in ("E1", "E2")
        },
        "borrowed_ids": seed.borrowed,
        # Tablas sin columna de texto libre donde declararse: su procedencia queda aquí.
        # Mismo criterio que las 22 tablas excepcionales de DATA150.
        "identified_by_manifest": {
            table: [row["id"] for row in rows]
            for table, rows in seed.dataset.items()
            if table == "warehouse_behavior_policies"
        },
    }


def main() -> None:
    import argparse
    parser = argparse.ArgumentParser(description="Genera el lote DATA150-WMS. No conecta a BD.")
    parser.add_argument("snapshot", help="JSON con los ids prestados de DATA150")
    parser.add_argument("--out", default="wms-seed-dataset.json")
    parser.add_argument("--manifest", default="wms-seed-manifest.json")
    parser.add_argument("--delivery", default="E1", choices=["E1", "E1,E2"],
                        help="E1 por defecto: el escenario 4 (reposición) necesita la tabla de E2")
    args = parser.parse_args()

    with open(args.snapshot, encoding="utf-8") as handle:
        snapshot = json.load(handle)

    deliveries = tuple(args.delivery.split(","))
    seed = plan(snapshot, deliveries)
    for warning in seed.warnings:
        print("AVISO:", warning)
    with open(args.out, "w", encoding="utf-8") as handle:
        json.dump({"batch_id": BATCH_ID, "tables": seed.dataset}, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")
    with open(args.manifest, "w", encoding="utf-8") as handle:
        json.dump(manifest(seed), handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")
    print(json.dumps(manifest(seed)["by_table"], indent=2))


if __name__ == "__main__":
    main()
