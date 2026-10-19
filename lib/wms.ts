/**
 * FORNEXA — WMS Core Domain, Closed Error Catalogue (§3.1), Policy Inheritance & Interactive Proposal Engine
 * TASK_ID: WMS-RESEARCH-20261017 · Fase 3 (Entrega E1 — Núcleo operable)
 */

export const WMS_FLOW_STATES = [
  "STAGING_UNCHECKED",
  "STAGING_CHECKED",
  "STORED",
  "RESERVED",
  "PICKED_STAGED",
  "LOADED",
  "QUARANTINE",
  "DAMAGED",
] as const;

export type WmsFlowState = (typeof WMS_FLOW_STATES)[number];

export const WMS_HU_STATES = [
  "STAGING_UNCHECKED",
  "STAGING_CHECKED",
  "STORED",
  "PICKED_STAGED",
  "LOADED",
  "QUARANTINE",
  "DAMAGED",
] as const;

export type WmsHuState = (typeof WMS_HU_STATES)[number];

export const WMS_ACTIONS = [
  "RECEIVE_CHECK",
  "PUTAWAY",
  "RESERVE",
  "PICK",
  "REPLENISH",
  "CONFIRM_TASK",
  "LABEL",
  "LOAD",
  "UPSERT_POLICY",
  "UPSERT_RESOURCE",
  "CONTROL_STATE",
] as const;

export type WmsAction = (typeof WMS_ACTIONS)[number];

/**
 * Closed catalogue of 30 canonical WMS_* error codes from §3.1 of docs/architecture/wms-fase2-20261017.md
 */
export const WMS_ERROR_CODES = [
  "WMS_FORBIDDEN",
  "WMS_TENANT_MISMATCH",
  "WMS_CROSS_WAREHOUSE_INVALID",
  "WMS_DUPLICATE",
  "WMS_STOCK_NOT_LOCATED",
  "WMS_STOCK_BLOCKED",
  "WMS_INSUFFICIENT_PICK_STOCK",
  "WMS_REPLENISHMENT_PENDING",
  "WMS_INSUFFICIENT_STOCK",
  "WMS_LOT_MISMATCH",
  "WMS_LOT_REQUIRED",
  "WMS_EXPIRY_REQUIRED",
  "WMS_HU_NOT_UNCHECKED",
  "WMS_HU_NOT_CHECKED",
  "WMS_BIN_BLOCKED",
  "WMS_BIN_CAPACITY",
  "WMS_TEMP_MISMATCH",
  "WMS_ADR_INCOMPATIBLE",
  "WMS_LOT_MIX_FORBIDDEN",
  "WMS_NO_SOURCE_STOCK",
  "WMS_CONSOLIDATION_CONFLICT",
  "WMS_TASK_NOT_READY",
  "WMS_LABEL_MISSING",
  "WMS_LABEL_MISMATCH",
  "WMS_CONTROL_PENDING",
  "WMS_WEIGHT_TOLERANCE",
  "WMS_VOLUME_TOLERANCE",
  "WMS_NOT_READY_TO_LOAD",
  "WMS_NOT_RESERVED",
  "WMS_RESOURCE_INCOMPATIBLE",
] as const;

export type WmsErrorCode = (typeof WMS_ERROR_CODES)[number];

