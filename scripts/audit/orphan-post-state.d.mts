export function assertEmptySearchPath(setting: string, functionName: string): void;
export function verifyCustomsTenantColumns(query: (sql: string) => string | Promise<string>): Promise<Array<{
  table: string;
  type: string;
  nullable: boolean;
  default_seed: boolean;
  tenant_foreign_key_delete_restrict: boolean;
}>>;
