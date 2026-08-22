import test from "node:test";
import assert from "node:assert/strict";
import { defaultAdrDeclaration, evaluateAdrWarnings, shouldBlockForPolicy } from "../lib/adr.ts";

test("applies customer ADR defaults without hiding exceptions", () => {
  assert.equal(defaultAdrDeclaration("ALWAYS"), "YES");
  assert.equal(defaultAdrDeclaration("SOMETIMES"), "UNANSWERED");
  assert.equal(defaultAdrDeclaration("NEVER"), "NO");
});

test("warns instead of blocking unresolved ADR by default", () => {
  const warnings = evaluateAdrWarnings("YES", "SOMETIMES", [{ hazardStatus: "UNKNOWN" }]);
  assert.equal(warnings.some(item => item.code === "ADR_LINE_UNRESOLVED"), true);
  assert.equal(shouldBlockForPolicy("WARNING", warnings), false);
  assert.equal(shouldBlockForPolicy("BLOCKING", warnings), true);
});

test("detects a dangerous article under a non ADR header", () => {
  const warnings = evaluateAdrWarnings("NO", "NEVER", [{
    hazardStatus: "HAZMAT",
    hazmatEntryId: "entry-id",
    netQuantity: 20,
    quantityUom: "kg",
    packageCount: 2,
    packagingTypeId: "4G",
  }]);
  assert.equal(warnings.some(item => item.code === "ADR_HEADER_LINE_CONFLICT"), true);
});

