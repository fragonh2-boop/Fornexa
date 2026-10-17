#!/usr/bin/env python3
"""
FORNEXA — Generador determinista de lote sintético de Muelles (MUELLES-SEED)
TASK_ID: MUELLES-SEED-20261017
Tenant fijo: 00000000-0000-4000-8000-000000000001

Genera sobre los maestros sintéticos de DATA150 (sin mutar ninguna fila preexistente):
1. warehouse_zones: 450 filas nuevas (3 por cada uno de los 150 almacenes: RECEIVING, SHIPPING, CROSS_DOCK).
2. warehouse_docks: 800 filas nuevas (entre 5 y 8 muelles por almacén; total 800 < 1000 para evitar truncamiento en UI).
3. dock_appointment_rules: 450 filas nuevas (3 reglas por almacén: INBOUND, OUTBOUND, BOTH).
4. dock_policies: 150 filas nuevas (1 política canónica de 15 parámetros por almacén).
5. dock_appointments: 150 filas nuevas (1 por cada trip_stop sintético de DATA150, sin solapes en ningún muelle,
   con 15 citas concentradas en WH-PRV-0000 entre 2026-10-16 y 2026-10-19 incluyendo 10 en 2026-10-17).
6. transport_events: 31 eventos DOCK_* sobre 9 citas operativas en WH-PRV-0000 con actor_user_id resuelto
   al miembro activo OWNER/ADMIN del tenant.
Total filas del lote: 2.031 filas en 6 tablas.
"""

import hashlib
import json
import os
import uuid
from pathlib import Path

TENANT_ID = "00000000-0000-4000-8000-000000000001"
BATCH_ID = "MUELLES-SEED-PRODUCTION-20261017"
NAMESPACE = uuid.UUID("c1101405-2026-1017-8000-000000000105")

ROOT_DIR = Path(__file__).resolve().parents[2]
DATA150_DATASET_PATH = ROOT_DIR / "docs" / "verification" / "data150-dataset.json"
OUT_DATASET_PATH = ROOT_DIR / "docs" / "verification" / "muelles-seed-dataset.json"
OUT_MANIFEST_PATH = ROOT_DIR / "docs" / "verification" / "muelles-seed-manifest.json"
OUT_RECEIPT_PATH = ROOT_DIR / "docs" / "verification" / "muelles-seed-execution-receipt.json"
OUT_SQL_LOADER_PATH = ROOT_DIR / "scripts" / "muelles" / "muelles-seed-loader.sql"
OUT_SQL_ROLLBACK_PATH = ROOT_DIR / "scripts" / "muelles" / "muelles-seed-rollback.sql"

DEFAULT_POLICY_PARAMS = {
    "min_lead_minutes": 240,
    "horizon_days": 60,
    "firm_fence_minutes": 120,
    "buffer_minutes": 10,
    "punctuality_minutes": 30,
    "dwell_target_minutes": 80,
    "confirmation_minutes": 20,
    "no_show_minutes": 20,
    "no_show_limit": 2,
    "change_cutoff_minutes": 240,
    "max_changes": 2,
    "last_minute_quota_pct": 10,
    "compensation_hour_eur": 35,
    "allow_holiday_override": False,
    "block_portal_holidays": True,
}

DEFAULT_NOTIFICATIONS = {
    "confirmation": True,
    "reminder": True,
    "late": True,
    "release": True,
}


def det_uuid(domain: str, key: str) -> str:
    return str(uuid.uuid5(NAMESPACE, f"{domain}:{key}"))


def jcs_bytes(obj) -> bytes:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sql_literal(val) -> str:
    if val is None:
        return "NULL"
    if isinstance(val, bool):
        return "TRUE" if val else "FALSE"
    if isinstance(val, (int, float)):
        return str(val)
    if isinstance(val, list):
        # Postgres text[] literal
        escaped = [f'"{str(x).replace(chr(34), chr(92)+chr(34))}"' for x in val]
        return "'{" + ",".join(escaped) + "}'::text[]"
    if isinstance(val, dict):
        s = json.dumps(val, sort_keys=True, separators=(",", ":"), ensure_ascii=False).replace("'", "''")
        return f"'{s}'::jsonb"
    s = str(val).replace("'", "''")
    return f"'{s}'"


