export type RecoveryMode = "ROLLBACK" | "PRESERVE_HU";
export interface RecoveryInputs {
  mode: RecoveryMode;
  c3Source: string;
  rollbackSource?: string;
  recoverySource?: string;
}
export interface RecoveryBundle {
  sql: string;
  mode: RecoveryMode;
  c3SourceSha256: string;
  c3BodySha256: string;
  operationSourceSha256: string;
  effectiveSqlSha256: string;
}
export const C3_SOURCE_SHA256: string;
export const C3_BODY_SHA256: string;
export function extractC3Restore(source: string): { sql: string; sourceSha256: string; bodySha256: string };
export function buildE2RecoverySql(inputs: RecoveryInputs): RecoveryBundle;
