#!/usr/bin/env python3
"""
Pruebas del generador DATA150-WMS. Sin red, sin base de datos.

Se ejecuta con: python3 test_generate_wms_seed.py
Comprueba lo que el lote tiene que garantizar antes de acercarse a producción:
determinismo, reparto por escenario, procedencia al 100%, dominios del esquema real
y que las filas respeten los CHECK de la migración.
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
from pathlib import Path

HERE = Path(__file__).parent
spec = importlib.util.spec_from_file_location("gen", HERE / "generate_wms_seed.py")
gen = importlib.util.module_from_spec(spec)
assert spec.loader is not None
sys.modules["gen"] = gen
spec.loader.exec_module(gen)

SNAPSHOT = {
    "tenant_id": "00000000-0000-4000-8000-000000000001",
    "warehouses": [{"id": "11111111-1111-5111-8111-111111111111"}],
    "paths": {
        "unchecked_dock": "22222222-2222-5222-8222-222222222222",
        "bins": ["33333333-3333-5333-8333-333333333333", "44444444-4444-5444-8444-444444444444"],
        "products": ["55555555-5555-5555-8555-555555555555"],
        "owner_party_id": "77777777-7777-5777-8777-777777777777",
    },
    "borrowed_ids": {"inventory_quants": [f"{i:08d}-0000-5000-8000-000000000000" for i in range(150)]},
}

failures: list[str] = []


def check(condition: bool, message: str) -> None:
    if not condition:
        failures.append(message)


def digest(seed: gen.Seed) -> str:
    return hashlib.sha256(
        json.dumps({"batch": gen.BATCH_ID, "tables": seed.dataset}, sort_keys=True).encode()
    ).hexdigest()


# 1. Determinismo: dos generaciones producen exactamente el mismo lote.
a = gen.plan(SNAPSHOT, ("E1",))
b = gen.plan(SNAPSHOT, ("E1",))
check(digest(a) == digest(b), "el generador no es determinista")

# 2. Reparto por escenario y por entrega.
hus = a.dataset["handling_units"]
por_escenario: dict[str, int] = {}
for row in hus:
    clave = row["code"].split("-")[2]
    por_escenario[clave] = por_escenario.get(clave, 0) + 1
esperado_e1 = {"S01": 20, "S02": 30, "S03": 40, "S05": 25, "S06": 15}
check(por_escenario == esperado_e1, f"reparto E1 inesperado: {por_escenario}")
check("S04" not in por_escenario, "E1 no debe incluir el escenario 4 (reposición, E2)")

completo = gen.plan(SNAPSHOT, ("E1", "E2"))
check(len(completo.dataset["handling_units"]) == 150, "el lote completo debe tener 150 pallets")
check(
    sum(1 for t in completo.dataset["warehouse_tasks"] if t["task_type"] == "REPLENISH") == 20,
    "el lote completo debe traer 20 tareas de reposición",
)
check(
    sum(1 for t in a.dataset["warehouse_tasks"] if t["task_type"] == "REPLENISH") == 0,
    "E1 no debe traer tareas de reposición: su tabla no existe todavía",
)

# 3. Procedencia: ninguna fila anónima.
#    `warehouse_behavior_policies` no tiene campo de texto libre y `wbp_scope_target`
#    prohíbe usar `category_code` para marcarla, así que su procedencia va en el
#    manifiesto (`identified_by_manifest`), como en las tablas excepcionales de DATA150.
SIN_CAMPO_DE_TEXTO = {"warehouse_behavior_policies"}
manifiesto_completo = gen.manifest(completo)
identificadas = set(manifiesto_completo.get("identified_by_manifest", {}).get("warehouse_behavior_policies", []))
for table, rows in completo.dataset.items():
    for row in rows:
        texto = json.dumps(row, ensure_ascii=False)
        marcada = (gen.BATCH_ID in texto) or ("WMS-TEST-" in texto) or ("LOT-WMS-" in texto)
        if table in SIN_CAMPO_DE_TEXTO:
            check(row["id"] in identificadas, f"{table}: {row['id']} no figura en el manifiesto")
        else:
            check(marcada, f"{table}: fila sin marca de procedencia -> {row.get('id')}")

# 4. Dominios del esquema real.
for row in completo.dataset["handling_units"]:
    check(row["state"] in gen.HU_STATES, f"estado de HU fuera de dominio: {row['state']}")
for row in completo.dataset["inventory_quants"]:
    check(row["flow_state"] in gen.FLOW_STATES, f"flow_state fuera de dominio: {row['flow_state']}")
for row in completo.dataset["warehouse_tasks"]:
    check(row["state"] in gen.TASK_STATES, f"estado de tarea fuera de dominio: {row['state']}")
for row in completo.dataset["stock_reservations"]:
    check(row["status"] in gen.RESERVATION_STATES, f"estado de reserva fuera de dominio: {row['status']}")

# 5. CHECK de la migración: hu_stored_needs_bin.
for row in completo.dataset["handling_units"]:
    if row["state"] == "STORED":
        check(bool(row.get("current_bin_id")), f"HU STORED sin bin (viola hu_stored_needs_bin): {row['code']}")
    else:
        check(not row.get("current_bin_id"), f"HU no almacenada con bin asignado: {row['code']}")

# 6. Cantidades positivas.
for row in completo.dataset["inventory_quants"]:
    check(row["quantity_on_hand"] > 0, f"cantidad no positiva en {row['id']}")
for row in completo.dataset["stock_reservations"]:
    check(row["quantity"] > 0, f"reserva no positiva en {row['id']}")
    check(bool(row.get("batch_number")), "reserva sin lote: WMS_LOT_MISMATCH sería inalcanzable")

# 7. Política: los 27 parámetros y el invariante de la regla de oro.
for row in completo.dataset["warehouse_behavior_policies"]:
    params = row["params"]
    check(len(params) == 26, f"la política debe tener los 26 parámetros de WmsBehaviorPolicyParams, tiene {len(params)}")
    check(params.get("forbid_picking_unlocated") is True, "forbid_picking_unlocated debe ser true")
    if row["scope"] == "WAREHOUSE":
        check(
            not (row["product_id"] or row["owner_party_id"] or row["category_code"]),
            "política WAREHOUSE con ámbito específico: viola wbp_scope_target",
        )

# 8. Recursos: debe haber al menos uno inutilizable para que REJ-15 sea provocable.
check(
    any(r["status"] == "MAINTENANCE" for r in completo.dataset["warehouse_resources"]),
    "sin recurso en MAINTENANCE no se puede probar WMS_RESOURCE_INCOMPATIBLE",
)

# 9. Manifiesto coherente con el dataset.
manifiesto = gen.manifest(a)
check(
    manifiesto["by_delivery"] == {"E1": 130, "E2": 0},
    f"manifiesto E1 incorrecto: {manifiesto['by_delivery']}",
)
check(
    manifiesto["total_rows"] == sum(len(v) for v in a.dataset.values()),
    "el total del manifiesto no suma las filas del dataset",
)

# 10. Unicidad: las tres claves únicas del esquema, sobre el lote completo.
def _dups(claves):
    from collections import Counter
    return [k for k, n in Counter(claves).items() if n > 1]

check(not _dups((r["bin_id"], r["product_id"], r.get("owner_party_id"), r.get("batch_number"),
                 r.get("serial_number"), r["stock_status"])
                for r in completo.dataset["inventory_quants"]),
      "quants duplicados: viola unique (bin_id, product_id, owner_party_id, batch, serial, stock_status)")
check(not _dups((t["tenant_id"], t["idempotency_key"]) for t in completo.dataset["warehouse_tasks"]),
      "tareas duplicadas: viola unique (tenant_id, idempotency_key)")
check(not _dups((h["tenant_id"], h["code"]) for h in completo.dataset["handling_units"]),
      "HUs con código repetido: viola unique (tenant_id, code)")

if failures:
    print(f"FALLOS ({len(failures)}):")
    for f in failures:
        print(" -", f)
    sys.exit(1)

print(f"OK: {len(failures)} fallos · {sum(len(v) for v in completo.dataset.values())} filas validadas en el lote completo")
