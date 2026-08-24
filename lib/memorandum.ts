export type MemorandumSurface = "Web" | "Mobile" | "Plataforma";

export type MemorandumRelease = {
  version: string;
  date: string;
  surface: MemorandumSurface[];
  title: string;
  purpose: string;
  outcome: string;
  status: "Producción" | "Canal interno" | "Hito de producto";
};

export type MemorandumPending = {
  area: "Funcional" | "Técnico";
  title: string;
  summary: string;
  priority: "Ahora" | "Siguiente";
  state: "Por definir" | "Pendiente" | "En seguimiento";
};

export const memorandumUpdatedAt = "25 ago 2026";
export const memorandumCommitCoverage = 489;

export const memorandumPending: MemorandumPending[] = [
  {
    area: "Técnico",
    title: "Auditoría UX transversal",
    summary: "Revisar consistencia de controles, estados vacíos, accesibilidad y comportamiento responsive en todo el aplicativo.",
    priority: "Siguiente",
    state: "En seguimiento",
  },
  {
    area: "Técnico",
    title: "Activación del maestro ADR 2025",
    summary: "Importar y verificar la fuente oficial, sus embalajes y reglas antes de activar el cálculo regulatorio.",
    priority: "Ahora",
    state: "Pendiente",
  },
  {
    area: "Funcional",
    title: "Autonomía de tenants",
    summary: "Definir cómo un nuevo cliente configura y administra su organización; decidir el alcance de OWNER y ADMIN.",
    priority: "Ahora",
    state: "Por definir",
  },
  {
    area: "Técnico",
    title: "Control Tower con fuente única",
    summary: "Completar la sustitución de indicadores de demostración por datos operativos trazables y aislados por tenant.",
    priority: "Siguiente",
    state: "Pendiente",
  },
  {
    area: "Técnico",
    title: "Cobertura de recorridos críticos",
    summary: "Consolidar pruebas E2E de acceso, alta inicial, operación tenant y continuidad Web–Mobile.",
    priority: "Siguiente",
    state: "En seguimiento",
  },
  {
    area: "Técnico",
    title: "Canal estable de Mobile",
    summary: "Formalizar promoción, distribución y trazabilidad de cada build Android más allá del canal interno.",
    priority: "Siguiente",
    state: "Pendiente",
  },
];

