export const WEEK_DAYS = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const;
export type WeekDay = (typeof WEEK_DAYS)[number];
export type TimeRange = { from: string; to: string };
export type OpeningHours = {
  timezone: string;
  days: Record<WeekDay, TimeRange[]>;
  peak?: Partial<Record<WeekDay, TimeRange[]>>;
};
export type HolidayException =
  | { date: string; closed: true; reason?: string }
  | { date: string; ranges: TimeRange[]; reason?: string };
export class CalendarValidationError extends Error {}
function fail(message: string): never {
  throw new CalendarValidationError(message);
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail("Se esperaba un objeto.");
  return value as Record<string, unknown>;
}
export function onlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
) {
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    fail("Campo desconocido.");
}
export function validateRanges(value: unknown): TimeRange[] {
  if (!Array.isArray(value) || value.length > 24)
    fail("Intervalos no válidos.");
  const ranges = value
    .map((item) => {
      const row = object(item);
      onlyKeys(row, ["from", "to"]);
      if (
        typeof row.from !== "string" ||
        typeof row.to !== "string" ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(row.from) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(row.to) ||
        row.from >= row.to
      )
        fail("Horario no válido: HH:MM y desde < hasta.");
      return { from: row.from, to: row.to };
    })
    .sort((a, b) => a.from.localeCompare(b.from));
  if (ranges.some((row, index) => index > 0 && row.from < ranges[index - 1].to))
    fail("Los intervalos se solapan.");
  return ranges;
}
export function validateOpeningHours(value: unknown): OpeningHours {
  const row = object(value);
  onlyKeys(row, ["timezone", "days", "peak"]);
  if (typeof row.timezone !== "string" || row.timezone.length > 64)
    fail("Zona horaria no válida.");
  try {
    new Intl.DateTimeFormat("en", { timeZone: row.timezone });
  } catch {
    fail("Zona horaria no válida.");
  }
  const days = object(row.days);
  onlyKeys(days, WEEK_DAYS);
  if (Object.keys(days).length !== 7)
    fail("El horario requiere las siete claves mon–sun.");
  const result: OpeningHours = {
    timezone: row.timezone,
    days: Object.fromEntries(
      WEEK_DAYS.map((day) => [day, validateRanges(days[day])]),
    ) as OpeningHours["days"],
  };
  if (row.peak !== undefined) {
    const peak = object(row.peak);
    onlyKeys(peak, WEEK_DAYS);
    result.peak = Object.fromEntries(
      Object.entries(peak).map(([day, ranges]) => {
        const validated = validateRanges(ranges);
        if (
          validated.some(
            (range) =>
              !result.days[day as WeekDay].some(
                (open) => range.from >= open.from && range.to <= open.to,
              ),
          )
        )
          fail("La hora punta debe estar dentro del horario abierto.");
        return [day, validated];
      }),
    );
  }
  return result;
}
export function validateHolidayExceptions(value: unknown): HolidayException[] {
  if (!Array.isArray(value) || value.length > 366) fail("Festivos no válidos.");
  const seen = new Set<string>();
  return value.map((item) => {
    const row = object(item);
    onlyKeys(row, ["date", "closed", "ranges", "reason"]);
    if (
      typeof row.date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(row.date) ||
      !Number.isFinite(Date.parse(row.date)) ||
      new Date(row.date).toISOString().slice(0, 10) !== row.date ||
      seen.has(row.date)
    )
      fail("Fecha de excepción no válida o duplicada.");
    seen.add(row.date);
    if (
      row.reason !== undefined &&
      (typeof row.reason !== "string" ||
        row.reason.length > 200 ||
        /[\x00-\x1f\x7f]/.test(row.reason))
    )
      fail("Motivo no válido.");
    const reason = row.reason as string | undefined;
    if (row.closed === true && row.ranges === undefined)
      return { date: row.date, closed: true, ...(reason ? { reason } : {}) };
    if (row.closed !== undefined)
      fail("Use closed:true o ranges, exclusivamente.");
    return {
      date: row.date,
      ranges: validateRanges(row.ranges),
      ...(reason ? { reason } : {}),
    };
  });
}
export function closedOpeningHours(): OpeningHours {
  return {
    timezone: "Europe/Madrid",
    days: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] },
  };
}
export function calendarParts(date: Date, timezone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    day: parts.weekday.toLowerCase() as WeekDay,
    time: `${parts.hour}:${parts.minute}`,
  };
}
export function isWithinOpeningHours(
  start: string,
  end: string,
  opening: OpeningHours,
  holidays: HolidayException[],
) {
  const a = new Date(start),
    b = new Date(end);
  if (
    !Number.isFinite(a.getTime()) ||
    !Number.isFinite(b.getTime()) ||
    b <= a ||
    b.getTime() - a.getTime() > 86400000
  )
    return false;
  const first = calendarParts(a, opening.timezone),
    last = calendarParts(b, opening.timezone);
  if (first.date !== last.date) return false;
  const holiday = holidays.find((row) => row.date === first.date);
  if (holiday && "closed" in holiday) return false;
  const ranges =
    holiday && "ranges" in holiday ? holiday.ranges : opening.days[first.day];
  return ranges.some(
    (range) =>
      first.time >= range.from &&
      (last.time < range.to ||
        (last.time === range.to &&
          b.getUTCSeconds() === 0 &&
          b.getUTCMilliseconds() === 0)),
  );
}
// Resolve a wall-clock time in the warehouse timezone. Reject nonexistent or ambiguous DST times.
export function zonedInstant(date: string, time: string, timezone: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
  )
    fail("Fecha u hora no válida.");
  const naive = Date.parse(`${date}T${time}:00Z`),
    candidates: string[] = [];
  for (let offset = -14 * 60; offset <= 14 * 60; offset += 15) {
    const candidate = new Date(naive + offset * 60000),
      parts = calendarParts(candidate, timezone);
    if (parts.date === date && parts.time === time)
      candidates.push(candidate.toISOString());
  }
  if (candidates.length !== 1)
    fail("Hora inexistente o ambigua por cambio de horario. Elige otra hora.");
  return candidates[0];
}
export function shiftDate(date: string, days: number) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000)
    .toISOString()
    .slice(0, 10);
}