export const WMS_ERROR_MESSAGES: Record<WmsErrorCode, { status: number; message: string }> = {
  WMS_FORBIDDEN: { status: 403, message: "No tienes permisos operativos en este almacén o tenant." },
  WMS_TENANT_MISMATCH: { status: 403, message: "El tenant del payload no coincide con la sesión activa." },
  WMS_CROSS_WAREHOUSE_INVALID: { status: 422, message: "No se pueden cruzar ubicaciones, HUs o recursos de almacenes distintos." },
  WMS_DUPLICATE: { status: 409, message: "Conflicto de idempotencia: la clave ya se utilizó con parámetros distintos." },
  WMS_STOCK_NOT_LOCATED: { status: 422, message: "Operación rechazada: el stock no está ubicado (STORED) o su estado de flujo es nulo/en playa." },
  WMS_STOCK_BLOCKED: { status: 422, message: "El stock no está en estado de calidad AVAILABLE." },
  WMS_INSUFFICIENT_PICK_STOCK: { status: 409, message: "Saldo disponible insuficiente en la ubicación de picking." },
  WMS_REPLENISHMENT_PENDING: { status: 409, message: "Existe una reposición pendiente de confirmar hacia esta ubicación de picking." },
  WMS_INSUFFICIENT_STOCK: { status: 409, message: "Saldo libre insuficiente en el quant para completar la reserva." },
  WMS_LOT_MISMATCH: { status: 422, message: "El lote escaneado no coincide con el lote reservado." },
  WMS_LOT_REQUIRED: { status: 422, message: "La política del almacén exige informar el lote en la recepción." },
  WMS_EXPIRY_REQUIRED: { status: 422, message: "La política del almacén exige informar la fecha de caducidad en la recepción." },
  WMS_HU_NOT_UNCHECKED: { status: 422, message: "La unidad de manipulación (HU) no está en estado STAGING_UNCHECKED." },
  WMS_HU_NOT_CHECKED: { status: 422, message: "No se puede ubicar una HU que no haya superado el chequeo de entrada (STAGING_CHECKED)." },
  WMS_BIN_BLOCKED: { status: 422, message: "La ubicación de destino está bloqueada o inactiva." },
  WMS_BIN_CAPACITY: { status: 422, message: "Capacidad de la ubicación superada (pallets, peso o volumen máximo)." },
  WMS_TEMP_MISMATCH: { status: 422, message: "Régimen térmico incompatible entre el artículo y la zona de destino." },
  WMS_ADR_INCOMPATIBLE: { status: 422, message: "Mercancía peligrosa (ADR) incompatible con la zona o ubicación de destino." },
  WMS_LOT_MIX_FORBIDDEN: { status: 422, message: "La política del almacén prohíbe mezclar lotes distintos en la misma ubicación." },
  WMS_NO_SOURCE_STOCK: { status: 409, message: "No existe stock ubicado disponible en reserva para abastecer la reposición." },
  WMS_CONSOLIDATION_CONFLICT: { status: 422, message: "Conflicto de consolidación BY_BATCH: no se pueden agrupar lotes distintos." },
  WMS_TASK_NOT_READY: { status: 409, message: "La tarea no se encuentra en un estado ejecutable (READY/ASSIGNED/IN_PROGRESS)." },
  WMS_LABEL_MISSING: { status: 422, message: "No se puede cargar una HU sin etiqueta SSCC/LPN emitida." },
  WMS_LABEL_MISMATCH: { status: 422, message: "El código de etiqueta escaneado en muelle no coincide con la HU." },
  WMS_CONTROL_PENDING: { status: 422, message: "Control físico de estado pendiente o rechazado antes de expedir." },
  WMS_WEIGHT_TOLERANCE: { status: 422, message: "El peso controlado supera la tolerancia permitida por la política del almacén." },
  WMS_VOLUME_TOLERANCE: { status: 422, message: "El volumen controlado supera la tolerancia permitida por la política del almacén." },
  WMS_NOT_READY_TO_LOAD: { status: 422, message: "La unidad de manipulación no está preparada para carga (PICKED_STAGED)." },
  WMS_NOT_RESERVED: { status: 422, message: "No existe una reserva activa (ALLOCATED) para ejecutar este picking." },
  WMS_RESOURCE_INCOMPATIBLE: { status: 422, message: "El recurso asignado está inactivo o no cumple altura, peso o certificación." },
};

