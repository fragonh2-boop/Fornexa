"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import styles from "../dashboard/layout.module.css";
import FornexaLogo from "./FornexaLogo";
import { createClient } from "@/lib/supabase/client";

const navigation = [
  ["Control Tower", "/dashboard"],
  ["Decision Center", "/dashboard/decision-center"],
  ["Partidas", "/dashboard/partidas"],
  ["Expediciones", "/dashboard/expediciones"],
  ["Viajes", "/dashboard/viajes"],
  ["Aduanas", "/dashboard/aduanas"],
  ["Ofertas y tarifas", "/dashboard/ofertas-tarifas"],
  ["Clientes", "/dashboard/clientes"],
  ["Colaboradores", "/dashboard/colaboradores"],
  ["Almacenes", "/dashboard/almacenes"],
  ["Tracking", "/dashboard/tracking"],
  ["ePOD & CMR", "/dashboard/epod-cmr"],
  ["Integraciones", "/dashboard/integraciones"],
  ["Informes", "/dashboard/informes"],
] as const;

const recordModules: Record<string, string> = {
  partidas: "/dashboard/partidas",
  expediciones: "/dashboard/expediciones",
  viajes: "/dashboard/viajes",
  "ofertas-tarifas": "/dashboard/ofertas-tarifas",
  clientes: "/dashboard/clientes",
  colaboradores: "/dashboard/colaboradores",
  almacenes: "/dashboard/almacenes",
};

const createRoutes: Record<string, string> = {
  "/dashboard/partidas": "/dashboard/nuevo/partida",
  "/dashboard/expediciones": "/dashboard/nuevo/expedicion",
  "/dashboard/viajes": "/dashboard/nuevo/viaje",
  "/dashboard/ofertas-tarifas": "/dashboard/registros/ofertas-tarifas/nuevo",
  "/dashboard/clientes": "/dashboard/registros/clientes/nuevo",
  "/dashboard/colaboradores": "/dashboard/registros/colaboradores/nuevo",
  "/dashboard/almacenes": "/dashboard/registros/almacenes/nuevo",
  "/dashboard/epod-cmr": "/dashboard/epod-cmr/nuevo",
};

function activeHref(pathname: string) {
  const recordModule = pathname.match(/^\/dashboard\/registros\/([^/]+)/)?.[1];
  if (recordModule) return recordModules[recordModule];
  const newModule = pathname.match(/^\/dashboard\/nuevo\/([^/]+)/)?.[1];
  if (newModule === "partida") return "/dashboard/partidas";
  if (newModule === "expedicion") return "/dashboard/expediciones";
  if (newModule === "viaje") return "/dashboard/viajes";
  return navigation.slice(1).find(([, href]) => pathname === href || pathname.startsWith(`${href}/`))?.[1] ?? "/dashboard";
}

function createHref(pathname: string, currentHref: string) {
  if (pathname.startsWith("/dashboard/nuevo/") || pathname.endsWith("/nuevo")) return null;
  return createRoutes[currentHref] ?? null;
}

function isPlusShortcut(event: KeyboardEvent) {
  if (event.code === "NumpadAdd") return !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
  if (event.key === "+") return !event.altKey && !event.ctrlKey && !event.metaKey;
  return false;
}

export default function DashboardSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const currentHref = activeHref(pathname);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    function openNewRecord(event: KeyboardEvent) {
      if (!isPlusShortcut(event) || event.repeat) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || Boolean(target.closest("input, textarea, select, [contenteditable='true']")))) return;
      const href = createHref(pathname, currentHref);
      if (!href) return;
      event.preventDefault();
      window.scrollTo(0, 0);
      router.push(href);
    }
    window.addEventListener("keydown", openNewRecord);
    return () => window.removeEventListener("keydown", openNewRecord);
  }, [router, pathname, currentHref]);

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
    <aside className={styles.sidebar}>
      <Link href="/dashboard" className={styles.brand}><FornexaLogo className={styles.brandLogo} /></Link>
      <nav className={styles.nav} aria-label="Navegación principal">
        {navigation.map(([label, href]) => {
          const active = href === currentHref;
          return <Link key={href} href={href} scroll className={active ? styles.active : ""} aria-current={active ? "page" : undefined} onClick={() => window.scrollTo(0, 0)}>{label}</Link>;
        })}
      </nav>
      <div className={styles.footer}>
        <span>FORNEXA</span>
        <small>Supply Chain Suite</small>
        <button type="button" className={styles.signOut} onClick={handleSignOut} disabled={signingOut}>
          {signingOut ? "Cerrando sesión…" : "Cerrar sesión"}
        </button>
      </div>
    </aside>
  );
}
