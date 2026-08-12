export const FORNEXA_LOCAL_STORAGE_PREFIX = "fornexa-";
export const FORNEXA_LOCAL_STORAGE_MAX_BYTES = 4_000_000;

export type LocalStorageEntry = {
  key: string;
  value: unknown;
};

export type LocalStorageMigrationRequest = {
  sourceOrigin: string;
  entries: LocalStorageEntry[];
};

export type LocalStorageMigrationResult = {
  status: "COMPLETED";
  runId: string;
  storageKeys: number;
  sourceItems: number;
  normalizedRecords: number;
  summary: Record<string, number>;
};

export function collectFornexaLocalStorage(): LocalStorageEntry[] {
  const entries: LocalStorageEntry[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key || !key.startsWith(FORNEXA_LOCAL_STORAGE_PREFIX) || isPresentationSetting(key)) continue;
    const raw = window.localStorage.getItem(key);
    if (raw == null) continue;
    try { entries.push({ key, value: JSON.parse(raw) }); }
    catch { entries.push({ key, value: raw }); }
  }
  return entries.sort((left, right) => left.key.localeCompare(right.key));
}

export function localStorageFingerprint(entries: LocalStorageEntry[]) {
  return entries.map(entry => `${entry.key}:${stableStringify(entry.value)}`).join("|");
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function isPresentationSetting(key: string) {
  return key.startsWith("fornexa-grid-") || key === "fornexa-local-storage-sync";
}