export interface WmsBehaviorPolicyParams {
  capture_lot_on_receipt: boolean;
  capture_expiry_on_receipt: boolean;
  require_qa_check: boolean;
  allowed_bin_types: string[];
  putaway_strategy: "FEFO" | "FIXED" | "CHAOTIC" | "CONSOLIDATE" | "ABC" | "NEAREST";
  allow_mixed_lots_in_bin: boolean;
  allow_mixed_skus_in_bin: boolean;
  max_pallets_per_bin: number;
  capture_lot_on_pick: boolean;
  rotation: "FEFO" | "FIFO" | "LIFO" | "LEFO" | "MANUAL";
  min_remaining_shelf_life_days: number;
  forbid_picking_unlocated: true;
  partial_pick_allowed: boolean;
  replenishment_trigger: "MIN_MAX" | "DEMAND" | "TOP_OFF";
  min_qty: number;
  max_qty: number;
  consolidation: "NO" | "YES" | "BY_BATCH";
  top_off_threshold: number;
  require_label_scan_on_load: boolean;
  weight_tolerance_pct: number;
  volume_tolerance_pct: number;
  require_weight_measurement?: boolean;
  require_volume_measurement?: boolean;
  require_state_control_on_load: boolean;
  allow_cross_dock: boolean;
  require_resource_certification: boolean;
  max_lift_height_m: number;
  max_weight_kg: number;
}

export const DEFAULT_WMS_POLICY: WmsBehaviorPolicyParams = {
  capture_lot_on_receipt: true,
  capture_expiry_on_receipt: true,
  require_qa_check: false,
  allowed_bin_types: [
    "PALLET_RACK",
    "SHELVING",
    "BULK_FLOOR",
    "CANTILEVER",
    "DOCK_STAGE",
    "CROSS_DOCK",
    "DYNAMIC_FLOW",
  ],
  putaway_strategy: "FEFO",
  allow_mixed_lots_in_bin: false,
  allow_mixed_skus_in_bin: false,
  max_pallets_per_bin: 2,
  capture_lot_on_pick: true,
  rotation: "FEFO",
  min_remaining_shelf_life_days: 15,
  forbid_picking_unlocated: true,
  partial_pick_allowed: true,
  replenishment_trigger: "MIN_MAX",
  min_qty: 10,
  max_qty: 50,
  consolidation: "YES",
  top_off_threshold: 0.3,
  require_label_scan_on_load: true,
  weight_tolerance_pct: 5.0,
  volume_tolerance_pct: 10.0,
  require_state_control_on_load: true,
  allow_cross_dock: false,
  require_resource_certification: true,
  max_lift_height_m: 12.0,
  max_weight_kg: 1500.0,
};

export interface WmsPolicyRecord {
  id: string;
  warehouse_id: string;
  owner_party_id: string | null;
  scope: "WAREHOUSE" | "OWNER" | "CATEGORY" | "PRODUCT";
  product_id: string | null;
  category_code: string | null;
  policy_version: number;
  effective_from: string;
  superseded_at: string | null;
  params: Partial<WmsBehaviorPolicyParams>;
}

export interface WmsWarehouse {
  id: string;
  code: string;
  name: string;
  status: string;
  owner_party_id: string | null;
}

export interface WmsZone {
  id: string;
  warehouse_id: string;
  zone_code: string;
  zone_name: string;
  zone_type: string;
  temperature_regime: string;
  is_active: boolean;
}

export interface WmsBin {
  id: string;
  warehouse_id: string;
  zone_id: string | null;
  bin_code: string;
  aisle: string | null;
  rack: string | null;
  shelf: string | null;
  bin_position: string | null;
  bin_type: string;
  max_weight_kg: number | null;
  max_volume_m3: number | null;
  max_pallets: number;
  is_blocked: boolean;
  block_reason: string | null;
  is_active: boolean;
}

export interface WmsProduct {
  id: string;
  sku: string;
  name: string;
  category_code: string | null;
  uom_base: string;
  gross_weight_kg: number | null;
  volume_m3: number | null;
  is_hazardous: boolean;
  is_temperature_controlled: boolean;
  temp_min_c: number | null;
  temp_max_c: number | null;
  shelf_life_days: number | null;
  is_batch_managed: boolean;
  is_serial_managed: boolean;
  owner_party_id: string | null;
}

