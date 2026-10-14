import { createSupabaseAdmin } from "./supabase-admin";
import { DEFAULT_DOCK_POLICY, EMPTY_DOCK_DATA, type DockData } from "./docks";
export async function loadDockData(
  tenantId: string,
  from: string,
  until: string,
): Promise<DockData> {
  const db = createSupabaseAdmin();
  const specs = [
    ["warehouses", "id,code,name,address_id", "code"],
    [
      "warehouse_zones",
      "id,warehouse_id,zone_name,temperature_regime",
      "zone_name",
    ],
    ["warehouse_docks", "*", "sort_order"],
    ["dock_appointment_rules", "*", "code"],
    ["dock_policies", "warehouse_id,parameters,notifications", "warehouse_id"],
    [
      "address_operational_profiles",
      "address_id,opening_hours,holiday_exceptions",
      "address_id",
    ],
    ["trip_stops", "id,trip_id,sequence,full_address", "id"],
    [
      "trips",
      "id,code,carrier_id,vehicle_id,driver_id,trailer_registration",
      "code",
    ],
    ["parties", "id,code,legal_name", "code"],
    ["vehicles", "id,registration,capacity_weight,adr_enabled", "registration"],
    ["drivers", "id,name,adr_qualified", "name"],
    ["orders", "id,code,adr", "code"],
    ["expeditions", "id,code", "code"],
  ];
  const results = await Promise.all(
    specs.map(([table, fields, sort]) =>
      db
        .from(table)
        .select(fields)
        .eq("tenant_id", tenantId)
        .order(sort)
        .limit(1000),
    ),
  );
  const appointmentResult = await db
    .from("dock_appointments")
    .select("*")
    .eq("tenant_id", tenantId)
    .lt("planned_start", until)
    .gt("planned_end", from)
    .order("planned_start")
    .limit(1000);
  if (results.some((result) => result.error) || appointmentResult.error)
    throw new Error(
      "No se pudieron cargar los muelles. Comprueba la disponibilidad del módulo.",
    );
  const keys = [
    "warehouses",
    "zones",
    "docks",
    "rules",
    "policies",
    "profiles",
    "stops",
    "trips",
    "carriers",
    "vehicles",
    "drivers",
    "orders",
    "expeditions",
  ] as const;
  const data = { ...EMPTY_DOCK_DATA };
  keys.forEach((key, i) => {
    Object.assign(data, { [key]: results[i].data });
  });
  data.appointments = appointmentResult.data ?? [];
  data.policies = data.warehouses.map(
    (warehouse) =>
      data.policies.find((row) => row.warehouse_id === warehouse.id) ?? {
        warehouse_id: warehouse.id,
        parameters: DEFAULT_DOCK_POLICY,
        notifications: {
          confirmation: true,
          reminder: true,
          late: true,
          release: true,
        },
      },
  );
  data.truncated =
    results.some((result) => result.data?.length === 1000) ||
    data.appointments.length === 1000;
  if (data.appointments.length) {
    const ids = data.appointments.map((row) => row.id);
    // Chunked to keep URL length bounded. Every query is explicitly scoped.
    for (let i = 0; i < ids.length; i += 100) {
      const [events, audits] = await Promise.all([
        db
          .from("transport_events")
          .select(
            "id,dock_appointment_id,event_type,occurred_at,actor_user_id,payload",
          )
          .eq("tenant_id", tenantId)
          .in("dock_appointment_id", ids.slice(i, i + 100))
          .order("occurred_at")
          .limit(1000),
        db
          .from("audit_events")
          .select("id,entity_id,action,occurred_at,actor_user_id,source_channel,reason")
          .eq("tenant_id", tenantId)
          .eq("entity_type", "DOCK_APPOINTMENT")
          .in("entity_id", ids.slice(i, i + 100))
          .order("occurred_at")
          .limit(1000),
      ]);
      if (events.error || audits.error)
        throw new Error("No se pudo cargar la trazabilidad de muelles.");
      data.events = [...data.events, ...(events.data ?? [])];
      data.audits = [...data.audits, ...(audits.data ?? [])];
      data.truncated ||=
        events.data?.length === 1000 || audits.data?.length === 1000;
    }
  }
  const actorIds = [
    ...new Set(
      [...data.events, ...data.audits]
        .map((row) => row.actor_user_id)
        .filter((id): id is string => !!id),
    ),
  ];
  if (actorIds.length) {
    const members = await db
      .from("tenant_members")
      .select("user_id")
      .eq("tenant_id", tenantId)
      .in("user_id", actorIds)
      .limit(100);
    if (members.error) throw new Error("No se pudo cargar la autoría.");
    data.actorNames = {};
    for (let i = 0; i < (members.data?.length ?? 0); i += 10) {
      await Promise.all(
        (members.data ?? []).slice(i, i + 10).map(async (member) => {
          const user = await db.auth.admin.getUserById(member.user_id);
          const name =
            user.data.user?.user_metadata?.full_name ??
            user.data.user?.user_metadata?.name;
          data.actorNames[member.user_id] =
            typeof name === "string" && name.length <= 120
              ? name
              : "Usuario de la empresa";
        }),
      );
    }
  }
  return data;
}
