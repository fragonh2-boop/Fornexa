import { NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/lib/auth-context";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import {
  object,
  onlyKeys,
  CalendarValidationError,
  validateOpeningHours,
  validateHolidayExceptions,
} from "@/lib/operational-calendar";
import {
  uuid,
  choice,
  boundedText,
  integer,
  validatePolicy,
  CARGO_PROFILES,
  DIRECTIONS,
} from "@/lib/docks";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const auth = await getAuthenticatedContext();
  if (!auth)
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  if (!["OWNER", "ADMIN"].includes(auth.role))
    return NextResponse.json(
      { error: "Solo un administrador puede configurar muelles." },
      { status: 403 },
    );
  try {
    const b = object(await request.json());
    onlyKeys(b, ["kind", "id", "values"]);
    const kind = choice(b.kind, ["dock", "rule", "policy", "calendar"]),
      id = uuid(b.id, true),
      v = object(b.values);
    const db = createSupabaseAdmin(),
      wid = uuid(v.warehouse_id);
    if (kind === "calendar") {
      onlyKeys(v, ["warehouse_id", "opening_hours", "holiday_exceptions"]);
      const result = await db.rpc("fornexa_dock_calendar", {
        p_tenant: auth.tenantId,
        p_actor: auth.userId,
        p_warehouse: wid,
        p_opening: validateOpeningHours(v.opening_hours),
        p_holidays: validateHolidayExceptions(v.holiday_exceptions),
      });
      if (result.error) throw result.error;
      return NextResponse.json({ ok: true });
    }
    let values: Record<string, unknown>;
    const bool = (key: string) => {
      if (typeof v[key] !== "boolean")
        throw new CalendarValidationError("Valor booleano obligatorio.");
      return v[key];
    };
    if (kind === "policy") {
      onlyKeys(v, ["warehouse_id", "parameters", "notifications"]);
      const notifications = object(v.notifications);
      onlyKeys(notifications, ["confirmation", "reminder", "late", "release"]);
      if (
        Object.keys(notifications).length !== 4 ||
        Object.values(notifications).some((n) => typeof n !== "boolean")
      )
        throw new CalendarValidationError("Notificaciones no válidas.");
      values = {
        warehouse_id: wid,
        parameters: validatePolicy(v.parameters),
        notifications,
      };
    } else if (kind === "rule") {
      onlyKeys(v, [
        "warehouse_id",
        "code",
        "direction",
        "cargo_profile",
        "default_duration_minutes",
        "min_duration_minutes",
        "max_duration_minutes",
        "max_appointments_per_slot",
        "requires_driver_checkin",
        "is_active",
      ]);
      values = {
        warehouse_id: wid,
        code: boundedText(v.code, 40, true),
        direction: choice(v.direction, ["BOTH", ...DIRECTIONS]),
        cargo_profile: choice(v.cargo_profile, CARGO_PROFILES),
        default_duration_minutes: integer(v.default_duration_minutes, 15, 1440),
        min_duration_minutes: integer(v.min_duration_minutes, 15, 1440),
        max_duration_minutes: integer(v.max_duration_minutes, 15, 1440),
        max_appointments_per_slot: integer(
          v.max_appointments_per_slot,
          1,
          1000,
        ),
        requires_driver_checkin: bool("requires_driver_checkin"),
        is_active: bool("is_active"),
      };
    } else {
      onlyKeys(v, [
        "warehouse_id",
        "zone_id",
        "code",
        "name",
        "status",
        "max_weight_t",
        "max_vehicle_length_m",
        "is_leveler",
        "has_scale",
        "has_pit",
        "has_spill_basin",
        "temperature_regime",
        "cargo_profiles",
        "default_operation_minutes",
        "buffer_minutes",
        "sort_order",
        "is_active",
      ]);
      const decimal = (key: string, max: number) => {
        if (v[key] === null) return null;
        if (
          typeof v[key] !== "number" ||
          !Number.isFinite(v[key]) ||
          (v[key] as number) <= 0 ||
          (v[key] as number) > max
        )
          throw new CalendarValidationError("Límite físico no válido.");
        return v[key];
      };
      if (
        !Array.isArray(v.cargo_profiles) ||
        !v.cargo_profiles.length ||
        v.cargo_profiles.length > CARGO_PROFILES.length
      )
        throw new CalendarValidationError(
          "Selecciona compatibilidad de carga.",
        );
      values = {
        warehouse_id: wid,
        zone_id: uuid(v.zone_id, true),
        code: boundedText(v.code, 40, true),
        name: boundedText(v.name, 120, true),
        status: choice(v.status, ["ACTIVE", "MAINTENANCE", "OUT_OF_SERVICE"]),
        max_weight_t: decimal("max_weight_t", 100),
        max_vehicle_length_m: decimal("max_vehicle_length_m", 50),
        temperature_regime: choice(v.temperature_regime, [
          "AMBIENT",
          "CHILLED",
          "FROZEN",
          "CONTROLLED",
        ]),
        cargo_profiles: v.cargo_profiles.map((c) => choice(c, CARGO_PROFILES)),
        default_operation_minutes: integer(
          v.default_operation_minutes,
          15,
          1440,
        ),
        buffer_minutes: integer(v.buffer_minutes, 0, 240),
        sort_order: integer(v.sort_order, 0, 1000),
        is_active: bool("is_active"),
        is_leveler: bool("is_leveler"),
        has_scale: bool("has_scale"),
        has_pit: bool("has_pit"),
        has_spill_basin: bool("has_spill_basin"),
      };
    }
    const result = await db.rpc("fornexa_dock_config", {
      p_tenant: auth.tenantId,
      p_actor: auth.userId,
      p_kind: kind,
      p_id: id,
      p_values: values,
    });
    if (result.error)
      return NextResponse.json(
        {
          error:
            "No se pudo guardar: comprueba referencias, capacidad y duplicados.",
        },
        { status: 409 },
      );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof CalendarValidationError
            ? e.message
            : "No se pudo guardar la configuración.",
      },
      {
        status:
          e instanceof CalendarValidationError || e instanceof SyntaxError
            ? 400
            : 503,
      },
    );
  }
}
