import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  normalizeTelemetryPath,
  normalizeTelemetryReferrer,
  telemetryNetworkIdentity,
} from "../lib/platform-telemetry.ts";

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test("TLM-1 network identity is fail-safe when the dedicated hash secret is missing", () => {
  const original = process.env.FORNEXA_TELEMETRY_HASH_SECRET;
  const headers = new Headers({
    "x-vercel-forwarded-for": "203.0.113.10, 10.0.0.1",
  });

  try {
    delete process.env.FORNEXA_TELEMETRY_HASH_SECRET;
    assert.deepEqual(telemetryNetworkIdentity(headers), {
      ip: null,
      ip_hash: null,
    });
  } finally {
    restoreEnv("FORNEXA_TELEMETRY_HASH_SECRET", original);
  }
});

test("TLM-1 network identity persists raw IP together with HMAC only when configured", () => {
  const original = process.env.FORNEXA_TELEMETRY_HASH_SECRET;
  const secret = "tlm-test-secret-not-for-production";
  const ip = "203.0.113.10";
  const headers = new Headers({ "x-vercel-forwarded-for": ip });

  try {
    process.env.FORNEXA_TELEMETRY_HASH_SECRET = secret;
    assert.deepEqual(telemetryNetworkIdentity(headers), {
      ip,
      ip_hash: createHmac("sha256", secret).update(ip).digest("hex"),
    });
  } finally {
    restoreEnv("FORNEXA_TELEMETRY_HASH_SECRET", original);
  }
});

test("TLM-1 network identity remains null when no client IP is available", () => {
  const original = process.env.FORNEXA_TELEMETRY_HASH_SECRET;
  try {
    process.env.FORNEXA_TELEMETRY_HASH_SECRET = "configured-test-secret";
    assert.deepEqual(telemetryNetworkIdentity(new Headers()), {
      ip: null,
      ip_hash: null,
    });
  } finally {
    restoreEnv("FORNEXA_TELEMETRY_HASH_SECRET", original);
  }
});

test("request and auth telemetry use the same fail-safe network identity helper", () => {
  const helper = readFileSync("lib/platform-telemetry.ts", "utf8");
  const authRoute = readFileSync("app/api/telemetry/event/route.ts", "utf8");

  assert.match(helper, /const network = telemetryNetworkIdentity\(request\.headers\)/);
  assert.match(helper, /\.\.\.network,/);
  assert.match(authRoute, /const network = telemetryNetworkIdentity\(request\.headers\)/);
  assert.match(authRoute, /\.\.\.network,/);
  assert.doesNotMatch(authRoute, /telemetryClientIp|telemetryIpHash/);
});

test("TLM-1 redacts regulatory bearer capabilities from paths and referrers", () => {
  assert.equal(
    normalizeTelemetryPath("/regulatory/d/raw-secret-token?download=1"),
    "/regulatory/d/[token]",
  );
  assert.equal(
    normalizeTelemetryReferrer("https://fornexasc.com/regulatory/d/raw-secret-token?download=1"),
    "https://fornexasc.com/regulatory/d/[token]",
  );
});
