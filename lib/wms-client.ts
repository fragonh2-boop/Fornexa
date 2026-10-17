"use client";
import { useCallback, useEffect, useState } from "react";
import { EMPTY_WMS_DATA, type WmsAction, type WmsOverviewData } from "./wms";

export interface WmsClientData extends WmsOverviewData {
  canEdit: boolean;
  canConfigure: boolean;
}

export function useWmsData() {
  const [data, setData] = useState<WmsClientData>({
    ...EMPTY_WMS_DATA,
    canEdit: false,
    canConfigure: false,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/wms", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "No se pudieron cargar los datos de almacenes.");
      } else {
        setData(json);
        setError(null);
      }
    } catch {
      setError("Error de conexión al cargar almacenes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, setError, load };
}

export async function wmsMutation(
  action: WmsAction,
  payload: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<{ ok: boolean; data?: any; error?: string; code?: string }> {
  const key =
    idempotencyKey ??
    `WMS-${action}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    const res = await fetch("/api/wms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        payload,
        idempotency_key: key,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      return {
        ok: false,
        error: json.error ?? "Operación rechazada por el motor de almacén.",
        code: json.code,
      };
    }
    return { ok: true, data: json.result };
  } catch {
    return {
      ok: false,
      error: "No se pudo comunicar con el servidor de almacenes.",
    };
  }
}
