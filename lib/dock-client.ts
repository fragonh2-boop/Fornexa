"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { EMPTY_DOCK_DATA, type DockData } from "./docks";
export function useDockData(from: string, until: string, enabled = true) {
  const [data, setData] = useState<DockData>(EMPTY_DOCK_DATA),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(enabled);
  const requestId = useRef(0);
  const load = useCallback(async () => {
    if (!enabled) return;
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/docks?from=${encodeURIComponent(from)}&until=${encodeURIComponent(until)}`,
        { cache: "no-store" },
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "No se pudo cargar Muelles.");
      if (currentRequest === requestId.current) setData(body);
    } catch (e) {
      if (currentRequest === requestId.current)
        setError(e instanceof Error ? e.message : "No se pudo cargar Muelles.");
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [from, until, enabled]);
  useEffect(() => {
    void load();
    return () => {
      requestId.current += 1;
    };
  }, [load]);
  return { data, error, loading, load, setError };
}
export async function dockMutation(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || "No se pudo guardar.");
  return result;
}
