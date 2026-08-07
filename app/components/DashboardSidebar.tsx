"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "../dashboard/layout.module.css";

const navigation = [
  ["Control Tower", "/dashboard"],
  ["Decision Center", "/dashboard/decision-center"],
  ["Partidas", "/dashboard/partidas"],
  ["Expediciones", "/dashboard/expediciones"],
  ["Viajes", "/dashboard/viajes"],\n  ["Aduanas", "/dashboard/aduanas"],
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

function activeHref(pathname: string) {
  const recordModule = pathname.match(/^\/dashboard\/registros\/([^/]+)/)?.[1];
  if (recordModule) return recordModules[recordModule];

  const newModule = pathname.match(/^\/dashboard\/nuevo\/([^/]+)/)?.[1];
  if (newModule === "partida") return "/dashboard/partidas";
  if (newModule === "expedicion") return "/dashboard/expediciones";

  return navigation
    .slice(1)
    .find(([, href]) => pathname === href || pathname.startsWith(`${href}/`))?.[1] ?? "/dashboard";
}

export default function DashboardSidebar() {
  const pathname = usePathname();
  const currentHref = activeHref(pathname);

  return (
    <aside className={styles.sidebar}>
      <Link href="/dashboard" className={styles.brand}>FORNEXA</Link>
      <nav className={styles.nav} aria-label="Navegación principal">
        {navigation.map(([label, href]) => {
          const active = href === currentHref;
          return (
            <Link
              key={href}
              href={href}
              scroll
              className={active ? styles.active : ""}
              aria-current={active ? "page" : undefined}
              onClick={() => window.scrollTo(0, 0)}
            >
              {label}
            </Link>
          );
        })}
      </nav>
      <div className={styles.footer}>
        <span>FORNEXA Suite</span>
        <small>Navegación unificada</small>
      </div>
    </aside>
  );
}