export interface WmsResource {
  id: string;
  warehouse_id: string;
  code: string;
  name: string;
  resource_type: string;
  status: string;
  max_lift_height_m: number | null;
  max_weight_kg: number | null;
  certifications: string[];
  shift_code: string | null;
  is_active: boolean;
}

export interface WmsHandlingUnit {
  id: string;
  warehouse_id: string;
  code: string;
  code_type: "LPN" | "SSCC";
  hu_type: "PALLET" | "BOX" | "TOTE" | "CONTAINER";
  state: WmsHuState;
  current_bin_id: string | null;
  current_dock_id: string | null;
  owner_party_id: string | null;
  parent_hu_id: string | null;
  gross_weight_kg: number | null;
  volume_m3: number | null;
  label_issued_at: string | null;
  state_controlled_at?: string | null;
  state_controlled_by?: string | null;
  measured_at?: string | null;
  measured_by?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Checks whether an error from querying handling_units is strictly due to
 * missing C-3 columns (PostgreSQL error 42703 undefined_column or matching message).
 * Prevents masking network, RLS or authorization errors (MUST-2).
 */
export function isHuColumnMissingError(err: any): boolean {
  return Boolean(
    err &&
      (err.code === "42703" ||
        (typeof err.message === "string" &&
          (err.message.includes("state_controlled") ||
            err.message.includes("measured_at") ||
            err.message.includes("undefined_column")))),
  );
}

export interface WmsHandlingUnitContent {
  id: string;
  handling_unit_id: string;
  product_id: string;
  batch_number: string | null;
  serial_number: string | null;
  expiry_date: string | null;
  quantity: number;
  uom: string;
}

export interface WmsQuant {
  id: string;
  warehouse_id: string;
  bin_id: string;
  product_id: string;
  owner_party_id: string | null;
  batch_number: string | null;
  serial_number: string | null;
  expiry_date: string | null;
  quantity_on_hand: number;
  quantity_reserved: number;
  uom: string;
  stock_status: string;
  flow_state: WmsFlowState | null;
  hu_id: string | null;
  updated_at: string;
}

export interface WmsReservation {
  id: string;
  quant_id: string;
  hu_id: string | null;
  order_id: string | null;
  order_line_id: string | null;
  trip_id: string | null;
  batch_number: string | null;
  serial_number: string | null;
  quantity: number;
  uom: string;
  status: "HELD" | "ALLOCATED" | "PICKED" | "RELEASED" | "CANCELLED";
  created_at: string;
}

export interface WmsTask {
  id: string;
  warehouse_id: string;
  task_type: string;
  priority: number;
  state: "PROPOSED" | "READY" | "ASSIGNED" | "IN_PROGRESS" | "DONE" | "REJECTED" | "CANCELLED";
  assigned_resource_id: string | null;
  source_bin_id: string | null;
  destination_bin_id: string | null;
  hu_id: string | null;
  product_id: string | null;
  quantity: number | null;
  uom: string | null;
  idempotency_key: string | null;
  reject_code: string | null;
  reject_detail: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface WmsMovement {
  id: string;
  movement_number: string;
  warehouse_id: string;
  movement_type: string;
  product_id: string;
  source_bin_id: string | null;
  destination_bin_id: string | null;
  quantity: number;
  uom: string;
  batch_number: string | null;
  operator_id: string | null;
  resource_id: string | null;
  status: string;
  completed_at: string | null;
  created_at: string;
}

export interface WmsDockAppointmentSummary {
  id: string;
  code: string;
  warehouse_id: string;
  dock_id: string | null;
  direction: string;
  status: string;
  planned_start: string;
  planned_end: string;
  order_id: string | null;
  expedition_id: string | null;
}

export interface WmsPutawayProposal {
  hu_id: string;
  hu_code: string;
  recommended_bin_id: string | null;
  recommended_bin_code: string | null;
  zone_code: string | null;
  temperature_regime: string | null;
  strategy: string;
  rule_applied: string;
  computed_by: "TS_INTERACTIVE";
}

export interface WmsPickProposal {
  quant_id: string;
  bin_id: string;
  bin_code: string;
  product_id: string;
  sku: string;
  batch_number: string | null;
  expiry_date: string | null;
  available_qty: number;
  recommended_qty: number;
  rotation: string;
  rule_applied: string;
  computed_by: "TS_INTERACTIVE";
}

export interface WmsOverviewData {
  schemaReady: boolean;
  warehouses: WmsWarehouse[];
  zones: WmsZone[];
  bins: WmsBin[];
  products: WmsProduct[];
  parties: Array<{ id: string; code: string; legal_name: string }>;
  orders: Array<{ id: string; code: string }>;
  docks: Array<{ id: string; warehouse_id: string; code: string; name: string }>;
  appointments: WmsDockAppointmentSummary[];
  policies: WmsPolicyRecord[];
  resources: WmsResource[];
  handlingUnits: WmsHandlingUnit[];
  huContents: WmsHandlingUnitContent[];
  quants: WmsQuant[];
  reservations: WmsReservation[];
  tasks: WmsTask[];
  movements: WmsMovement[];
}

export const EMPTY_WMS_DATA: WmsOverviewData = {
  schemaReady: false,
  warehouses: [],
  zones: [],
  bins: [],
  products: [],
  parties: [],
  orders: [],
  docks: [],
  appointments: [],
  policies: [],
  resources: [],
  handlingUnits: [],
  huContents: [],
  quants: [],
  reservations: [],
  tasks: [],
  movements: [],
};

const SCOPE_ORDER: Record<WmsPolicyRecord["scope"], number> = {
  WAREHOUSE: 1,
  OWNER: 2,
  CATEGORY: 3,
  PRODUCT: 4,
};

/**
 * Resolves the effective warehouse policy using the exact precedence:
 * WAREHOUSE -> OWNER -> CATEGORY -> PRODUCT, enforcing forbid_picking_unlocated = true.
 */
export function resolveEffectiveWmsPolicy(
  policies: WmsPolicyRecord[],
  warehouseId: string,
  ownerPartyId?: string | null,
  productId?: string | null,
  categoryCode?: string | null,
): WmsBehaviorPolicyParams {
  const applicable = policies
    .filter((p) => {
      if (p.warehouse_id !== warehouseId || p.superseded_at !== null) return false;
      if (p.scope === "WAREHOUSE") return true;
      if (p.scope === "OWNER") return !!ownerPartyId && p.owner_party_id === ownerPartyId;
      if (p.scope === "CATEGORY") {
        return (
          !!categoryCode &&
          p.category_code === categoryCode &&
          (!p.owner_party_id || p.owner_party_id === ownerPartyId)
        );
      }
      if (p.scope === "PRODUCT") {
        return (
          !!productId &&
          p.product_id === productId &&
          (!p.owner_party_id || p.owner_party_id === ownerPartyId)
        );
      }
      return false;
    })
    .sort((a, b) => {
      const scopeDiff = SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope];
      return scopeDiff !== 0 ? scopeDiff : a.policy_version - b.policy_version;
    });

