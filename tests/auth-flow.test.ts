import assert from "node:assert/strict";
import test from "node:test";
import {
  authEmailCopy,
  isSafeTokenHash,
  loginErrorMessage,
  parseAuthEmailFlow,
  recoveryVerificationPath,
  resetPasswordPath,
  safeInternalPath,
} from "../lib/auth-flow.ts";

test("email auth flow accepts only the explicit first-access value", () => {
  assert.equal(parseAuthEmailFlow("first-access"), "first-access");
  assert.equal(parseAuthEmailFlow("recover"), "recover");
  assert.equal(parseAuthEmailFlow("magiclink"), "recover");
  assert.equal(parseAuthEmailFlow(null), "recover");
});

test("first access and recovery land on the correct reset-password route", () => {
  assert.equal(resetPasswordPath("first-access"), "/reset-password?firstAccess=1");
  assert.equal(resetPasswordPath("recover"), "/reset-password");
  assert.equal(recoveryVerificationPath("first-access"), "/auth/verify?flow=first-access");
  assert.equal(recoveryVerificationPath("recover"), "/auth/verify?flow=recover");
});

test("recovery tokens are bounded and cookie-safe before storage", () => {
  assert.equal(isSafeTokenHash("abcDEF_123-xyz.~"), true);
  assert.equal(isSafeTokenHash("contains=padding"), false);
  assert.equal(isSafeTokenHash("line\nbreak"), false);
  assert.equal(isSafeTokenHash("a".repeat(1025)), false);
  assert.equal(isSafeTokenHash(null), false);
});

test("post-login redirects accept internal paths and reject open redirects", () => {
  assert.equal(safeInternalPath("/dashboard/viajes?today=1", "/dashboard"), "/dashboard/viajes?today=1");
  assert.equal(safeInternalPath("//attacker.example", "/dashboard"), "/dashboard");
  assert.equal(safeInternalPath("/\\attacker.example", "/dashboard"), "/dashboard");
  assert.equal(safeInternalPath("https://attacker.example", "/dashboard"), "/dashboard");
  assert.equal(safeInternalPath("/dashboard\nLocation: https://attacker.example", "/dashboard"), "/dashboard");
  assert.equal(safeInternalPath(null, "/dashboard"), "/dashboard");
});

test("login errors remain useful without leaking raw provider details", () => {
  assert.match(loginErrorMessage("Invalid login credentials"), /correo o la contraseña/i);
  assert.match(loginErrorMessage("Email not confirmed"), /confirmar primero/i);
  assert.match(loginErrorMessage("rate limit exceeded"), /demasiados intentos/i);
  assert.equal(
    loginErrorMessage("unexpected backend detail: user 123 does not exist"),
    "No se ha podido iniciar sesión. Revisa tus datos o inténtalo de nuevo más tarde.",
  );
});

test("first-access email copy is distinct from password recovery", () => {
  assert.equal(authEmailCopy("first-access").tag, "first-access");
  assert.equal(authEmailCopy("recover").tag, "password-recovery");
  assert.notEqual(authEmailCopy("first-access").subject, authEmailCopy("recover").subject);
});
