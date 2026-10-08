"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../dashboard/layout.module.css";
import DashboardSidebarView from "./DashboardSidebarView";
import { createClient } from "@/lib/supabase/client";

export default function DashboardSidebar() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const supabase = await createClient();
      await supabase.auth.signOut();
      router.replace("/login");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <DashboardSidebarView sessionAction={
        <button type="button" className={styles.signOut} onClick={handleSignOut} disabled={signingOut}>
          {signingOut ? "Cerrando sesión…" : "Cerrar sesión"}
        </button>
    } />
  );
}
