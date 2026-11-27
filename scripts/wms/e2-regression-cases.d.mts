export type E2RegressionOptions = {
  sql: (text: string) => Promise<{ rows: Record<string, unknown>[] }>;
  action: (actor: string, action: string, payload: unknown, key?: string | null) => Promise<Record<string, unknown> | undefined>;
  tenant: string;
  warehouse: string;
  product: string;
  sourceBin: string;
  destinationBin: string;
  planner: string;
  operator: string;
};
export function runE2RegressionCases(options: E2RegressionOptions): Promise<Array<{ case: string; status: "PASS" }>>;
