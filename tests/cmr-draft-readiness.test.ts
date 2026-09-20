import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { cmrDraftReadiness, createEmptyCmrDraft } from "../lib/cmr-draft-readiness.ts";

const page = readFileSync("app/dashboard/epod-cmr/nuevo/page.tsx", "utf8");
const route = readFileSync("app/api/cmr/route.ts", "utf8");

function completeDraft() {
  return {
    ...createEmptyCmrDraft(),
    expediciones: ["EX-TEST-001"],
    customerIds: ["CUSTOMER-TEST-001"],
    expedidor: "Expedidor de prueba",
    destinatario: "Destinatario de prueba",
    carga: "Origen de prueba",
    entrega: "Destino de prueba",
    transportista: "Transportista de prueba",
    mercancia: "Mercancía de prueba",
    peso: "100",
  };
}

test("a new CMR draft starts empty, incomplete and unable to represent demo data", () => {
  const draft = createEmptyCmrDraft();
  assert.deepEqual(draft.expediciones, []);
  assert.deepEqual(draft.customerIds, []);
  for (const [key, value] of Object.entries(draft)) {
    if (key === "source" || Array.isArray(value)) continue;
    assert.equal(value, "", `${key} must start empty`);
  }
  assert.deepEqual(cmrDraftReadiness(draft), {
    missing: ["Expedición", "Customer ID", "Expedidor", "Destinatario", "Lugar de carga", "Lugar de entrega", "Transportista", "Mercancía", "Peso bruto"],
    completeness: 0,
  });
});

test("readiness accepts complete expedition input and rejects whitespace-only legal fields", () => {
  const complete = completeDraft();
  assert.deepEqual(cmrDraftReadiness(complete), { missing: [], completeness: 100 });
  assert.deepEqual(cmrDraftReadiness({ ...complete, expedidor: "   " }).missing, ["Expedidor"]);
});

test("trip and ADR selections add their own required data", () => {
  const tripDraft = { ...completeDraft(), source: "viaje", expediciones: [], viaje: "" };
  assert.deepEqual(cmrDraftReadiness(tripDraft).missing, ["Expedición", "Viaje"]);
  assert.deepEqual(cmrDraftReadiness({ ...tripDraft, viaje: "VJ-TEST-001" }).missing, ["Expedición"]);
  assert.deepEqual(cmrDraftReadiness({ ...tripDraft, viaje: "VJ-TEST-001", expediciones: ["EX-TEST-001"] }).missing, []);

  const adrDraft = { ...completeDraft(), adr: "S", adrRegime: "" };
  assert.deepEqual(cmrDraftReadiness(adrDraft).missing, ["Régimen ADR"]);
  assert.equal(cmrDraftReadiness({ ...adrDraft, adrRegime: "1.1.3.6" }).completeness, 100);
});

test("trip readiness preserves the API invariant that a trip CMR needs an expedition", () => {
  assert.ok(route.includes('if (!expeditionRecords.length)'));
  assert.ok(route.includes('Un CMR asociado a Viaje necesita al menos una Expedición operativa.'));
});

test("the page and API share readiness and the issue button remains fail-closed", () => {
  assert.ok(page.includes("createEmptyCmrDraft()"));
  assert.ok(page.includes("cmrDraftReadiness(form)"));
  assert.ok(page.includes("disabled={missing.length>0||issuing}"));
  assert.ok(route.includes("cmrDraftReadiness(input)"));
});