  let merged: WmsBehaviorPolicyParams = { ...DEFAULT_WMS_POLICY };
  for (const row of applicable) {
    merged = {
      ...merged,
      ...row.params,
      forbid_picking_unlocated: true,
    };
  }
  merged.forbid_picking_unlocated = true;
  return merged;
}

/**
 * Interactive TypeScript Putaway Proposal Engine (TS_INTERACTIVE).
 * Evaluates candidate storage bins against temperature, ADR, capacity, and lot-mixing rules.
 */
export function computePutawayProposal(params: {
  hu: WmsHandlingUnit;
  content: WmsHandlingUnitContent | undefined;
  product: WmsProduct | undefined;
  bins: WmsBin[];
  zones: WmsZone[];
  quants: WmsQuant[];
  allHus: WmsHandlingUnit[];
  policy: WmsBehaviorPolicyParams;
}): WmsPutawayProposal {
  const { hu, content, product, bins, zones, quants, allHus, policy } = params;
  const zoneById = new Map(zones.map((z) => [z.id, z]));

  const candidates = bins
    .filter((bin) => {
      if (bin.warehouse_id !== hu.warehouse_id) return false;
      if (!bin.is_active || bin.is_blocked) return false;
      if (bin.bin_type === "DOCK_STAGE" || bin.bin_type === "CROSS_DOCK") return false;
      if (
        policy.allowed_bin_types?.length &&
        !policy.allowed_bin_types.includes(bin.bin_type)
      ) {
        return false;
      }

      const zone = bin.zone_id ? zoneById.get(bin.zone_id) : undefined;
      if (zone && !zone.is_active) return false;
      if (zone && !["STORAGE", "PICKING"].includes(zone.zone_type)) return false;

      // Temperature check
      if (product?.is_temperature_controlled && zone) {
        if (product.temp_max_c !== null && product.temp_max_c <= 0 && zone.temperature_regime !== "FROZEN") {
          return false;
        }
        if (
          product.temp_max_c !== null &&
          product.temp_max_c > 0 &&
          product.temp_max_c <= 8 &&
          !["CHILLED", "CONTROLLED"].includes(zone.temperature_regime)
        ) {
          return false;
        }
        if (zone.temperature_regime === "AMBIENT") return false;
      }

      // ADR check
      if (product?.is_hazardous && zone?.zone_code.includes("NO-ADR")) {
        return false;
      }

      // Capacity check
      const storedInBin = allHus.filter(
        (other) =>
          other.is_active &&
          other.state === "STORED" &&
          other.current_bin_id === bin.id &&
          other.id !== hu.id,
      );
      if (bin.max_pallets > 0 && storedInBin.length + 1 > bin.max_pallets) {
        return false;
      }
      const currentWeight = storedInBin.reduce((acc, h) => acc + (h.gross_weight_kg ?? 0), 0);
      if (bin.max_weight_kg !== null && currentWeight + (hu.gross_weight_kg ?? 0) > bin.max_weight_kg) {
        return false;
      }
      const currentVol = storedInBin.reduce((acc, h) => acc + (h.volume_m3 ?? 0), 0);
      if (bin.max_volume_m3 !== null && currentVol + (hu.volume_m3 ?? 0) > bin.max_volume_m3) {
        return false;
      }

      // Lot mixing check
      if (!policy.allow_mixed_lots_in_bin && content?.batch_number) {
        const conflictingLot = quants.some(
          (q) =>
            q.bin_id === bin.id &&
            q.quantity_on_hand > 0 &&
            q.batch_number !== content.batch_number &&
            q.hu_id !== hu.id,
        );
        if (conflictingLot) return false;
      }

      return true;
    })
    .sort((a, b) => {
      if (policy.putaway_strategy === "CONSOLIDATE") {
        const aSameBatch = quants.some(
          (q) => q.bin_id === a.id && q.product_id === product?.id && q.batch_number === content?.batch_number,
        );
        const bSameBatch = quants.some(
          (q) => q.bin_id === b.id && q.product_id === product?.id && q.batch_number === content?.batch_number,
        );
        if (aSameBatch !== bSameBatch) return aSameBatch ? -1 : 1;
      }
      return a.bin_code.localeCompare(b.bin_code);
    });

  const best = candidates[0];
  const bestZone = best?.zone_id ? zoneById.get(best.zone_id) : undefined;

  return {
    hu_id: hu.id,
    hu_code: hu.code,
    recommended_bin_id: best?.id ?? null,
    recommended_bin_code: best?.bin_code ?? null,
    zone_code: bestZone?.zone_code ?? null,
    temperature_regime: bestZone?.temperature_regime ?? null,
    strategy: policy.putaway_strategy,
    rule_applied: best
      ? `Estrategia ${policy.putaway_strategy} · Régimen ${bestZone?.temperature_regime ?? "AMBIENT"} · Capacidad OK (${best.max_pallets} pal.) · Mezcla lote=${policy.allow_mixed_lots_in_bin ? "SÍ" : "NO"}`
      : "Sin hueco compatible disponible (verificar capacidad, bloqueo, temperatura o mezcla de lote)",
    computed_by: "TS_INTERACTIVE",
  };
}

/**
 * Interactive TypeScript Pick Allocation Proposal Engine (TS_INTERACTIVE).
 * Strictly enforces flow_state IN ('STORED', 'RESERVED') — legacy NULL is rejected fail-closed.
 */
export function computePickAllocationProposals(params: {
  warehouseId: string;
  productId?: string;
  requiredQty?: number;
  quants: WmsQuant[];
  bins: WmsBin[];
  products: WmsProduct[];
  tasks: WmsTask[];
  policy: WmsBehaviorPolicyParams;
}): WmsPickProposal[] {
  const { warehouseId, productId, requiredQty = 10, quants, bins, products, tasks, policy } = params;
  const binById = new Map(bins.map((b) => [b.id, b]));
  const prodById = new Map(products.map((p) => [p.id, p]));

  const eligible = quants
    .filter((q) => {
      if (q.warehouse_id !== warehouseId) return false;
      if (productId && q.product_id !== productId) return false;
      // Golden Rule + MUST-D3: NULL or non-STORED flow_state is never eligible for picking
      if (q.flow_state !== "STORED" && q.flow_state !== "RESERVED") return false;
      if (q.stock_status !== "AVAILABLE" && q.stock_status !== "RESERVED") return false;
      const free = q.quantity_on_hand - q.quantity_reserved;
      if (free <= 0) return false;
      const hasPendingReplenish = tasks.some(
        (t) =>
          t.destination_bin_id === q.bin_id &&
          t.product_id === q.product_id &&
          t.task_type === "REPLENISH" &&
          ["PROPOSED", "READY", "ASSIGNED", "IN_PROGRESS"].includes(t.state),
      );
      if (hasPendingReplenish) return false;
      return true;
    })
    .sort((a, b) => {
      if (policy.rotation === "FEFO") {
        const expA = a.expiry_date ?? "9999-12-31";
        const expB = b.expiry_date ?? "9999-12-31";
        if (expA !== expB) return expA.localeCompare(expB);
      } else if (policy.rotation === "LEFO") {
        const expA = a.expiry_date ?? "0000-01-01";
        const expB = b.expiry_date ?? "0000-01-01";
        if (expA !== expB) return expB.localeCompare(expA);
      } else if (policy.rotation === "LIFO") {
        return b.updated_at.localeCompare(a.updated_at);
      }
      return a.updated_at.localeCompare(b.updated_at);
    });

  let remaining = requiredQty;
  const proposals: WmsPickProposal[] = [];

  for (const q of eligible) {
    if (remaining <= 0 && productId) break;
    const free = Number((q.quantity_on_hand - q.quantity_reserved).toFixed(3));
    const take = productId ? Math.min(free, remaining) : free;
    if (take <= 0) continue;
    remaining -= take;
    const bin = binById.get(q.bin_id);
    const prod = prodById.get(q.product_id);
    proposals.push({
      quant_id: q.id,
      bin_id: q.bin_id,
      bin_code: bin?.bin_code ?? "—",
      product_id: q.product_id,
      sku: prod?.sku ?? "—",
      batch_number: q.batch_number,
      expiry_date: q.expiry_date,
      available_qty: free,
      recommended_qty: take,
      rotation: policy.rotation,
      rule_applied: `Rotación ${policy.rotation} · flow_state=${q.flow_state} · Lote ${q.batch_number ?? "S/L"}${q.expiry_date ? ` · Cad. ${q.expiry_date}` : ""}`,
      computed_by: "TS_INTERACTIVE",
    });
  }

  return proposals;
}

export function wmsRpcFailure(error: { code?: string; message?: string } | null | undefined): {
  status: number;
  code: string;
  error: string;
} {
  const rawMessage = String(error?.message ?? "");
  for (const code of WMS_ERROR_CODES) {
    if (rawMessage.includes(code)) {
      const entry = WMS_ERROR_MESSAGES[code];
      return {
        status: entry.status,
        code,
        error: `${code}: ${entry.message}`,
      };
    }
  }
  return {
    status: 503,
    code: error?.code ?? "WMS_UNEXPECTED_ERROR",
    error: "No se pudo completar la operación de almacén.",
  };
}

export function validateWmsActionPayloadSecurity(
  action: string,
  payload: unknown,
): { error: string; code: string; status: number } | null {
  if (!WMS_ACTIONS.includes(action as WmsAction)) {
    return {
      error: "WMS_FORBIDDEN: Acción de almacén no reconocida.",
      code: "WMS_FORBIDDEN",
      status: 400,
    };
  }

  const p =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};

