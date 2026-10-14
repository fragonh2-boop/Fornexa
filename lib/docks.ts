import {
  object,
  onlyKeys,
  CalendarValidationError,
} from "./operational-calendar.ts";
export const DOCK_EVENTS = [
  "DOCK_GATE_IN",
  "DOCK_CHECK_IN",
  "DOCK_OPERATION_START",
  "DOCK_OPERATION_END",
  "DOCK_CHECK_OUT",
] as const;
export const APPOINTMENT_STATUSES = [
  "DRAFT",
  "CONFIRMED",
  "CHECKED_IN",
  "AT_DOCK",
  "OPERATION_ENDED",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
] as const;
export const ACTIVE_DOCK_STATUSES = [
  "CONFIRMED",
  "CHECKED_IN",
  "AT_DOCK",
  "OPERATION_ENDED",
];
export const DIRECTIONS = [
  "INBOUND",
  "OUTBOUND",
  "INTERNAL",
  "RETURN",
  "TRANSFER",
] as const;
export const CARGO_PROFILES = [
  "DRY_PALLETIZED",
  "BULK",
  "CHILLED",
  "FROZEN",
  "HAZMAT_ADR",
  "LIQUID_TANKER",
  "RETURNS",
  "MIXED",
] as const;
export const POLICY_FIELDS = {
  min_lead_minutes: ["Antelación mínima (min)", 240, 0, 43200],
  horizon_days: ["Horizonte (días)", 60, 1, 365],
  firm_fence_minutes: ["Firmeza (min)", 120, 0, 43200],
  buffer_minutes: ["Buffer (min)", 10, 0, 240],
  punctuality_minutes: ["Tolerancia (min)", 30, 0, 240],
  dwell_target_minutes: ["Permanencia objetivo (min)", 80, 1, 1440],
  confirmation_minutes: ["Caducidad de confirmación (min)", 20, 1, 1440],
  no_show_minutes: ["No-show tras fin (min)", 20, 0, 1440],
  no_show_limit: ["Avisos antes de suspensión / 30 días", 2, 1, 100],
  change_cutoff_minutes: ["Corte de cambios (min)", 240, 0, 43200],
  max_changes: ["Máximo de cambios", 2, 0, 100],
  last_minute_quota_pct: ["Cupo última hora (%)", 10, 0, 100],
  compensation_hour_eur: ["Compensación / hora (€)", 35, 0, 10000],
  allow_holiday_override: ["Festivos con autorización", false],
  block_portal_holidays: ["Bloquear portal en festivos", true],
} as const;
export type DockPolicy = {
  [K in keyof typeof POLICY_FIELDS]: (typeof POLICY_FIELDS)[K][1] extends boolean
    ? boolean
    : number;
};
export const DEFAULT_DOCK_POLICY = Object.fromEntries(
  Object.entries(POLICY_FIELDS).map(([key, spec]) => [key, spec[1]]),
) as DockPolicy;
export type Dock = {
  id: string;
  warehouse_id: string;
  zone_id: string | null;
  code: string;
  name: string;
  status: string;
  temperature_regime: string;
  cargo_profiles: string[];
  max_weight_t: number | null;
  max_vehicle_length_m: number | null;
  default_operation_minutes: number;
  buffer_minutes: number;
  sort_order: number;
  is_active: boolean;
  is_leveler: boolean;
  has_scale: boolean;
  has_pit: boolean;
  has_spill_basin: boolean;
};
export type DockRule = {
  id: string;
  warehouse_id: string;
  code: string;
  direction: string;
  cargo_profile: string;
  default_duration_minutes: number;
  min_duration_minutes: number;
  max_duration_minutes: number;
  max_appointments_per_slot: number;
  requires_driver_checkin: boolean;
  is_active: boolean;
};
export type Appointment = {
  id: string;
  code: string;
  warehouse_id: string;
  dock_id: string | null;
  trip_stop_id: string | null;
  order_id: string | null;
  expedition_id: string | null;
  rule_id: string;
  direction: string;
  planned_start: string;
  planned_end: string;
  requested_start: string | null;
  requested_end: string | null;
  status: string;
  booking_kind: string;
  priority: string;
  booked_via: string;
  is_confirmed: boolean;
  confirmation_deadline_at: string | null;
  is_overbooked: boolean;
  precheck_completed_at: string | null;
  cancellation_reason: string | null;
  metadata: Record<string, unknown>;
  buffer_minutes: number;
  updated_at: string;
};
export type DockEvent = {
  id: string;
  dock_appointment_id: string;
  event_type: string;
  occurred_at: string;
  actor_user_id: string;
  payload: Record<string, unknown>;
};
export type DockAudit = {
  id: number;
  entity_id: string;
  action: string;
  occurred_at: string;
  actor_user_id: string;
  reason: string | null;
};
export type DockData = {
  warehouses: {
    id: string;
    code: string;
    name: string;
    address_id: string | null;
  }[];
  zones: {
    id: string;
    warehouse_id: string;
    zone_name: string;
    temperature_regime: string;
  }[];
  docks: Dock[];
  rules: DockRule[];
  appointments: Appointment[];
  events: DockEvent[];
  audits: DockAudit[];
  policies: {
    warehouse_id: string;
    parameters: DockPolicy;
    notifications: Record<string, boolean>;
  }[];
  profiles: {
    address_id: string;
    opening_hours: unknown;
    holiday_exceptions: unknown;
  }[];
  stops: {
    id: string;
    trip_id: string;
    sequence: number;
    full_address: string;
  }[];
  trips: {
    id: string;
    code: string;
    carrier_id: string | null;
    vehicle_id: string | null;
    driver_id: string | null;
    trailer_registration: string | null;
  }[];
  carriers: { id: string; code: string; legal_name: string }[];
  vehicles: {
    id: string;
    registration: string;
    capacity_weight: number | null;
    adr_enabled: boolean;
  }[];
  drivers: { id: string; name: string; adr_qualified: boolean }[];
  orders: { id: string; code: string; adr: boolean }[];
  expeditions: { id: string; code: string }[];
  actorNames: Record<string, string>;
  canEdit: boolean;
  canConfigure: boolean;
  truncated: boolean;
};
export const EMPTY_DOCK_DATA: DockData = {
  warehouses: [],
  zones: [],
  docks: [],
  rules: [],
  appointments: [],
  events: [],
  audits: [],
  policies: [],
  profiles: [],
  stops: [],
  trips: [],
  carriers: [],
  vehicles: [],
  drivers: [],
  orders: [],
  expeditions: [],
  actorNames: {},
  canEdit: false,
  canConfigure: false,
  truncated: false,
};
export function validatePolicy(value: unknown): DockPolicy {
  const row = object(value);
  onlyKeys(row, Object.keys(POLICY_FIELDS));
  for (const [key, spec] of Object.entries(POLICY_FIELDS)) {
    const v = row[key];
    if (typeof spec[1] === "boolean") {
      if (typeof v !== "boolean")
        throw new CalendarValidationError(`Parámetro no válido: ${key}.`);
    } else if (
      typeof v !== "number" ||
      !Number.isFinite(v) ||
      v < (spec[2] ?? 0) ||
      v > (spec[3] ?? 0) ||
      (key !== "compensation_hour_eur" && !Number.isInteger(v))
    )
      throw new CalendarValidationError(`Parámetro no válido: ${key}.`);
  }
  return row as DockPolicy;
}
export function uuid(value: unknown, optional = false): string | null {
  if (optional && (value === null || value === "" || value === undefined))
    return null;
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new CalendarValidationError("Identificador no válido.");
  return value;
}
export function choice(value: unknown, values: readonly string[]): string {
  if (typeof value !== "string" || !values.includes(value))
    throw new CalendarValidationError("Valor no permitido.");
  return value;
}
export function boundedText(value: unknown, max: number, required = false) {
  if (
    typeof value !== "string" ||
    value.length > max ||
    /[\x00-\x1f\x7f]/.test(value) ||
    (required && !value.trim())
  )
    throw new CalendarValidationError("Texto no válido.");
  return value.trim();
}
export function integer(value: unknown, min: number, max: number) {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  )
    throw new CalendarValidationError("Número fuera del intervalo permitido.");
  return value;
}
export function instant(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) ||
    !Number.isFinite(Date.parse(value))
  )
    throw new CalendarValidationError("Fecha con zona horaria obligatoria.");
  return new Date(value).toISOString();
}
export function overlaps(
  start: string,
  end: string,
  otherStart: string,
  otherEnd: string,
  buffer = 0,
  otherBuffer = 0,
) {
  return (
    Date.parse(start) < Date.parse(otherEnd) + otherBuffer * 60000 &&
    Date.parse(otherStart) < Date.parse(end) + buffer * 60000
  );
}
export function availableDocks(
  docks: Dock[],
  appointments: Appointment[],
  start: string,
  end: string,
  excludeId?: string,
  cargo?: string,
) {
  return docks.filter(
    (dock) =>
      dock.is_active &&
      dock.status === "ACTIVE" &&
      (!cargo || dock.cargo_profiles.includes(cargo)) &&
      !appointments.some(
        (row) =>
          row.id !== excludeId &&
          row.dock_id === dock.id &&
          row.booking_kind === "FIRM" &&
          ACTIVE_DOCK_STATUSES.includes(row.status) &&
          overlaps(
            start,
            end,
            row.planned_start,
            row.planned_end,
            dock.buffer_minutes,
            row.buffer_minutes,
          ),
      ),
  );
}
export function appointmentKpis(
  appointments: Appointment[],
  events: DockEvent[],
  tolerance: number,
) {
  const deviations: number[] = [],
    waits: number[] = [],
    dwells: number[] = [];
  for (const row of appointments) {
    const own = events.filter((event) => event.dock_appointment_id === row.id);
    const time = (type: string) =>
      own.find((event) => event.event_type === type)?.occurred_at;
    const gate = time("DOCK_GATE_IN"),
      check = time("DOCK_CHECK_IN"),
      start = time("DOCK_OPERATION_START"),
      end = time("DOCK_CHECK_OUT");
    if (check)
      deviations.push(
        (Date.parse(check) - Date.parse(row.planned_start)) / 60000,
      );
    if (check && start)
      waits.push(Math.max(0, (Date.parse(start) - Date.parse(check)) / 60000));
    if (gate && end)
      dwells.push(Math.max(0, (Date.parse(end) - Date.parse(gate)) / 60000));
  }
  const avg = (values: number[]) =>
    values.length
      ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
      : null;
  return {
    punctuality: deviations.length
      ? Math.round(
          (100 * deviations.filter((n) => Math.abs(n) <= tolerance).length) /
            deviations.length,
        )
      : null,
    wait: avg(waits),
    dwell: avg(dwells),
    noShows: appointments.filter((row) => row.status === "NO_SHOW").length,
  };
}
