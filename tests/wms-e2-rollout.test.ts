import assert from "node:assert/strict";
import test from "node:test";
import { isWmsE2Enabled, isWmsE2Action } from "../lib/wms-e2-rollout.ts";

test("only the exact server opt-in enables E2; C3 replenishment remains available", () => {
  const previous = process.env.FORNEXA_WMS_E2_ENABLED;
  try {
    for (const value of [undefined, "", "false", "1", "TRUE"]) {
      if (value === undefined) delete process.env.FORNEXA_WMS_E2_ENABLED;
      else process.env.FORNEXA_WMS_E2_ENABLED = value;
      assert.equal(isWmsE2Enabled(), false);
    }
    process.env.FORNEXA_WMS_E2_ENABLED = "true";
    assert.equal(isWmsE2Enabled(), true);
    assert.equal(isWmsE2Action("REPLENISH", { task_id: "task" }), false);
    assert.equal(isWmsE2Action("REPLENISH", { proposal_id: "proposal" }), true);
    assert.equal(isWmsE2Action("LOAD", {}), false);
  } finally {
    if (previous === undefined) delete process.env.FORNEXA_WMS_E2_ENABLED;
    else process.env.FORNEXA_WMS_E2_ENABLED = previous;
  }
});
