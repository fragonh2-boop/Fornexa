import assert from "node:assert/strict";
import test from "node:test";
import { buildSubdivisionId, frenchDepartments, inferSubdivisionFromPostalCode, spanishProvinces, subdivisionMatchesPostalCode } from "../lib/geography-master.ts";

test("French department 66 produces a postal-first stable key", () => {
  const department = frenchDepartments.find(([code]) => code === "66");
  assert.deepEqual(department, ["66", "Pyrénées-Orientales"]);
  assert.equal(buildSubdivisionId("FR", "66", "66"), "66-FR-66");
});

test("Perpignan postal codes infer Pyrénées-Orientales", () => {
  const subdivisions = frenchDepartments.map(([code, name]) => ({
    id: buildSubdivisionId("FR", code, code === "2A" || code === "2B" ? "20" : code),
    code,
    name,
    postalPrefix: code === "2A" || code === "2B" ? "20" : code,
  }));
  const result = inferSubdivisionFromPostalCode(subdivisions, "66000");
  assert.equal(result?.code, "66");
  assert.equal(result?.name, "Pyrénées-Orientales");
  assert.equal(result?.id, "66-FR-66");
});

test("Spanish province prefixes remain aligned with postal codes", () => {
  const valencia = spanishProvinces.find(([code]) => code === "46");
  assert.deepEqual(valencia, ["46", "Valencia"]);
  assert.equal(subdivisionMatchesPostalCode({ postalPrefix: "46" }, "46023"), true);
  assert.equal(subdivisionMatchesPostalCode({ postalPrefix: "46" }, "08001"), false);
});

test("countries without postal subdivision semantics do not invent a postal rule", () => {
  assert.equal(subdivisionMatchesPostalCode({ postalPrefix: null }, "SW1A 1AA"), true);
});
