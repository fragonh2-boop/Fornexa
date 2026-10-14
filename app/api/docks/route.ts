import { NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth-context";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { loadDockData } from "@/lib/dock-loader";
import {
  CalendarValidationError,
  object,
  onlyKeys,
  validateOpeningHours,
  validateHolidayExceptions,
  isWithinOpeningHours,
} from "@/lib/operational-calendar";
import {
  uuid,
  choice,
  instant,
  boundedText,
  DIRECTIONS,
  DOCK_EVENTS,
  DEFAULT_DOCK_POLICY,
} from "@/lib/docks";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const EDIT_ROLES = new Set(["OWNER", "ADMIN", "OPERATOR"]);
function response(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
export async function GET(request: Request) {
  const auth = await getAuthenticatedContext();
  if (!auth) return response({ error: "No autorizado." }, 401);
  try {
    const url = new URL(request.url),
      from = instant(url.searchParams.get("from")),
      until = instant(url.searchParams.get("until"));
    if (
      Date.parse(until) <= Date.parse(from) ||
      Date.parse(until) - Date.parse(from) > 32 * 86400000
    )
      throw new CalendarValidationError("Intervalo máximo: 32 días.");
    const data = await loadDockData(auth.tenantId, from, until);
    return response({
      ...data,
      canEdit: EDIT_ROLES.has(auth.role),
      canConfigure: ["OWNER", "ADMIN"].includes(auth.role),
    });
  } catch (e) {
    return response(
      {
        error:
          e instanceof CalendarValidationError
            ? e.message
            : "No se pudieron cargar los muelles.",
      },
      e instanceof CalendarValidationError ? 400 : 503,
    );
  }
}
export async function POST(request: Request) {
  const auth = await getAuthenticatedContext();
  if (!auth) return response({ error: "No autorizado." }, 401);
  if (!EDIT_ROLES.has(auth.role))
    return response({ error: "No tienes permisos para modificar citas." }, 403);
  try {
    const body = object(await request.json());
    onlyKeys(body, ["id", "expected", "action", "reason", "values"]);
    const id = uuid(body.id, true),
      expected = body.expected === undefined ? null : instant(body.expected);
    if (id && !expected)
      throw new CalendarValidationError("Versión de cita obligatoria.");
    const reason =
      body.reason === undefined ? null : boundedText(body.reason, 500, true);
    const db = createSupabaseAdmin();
    if (body.action !== undefined) {
      if (!id) throw new CalendarValidationError("Cita obligatoria.");
      const action = choice(body.action, [...DOCK_EVENTS, "CANCEL", "NO_SHOW"]);
      if (["CANCEL", "NO_SHOW"].includes(action) && !reason)
        throw new CalendarValidationError("Motivo obligatorio.");
      const result = await db.rpc("fornexa_dock_action", {
        p_tenant: auth.tenantId,
        p_actor: auth.userId,
        p_id: id,
        p_expected: expected,
        p_action: action,
        p_reason: reason,
      });
      if (result.error)
        return response(
          {
            error:
              "No se pudo registrar el hito. Actualiza la cita y comprueba su estado.",
          },
          409,
        );
      return response({ item: result.data });
    }
    const v = object(body.values);
    onlyKeys(v, [
      "warehouse_id",
      "dock_id",
      "trip_stop_id",
      "order_id",
      "expedition_id",
      "rule_id",
      "direction",
      "planned_start",
      "planned_end",
      "requested_start",
      "requested_end",
      "status",
      "booking_kind",
      "priority",
      "metadata",
    ]);
    const metadata = object(v.metadata ?? {});
    onlyKeys(metadata, ["notes", "holiday_override"]);
    if (metadata.holiday_override !== undefined && typeof metadata.holiday_override !== "boolean") throw new CalendarValidationError("Excepción de horario no válida.");
    const values = {
      warehouse_id: uuid(v.warehouse_id),
      dock_id: uuid(v.dock_id, true),
      trip_stop_id: uuid(v.trip_stop_id, true),
      order_id: uuid(v.order_id, true),
      expedition_id: uuid(v.expedition_id, true),
      rule_id: uuid(v.rule_id),
      direction: choice(v.direction, DIRECTIONS),
      planned_start: instant(v.planned_start),
      planned_end: instant(v.planned_end),
      requested_start:
        v.requested_start == null ? null : instant(v.requested_start),
      requested_end: v.requested_end == null ? null : instant(v.requested_end),
      status: choice(v.status, ["DRAFT", "CONFIRMED", "CHECKED_IN"]),
      booking_kind: choice(v.booking_kind, ["FIRM", "PROVISIONAL", "WAITLIST"]),
      priority: choice(v.priority, ["LOW", "NORMAL", "HIGH", "URGENT"]),
      metadata: {
        notes: boundedText(metadata.notes ?? "", 500),
        holiday_override: metadata.holiday_override === true,
      },
    };
    if (
      values.planned_end <= values.planned_start ||
      Date.parse(values.planned_end) - Date.parse(values.planned_start) >
        86400000
    )
      throw new CalendarValidationError("Ventana no válida.");
    if (values.booking_kind !== "FIRM" && values.dock_id)
      throw new CalendarValidationError(
        "Las provisionales y la cola no asignan muelle.",
      );
    if (
      values.metadata.holiday_override &&
      (!["OWNER", "ADMIN"].includes(auth.role) || !reason)
    )
      return response(
        { error: "La excepción de horario requiere administrador y motivo." },
        403,
      );
    const [warehouse, policy] = await Promise.all([
      db
        .from("warehouses")
        .select("id,address_id")
        .eq("tenant_id", auth.tenantId)
        .eq("id", values.warehouse_id)
        .single(),
      db
        .from("dock_policies")
        .select("parameters")
        .eq("tenant_id", auth.tenantId)
        .eq("warehouse_id", values.warehouse_id)
        .maybeSingle(),
    ]);
    if (warehouse.error || policy.error || !warehouse.data?.address_id)
      throw new CalendarValidationError("Almacén sin dirección operativa.");
    const profile = await db
      .from("address_operational_profiles")
      .select(
        "opening_hours,holiday_exceptions,requires_appointment,adr_capable",
      )
      .eq("tenant_id", auth.tenantId)
      .eq("address_id", warehouse.data.address_id)
      .single();
    if (profile.error || !profile.data?.requires_appointment)
      throw new CalendarValidationError(
        "Activa las citas en el perfil operativo del almacén.",
      );
    const opening = validateOpeningHours(profile.data.opening_hours),
      holidays = validateHolidayExceptions(profile.data.holiday_exceptions);
    const parameters = policy.data?.parameters ?? DEFAULT_DOCK_POLICY;
    if (
      !isWithinOpeningHours(
        values.planned_start,
        values.planned_end,
        opening,
        holidays,
      ) &&
      !(values.metadata.holiday_override && parameters.allow_holiday_override)
    )
      throw new CalendarValidationError(
        "La cita está fuera del horario de servicio.",
      );
    const ruleCheck = await db
      .from("dock_appointment_rules")
      .select("cargo_profile")
      .eq("tenant_id", auth.tenantId)
      .eq("warehouse_id", values.warehouse_id)
      .eq("id", values.rule_id)
      .single();
    if (ruleCheck.error) throw new CalendarValidationError("Regla no válida.");
    if (values.dock_id) {
      const dockCheck = await db
        .from("warehouse_docks")
        .select("temperature_regime,has_spill_basin,max_weight_t")
        .eq("tenant_id", auth.tenantId)
        .eq("warehouse_id", values.warehouse_id)
        .eq("id", values.dock_id)
        .single();
      if (dockCheck.error)
        throw new CalendarValidationError("Muelle no válido.");
      if (
        (ruleCheck.data.cargo_profile === "CHILLED" &&
          !["CHILLED", "CONTROLLED"].includes(
            dockCheck.data.temperature_regime,
          )) ||
        (ruleCheck.data.cargo_profile === "FROZEN" &&
          dockCheck.data.temperature_regime !== "FROZEN")
      )
        throw new CalendarValidationError(
          "El régimen térmico no es compatible.",
        );
      if (
        ["HAZMAT_ADR", "LIQUID_TANKER"].includes(
          ruleCheck.data.cargo_profile,
        ) &&
        (!profile.data.adr_capable || !dockCheck.data.has_spill_basin)
      )
        throw new CalendarValidationError(
          "El almacén y muelle no están habilitados para esta carga.",
        );
    }
    if (
      !id &&
      Date.parse(values.planned_start) >
        Date.now() + parameters.horizon_days * 86400000
    )
      throw new CalendarValidationError(
        "La cita supera el horizonte de reserva.",
      );
    if (values.trip_stop_id) {
      const stop = await db
        .from("trip_stops")
        .select("trip_id,address_id")
        .eq("tenant_id", auth.tenantId)
        .eq("id", values.trip_stop_id)
        .single();
      if (stop.error || stop.data.address_id !== warehouse.data.address_id)
        throw new CalendarValidationError(
          "La parada debe pertenecer a la dirección del almacén.",
        );
      const trip = await db
        .from("trips")
        .select("vehicle_id,driver_id,carrier_id")
        .eq("tenant_id", auth.tenantId)
        .eq("id", stop.data.trip_id)
        .single();
      if (trip.error) throw new CalendarValidationError("Viaje no válido.");
      if (values.dock_id && trip.data.vehicle_id) {
        const [vehicle, dock] = await Promise.all([
          db
            .from("vehicles")
            .select("capacity_weight,adr_enabled")
            .eq("tenant_id", auth.tenantId)
            .eq("id", trip.data.vehicle_id)
            .single(),
          db
            .from("warehouse_docks")
            .select("max_weight_t")
            .eq("tenant_id", auth.tenantId)
            .eq("id", values.dock_id)
            .single(),
        ]);
        if (vehicle.error || dock.error)
          throw new CalendarValidationError("No se pudo validar el vehículo.");
        if (
          dock.data.max_weight_t &&
          vehicle.data.capacity_weight &&
          vehicle.data.capacity_weight > dock.data.max_weight_t * 1000
        )
          throw new CalendarValidationError(
            "El vehículo excede el peso admitido.",
          );
        if (
          ruleCheck.data.cargo_profile === "HAZMAT_ADR" &&
          !vehicle.data.adr_enabled
        )
          throw new CalendarValidationError("Vehículo sin habilitación ADR.");
      }
      if (ruleCheck.data.cargo_profile === "HAZMAT_ADR") {
        const driver = await db
          .from("drivers")
          .select("adr_qualified")
          .eq("tenant_id", auth.tenantId)
          .eq(
            "id",
            trip.data.driver_id ?? "00000000-0000-4000-8000-000000000000",
          )
          .maybeSingle();
        if (driver.error || !driver.data?.adr_qualified)
          throw new CalendarValidationError("Conductor sin habilitación ADR.");
      }
      if (trip.data.carrier_id) {
        const blocks = await db
          .from("customer_blocks")
          .select("behavior")
          .eq("tenant_id", auth.tenantId)
          .eq("party_id", trip.data.carrier_id)
          .is("released_at", null);
        if (blocks.error) throw new Error("Bloqueos no disponibles.");
        if (blocks.data.some((block) => block.behavior === "HARD"))
          throw new CalendarValidationError(
            "Transportista bloqueado para operar.",
          );
      }
    }
    const result = await db.rpc("fornexa_write_dock_appointment", {
      p_tenant: auth.tenantId,
      p_actor: auth.userId,
      p_id: id,
      p_expected: expected,
      p_values: values,
      p_reason: reason,
    });
    if (result.error)
      return response(
        {
          error:
            "La reserva entra en conflicto con la capacidad, compatibilidad o versión actual. Elige otra franja y actualiza.",
        },
        409,
      );
    return response({ item: result.data }, id ? 200 : 201);
  } catch (e) {
    return response(
      {
        error:
          e instanceof CalendarValidationError
            ? e.message
            : "No se pudo guardar la cita.",
      },
      e instanceof CalendarValidationError || e instanceof SyntaxError
        ? 400
        : 503,
    );
  }
}
