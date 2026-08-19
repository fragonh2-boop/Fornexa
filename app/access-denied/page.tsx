"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AccessDeniedPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function signOut() {
    setLoading(true);
    try {
      const supabase = await createClient();
      await supabase.auth.signOut();
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#eef3f9" }}>
      <section style={{ width: "100%", maxWidth: 560, padding: 32, borderRadius: 18, background: "white", border: "1px solid #dbe4ef", fontFamily: "Arial, sans-serif", color: "#172033" }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.2, color: "#66758a" }}>FORNEXA ACCESS</span>
        <h1>Acceso no asignado</h1>
        <p>Tu identidad se ha verificado, pero esta cuenta no tiene una empresa o permiso activo asociado en FORNEXA.</p>
        <p>Solicita a un administrador que te asigne al tenant correspondiente antes de acceder al producto.</p>
        <button type="button" onClick={signOut} disabled={loading} style={{ marginTop: 12, padding: "12px 18px", border: 0, borderRadius: 10, cursor: "pointer", fontWeight: 700 }}>
          {loading ? "Cerrando sesión…" : "Cerrar sesión"}
        </button>
      </section>
    </main>
  );
}
