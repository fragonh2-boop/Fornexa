import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DECA_PUBLIC_POST_COMPLETION_MS,
  decaMinimumPublicUntilMs,
  decaPublicAccessWindowIsUsable,
} from "../lib/regulatory-lifecycle.ts";

const completedAt = "2026-09-01T12:00:00.000Z";
const minimumPublicUntil = "2026-09-08T12:00:00.000Z";

test("DeCA public window requires at least seven days after service completion", () => {
  assert.equal(
    decaMinimumPublicUntilMs(completedAt),
    Date.parse(completedAt) + DECA_PUBLIC_POST_COMPLETION_MS,
  );
});

test("DeCA token remains usable during service and throughout the seven-day minimum", () => {
  const row = {
    valid_from: "2026-09-01T08:00:00.000Z",
    service_completed_at: completedAt,
    public_until: minimumPublicUntil,
    deactivated_at: null,
  };

  assert.equal(decaPublicAccessWindowIsUsable(row, Date.parse("2026-09-01T10:00:00.000Z")), true);
  assert.equal(decaPublicAccessWindowIsUsable(row, Date.parse("2026-09-04T12:00:00.000Z")), true);
  assert.equal(decaPublicAccessWindowIsUsable(row, Date.parse(minimumPublicUntil)), true);
  assert.equal(decaPublicAccessWindowIsUsable(row, Date.parse("2026-09-08T12:00:00.001Z")), false);
});

test("DeCA permits windows longer than seven days and expires only after public_until", () => {
  const row = {
    valid_from: "2026-09-01T08:00:00.000Z",
    service_completed_at: completedAt,
    public_until: "2026-09-15T12:00:00.000Z",
    deactivated_at: null,
  };

  assert.equal(decaPublicAccessWindowIsUsable(row, Date.parse("2026-09-10T12:00:00.000Z")), true);
  assert.equal(decaPublicAccessWindowIsUsable(row, Date.parse("2026-09-15T12:00:00.000Z")), true);
  assert.equal(decaPublicAccessWindowIsUsable(row, Date.parse("2026-09-15T12:00:00.001Z")), false);
});

test("DeCA fails closed when public_until is configured below the seven-day minimum", () => {
  const row = {
    valid_from: "2026-09-01T08:00:00.000Z",
    service_completed_at: completedAt,
    public_until: "2026-09-08T11:59:59.999Z",
    deactivated_at: null,
  };

  assert.equal(decaPublicAccessWindowIsUsable(row, Date.parse("2026-09-02T12:00:00.000Z")), false);
});
