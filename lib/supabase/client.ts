import { createBrowserClient } from "@supabase/ssr";

let clientPromise: ReturnType<typeof loadClient> | null = null;

async function loadClient() {
  const response = await fetch("/api/supabase-config", {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });

  const data = await response.json();

  if (!response.ok || !data?.url || !data?.key) {
    const missing = data?.missing;
    if (missing?.url && missing?.key) {
      throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY en Vercel.");
    }
    if (missing?.url) {
      throw new Error("Falta NEXT_PUBLIC_SUPABASE_URL en Vercel.");
    }
    if (missing?.key) {
      throw new Error("Falta NEXT_PUBLIC_SUPABASE_ANON_KEY en Vercel.");
    }
    throw new Error(data?.error || "No se ha podido cargar la configuración de Supabase.");
  }

  return createBrowserClient(data.url, data.key);
}

export function createClient() {
  if (!clientPromise) {
    clientPromise = loadClient().catch((error: unknown) => {
      // A transient config/network failure must not poison every later login
      // attempt in this tab. Keep successful clients cached, but let retries
      // perform a fresh load.
      clientPromise = null;
      throw error;
    });
  }
  return clientPromise;
}
