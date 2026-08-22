import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  shouldClearDeadSession,
  supabaseAuthCookieBase,
  supabaseAuthCookieNames,
} from "../lib/auth-session.ts";

const supabaseUrl = "https://project-ref.supabase.co";

test("derives and matches only this project's auth cookie and chunks", () => {
  assert.equal(supabaseAuthCookieBase(supabaseUrl), "sb-project-ref-auth-token");
  assert.equal(supabaseAuthCookieBase("not a url"), null);
  assert.deepEqual(supabaseAuthCookieNames([
    { name: "sb-project-ref-auth-token" },
    { name: "sb-project-ref-auth-token.0" },
    { name: "sb-project-ref-auth-token.12" },
    { name: "sb-project-ref-auth-token.invalid" },
    { name: "sb-project-ref-auth-token-code-verifier" },
    { name: "sb-another-project-auth-token" },
  ], supabaseUrl), [
    "sb-project-ref-auth-token",
    "sb-project-ref-auth-token.0",
    "sb-project-ref-auth-token.12",
  ]);
});

test("clears cookies only for an absent or invalid server session", () => {
  assert.equal(shouldClearDeadSession(false, null, null), false);
  assert.equal(shouldClearDeadSession(true, "user-id", null), false);
  assert.equal(shouldClearDeadSession(true, null, null), true);
  assert.equal(shouldClearDeadSession(true, null, {
    code: "session_not_found",
    message: "Session no longer exists",
    status: 403,
  }), true);
  assert.equal(shouldClearDeadSession(true, null, {
    name: "AuthSessionMissingError",
    message: "Auth session missing!",
  }), true);
});

test("does not destroy a session during a transient Auth outage", () => {
  assert.equal(shouldClearDeadSession(true, null, {
    message: "upstream request timed out",
    status: 503,
  }), false);
  assert.equal(shouldClearDeadSession(true, null, {
    message: "network connection failed",
  }), false);
});

test("proxy validates identity against Auth instead of trusting JWT claims", async () => {
  const proxySource = await readFile(new URL("../proxy.ts", import.meta.url), "utf8");
  assert.match(proxySource, /supabase\.auth\.getUser\(\)/);
  assert.doesNotMatch(proxySource, /supabase\.auth\.getClaims\(\)/);
  assert.match(proxySource, /supabase\.auth\.signOut\(\{ scope: "local" \}\)/);
});
