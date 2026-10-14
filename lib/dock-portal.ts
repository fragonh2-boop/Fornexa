import { createSupabaseAdmin } from "./supabase-admin";
import {
  dockPortalTokenIsValid,
  dockPortalTokenHash,
} from "./dock-portal-validation";
import {
  ACTIVE_DOCK_STATUSES,
  availableDocks,
  overlaps,
  type Appointment,
  type Dock,
  type DockRule,
  validatePolicy,
} from "./docks";
import {
  calendarParts,
  isWithinOpeningHours,
  validateOpeningHours,
  validateHolidayExceptions,
  zonedInstant,
} from "./operational-calendar";
export async function resolveDockPortal(token: string) {
  if (!dockPortalTokenIsValid(token)) return null;
  const db = createSupabaseAdmin(),
    tokenHash = dockPortalTokenHash(token);
  const result = await db
    .from("dock_portal_access")
    .select("id,tenant_id,carrier_party_id,warehouse_id,expires_at,created_by")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (result.error) throw new Error("Portal no disponible.");
  if (!result.data) return null;
  const issuer = await db
    .from("tenant_members")
    .select("user_id")
    .eq("tenant_id", result.data.tenant_id)
    .eq("user_id", result.data.created_by)
    .eq("status", "ACTIVE")
    .in("role", ["OWNER", "ADMIN"])
    .maybeSingle();
  if (issuer.error) throw new Error("Portal no disponible.");
  return issuer.data ? { db, tokenHash, access: result.data } : null;
}
export type PortalView = {
  warehouse: string;
  timezone: string;
  date: string;
  instructions: string;
  rules: { code: string; cargo: string; minutes: number }[];
  selectedRule: string;
  slots: { start: string; end: string; remaining: number; capacity: number }[];
  appointments: { code: string; start: string; end: string; status: string }[];
  warning: boolean;
  suspended: boolean;
};
export async function loadDockPortal(
  context: NonNullable<Awaited<ReturnType<typeof resolveDockPortal>>>,
  requestedDate?: string,
  requestedRule?: string,
  direction = "INBOUND",
): Promise<PortalView> {
  const { db, access } = context,
    tenant = access.tenant_id;
  const [warehouse, policy, carrier, blocks, rules, docks, trips] =
    await Promise.all([
      db
        .from("warehouses")
        .select("name,address_id,status")
        .eq("tenant_id", tenant)
        .eq("id", access.warehouse_id)
        .single(),
      db
        .from("dock_policies")
        .select("parameters")
        .eq("tenant_id", tenant)
        .eq("warehouse_id", access.warehouse_id)
        .single(),
      db
        .from("carrier_profiles")
        .select("qualification_status,insurance_expiry_date")
        .eq("tenant_id", tenant)
        .eq("party_id", access.carrier_party_id)
        .single(),
      db
        .from("customer_blocks")
        .select("behavior")
        .eq("tenant_id", tenant)
        .eq("party_id", access.carrier_party_id)
        .is("released_at", null),
      db
        .from("dock_appointment_rules")
        .select("*")
        .eq("tenant_id", tenant)
        .eq("warehouse_id", access.warehouse_id)
        .eq("is_active", true)
        .order("code")
        .limit(100),
      db
        .from("warehouse_docks")
        .select("*")
        .eq("tenant_id", tenant)
        .eq("warehouse_id", access.warehouse_id)
        .eq("is_active", true)
        .eq("status", "ACTIVE")
        .order("sort_order")
        .limit(1000),
      db
        .from("trips")
        .select("id")
        .eq("tenant_id", tenant)
        .eq("carrier_id", access.carrier_party_id)
        .order("planned_start", { ascending: false })
        .limit(100),
    ]);
  if (
    [warehouse, policy, carrier, blocks, rules, docks, trips].some(
      (r) => r.error,
    ) ||
    !policy.data ||
    !carrier.data ||
    !blocks.data ||
    !warehouse.data?.address_id ||
    warehouse.data.status !== "ACTIVE"
  )
    throw new Error("Portal no disponible.");
  const profile = await db
    .from("address_operational_profiles")
    .select(
      "opening_hours,holiday_exceptions,access_instructions,requires_appointment",
    )
    .eq("tenant_id", tenant)
    .eq("address_id", warehouse.data.address_id)
    .single();
  if (profile.error || !profile.data?.requires_appointment)
    throw new Error("Portal no disponible.");
  const opening = validateOpeningHours(profile.data.opening_hours),
    holidays = validateHolidayExceptions(profile.data.holiday_exceptions),
    parameters = validatePolicy(policy.data.parameters);
  const date =
    requestedDate ??
    calendarParts(
      new Date(Date.now() + parameters.min_lead_minutes * 60000),
      opening.timezone,
    ).date;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date
  )
    throw new Error("Fecha no válida.");
  const today = calendarParts(new Date(), opening.timezone).date;
  const lastDay = calendarParts(
    new Date(Date.now() + parameters.horizon_days * 86400000),
    opening.timezone,
  ).date;
  if (date < today || date > lastDay) throw new Error("Fecha no disponible.");
  const allRules = (rules.data ?? []) as DockRule[],
    compatibleRules = allRules.filter(
      (r) => r.direction === "BOTH" || r.direction === direction,
    ),
    rule =
      compatibleRules.find((r) => r.code === requestedRule) ??
      (!requestedRule ? compatibleRules[0] : undefined);
  if (!rule) throw new Error("Regla no disponible.");
  const rangeStart = zonedInstant(date, "00:00", opening.timezone),
    rangeEnd = new Date(Date.parse(rangeStart) + 27 * 3600000).toISOString();
  const busy = await db
    .from("dock_appointments")
    .select(
      "id,dock_id,rule_id,status,booking_kind,planned_start,planned_end,buffer_minutes",
    )
    .eq("tenant_id", tenant)
    .eq("warehouse_id", access.warehouse_id)
    .lt("planned_start", rangeEnd)
    .gt(
      "planned_end",
      new Date(Date.parse(rangeStart) - 4 * 3600000).toISOString(),
    )
    .in("status", ACTIVE_DOCK_STATUSES)
    .eq("booking_kind", "FIRM")
    .limit(1000);
  if (busy.error || busy.data.length === 1000)
    throw new Error("Disponibilidad no disponible.");
  let mine: {
    code: string;
    planned_start: string;
    planned_end: string;
    status: string;
    metadata: Record<string, unknown>;
  }[] = [];
  if (trips.data?.length) {
    const stops = await db
      .from("trip_stops")
      .select("id")
      .eq("tenant_id", tenant)
      .eq("address_id", warehouse.data.address_id)
      .in(
        "trip_id",
        trips.data.map((t) => t.id),
      )
      .limit(200);
    if (stops.error) throw new Error("Portal no disponible.");
    if (stops.data?.length) {
      const own = await db
        .from("dock_appointments")
        .select("code,planned_start,planned_end,status,metadata")
        .eq("tenant_id", tenant)
        .eq("warehouse_id", access.warehouse_id)
        .in(
          "trip_stop_id",
          stops.data.map((s) => s.id),
        )
        .gt("planned_start", new Date(Date.now() - 30 * 86400000).toISOString())
        .order("planned_start", { ascending: false })
        .limit(100);
      if (own.error) throw new Error("Portal no disponible.");
      mine = own.data ?? [];
    }
  }
  const noShows = mine.filter(
    (a) => a.status === "NO_SHOW" && a.metadata.attributed_to === "CARRIER",
  ).length;
  const suspended =
    blocks.data.some((b) => b.behavior === "HARD") ||
    carrier.data.qualification_status !== "APPROVED" ||
    (!!carrier.data.insurance_expiry_date &&
      carrier.data.insurance_expiry_date <
        new Date().toISOString().slice(0, 10)) ||
    noShows >= parameters.no_show_limit;
  const slots: PortalView["slots"] = [];
  if (!suspended)
    for (let minutes = 0; minutes < 24 * 60; minutes += 30) {
      let start: string;
      try {
        start = zonedInstant(
          date,
          `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`,
          opening.timezone,
        );
      } catch {
        continue;
      }
      const end = new Date(
        Date.parse(start) + rule.default_duration_minutes * 60000,
      ).toISOString();
      if (
        Date.parse(start) < Date.now() + parameters.min_lead_minutes * 60000 ||
        Date.parse(start) > Date.now() + parameters.horizon_days * 86400000 ||
        !isWithinOpeningHours(start, end, opening, holidays)
      )
        continue;
      const resources = (docks.data ?? []) as Dock[],
        available = availableDocks(
          resources,
          busy.data as Appointment[],
          start,
          end,
          undefined,
          rule.cargo_profile,
        ),
        count = busy.data.filter(
          (a) =>
            a.rule_id === rule.id &&
            overlaps(
              start,
              end,
              a.planned_start,
              a.planned_end,
              Math.max(...resources.map((d) => d.buffer_minutes), 0),
              a.buffer_minutes,
            ),
        ).length;
      const capacity = Math.min(
        resources.filter((d) => d.cargo_profiles.includes(rule.cargo_profile))
          .length,
        rule.max_appointments_per_slot,
      );
      slots.push({
        start,
        end,
        remaining: Math.max(
          0,
          Math.min(available.length, rule.max_appointments_per_slot - count),
        ),
        capacity,
      });
    }
  return {
    warehouse: warehouse.data.name,
    timezone: opening.timezone,
    date,
    instructions: profile.data.access_instructions ?? "",
    rules: compatibleRules.map((r) => ({
      code: r.code,
      cargo: r.cargo_profile,
      minutes: r.default_duration_minutes,
    })),
    selectedRule: rule.code,
    slots,
    appointments: mine.map((a) => ({
      code: a.code,
      start: a.planned_start,
      end: a.planned_end,
      status: a.status,
    })),
    warning: blocks.data.some((b) => b.behavior === "WARNING"),
    suspended,
  };
}
