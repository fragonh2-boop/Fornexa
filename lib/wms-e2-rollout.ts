/** Server-owned rollout switch. Enable only after the isolated rehearsal and DB verification. */
export function isWmsE2Enabled(): boolean {
  return process.env.FORNEXA_WMS_E2_ENABLED === "true";
}

export function isWmsE2Action(action: string, payload: Record<string, unknown>): boolean {
  return ["EVALUATE_REPLENISHMENT", "APPROVE_PROPOSAL", "REJECT_PROPOSAL", "CANCEL_PROPOSAL"].includes(action)
    || (action === "REPLENISH" && "proposal_id" in payload);
}