  if (
    "state_controlled" in p ||
    "expected_weight_kg" in p ||
    "expected_volume_m3" in p
  ) {
    return {
      error:
        "WMS_FORBIDDEN: Los campos de control de estado y magnitudes esperadas son de cálculo exclusivo en servidor y no pueden enviarse desde el cliente.",
      code: "WMS_FORBIDDEN",
      status: 400,
    };
  }

  if (
    action === "REPLENISH" &&
    ("consolidation" in p || "conflicting_batch" in p)
  ) {
    return {
      error:
        "WMS_FORBIDDEN: La política de consolidación es de cálculo exclusivo en servidor y no puede ser anulada desde el cliente.",
      code: "WMS_FORBIDDEN",
      status: 400,
    };
  }

  return null;
}

export interface WmsAuthContextLike {
  userId: string;
  tenantId: string;
  role: string;
}

export async function executeWmsActionApi(
  request: Request,
  authContext: WmsAuthContextLike | null,
  rpcExecutor?: (action: WmsAction, payload: unknown, idemKey: string | null) => Promise<unknown>,
): Promise<Response> {
  if (!authContext) {
    return Response.json({ error: "No autorizado.", code: "WMS_FORBIDDEN" }, { status: 401 });
  }

  const EDIT_ROLES = new Set(["OWNER", "ADMIN", "PLANNER", "OPERATOR"]);
  const CONFIG_ROLES = new Set(["OWNER", "ADMIN", "PLANNER"]);

  if (!EDIT_ROLES.has(authContext.role)) {
    return Response.json(
      {
        error: "WMS_FORBIDDEN: No tienes permisos operativos en este almacén.",
        code: "WMS_FORBIDDEN",
      },
      { status: 403 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "JSON no válido.", code: "WMS_FORBIDDEN" }, { status: 400 });
  }

  const rawAction = String(body.action ?? "");
  const securityViolation = validateWmsActionPayloadSecurity(rawAction, body.payload);
  if (securityViolation) {
    return Response.json(
      { error: securityViolation.error, code: securityViolation.code },
      { status: securityViolation.status },
    );
  }

  const action = rawAction as WmsAction;
  if ((action === "UPSERT_POLICY" || action === "UPSERT_RESOURCE") && !CONFIG_ROLES.has(authContext.role)) {
    return Response.json(
      {
        error: "WMS_FORBIDDEN: Se requiere rol de planificación o administración.",
        code: "WMS_FORBIDDEN",
      },
      { status: 403 },
    );
  }

  if (rpcExecutor) {
    const payload = body.payload && typeof body.payload === "object" ? body.payload : {};
    const idemKey = typeof body.idempotency_key === "string" ? body.idempotency_key.trim() : null;
    const result = await rpcExecutor(action, payload, idemKey);
    return Response.json(result, { status: 200 });
  }

  return Response.json({ ok: true, action }, { status: 200 });
}

