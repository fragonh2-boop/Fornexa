import assert from "node:assert/strict";
import test from "node:test";
import {
  closedOpeningHours,
  validateOpeningHours,
  validateHolidayExceptions,
  isWithinOpeningHours,
  zonedInstant,
} from "../lib/operational-calendar.ts";
import {
  availableDocks,
  appointmentKpis,
  DEFAULT_DOCK_POLICY,
  validatePolicy,
  overlaps,
  dockRpcFailure,
  type Dock,
  type Appointment,
  type DockEvent,
} from "../lib/docks.ts";
const hours = {
  ...closedOpeningHours(),
  days: {
    ...closedOpeningHours().days,
    mon: [{ from: "06:00", to: "22:00" }],
    wed: [{ from: "06:00", to: "22:00" }],
  },
};
test("calendar requires exactly seven canonical day keys, valid timezone and strict ranges", () => {
  assert.deepEqual(validateOpeningHours(hours), hours);
  for (const bad of [
    { mon_fri: "08:00-18:00" },
    { ...hours, extra: true },
    { ...hours, timezone: "Mars/Test" },
    { ...hours, days: { mon: [] } },
    {
      ...hours,
      days: { ...hours.days, mon: [{ from: "24:00", to: "25:00" }] },
    },
    {
      ...hours,
      days: { ...hours.days, mon: [{ from: "12:00", to: "06:00" }] },
    },
    {
      ...hours,
      days: {
        ...hours.days,
        mon: [
          { from: "06:00", to: "12:00" },
          { from: "11:00", to: "14:00" },
        ],
      },
    },
  ])
    assert.throws(() => validateOpeningHours(bad));
  assert.throws(() =>
    validateOpeningHours({
      ...hours,
      peak: { mon: [{ from: "05:00", to: "07:00" }] },
    }),
  );
});
test("holiday contract rejects duplicate, nonexistent dates, unknown keys and mixed closure/ranges", () => {
  for (const bad of [
    [{ date: "2026-02-30", closed: true }],
    [
      { date: "2026-12-25", closed: true },
      { date: "2026-12-25", closed: true },
    ],
    [{ date: "2026-12-25", closed: true, ranges: [] }],
    [{ date: "2026-12-25", foo: true }],
  ])
    assert.throws(() => validateHolidayExceptions(bad));
  assert.equal(
    validateHolidayExceptions([
      { date: "2026-12-24", ranges: [{ from: "06:00", to: "14:00" }] },
    ]).length,
    1,
  );
});
test("availability respects timezone, holidays, shorter shifts and DST gaps/folds", () => {
  assert.equal(
    isWithinOpeningHours(
      "2026-10-14T06:00:00Z",
      "2026-10-14T07:00:00Z",
      hours,
      [],
    ),
    true,
  );
  assert.equal(
    isWithinOpeningHours(
      "2026-10-14T06:00:00Z",
      "2026-10-14T07:00:00Z",
      hours,
      [{ date: "2026-10-14", closed: true }],
    ),
    false,
  );
  assert.equal(
    isWithinOpeningHours(
      "2026-10-14T13:00:00Z",
      "2026-10-14T14:00:00Z",
      hours,
      [{ date: "2026-10-14", ranges: [{ from: "06:00", to: "14:00" }] }],
    ),
    false,
  );
  assert.equal(
    zonedInstant("2026-10-14", "08:00", "Europe/Madrid"),
    "2026-10-14T06:00:00.000Z",
  );
  assert.throws(() => zonedInstant("2026-03-29", "02:30", "Europe/Madrid"));
  assert.throws(() => zonedInstant("2026-10-25", "02:30", "Europe/Madrid"));
});
test("buffer is applied on both sides, equality at the boundary is free", () => {
  assert.equal(
    overlaps(
      "2026-10-14T09:00Z",
      "2026-10-14T10:00Z",
      "2026-10-14T08:00Z",
      "2026-10-14T09:00Z",
      10,
      10,
    ),
    true,
  );
  assert.equal(
    overlaps(
      "2026-10-14T09:10Z",
      "2026-10-14T10:10Z",
      "2026-10-14T08:00Z",
      "2026-10-14T09:00Z",
      10,
      10,
    ),
    false,
  );
  const dock = {
    id: "d",
    is_active: true,
    status: "ACTIVE",
    cargo_profiles: ["FROZEN"],
    buffer_minutes: 10,
  } as Dock;
  const row = {
    id: "a",
    dock_id: "d",
    status: "CONFIRMED",
    booking_kind: "FIRM",
    planned_start: "2026-10-14T08:00Z",
    planned_end: "2026-10-14T09:00Z",
    buffer_minutes: 10,
  } as Appointment;
  assert.equal(
    availableDocks([dock], [row], "2026-10-14T09:00Z", "2026-10-14T10:00Z")
      .length,
    0,
  );
  assert.equal(
    availableDocks(
      [dock],
      [{ ...row, booking_kind: "WAITLIST" }],
      "2026-10-14T09:00Z",
      "2026-10-14T10:00Z",
      undefined,
      "FROZEN",
    ).length,
    1,
  );
  assert.equal(
    availableDocks(
      [dock],
      [],
      "2026-10-14T09:00Z",
      "2026-10-14T10:00Z",
      undefined,
      "CHILLED",
    ).length,
    0,
  );
});
test("fifteen policies are typed, bounded, complete, and reject unknown fields", () => {
  assert.equal(Object.keys(DEFAULT_DOCK_POLICY).length, 15);
  assert.deepEqual(validatePolicy(DEFAULT_DOCK_POLICY), DEFAULT_DOCK_POLICY);
  assert.throws(() =>
    validatePolicy({ ...DEFAULT_DOCK_POLICY, horizon_days: null }),
  );
  assert.throws(() =>
    validatePolicy({ ...DEFAULT_DOCK_POLICY, unknown: true }),
  );
  assert.throws(() =>
    validatePolicy({ ...DEFAULT_DOCK_POLICY, no_show_limit: 0 }),
  );
});
test("KPIs derive from reservation events, never infer missing times as zero", () => {
  const a = {
    id: "a",
    planned_start: "2026-10-14T08:00Z",
    status: "COMPLETED",
  } as Appointment;
  const event = (event_type: string, occurred_at: string) =>
    ({ dock_appointment_id: "a", event_type, occurred_at }) as DockEvent;
  assert.deepEqual(appointmentKpis([a], [], 30), {
    punctuality: null,
    wait: null,
    dwell: null,
    noShows: 0,
  });
  assert.deepEqual(
    appointmentKpis(
      [a],
      [
        event("DOCK_GATE_IN", "2026-10-14T08:05Z"),
        event("DOCK_CHECK_IN", "2026-10-14T08:10Z"),
        event("DOCK_OPERATION_START", "2026-10-14T08:30Z"),
        event("DOCK_CHECK_OUT", "2026-10-14T09:35Z"),
      ],
      30,
    ),
    { punctuality: 100, wait: 20, dwell: 90, noShows: 0 },
  );
});

test("dock RPC failures distinguish denied, stale, conflict and unavailable without leaking server details", () => {
  assert.equal(dockRpcFailure({ message: "DOCK_FORBIDDEN" }).status, 403);
  assert.equal(dockRpcFailure({ message: "DOCK_STALE" }).status, 409);
  assert.equal(dockRpcFailure({ code: "23P01" }).status, 409);
  assert.equal(
    dockRpcFailure({ message: "DOCK_FUTURE_APPOINTMENTS" }).status,
    409,
  );
  const unknown = dockRpcFailure({
    code: "XX000",
    message: "private fixture details",
  });
  assert.equal(unknown.status, 503);
  assert.doesNotMatch(unknown.error, /private/);
});
