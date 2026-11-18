export function sha256(source: string): string;
export function stripExteriorTx(source: string): {
  totalStatements: number;
  innerStatements: string[];
  innerStatementCount: number;
  effectiveBodySql: string;
  effectiveBodySha256: string;
};
export const DISPOSABLE_DATABASES: readonly string[];
export const LOOPBACK_HOSTS: readonly string[];
export const DESTRUCTIVE_CONFIRM_ENV: string;
export const DESTRUCTIVE_CONFIRM_TOKEN: string;
export function assertDisposableTarget(target?: { host?: string; database?: string }, env?: Record<string, string | undefined>): void;
interface QueryResult { rows: Record<string, unknown>[] }
interface HarnessClient {
  connect(): Promise<void>;
  end(): Promise<void>;
  query(sql: string): Promise<QueryResult | QueryResult[]>;
}
export function runContingencyHarness(options?: {
  useRealPostgres?: boolean;
  pgDriver?: { Client: new (config: Record<string, string | number>) => HarnessClient };
  env?: Record<string, string | undefined>;
}): Promise<Record<string, unknown>>;
