"use client";

import { useEffect } from "react";
import {
  collectFornexaLocalStorage,
  FORNEXA_LOCAL_STORAGE_MAX_BYTES,
  localStorageFingerprint,
  type LocalStorageMigrationResult,
} from "@/lib/local-storage-migration";

const markerKey = "fornexa-local-storage-sync";
const scheduledEvents = ["fornexa:local-storage-updated", "storage"] as const;
let syncPromise: Promise<void> | null = null;

async function migrateLocalStorage() {
  const entries = collectFornexaLocalStorage();
  if (!entries.length) return;
  const fingerprint = localStorageFingerprint(entries);
  if (window.localStorage.getItem(markerKey) === fingerprint) return;
  const body = JSON.stringify({ sourceOrigin: window.location.origin, entries });
  if (body.length > FORNEXA_LOCAL_STORAGE_MAX_BYTES) {
    console.warn("La migración local de FORNEXA supera el tamaño permitido.");
    return;
  }

  const response = await fetch("/api/storage/migrate-local", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  if (!response.ok) throw new Error("No se pudo migrar el almacenamiento local de FORNEXA.");
  const result = await response.json() as LocalStorageMigrationResult;
  if (result.status === "COMPLETED") window.localStorage.setItem(markerKey, fingerprint);
}

function scheduleMigration() {
  window.setTimeout(() => {
    if (syncPromise) return;
    syncPromise = migrateLocalStorage()
      .catch(error => console.error("FORNEXA local migration", error))
      .finally(() => { syncPromise = null; });
  }, 250);
}

export default function LocalStorageMigrator() {
  useEffect(() => {
    scheduleMigration();
    scheduledEvents.forEach(eventName => window.addEventListener(eventName, scheduleMigration));
    return () => {
      scheduledEvents.forEach(eventName => window.removeEventListener(eventName, scheduleMigration));
    };
  }, []);

  return null;
}
