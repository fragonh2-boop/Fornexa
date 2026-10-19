export function validateIsolation(config: { host?: string; database?: string }): void;
export function validateDisposableDatabase(dbClient: unknown, type: string): Promise<void>;
export function runHarness(): Promise<unknown>;
