import { createSupabaseAdmin } from "./supabase-admin";
import { EMPTY_WMS_DATA, type WmsOverviewData } from "./wms";

export async function loadWmsData(
  tenantId: string,
  warehouseId?: string,
): Promise<WmsOverviewData> {
  const db = createSupabaseAdmin();

  const basePromises = [
    db
      .from("warehouses")
      .select("id,code,name,status,owner_party_id")
      .eq("tenant_id", tenantId)
      .order("code")
      .limit(500),
    db
      .from("warehouse_zones")
      .select("id,warehouse_id,zone_code,zone_name,zone_type,temperature_regime,is_active")
      .eq("tenant_id", tenantId)
      .order("zone_code")
      .limit(1000),
    db
      .from("warehouse_bins")
      .select(
        "id,warehouse_id,zone_id,bin_code,aisle,rack,shelf,bin_position,bin_type,max_weight_kg,max_volume_m3,max_pallets,is_blocked,block_reason,is_active",
      )
      .eq("tenant_id", tenantId)
      .order("bin_code")
      .limit(1000),
    db
      .from("products")
      .select(
        "id,sku,name,category_code,uom_base,gross_weight_kg,volume_m3,is_hazardous,is_temperature_controlled,temp_min_c,temp_max_c,shelf_life_days,is_batch_managed,is_serial_managed,owner_party_id",
      )
      .eq("tenant_id", tenantId)
      .order("sku")
      .limit(500),
    db
      .from("parties")
      .select("id,code,legal_name")
      .eq("tenant_id", tenantId)
      .order("code")
      .limit(500),
    db
      .from("orders")
      .select("id,code")
      .eq("tenant_id", tenantId)
      .order("code")
      .limit(500),
    db
      .from("warehouse_docks")
      .select("id,warehouse_id,code,name")
      .eq("tenant_id", tenantId)
      .order("code")
      .limit(500),
    db
      .from("dock_appointments")
      .select("id,code,warehouse_id,dock_id,direction,status,planned_start,planned_end,order_id,expedition_id")
      .eq("tenant_id", tenantId)
      .in("status", ["CONFIRMED", "CHECKED_IN", "AT_DOCK", "OPERATION_ENDED"])
      .order("planned_start", { ascending: false })
      .limit(300),
    db
      .from("inventory_movements")
      .select(
        "id,movement_number,warehouse_id,movement_type,product_id,source_bin_id,destination_bin_id,quantity,uom,batch_number,operator_id,status,completed_at,created_at",
      )
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(500),
  ];

  const baseResults = await Promise.all(basePromises);
  if (baseResults.some((r) => r.error)) {
    throw new Error("No se pudieron cargar los datos maestros de almacenes.");
  }

  // Query inventory_quants with flow_state & hu_id if migration is applied, fallback to base columns otherwise
  let quantsData: WmsOverviewData["quants"] = [];
  let schemaReady = true;

  const quantsE1 = await db
    .from("inventory_quants")
    .select(
      "id,warehouse_id,bin_id,product_id,owner_party_id,batch_number,serial_number,expiry_date,quantity_on_hand,quantity_reserved,uom,stock_status,flow_state,hu_id,updated_at",
    )
    .eq("tenant_id", tenantId)
    .order("updated_at", { ascending: false })
    .limit(1000);

  if (quantsE1.error) {
    schemaReady = false;
    const quantsFallback = await db
      .from("inventory_quants")
      .select(
        "id,warehouse_id,bin_id,product_id,owner_party_id,batch_number,serial_number,expiry_date,quantity_on_hand,quantity_reserved,uom,stock_status,updated_at",
      )
      .eq("tenant_id", tenantId)
      .order("updated_at", { ascending: false })
      .limit(1000);
    if (quantsFallback.error) {
      throw new Error("No se pudo cargar el inventario de almacenes.");
    }
    quantsData = (quantsFallback.data ?? []).map((q: any) => ({
      ...q,
      quantity_on_hand: Number(q.quantity_on_hand ?? 0),
      quantity_reserved: Number(q.quantity_reserved ?? 0),
      flow_state: null,
      hu_id: null,
    }));
  } else {
    quantsData = (quantsE1.data ?? []).map((q: any) => ({
      ...q,
      quantity_on_hand: Number(q.quantity_on_hand ?? 0),
      quantity_reserved: Number(q.quantity_reserved ?? 0),
    }));
  }

  let policies: WmsOverviewData["policies"] = [];
  let resources: WmsOverviewData["resources"] = [];
  let handlingUnits: WmsOverviewData["handlingUnits"] = [];
  let huContents: WmsOverviewData["huContents"] = [];
  let reservations: WmsOverviewData["reservations"] = [];
  let tasks: WmsOverviewData["tasks"] = [];

  if (schemaReady) {
    const e1Results = await Promise.all([
      db
        .from("warehouse_behavior_policies")
        .select("id,warehouse_id,owner_party_id,scope,product_id,category_code,policy_version,effective_from,superseded_at,params")
        .eq("tenant_id", tenantId)
        .is("superseded_at", null)
        .order("policy_version", { ascending: false })
        .limit(500),
      db
        .from("warehouse_resources")
        .select("id,warehouse_id,code,name,resource_type,status,max_lift_height_m,max_weight_kg,certifications,shift_code,is_active")
        .eq("tenant_id", tenantId)
        .order("code")
        .limit(500),
      db
        .from("handling_units")
        .select(
          "id,warehouse_id,code,code_type,hu_type,state,current_bin_id,current_dock_id,owner_party_id,parent_hu_id,gross_weight_kg,volume_m3,label_issued_at,is_active,created_at,updated_at",
        )
        .eq("tenant_id", tenantId)
        .order("code")
        .limit(1000),
      db
        .from("handling_unit_contents")
        .select("id,handling_unit_id,product_id,batch_number,serial_number,expiry_date,quantity,uom")
        .eq("tenant_id", tenantId)
        .limit(1000),
      db
        .from("stock_reservations")
        .select("id,quant_id,hu_id,order_id,order_line_id,trip_id,batch_number,serial_number,quantity,uom,status,created_at")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(1000),
      db
        .from("warehouse_tasks")
        .select(
          "id,warehouse_id,task_type,priority,state,assigned_resource_id,source_bin_id,destination_bin_id,hu_id,product_id,quantity,uom,idempotency_key,reject_code,reject_detail,created_at,completed_at",
        )
        .eq("tenant_id", tenantId)
        .order("priority", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(1000),
    ]);

    if (e1Results.some((r) => r.error)) {
      schemaReady = false;
    } else {
      policies = (e1Results[0].data ?? []) as any;
      resources = (e1Results[1].data ?? []).map((r: any) => ({
        ...r,
        max_lift_height_m: r.max_lift_height_m !== null ? Number(r.max_lift_height_m) : null,
        max_weight_kg: r.max_weight_kg !== null ? Number(r.max_weight_kg) : null,
        certifications: Array.isArray(r.certifications) ? r.certifications : [],
      }));
      handlingUnits = (e1Results[2].data ?? []).map((h: any) => ({
        ...h,
        gross_weight_kg: h.gross_weight_kg !== null ? Number(h.gross_weight_kg) : null,
        volume_m3: h.volume_m3 !== null ? Number(h.volume_m3) : null,
      }));
      huContents = (e1Results[3].data ?? []).map((c: any) => ({
        ...c,
        quantity: Number(c.quantity ?? 0),
      }));
      reservations = (e1Results[4].data ?? []).map((s: any) => ({
        ...s,
        quantity: Number(s.quantity ?? 0),
      }));
      tasks = (e1Results[5].data ?? []).map((t: any) => ({
        ...t,
        quantity: t.quantity !== null ? Number(t.quantity) : null,
      }));
    }
  }

  const filterWh = <T extends { warehouse_id: string }>(rows: T[]): T[] =>
    warehouseId ? rows.filter((r) => r.warehouse_id === warehouseId) : rows;

  return {
    ...EMPTY_WMS_DATA,
    schemaReady,
    warehouses: (baseResults[0].data ?? []) as any,
    zones: filterWh((baseResults[1].data ?? []) as any),
    bins: filterWh(
      ((baseResults[2].data ?? []) as any[]).map((b) => ({
        ...b,
        max_weight_kg: b.max_weight_kg !== null ? Number(b.max_weight_kg) : null,
        max_volume_m3: b.max_volume_m3 !== null ? Number(b.max_volume_m3) : null,
        max_pallets: Number(b.max_pallets ?? 1),
      })),
    ),
    products: ((baseResults[3].data ?? []) as any[]).map((p) => ({
      ...p,
      gross_weight_kg: p.gross_weight_kg !== null ? Number(p.gross_weight_kg) : null,
      volume_m3: p.volume_m3 !== null ? Number(p.volume_m3) : null,
      temp_min_c: p.temp_min_c !== null ? Number(p.temp_min_c) : null,
      temp_max_c: p.temp_max_c !== null ? Number(p.temp_max_c) : null,
    })),
    parties: (baseResults[4].data ?? []) as any,
    orders: (baseResults[5].data ?? []) as any,
    docks: filterWh((baseResults[6].data ?? []) as any),
    appointments: filterWh((baseResults[7].data ?? []) as any),
    movements: filterWh(
      ((baseResults[8].data ?? []) as any[]).map((m) => ({
        ...m,
        quantity: Number(m.quantity ?? 0),
        resource_id: m.resource_id ?? null,
      })),
    ),
    quants: filterWh(quantsData),
    policies: filterWh(policies),
    resources: filterWh(resources),
    handlingUnits: filterWh(handlingUnits),
    huContents,
    reservations,
    tasks: filterWh(tasks),
  };
}
