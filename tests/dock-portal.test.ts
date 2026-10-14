import assert from "node:assert/strict";
import test from "node:test";
import {
  generateDockPortalToken,
  dockPortalTokenIsValid,
  dockPortalTokenHash,
  dockPortalIpHash,
  validatePortalBooking,
  portalRequestHash,
  readPortalJson,
} from "../lib/dock-portal-validation.ts";
import {
  normalizeTelemetryPath,
  normalizeTelemetryReferrer,
} from "../lib/platform-telemetry.ts";
const booking = {
  plate: "1111-test",
  packages: 10,
  weight_kg: 1200,
  reference: "ORD.1/AB-2",
  notes: "Entrega <script> & [PRUEBA]",
  start: "2026-10-15T08:00:00Z",
  rule_code: "R1",
  direction: "INBOUND",
  idempotency_key: "test_request_1234567890",
};
test("public capability uses 256 random bits and only stable SHA256 for persistence", () => {
  const a = generateDockPortalToken(),
    b = generateDockPortalToken();
  assert.ok(dockPortalTokenIsValid(a));
  assert.notEqual(a, b);
  assert.equal(Buffer.from(a, "base64url").length, 32);
  assert.match(dockPortalTokenHash(a), /^[a-f0-9]{64}$/);
  assert.equal(dockPortalTokenHash(a), dockPortalTokenHash(a));
  for (const invalid of [undefined, "short", a + "/", a + " ", a.slice(1)])
    assert.equal(dockPortalTokenIsValid(invalid), false);
});
test("public booking validates strict types, controls, unknown fields and canonical plate", () => {
  const v = validatePortalBooking(booking);
  assert.equal(v.plate, "1111-TEST");
  assert.equal(v.notes, booking.notes);
  for (const invalid of [
    { ...booking, plate: "ß1111" },
    { ...booking, plate: "1111 TEST" },
    { ...booking, packages: "10" },
    { ...booking, packages: 1.1 },
    { ...booking, packages: 61 },
    { ...booking, packages: 0 },
    { ...booking, weight_kg: NaN },
    { ...booking, weight_kg: "1200" },
    { ...booking, weight_kg: 44001 },
    { ...booking, weight_kg: 0 },
    { ...booking, reference: "ORD 1" },
    { ...booking, reference: "x".repeat(41) },
    { ...booking, notes: "line\nline" },
    { ...booking, notes: "\u0085" },
    { ...booking, notes: "x".repeat(501) },
    { ...booking, start: "2026-10-15T08:00:00" },
    { ...booking, direction: "BOTH" },
    { ...booking, idempotency_key: "short" },
    { ...booking, tenant_id: "injected" },
  ])
    assert.throws(() => validatePortalBooking(invalid));
  const reordered = Object.fromEntries(Object.entries(booking).reverse());
  assert.equal(
    portalRequestHash(v),
    portalRequestHash(validatePortalBooking(reordered)),
  );
  assert.notEqual(
    portalRequestHash(v),
    portalRequestHash({ ...v, packages: 11 }),
  );
});
test("IP enforcement identity requires configured secret and trusted valid address", () => {
  const secret = "01".repeat(32);
  assert.equal(dockPortalIpHash(new Headers(), secret), null);
  assert.equal(
    dockPortalIpHash(new Headers({ "x-forwarded-for": "invalid" }), secret),
    null,
  );
  assert.equal(
    dockPortalIpHash(
      new Headers({ "x-forwarded-for": "203.0.113.1" }),
      "short",
    ),
    null,
  );
  const a = dockPortalIpHash(
    new Headers({
      "x-vercel-forwarded-for": "203.0.113.1",
      "x-forwarded-for": "198.51.100.1",
    }),
    secret,
  );
  assert.equal(
    a,
    dockPortalIpHash(
      new Headers({ "x-forwarded-for": "203.0.113.1, 10.0.0.1" }),
      secret,
    ),
  );
  assert.match(a!, /^[a-f0-9]{64}$/);
  assert.ok(!a!.includes("203.0.113"));
});
test("public JSON stream rejects oversized, invalid UTF8 and malformed requests", async () => {
  const req = (body: string | ArrayBuffer) =>
    new Request("http://localhost/", { method: "POST", body });
  assert.deepEqual(await readPortalJson(req(JSON.stringify(booking))), booking);
  await assert.rejects(() => readPortalJson(req(" ".repeat(4097))));
  await assert.rejects(() =>
    readPortalJson(req(new Uint8Array([0xff]).buffer)),
  );
  await assert.rejects(() => readPortalJson(req("{")));
  await assert.rejects(() =>
    readPortalJson(new Request("http://localhost/", { method: "POST" })),
  );
});
test("public bearer token is removed from telemetry paths and referrers", () => {
  for (const path of ["/muelles/p/", "/api/dock-portal/"]) {
    assert.equal(
      normalizeTelemetryPath(`${path}sensitive?date=2026-10-14`),
      `${path}[token]`,
    );
    assert.equal(
      normalizeTelemetryReferrer(`https://fornexasc.com${path}sensitive?x=1`),
      `https://fornexasc.com${path}[token]`,
    );
  }
});