def main():
    with open(DATA150_DATASET_PATH, "r", encoding="utf-8") as f:
        d150 = json.load(f)

    warehouses = d150["warehouses"]
    stops = d150["trip_stops"]
    orders = d150["orders"]
    expeditions = d150["expeditions"]

    assert len(warehouses) == 150, f"Expected 150 warehouses, got {len(warehouses)}"
    assert len(stops) == 150, f"Expected 150 trip_stops, got {len(stops)}"

    zones_rows = []
    docks_rows = []
    rules_rows = []
    policies_rows = []
    appointments_rows = []
    events_rows = []

    wh_zones_map = {}
    wh_docks_map = {}
    wh_rules_map = {}

    created_ts = "2026-10-14T08:00:00+00:00"

    # 1-4. Generate zones, docks, rules and policies per warehouse
    for w_idx, wh in enumerate(warehouses):
        wid = wh["id"]
        z_rec_id = det_uuid("warehouse_zones", f"{w_idx}-rec")
        z_shp_id = det_uuid("warehouse_zones", f"{w_idx}-shp")
        z_xdk_id = det_uuid("warehouse_zones", f"{w_idx}-xdk")

        temp_shp = "CHILLED" if w_idx % 2 == 0 else "AMBIENT"
        temp_xdk = ["CONTROLLED", "FROZEN", "CHILLED", "AMBIENT"][w_idx % 4]

        w_zones = [
            {
                "id": z_rec_id,
                "tenant_id": TENANT_ID,
                "warehouse_id": wid,
                "zone_code": f"ZN-MUE-R{w_idx:03d}",
                "zone_name": f"[PRUEBA] Zona Recepción Muelle {w_idx:03d}",
                "zone_type": "RECEIVING",
                "temperature_regime": "AMBIENT",
                "is_active": True,
                "created_at": created_ts,
                "updated_at": created_ts,
            },
            {
                "id": z_shp_id,
                "tenant_id": TENANT_ID,
                "warehouse_id": wid,
                "zone_code": f"ZN-MUE-S{w_idx:03d}",
                "zone_name": f"[PRUEBA] Zona Expedición Muelle {w_idx:03d}",
                "zone_type": "SHIPPING",
                "temperature_regime": temp_shp,
                "is_active": True,
                "created_at": created_ts,
                "updated_at": created_ts,
            },
            {
                "id": z_xdk_id,
                "tenant_id": TENANT_ID,
                "warehouse_id": wid,
                "zone_code": f"ZN-MUE-X{w_idx:03d}",
                "zone_name": f"[PRUEBA] Zona Cross-Dock Muelle {w_idx:03d}",
                "zone_type": "CROSS_DOCK",
                "temperature_regime": temp_xdk,
                "is_active": True,
                "created_at": created_ts,
                "updated_at": created_ts,
            },
        ]
        zones_rows.extend(w_zones)
        wh_zones_map[w_idx] = w_zones

        if w_idx < 10:
            n_docks = 8
        elif w_idx < 30:
            n_docks = 6
        else:
            n_docks = 5

        w_docks = []
        for d_idx in range(n_docks):
            did = det_uuid("warehouse_docks", f"{w_idx}-{d_idx}")
            z_obj = w_zones[d_idx % 3]
            z_label = ["Recepción", "Expedición", "Cross-Dock"][d_idx % 3]
            is_maint = (d_idx == n_docks - 1) and (w_idx % 5 == 0)
            if d_idx % 3 == 0:
                profiles = ["DRY_PALLETIZED", "MIXED", "RETURNS"]
            elif d_idx % 3 == 1:
                profiles = ["DRY_PALLETIZED", "CHILLED", "MIXED"]
            else:
                profiles = ["DRY_PALLETIZED", "CHILLED", "FROZEN", "HAZMAT_ADR", "MIXED"]

            dock_row = {
                "id": did,
                "tenant_id": TENANT_ID,
                "warehouse_id": wid,
                "zone_id": z_obj["id"],
                "code": f"M-{d_idx+1:02d}",
                "name": f"[PRUEBA] Muelle {d_idx+1:02d} · {z_label}",
                "status": "MAINTENANCE" if is_maint else "ACTIVE",
                "max_weight_t": 40.0 if d_idx % 2 == 0 else 24.0,
                "max_vehicle_length_m": 16.5 if d_idx % 2 == 0 else 18.75,
                "is_leveler": True,
                "has_scale": (d_idx % 2 == 0),
                "has_pit": (d_idx % 3 == 0),
                "has_spill_basin": (d_idx % 3 == 2),
                "temperature_regime": z_obj["temperature_regime"],
                "cargo_profiles": profiles,
                "default_operation_minutes": 60,
                "buffer_minutes": 10,
                "sort_order": d_idx + 1,
                "is_active": True,
                "created_at": created_ts,
                "updated_at": created_ts,
            }
            w_docks.append(dock_row)
            docks_rows.append(dock_row)
        wh_docks_map[w_idx] = w_docks

        r_in_id = det_uuid("dock_appointment_rules", f"{w_idx}-inbound")
        r_out_id = det_uuid("dock_appointment_rules", f"{w_idx}-outbound")
        r_mix_id = det_uuid("dock_appointment_rules", f"{w_idx}-mixed")

        w_rules = [
            {
                "id": r_in_id,
                "tenant_id": TENANT_ID,
                "warehouse_id": wid,
                "code": "R-RECEP-PAL",
                "direction": "INBOUND",
                "cargo_profile": "DRY_PALLETIZED",
                "default_duration_minutes": 60,
                "min_duration_minutes": 30,
                "max_duration_minutes": 120,
                "max_appointments_per_slot": 4,
                "requires_driver_checkin": True,
                "is_active": True,
                "created_at": created_ts,
                "updated_at": created_ts,
            },
            {
                "id": r_out_id,
                "tenant_id": TENANT_ID,
                "warehouse_id": wid,
                "code": "R-EXPED-PAL",
                "direction": "OUTBOUND",
                "cargo_profile": "DRY_PALLETIZED",
                "default_duration_minutes": 60,
                "min_duration_minutes": 30,
                "max_duration_minutes": 120,
                "max_appointments_per_slot": 4,
                "requires_driver_checkin": True,
                "is_active": True,
                "created_at": created_ts,
                "updated_at": created_ts,
            },
            {
                "id": r_mix_id,
                "tenant_id": TENANT_ID,
                "warehouse_id": wid,
                "code": "R-MULTI-ESP",
                "direction": "BOTH",
                "cargo_profile": "MIXED",
                "default_duration_minutes": 90,
                "min_duration_minutes": 30,
                "max_duration_minutes": 180,
                "max_appointments_per_slot": 3,
                "requires_driver_checkin": True,
                "is_active": True,
                "created_at": created_ts,
                "updated_at": created_ts,
            },
        ]
        rules_rows.extend(w_rules)
        wh_rules_map[w_idx] = w_rules

        policies_rows.append(
            {
                "id": det_uuid("dock_policies", str(w_idx)),
                "tenant_id": TENANT_ID,
                "warehouse_id": wid,
                "parameters": DEFAULT_POLICY_PARAMS,
                "notifications": DEFAULT_NOTIFICATIONS,
                "created_at": created_ts,
                "updated_at": created_ts,
            }
        )

    # 5. Generate 150 dock_appointments (1 per trip_stop) + 31 transport_events on 9 appointments
    # First 15 appointments (idx 0..14) on WH-PRV-0000 (w_idx = 0) so default view is richly populated:
    wh0_specs = [
        # Today 2026-10-17 (10 appointments across M-01..M-07 and queue)
        (0, 0, "INBOUND", 0, "2026-10-17T06:00:00+00:00", "2026-10-17T07:00:00+00:00", "COMPLETED", "FIRM", "NORMAL", "PLANNER", None, [
            ("DOCK_GATE_IN", "2026-10-17T05:50:00+00:00"),
            ("DOCK_CHECK_IN", "2026-10-17T05:55:00+00:00"),
            ("DOCK_OPERATION_START", "2026-10-17T06:05:00+00:00"),
            ("DOCK_CHECK_OUT", "2026-10-17T06:55:00+00:00"),
        ]),
        (1, 1, "OUTBOUND", 1, "2026-10-17T06:30:00+00:00", "2026-10-17T07:30:00+00:00", "COMPLETED", "FIRM", "HIGH", "PLANNER", None, [
            ("DOCK_GATE_IN", "2026-10-17T06:20:00+00:00"),
            ("DOCK_CHECK_IN", "2026-10-17T06:28:00+00:00"),
            ("DOCK_OPERATION_START", "2026-10-17T06:35:00+00:00"),
            ("DOCK_CHECK_OUT", "2026-10-17T07:25:00+00:00"),
        ]),
        (2, 0, "INBOUND", 0, "2026-10-17T08:00:00+00:00", "2026-10-17T09:30:00+00:00", "AT_DOCK", "FIRM", "HIGH", "PLANNER", None, [
            ("DOCK_GATE_IN", "2026-10-17T07:48:00+00:00"),
            ("DOCK_CHECK_IN", "2026-10-17T07:55:00+00:00"),
            ("DOCK_OPERATION_START", "2026-10-17T08:05:00+00:00"),
        ]),
        (3, 2, "BOTH", 2, "2026-10-17T08:30:00+00:00", "2026-10-17T10:00:00+00:00", "OPERATION_ENDED", "FIRM", "NORMAL", "PLANNER", None, [
            ("DOCK_GATE_IN", "2026-10-17T08:15:00+00:00"),
            ("DOCK_CHECK_IN", "2026-10-17T08:22:00+00:00"),
            ("DOCK_OPERATION_START", "2026-10-17T08:32:00+00:00"),
            ("DOCK_OPERATION_END", "2026-10-17T09:50:00+00:00"),
        ]),
        (4, 3, "INBOUND", 0, "2026-10-17T09:00:00+00:00", "2026-10-17T10:00:00+00:00", "CHECKED_IN", "FIRM", "NORMAL", "PLANNER", None, [
            ("DOCK_GATE_IN", "2026-10-17T08:45:00+00:00"),
            ("DOCK_CHECK_IN", "2026-10-17T08:52:00+00:00"),
        ]),
        (5, 4, "OUTBOUND", 1, "2026-10-17T09:30:00+00:00", "2026-10-17T10:30:00+00:00", "CHECKED_IN", "FIRM", "URGENT", "PORTAL", None, [
            ("DOCK_GATE_IN", "2026-10-17T09:15:00+00:00"),
            ("DOCK_CHECK_IN", "2026-10-17T09:20:00+00:00"),
        ]),
        (6, 5, "INBOUND", 0, "2026-10-17T11:00:00+00:00", "2026-10-17T12:30:00+00:00", "CONFIRMED", "FIRM", "NORMAL", "PLANNER", None, []),
        (7, 6, "OUTBOUND", 1, "2026-10-17T12:00:00+00:00", "2026-10-17T13:00:00+00:00", "CONFIRMED", "FIRM", "HIGH", "PORTAL", None, []),
        (8, None, "INBOUND", 0, "2026-10-17T13:00:00+00:00", "2026-10-17T14:00:00+00:00", "CONFIRMED", "WAITLIST", "NORMAL", "PLANNER", None, []),
        (9, 1, "INBOUND", 0, "2026-10-17T04:30:00+00:00", "2026-10-17T05:30:00+00:00", "NO_SHOW", "FIRM", "NORMAL", "PORTAL", None, []),
        # Yesterday 2026-10-16 (5 appointments on WH-PRV-0000 for historical reports)
        (10, 0, "INBOUND", 0, "2026-10-16T07:00:00+00:00", "2026-10-16T08:00:00+00:00", "COMPLETED", "FIRM", "NORMAL", "PLANNER", None, [
            ("DOCK_GATE_IN", "2026-10-16T06:50:00+00:00"),
            ("DOCK_CHECK_IN", "2026-10-16T06:55:00+00:00"),
            ("DOCK_OPERATION_START", "2026-10-16T07:05:00+00:00"),
            ("DOCK_CHECK_OUT", "2026-10-16T07:55:00+00:00"),
        ]),
        (11, 1, "OUTBOUND", 1, "2026-10-16T08:30:00+00:00", "2026-10-16T09:30:00+00:00", "COMPLETED", "FIRM", "NORMAL", "PORTAL", None, [
            ("DOCK_GATE_IN", "2026-10-16T08:25:00+00:00"),
            ("DOCK_CHECK_IN", "2026-10-16T08:32:00+00:00"),
            ("DOCK_OPERATION_START", "2026-10-16T08:45:00+00:00"),
            ("DOCK_CHECK_OUT", "2026-10-16T09:40:00+00:00"),
        ]),
        (12, 2, "INBOUND", 2, "2026-10-16T10:00:00+00:00", "2026-10-16T11:30:00+00:00", "COMPLETED", "FIRM", "HIGH", "PLANNER", None, [
            ("DOCK_GATE_IN", "2026-10-16T10:15:00+00:00"),
            ("DOCK_CHECK_IN", "2026-10-16T10:25:00+00:00"),
            ("DOCK_OPERATION_START", "2026-10-16T10:40:00+00:00"),
            ("DOCK_CHECK_OUT", "2026-10-16T11:50:00+00:00"),
        ]),
        (13, 3, "OUTBOUND", 1, "2026-10-16T12:00:00+00:00", "2026-10-16T13:00:00+00:00", "CANCELLED", "FIRM", "NORMAL", "PLANNER", "[PRUEBA] Reprogramación operativa solicitada por cargador", []),
        (14, None, "INBOUND", 0, "2026-10-18T08:00:00+00:00", "2026-10-18T09:00:00+00:00", "DRAFT", "PROVISIONAL", "NORMAL", "PLANNER", None, []),
    ]

    for spec in wh0_specs:
        idx, d_idx, dir_override, r_idx, p_start, p_end, status, b_kind, prio, via, cancel_reason, ev_list = spec
        w_idx = 0
        wid = warehouses[w_idx]["id"]
        dock_id = wh_docks_map[w_idx][d_idx]["id"] if d_idx is not None else None
        rule_id = wh_rules_map[w_idx][r_idx]["id"]
        direction = "INBOUND" if dir_override == "BOTH" else dir_override
        apt_id = det_uuid("dock_appointments", str(idx))
        meta = {
            "batch": BATCH_ID,
            "synthetic": True,
            "label": "[PRUEBA]",
            "index": idx,
        }
        if status == "NO_SHOW":
            meta["no_show_reason"] = "[PRUEBA] Retraso en ruta nacional A-2"
            meta["attributed_to"] = "CARRIER"

        apt_row = {
            "id": apt_id,
            "tenant_id": TENANT_ID,
            "code": f"APT-PRV-{idx:04d}",
            "warehouse_id": wid,
            "dock_id": dock_id,
            "trip_stop_id": stops[idx]["id"],
            "order_id": orders[idx]["id"],
            "expedition_id": expeditions[idx]["id"],
            "rule_id": rule_id,
            "direction": direction,
            "planned_start": p_start,
            "planned_end": p_end,
            "requested_start": p_start,
            "requested_end": p_end,
            "buffer_minutes": 10,
            "status": status,
            "booking_kind": b_kind,
            "priority": prio,
            "booked_via": via,
            "is_confirmed": status in ("CONFIRMED", "CHECKED_IN", "AT_DOCK", "OPERATION_ENDED", "COMPLETED"),
            "confirmation_deadline_at": None,
            "is_overbooked": False,
            "precheck_completed_at": p_start if status in ("CHECKED_IN", "AT_DOCK", "OPERATION_ENDED", "COMPLETED") else None,
            "cancellation_reason": cancel_reason,
            "metadata": meta,
            "created_at": created_ts,
            "updated_at": created_ts,
        }
        appointments_rows.append(apt_row)

        for ev_type, ev_ts in ev_list:
            ev_id = det_uuid("transport_events", f"{idx}:{ev_type}")
            events_rows.append(
                {
                    "id": ev_id,
                    "tenant_id": TENANT_ID,
                    "dock_appointment_id": apt_id,
                    "event_type": ev_type,
                    "occurred_at": ev_ts,
                    "payload": {
                        "batch": BATCH_ID,
                        "synthetic": True,
                        "label": "[PRUEBA]",
                        "appointment_code": f"APT-PRV-{idx:04d}",
                    },
                    "idempotency_key": f"{TENANT_ID}:{apt_id}:{ev_type}",
                }
            )

    # Remaining 135 appointments (idx 15..149) distributed across warehouses 1..135
    dates_pool = [
        "2026-10-08", "2026-10-09", "2026-10-12", "2026-10-13", "2026-10-14",
        "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-19", "2026-10-20",
        "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-26", "2026-10-27",
    ]
    hours_pool = [
        ("06:00:00", "07:00:00"),
        ("07:30:00", "08:30:00"),
        ("09:00:00", "10:00:00"),
        ("10:30:00", "11:30:00"),
        ("12:00:00", "13:00:00"),
        ("13:30:00", "14:30:00"),
    ]
    for idx in range(15, 150):
        w_idx = idx - 14  # warehouses 1..135
        wid = warehouses[w_idx]["id"]
        d_idx = idx % 3  # M-01, M-02, M-03 (all ACTIVE)
        dock_id = wh_docks_map[w_idx][d_idx]["id"]
        is_inbound = (idx % 2 == 0)
        direction = "INBOUND" if is_inbound else "OUTBOUND"
        rule_id = wh_rules_map[w_idx][0 if is_inbound else 1]["id"]
        day_str = dates_pool[idx % len(dates_pool)]
        h_start, h_end = hours_pool[idx % len(hours_pool)]
        p_start = f"{day_str}T{h_start}+00:00"
        p_end = f"{day_str}T{h_end}+00:00"
        status = "COMPLETED" if day_str < "2026-10-17" else "CONFIRMED"
        apt_id = det_uuid("dock_appointments", str(idx))

        appointments_rows.append(
            {
                "id": apt_id,
                "tenant_id": TENANT_ID,
                "code": f"APT-PRV-{idx:04d}",
                "warehouse_id": wid,
                "dock_id": dock_id,
                "trip_stop_id": stops[idx]["id"],
                "order_id": orders[idx]["id"],
                "expedition_id": expeditions[idx]["id"],
                "rule_id": rule_id,
                "direction": direction,
                "planned_start": p_start,
                "planned_end": p_end,
                "requested_start": p_start,
                "requested_end": p_end,
                "buffer_minutes": 10,
                "status": status,
                "booking_kind": "FIRM",
                "priority": "NORMAL" if idx % 4 != 0 else "HIGH",
                "booked_via": "PLANNER" if idx % 3 != 0 else "PORTAL",
                "is_confirmed": True,
                "confirmation_deadline_at": None,
                "is_overbooked": False,
                "precheck_completed_at": p_start if status == "COMPLETED" else None,
                "cancellation_reason": None,
                "metadata": {
                    "batch": BATCH_ID,
                    "synthetic": True,
                    "label": "[PRUEBA]",
                    "index": idx,
                },
                "created_at": created_ts,
                "updated_at": created_ts,
            }
        )

    dataset = {
        "batch_id": BATCH_ID,
        "tenant_id": TENANT_ID,
        "tables": {
            "warehouse_zones": zones_rows,
            "warehouse_docks": docks_rows,
            "dock_appointment_rules": rules_rows,
            "dock_policies": policies_rows,
            "dock_appointments": appointments_rows,
            "transport_events": events_rows,
        },
    }

    OUT_SQL_LOADER_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_DATASET_PATH, "w", encoding="utf-8") as f:
        json.dump(dataset, f, indent=2, ensure_ascii=False)

    # Generate SQL Loader
    sql_lines = [
        "-- FORNEXA — MUELLES-V1 Synthetic Production Seed Loader",
        f"-- Batch ID: {BATCH_ID}",
        f"-- Tenant ID: {TENANT_ID}",
        "-- Constraint: Zero mutations to pre-existing rows, dynamic OWNER/ADMIN actor resolution, fail-closed",
        "BEGIN;",
        "",
        "DO $$",
        "DECLARE",
        "  v_owner uuid;",
        "BEGIN",
        f"  SELECT tm.user_id INTO v_owner FROM public.tenant_members tm JOIN auth.users u ON u.id = tm.user_id WHERE tm.tenant_id = '{TENANT_ID}' AND tm.status = 'ACTIVE' AND tm.role IN ('OWNER', 'ADMIN') ORDER BY CASE tm.role WHEN 'OWNER' THEN 1 ELSE 2 END, tm.created_at ASC LIMIT 1;",
        "  IF v_owner IS NULL THEN",
        "    RAISE EXCEPTION 'MUELLES_SEED_PREFLIGHT_FAILED: No active OWNER/ADMIN found for tenant';",
        "  END IF;",
        "END $$;",
        "",
    ]

    # 1. warehouse_zones
    sql_lines.append("-- 1. warehouse_zones (450 rows)")
    for row in zones_rows:
        cols = ["id", "tenant_id", "warehouse_id", "zone_code", "zone_name", "zone_type", "temperature_regime", "is_active", "created_at", "updated_at"]
        vals = ", ".join(sql_literal(row[c]) for c in cols)
        sql_lines.append(
            f'INSERT INTO public.warehouse_zones ({", ".join(cols)}) VALUES ({vals}) ON CONFLICT ("id") DO NOTHING RETURNING "id";'
        )

    # 2. warehouse_docks
    sql_lines.append("\n-- 2. warehouse_docks (800 rows)")
    for row in docks_rows:
        cols = [
            "id", "tenant_id", "warehouse_id", "zone_id", "code", "name", "status",
            "max_weight_t", "max_vehicle_length_m", "is_leveler", "has_scale", "has_pit", "has_spill_basin",
            "temperature_regime", "cargo_profiles", "default_operation_minutes", "buffer_minutes",
            "sort_order", "is_active", "created_at", "updated_at",
        ]
        vals = ", ".join(sql_literal(row[c]) for c in cols)
        sql_lines.append(
            f'INSERT INTO public.warehouse_docks ({", ".join(cols)}) VALUES ({vals}) ON CONFLICT ("id") DO NOTHING RETURNING "id";'
        )

    # 3. dock_appointment_rules
    sql_lines.append("\n-- 3. dock_appointment_rules (450 rows)")
    for row in rules_rows:
        cols = [
            "id", "tenant_id", "warehouse_id", "code", "direction", "cargo_profile",
            "default_duration_minutes", "min_duration_minutes", "max_duration_minutes",
            "max_appointments_per_slot", "requires_driver_checkin", "is_active", "created_at", "updated_at",
        ]
        vals = ", ".join(sql_literal(row[c]) for c in cols)
        sql_lines.append(
            f'INSERT INTO public.dock_appointment_rules ({", ".join(cols)}) VALUES ({vals}) ON CONFLICT ("id") DO NOTHING RETURNING "id";'
        )

    # 4. dock_policies
    sql_lines.append("\n-- 4. dock_policies (150 rows)")
    for row in policies_rows:
        cols = ["id", "tenant_id", "warehouse_id", "parameters", "notifications", "created_at", "updated_at"]
        vals = ", ".join(sql_literal(row[c]) for c in cols)
        sql_lines.append(
            f'INSERT INTO public.dock_policies ({", ".join(cols)}) VALUES ({vals}) ON CONFLICT ("id") DO NOTHING RETURNING "id";'
        )

    # 5. dock_appointments
    sql_lines.append("\n-- 5. dock_appointments (150 rows)")
    for row in appointments_rows:
        cols = [
            "id", "tenant_id", "code", "warehouse_id", "dock_id", "trip_stop_id", "order_id", "expedition_id",
            "rule_id", "direction", "planned_start", "planned_end", "requested_start", "requested_end",
            "buffer_minutes", "status", "booking_kind", "priority", "booked_via", "is_confirmed",
            "confirmation_deadline_at", "is_overbooked", "precheck_completed_at", "cancellation_reason",
            "metadata", "created_at", "updated_at",
        ]
        vals = ", ".join(sql_literal(row[c]) for c in cols)
        sql_lines.append(
            f'INSERT INTO public.dock_appointments ({", ".join(cols)}) VALUES ({vals}) ON CONFLICT ("id") DO NOTHING RETURNING "id";'
        )

    # 6. transport_events (31 rows)
    sql_lines.append("\n-- 6. transport_events (31 rows, dynamic active OWNER/ADMIN actor resolution)")
    actor_subq = (
        f"(SELECT tm.user_id FROM public.tenant_members tm JOIN auth.users u ON u.id = tm.user_id "
        f"WHERE tm.tenant_id = '{TENANT_ID}' AND tm.status = 'ACTIVE' AND tm.role IN ('OWNER', 'ADMIN') "
        f"ORDER BY CASE tm.role WHEN 'OWNER' THEN 1 ELSE 2 END, tm.created_at ASC LIMIT 1)"
    )
    for row in events_rows:
        sql_lines.append(
            f"INSERT INTO public.transport_events (id, tenant_id, cmr_id, dock_appointment_id, event_type, actor_user_id, occurred_at, payload, idempotency_key) "
            f"VALUES ({sql_literal(row['id'])}, {sql_literal(row['tenant_id'])}, NULL, {sql_literal(row['dock_appointment_id'])}, "
            f"{sql_literal(row['event_type'])}, {actor_subq}, {sql_literal(row['occurred_at'])}, {sql_literal(row['payload'])}, {sql_literal(row['idempotency_key'])}) "
            f'ON CONFLICT ("id") DO NOTHING RETURNING "id";'
        )

    sql_lines.append("\nCOMMIT;\n")
    loader_sql = "\n".join(sql_lines)
    with open(OUT_SQL_LOADER_PATH, "w", encoding="utf-8") as f:
        f.write(loader_sql)

    # Generate Compensation Rollback SQL
    # Appointments with events cannot be physically deleted due to append-only guard T1 on transport_events.
    # They are compensated (status='CANCELLED', dock_id=NULL) so all 800 warehouse_docks and 450 warehouse_zones can be deleted.
    apt_ids_with_events = sorted({row["dock_appointment_id"] for row in events_rows})
    apt_ids_deletable = [row["id"] for row in appointments_rows if row["id"] not in apt_ids_with_events]
    rule_ids_referenced_by_compensated = sorted(
        {row["rule_id"] for row in appointments_rows if row["id"] in apt_ids_with_events}
    )
    rule_ids_deletable = [row["id"] for row in rules_rows if row["id"] not in rule_ids_referenced_by_compensated]

    rb_lines = [
        "-- FORNEXA — MUELLES-V1 Deterministic Compensation Rollback",
        f"-- Batch ID: {BATCH_ID}",
        f"-- Tenant ID: {TENANT_ID}",
        "-- Guard T1 (append-only transport_events) preserved intact:",
        "--   * 9 dock_appointments with transport_events are compensated (status='CANCELLED', dock_id=NULL).",
        "--   * 141 dock_appointments without events are physically deleted.",
        "--   * All 800 warehouse_docks, 450 warehouse_zones, 150 dock_policies and 447 unreferenced dock_appointment_rules are physically deleted.",
        "BEGIN;",
        "",
        "-- Step 1: Compensate the 9 appointments referenced by append-only transport_events (freeing dock_id)",
        f"UPDATE public.dock_appointments SET status = 'CANCELLED', cancellation_reason = '[ROLLBACK COMPENSACIÓN {BATCH_ID}] Cita cancelada conservando traza append-only T1', dock_id = NULL, updated_at = date_trunc('milliseconds', clock_timestamp()) WHERE tenant_id = '{TENANT_ID}' AND id IN ({', '.join(sql_literal(x) for x in apt_ids_with_events)});",
        "",
        "-- Step 2: Delete the 141 appointments without transport_events",
        f"DELETE FROM public.dock_appointments WHERE tenant_id = '{TENANT_ID}' AND id IN ({', '.join(sql_literal(x) for x in apt_ids_deletable)});",
        "",
        "-- Step 3: Delete all 800 warehouse_docks",
        f"DELETE FROM public.warehouse_docks WHERE tenant_id = '{TENANT_ID}' AND id IN ({', '.join(sql_literal(row['id']) for row in docks_rows)});",
        "",
        "-- Step 4: Delete all 447 unreferenced dock_appointment_rules (preserving 3 rules referenced by compensated appointments)",
        f"DELETE FROM public.dock_appointment_rules WHERE tenant_id = '{TENANT_ID}' AND id IN ({', '.join(sql_literal(x) for x in rule_ids_deletable)});",
        "",
        "-- Step 5: Delete all 150 dock_policies",
        f"DELETE FROM public.dock_policies WHERE tenant_id = '{TENANT_ID}' AND id IN ({', '.join(sql_literal(row['id']) for row in policies_rows)});",
        "",
        "-- Step 6: Delete all 450 warehouse_zones created by MUELLES-SEED",
        f"DELETE FROM public.warehouse_zones WHERE tenant_id = '{TENANT_ID}' AND id IN ({', '.join(sql_literal(row['id']) for row in zones_rows)});",
        "",
        "COMMIT;\n",
    ]
    rollback_sql = "\n".join(rb_lines)
    with open(OUT_SQL_ROLLBACK_PATH, "w", encoding="utf-8") as f:
        f.write(rollback_sql)

    # Manifest
    table_hashes = {}
    for t_name, rows in dataset["tables"].items():
        row_hashes = [sha256_hex(jcs_bytes(r)) for r in rows]
        table_hashes[t_name] = {
            "count": len(rows),
            "table_sha256": sha256_hex(jcs_bytes(row_hashes)),
        }

    manifest = {
        "batch_id": BATCH_ID,
        "tenant_id": TENANT_ID,
        "loader_sql_sha256": sha256_hex(loader_sql.encode("utf-8")),
        "rollback_sql_sha256": sha256_hex(rollback_sql.encode("utf-8")),
        "total_rows": sum(len(r) for r in dataset["tables"].values()),
        "tables": table_hashes,
        "compensation_residual_footprint": {
            "transport_events_append_only": len(events_rows),
            "dock_appointments_compensated_cancelled": len(apt_ids_with_events),
            "dock_appointment_rules_fk_retained": len(rule_ids_referenced_by_compensated),
        },
    }
    with open(OUT_MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    receipt_template = {
        "status": "PENDING_EXECUTION",
        "batch_id": BATCH_ID,
        "tenant_id": TENANT_ID,
        "loader_sql_sha256": manifest["loader_sql_sha256"],
        "rollback_sql_sha256": manifest["rollback_sql_sha256"],
        "executed_at": None,
        "tables": {},
    }
    with open(OUT_RECEIPT_PATH, "w", encoding="utf-8") as f:
        json.dump(receipt_template, f, indent=2, ensure_ascii=False)

    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
