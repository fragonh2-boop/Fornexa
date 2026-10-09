export type StorageProvider = "local" | "claude_space";

export interface StorageConfig {
  provider: StorageProvider;
  localDirectory: string;
  claudeSpaceAccount: string;
}

export const DEFAULT_STORAGE_CONFIG: StorageConfig = {
  provider: "local",
  localDirectory: "/Users/Shared/fornexa-adjuntos",
  claudeSpaceAccount: "workspace-claude-default",
};

const STORAGE_KEY = "fornexa_storage_config";
export const STORAGE_UPDATED_EVENT = "fornexa-storage-config-updated";

export function getStorageConfig(): StorageConfig {
  if (typeof window === "undefined" || !window.localStorage) {
    return DEFAULT_STORAGE_CONFIG;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STORAGE_CONFIG;
    const parsed = JSON.parse(raw) as Partial<StorageConfig>;
    return {
      provider: parsed.provider === "claude_space" ? "claude_space" : "local",
      localDirectory: typeof parsed.localDirectory === "string" && parsed.localDirectory.trim()
        ? parsed.localDirectory.trim()
        : DEFAULT_STORAGE_CONFIG.localDirectory,
      claudeSpaceAccount: typeof parsed.claudeSpaceAccount === "string" && parsed.claudeSpaceAccount.trim()
        ? parsed.claudeSpaceAccount.trim()
        : DEFAULT_STORAGE_CONFIG.claudeSpaceAccount,
    };
  } catch {
    return DEFAULT_STORAGE_CONFIG;
  }
}

export function saveStorageConfig(updated: Partial<StorageConfig>): StorageConfig {
  const current = getStorageConfig();
  const next: StorageConfig = {
    ...current,
    ...updated,
  };

  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent(STORAGE_UPDATED_EVENT, { detail: next }));
    } catch (e) {
      console.error("Error saving storage config to localStorage", e);
    }
  }

  return next;
}

export function resetStorageConfig(): StorageConfig {
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      window.dispatchEvent(new CustomEvent(STORAGE_UPDATED_EVENT, { detail: DEFAULT_STORAGE_CONFIG }));
    } catch (e) {
      console.error("Error resetting storage config", e);
    }
  }

  return DEFAULT_STORAGE_CONFIG;
}