export const memorandumReleases: MemorandumRelease[] = [
  {
    version: "2026.08.25",
    date: "25 ago 2026",
    surface: ["Web", "Plataforma"],
    title: "Servicios canónicos y ayudas contextuales",
    purpose: "Eliminar coberturas importadas como servicios y mantener alineados los formularios con ayuda accionable.",
    outcome: "Catálogo depurado, campos alineados y avisos enlazados directamente a la configuración correspondiente.",
    status: "Producción",
  },
  {
    version: "2026.08.23.2",
    date: "23 ago 2026",
    surface: ["Web", "Plataforma"],
    title: "Direcciones reutilizables y formularios explícitos",
    purpose: "Evitar selecciones aparentes y centralizar los puntos operativos sin duplicar direcciones.",
    outcome: "Controles alineados, estados Seleccionar, direcciones compartibles por cliente y uso controlado desde su configuración.",
    status: "Producción",
  },
  {
    version: "2026.08.23",
    date: "23 ago 2026",
    surface: ["Web", "Plataforma"],
    title: "Clasificación ADR trazable por artículo",
    purpose: "Acelerar la identificación de mercancías peligrosas sin permitir códigos regulatorios manuales.",
    outcome: "Perfiles por cliente, artículos reutilizables, clasificación por línea, advertencias configurables, revisiones y auditoría.",
    status: "Producción",
  },
  {
    version: "2026.08.22",
    date: "22 ago 2026",
    surface: ["Web", "Plataforma"],
    title: "Continuidad de sesión y acceso",
    purpose: "Evitar bloqueos ante sesiones revocadas, incompletas o caducadas.",
    outcome: "Recuperación segura de sesión, limpieza de credenciales inválidas y regresiones cubiertas.",
    status: "Producción",
  },
  {
    version: "2026.08.21",
    date: "21 ago 2026",
    surface: ["Web"],
    title: "Primera configuración y enlaces seguros",
    purpose: "Hacer comprensible el primer acceso y robustecer el uso de enlaces desde cualquier dispositivo.",
    outcome: "Onboarding renovado, preferencias persistentes y protección frente a consumo automático del enlace.",
    status: "Producción",
  },
  {
    version: "2026.08.20",
    date: "20 ago 2026",
    surface: ["Web", "Plataforma"],
    title: "Recuperación de acceso entre dispositivos",
    purpose: "Separar la verificación del navegador que solicita el correo.",
    outcome: "Generación y validación de recuperación en servidor, redirecciones y caché endurecidas.",
    status: "Producción",
  },
  {
    version: "Mobile 0.7.0",
    date: "19 ago 2026",
    surface: ["Mobile", "Plataforma"],
    title: "Viajes canónicos en movilidad",
    purpose: "Conectar al conductor con viajes, paradas y evidencias reales de FORNEXA.",
    outcome: "Acceso por capacidad, deep links, QR privado, incidencias, firma, POD y cierre sincronizado.",
    status: "Canal interno",
  },
  {
    version: "2026.08.19",
    date: "19 ago 2026",
    surface: ["Web", "Plataforma"],
    title: "Operación real aislada por tenant",
    purpose: "Sustituir recorridos de demostración y asegurar el perímetro multiempresa.",
    outcome: "Partidas, expediciones, viajes y CMR con contexto tenant, permisos y rutas internas protegidas.",
    status: "Producción",
  },
  {
    version: "2026.08.18",
    date: "18 ago 2026",
    surface: ["Web", "Plataforma"],
    title: "Modelo CMR y datos operativos reales",
    purpose: "Llevar la operativa principal desde prototipos locales a persistencia canónica.",
    outcome: "CMR relacional, listados Supabase, cardinalidades validadas y acceso autenticado en servidor.",
    status: "Hito de producto",
  },
  {
    version: "Suite 0.6.0",
    date: "12 ago 2026",
    surface: ["Web", "Mobile", "Plataforma"],
    title: "Base operacional compartida",
    purpose: "Unificar datos web y movilidad sobre una estructura preparada para crecer.",
    outcome: "Modelo operacional, migración de datos locales y FORNEXA Mobile 0.6.0.",
    status: "Producción",
  },
  {
    version: "2026.08.11",
    date: "11 ago 2026",
    surface: ["Web", "Mobile"],
    title: "Identidad FORNEXA consistente",
    purpose: "Consolidar una presencia visual reconocible en todos los puntos de contacto.",
    outcome: "Marca 4NXA canónica, navegación persistente y sistema visual claro y responsive.",
    status: "Hito de producto",
  },
  {
    version: "2026.08.08",
    date: "8 ago 2026",
    surface: ["Web", "Mobile", "Plataforma"],
    title: "Conectividad operativa",
    purpose: "Acercar documentación, telemática y trabajo del conductor.",
    outcome: "Hub telemático, viabilidad de rutas, flujo ADR y conexión CMR–Mobile.",
    status: "Hito de producto",
  },
  {
    version: "2026.08.07",
    date: "7 ago 2026",
    surface: ["Web", "Plataforma"],
    title: "Integraciones, aduanas y relación comercial",
    purpose: "Extender FORNEXA más allá de la ejecución de transporte.",
    outcome: "Connectivity Hub, workspace aduanero, CRM de correo y servicios por entidad.",
    status: "Hito de producto",
  },
  {
    version: "Mobile beta",
    date: "5 ago 2026",
    surface: ["Mobile", "Web"],
    title: "Primer flujo de conductor y ePOD/CMR",
    purpose: "Validar la continuidad documental desde oficina hasta carretera.",
    outcome: "Beta Android interna, paradas guiadas, CMR imprimible y exportación A4.",
    status: "Canal interno",
  },
  {
    version: "2026.08.04",
    date: "4 ago 2026",
    surface: ["Web"],
    title: "Exploración de datos operativos",
    purpose: "Hacer utilizables listados crecientes de expediciones y maestros.",
    outcome: "DataGrid reutilizable con filtros, ordenación y personalización.",
    status: "Hito de producto",
  },
  {
    version: "2026.07.31",
    date: "31 jul 2026",
    surface: ["Web"],
    title: "Servicios y replanificación",
    purpose: "Representar catálogo logístico y decisiones de cambio durante el viaje.",
    outcome: "Catálogo estructurado, espacio de servicios y flujo de replanificación.",
    status: "Hito de producto",
  },
  {
    version: "2026.07.29",
    date: "29 jul 2026",
    surface: ["Web"],
    title: "Decisión e incorporación de datos",
    purpose: "Acelerar el arranque operativo y apoyar decisiones de planificación.",
    outcome: "Decision Center, importación Excel y editores relacionales.",
    status: "Hito de producto",
  },
  {
    version: "Fundación",
    date: "27 jul 2026",
    surface: ["Web", "Plataforma"],
    title: "Nacimiento de FORNEXA",
    purpose: "Establecer el núcleo de una suite de control de cadena de suministro.",
    outcome: "Aplicación Next.js, acceso, onboarding, tracking y primera Control Tower navegable.",
    status: "Hito de producto",
  },
];
