export type DashboardBasePath = "/dashboard" | "/demo";

// The same hierarchy is rendered in the authenticated app and the isolated demo.
export const dashboardNavigation = [
  ["Control Tower", ""],
  ["Partidas", "/partidas"],
  ["Expediciones", "/expediciones"],
  ["Viajes", "/viajes"],
  ["Aduanas", "/aduanas"],
  ["Ofertas y tarifas", "/ofertas-tarifas"],
  ["Clientes", "/clientes"],
  ["Artículos", "/articulos"],
  ["Colaboradores", "/colaboradores"],
  ["Almacenes", "/almacenes"],
  ["Tracking", "/tracking"],
  ["ePOD & CMR", "/epod-cmr"],
  ["Integraciones", "/integraciones"],
  ["Informes", "/informes"],
] as const;

const recordModules: Record<string, string> = {
  partidas: "/partidas",
  expediciones: "/expediciones",
  viajes: "/viajes",
  "ofertas-tarifas": "/ofertas-tarifas",
  clientes: "/clientes",
  colaboradores: "/colaboradores",
  almacenes: "/almacenes",
};

const createRoutes: Record<string, string> = {
  "/partidas": "/nuevo/partida",
  "/expediciones": "/nuevo/expedicion",
  "/viajes": "/nuevo/viaje",
  "/ofertas-tarifas": "/registros/ofertas-tarifas/nuevo",
  "/clientes": "/registros/clientes/nuevo",
  "/colaboradores": "/registros/colaboradores/nuevo",
  "/almacenes": "/registros/almacenes/nuevo",
  "/epod-cmr": "/epod-cmr/nuevo",
};

export function dashboardHref(basePath: DashboardBasePath, suffix = "") {
  return `${basePath}${suffix}`;
}

function relativePath(pathname: string, basePath: DashboardBasePath) {
  return pathname === basePath || pathname.startsWith(`${basePath}/`) ? pathname.slice(basePath.length) : "";
}

export function activeDashboardHref(pathname: string, basePath: DashboardBasePath) {
  const path = relativePath(pathname, basePath);
  const recordModule = path.match(/^\/registros\/([^/]+)/)?.[1];
  if (recordModule && recordModules[recordModule]) return dashboardHref(basePath, recordModules[recordModule]);
  const newModule = path.match(/^\/nuevo\/([^/]+)/)?.[1];
  if (newModule === "partida") return dashboardHref(basePath, "/partidas");
  if (newModule === "expedicion") return dashboardHref(basePath, "/expediciones");
  if (newModule === "viaje") return dashboardHref(basePath, "/viajes");
  const suffix = dashboardNavigation.slice(1).find(([, route]) => path === route || path.startsWith(`${route}/`))?.[1] ?? "";
  return dashboardHref(basePath, suffix);
}

export function createDashboardHref(pathname: string, currentHref: string, basePath: DashboardBasePath) {
  const path = relativePath(pathname, basePath);
  if (path.startsWith("/nuevo/") || path.endsWith("/nuevo")) return null;
  const suffix = createRoutes[relativePath(currentHref, basePath)];
  return suffix ? dashboardHref(basePath, suffix) : null;
}

export function isPlusShortcut(event: Pick<KeyboardEvent, "code" | "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey">) {
  if (event.code === "NumpadAdd") return !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
  if (event.key === "+") return !event.altKey && !event.ctrlKey && !event.metaKey;
  return false;
}
