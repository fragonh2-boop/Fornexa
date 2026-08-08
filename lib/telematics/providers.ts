export type TelematicsProviderStatus = "Pendiente autorización" | "Disponible" | "No configurado";
export type PublicApiReadiness = "PUBLIC_ENDPOINTS" | "PUBLIC_MODEL" | "COMMERCIAL_DOCS";

export type TelematicsEndpoint = {
  key: string;
  method: "GET" | "POST";
  path: string;
  capability: string;
  publicDocumented: boolean;
  notes?: string;
};

export type TelematicsProvider = {
  id: string;
  slug: string;
  name: string;
  auth: string;
  status: TelematicsProviderStatus;
  readiness: PublicApiReadiness;
  capabilities: string[];
  liveDriverTimes: boolean;
  gps: boolean;
  tachographFiles: boolean;
  webhooks: boolean;
  baseUrl?: string;
  documentationUrl: string;
  env: string[];
  endpoints: TelematicsEndpoint[];
  notes: string;
};

export const telematicsProviders: TelematicsProvider[] = [
  {
    id: "SAM", slug: "samsara", name: "Samsara", auth: "Bearer token / OAuth 2.0", status: "Pendiente autorización", readiness: "PUBLIC_ENDPOINTS",
    capabilities: ["GPS", "Tacógrafo live", "Actividad conductor", "DDD conductor", "DDD vehículo"], liveDriverTimes: true, gps: true, tachographFiles: true, webhooks: true,
    baseUrl: "https://api.eu.samsara.com", documentationUrl: "https://developers.samsara.com/docs/tachograph-guide",
    env: ["SAMSARA_API_TOKEN"],
    endpoints: [
      { key:"driver-live", method:"GET", path:"/fleet/tachograph-live-data/latest", capability:"Tiempos conducción/descanso live", publicDocumented:true },
      { key:"driver-activity", method:"GET", path:"/fleet/drivers/tachograph-activity/history", capability:"Actividad histórica", publicDocumented:true },
      { key:"driver-ddd", method:"GET", path:"/fleet/drivers/tachograph-files/history", capability:"DDD conductor", publicDocumented:true },
      { key:"vehicle-ddd", method:"GET", path:"/fleet/vehicles/tachograph-files/history", capability:"DDD vehículo", publicDocumented:true },
      { key:"vehicles", method:"GET", path:"/fleet/vehicles", capability:"Vehículos / conectividad", publicDocumented:true },
    ],
    notes: "Adaptador ejecutable preparado. Requiere cliente UE y scope Read Tachograph (EU) para datos de tacógrafo."
  },
  {
    id: "VDO", slug: "vdo", name: "VDO / Continental", auth: "Credenciales VDO Fleet / contrato", status: "Pendiente autorización", readiness: "COMMERCIAL_DOCS",
    capabilities: ["GPS", "Driving & resting times", "VDO Link", "Remote DL", "Vehículo"], liveDriverTimes: true, gps: true, tachographFiles: true, webhooks: false,
    documentationUrl: "https://www.fleet.vdo.com/products/vdo-fleet-data-services/", env: ["VDO_FLEET_BASE_URL", "VDO_FLEET_TOKEN"], endpoints: [],
    notes: "VDO publica la capacidad Live Data API, pero el contrato técnico detallado/endpoints se obtiene durante onboarding. El adapter admite base URL configurable."
  },
  {
    id: "WBF", slug: "webfleet", name: "Webfleet", auth: "OAuth 2.0 / API key .connect", status: "Pendiente autorización", readiness: "PUBLIC_MODEL",
    capabilities: ["GPS", "WEBFLEET.connect", "TachoShare.connect", "DDD"], liveDriverTimes: false, gps: true, tachographFiles: true, webhooks: true,
    documentationUrl: "https://www.webfleet.com/es_es/webfleet/partners/integration/developer-resources/", env: ["WEBFLEET_CLIENT_ID", "WEBFLEET_CLIENT_SECRET", "WEBFLEET_API_KEY", "WEBFLEET_BASE_URL"], endpoints: [],
    notes: "OAuth y TachoShare están documentados públicamente; URLs operativas quedan parametrizadas para usar los valores oficiales entregados al partner."
  },
  {
    id: "VOL", slug: "volvo", name: "Volvo Connect", auth: "OAuth / API Manager / suscripción OEM", status: "Pendiente autorización", readiness: "PUBLIC_MODEL",
    capabilities: ["GPS", "Driver Times", "Tachograph Files", "Vehículo"], liveDriverTimes: true, gps: true, tachographFiles: true, webhooks: false,
    documentationUrl: "https://developer.volvotrucks.com/", env: ["VOLVO_CLIENT_ID", "VOLVO_CLIENT_SECRET", "VOLVO_BASE_URL"], endpoints: [],
    notes: "Preparado para API Manager. La disponibilidad final depende del catálogo y de servicios contratados como Driver Times."
  },
  {
    id: "SCN", slug: "scania", name: "Scania", auth: "Developer Portal / suscripción Data Access", status: "Pendiente autorización", readiness: "PUBLIC_MODEL",
    capabilities: ["rFMS", "GPS", "Vehículo", "Fleet Management", "Tachograph Services"], liveDriverTimes: false, gps: true, tachographFiles: true, webhooks: false,
    documentationUrl: "https://developer.scania.com/", env: ["SCANIA_CLIENT_ID", "SCANIA_CLIENT_SECRET", "SCANIA_BASE_URL"], endpoints: [],
    notes: "Data Access entrega datos server-to-server y Scania publica soporte para Fleet Management/Tachograph Services. Endpoints finales dependen del portal y suscripción."
  },
  {
    id: "MAN", slug: "man", name: "MAN DigitalServices / RIO", auth: "RIO / MAN DataPackage", status: "Pendiente autorización", readiness: "PUBLIC_MODEL",
    capabilities: ["GPS", "Vehículo", "DataPackage", "Compliant M", "Timed"], liveDriverTimes: true, gps: true, tachographFiles: true, webhooks: false,
    documentationUrl: "https://www.man.eu/global/en/services-accessories/service-overview/digital-services.html", env: ["MAN_RIO_CLIENT_ID", "MAN_RIO_CLIENT_SECRET", "MAN_RIO_BASE_URL"], endpoints: [],
    notes: "Modelo preparado para DataPackages, Compliant M y Timed. Contrato API concreto se activa cuando RIO/MAN autorice la cuenta."
  },
  {
    id: "FG0", slug: "fleetgo", name: "FleetGO", auth: "Bearer token", status: "Pendiente autorización", readiness: "PUBLIC_ENDPOINTS",
    capabilities: ["GPS", "Tacógrafo", "DDD", "Actividad"], liveDriverTimes: false, gps: true, tachographFiles: true, webhooks: false,
    baseUrl: "https://api.fleetgo.com", documentationUrl: "https://api.fleetgo.com/api/Description", env: ["FLEETGO_ACCESS_TOKEN", "FLEETGO_BASE_URL"],
    endpoints: [{ key:"session", method:"POST", path:"/api/session/Login", capability:"Obtención de sesión/token", publicDocumented:true, notes:"La documentación pública describe session/Login y Bearer; los recursos se amplían al disponer de partner account." }],
    notes: "Cliente HTTP y autenticación Bearer preparados; partner account necesario para validar recursos concretos del tenant."
  },
  {
    id: "CTR", slug: "cartrack", name: "Cartrack", auth: "Basic Authentication", status: "Pendiente autorización", readiness: "PUBLIC_ENDPOINTS",
    capabilities: ["GPS", "Driving/rest times", "DDD", "Vehículo"], liveDriverTimes: true, gps: true, tachographFiles: true, webhooks: false,
    documentationUrl: "https://developer.cartrack.com/docs/fleet-api/tachograph/", env: ["CARTRACK_USERNAME", "CARTRACK_PASSWORD", "CARTRACK_BASE_URL"],
    endpoints: [
      { key:"vehicles", method:"GET", path:"/rest/vehicles", capability:"Vehículos / health probe", publicDocumented:true },
      { key:"driving-times", method:"GET", path:"/tachographs/driving-times", capability:"Tiempos de conducción y descanso", publicDocumented:true },
      { key:"tachograph-files", method:"GET", path:"/tachographs", capability:"Listado de ficheros de tacógrafo", publicDocumented:true },
    ],
    notes: "OpenAPI pública disponible y adaptador listo para Basic Auth. Base URL se configura por entorno/tenant."
  },
  {
    id: "GEO", slug: "geotab", name: "Geotab", auth: "MyGeotab API credentials", status: "Pendiente autorización", readiness: "PUBLIC_MODEL",
    capabilities: ["GPS", "CAN", "Tachograph", "Driving Time Status", "Vehículo"], liveDriverTimes: true, gps: true, tachographFiles: true, webhooks: true,
    documentationUrl: "https://developers.geotab.com/", env: ["GEOTAB_DATABASE", "GEOTAB_USERNAME", "GEOTAB_PASSWORD", "GEOTAB_SERVER"], endpoints: [],
    notes: "MyGeotab SDK es público; la solución europea de tacógrafo incluye datos live. Adapter JSON-RPC queda preparado para credenciales del database."
  },
];

export type DriverActivity = "DRIVING" | "WORK" | "AVAILABLE" | "REST" | "UNKNOWN";
export type CanonicalDriverStatus = {
  provider: string;
  driverId: string;
  vehicleId: string;
  activity: DriverActivity;
  remainingUntilBreakMin: number | null;
  remainingDailyDrivingMin: number | null;
  nextRequiredBreakMin: number | null;
  gpsLat: number | null;
  gpsLon: number | null;
  speedKmh: number | null;
  observedAt: string;
  sourceId?: string;
  rawUpdatedAt?: string | null;
};

export type RouteFeasibility = {
  expedition: string; route: string; vehicle: string; driver: string; provider: string;
  remainingDriving: string; nextBreak: string; navigationEta: string; adjustedEta: string;
  adr: "OK" | "NO" | "N/A"; status: "VIABLE" | "RIESGO" | "NO VIABLE"; reason: string;
};

export const routeFeasibilityDemo: RouteFeasibility[] = [
  { expedition: "EX-260071", route: "Lyon → Valencia", vehicle: "TRK-023", driver: "Jean Dupont", provider: "Samsara", remainingDriving: "7 h 38 min", nextBreak: "2 h 04 min", navigationEta: "17:25", adjustedEta: "18:12", adr: "OK", status: "VIABLE", reason: "Incluye pausa reglamentaria en el ETA." },
  { expedition: "EX-260074", route: "Toulouse → Barcelona", vehicle: "TRK-015", driver: "Marc Robert", provider: "VDO", remainingDriving: "1 h 12 min", nextBreak: "0 h 31 min", navigationEta: "16:40", adjustedEta: "18:06", adr: "OK", status: "RIESGO", reason: "Conducción disponible insuficiente sin descanso intermedio." },
  { expedition: "EX-260078", route: "Zaragoza → Marseille", vehicle: "TRK-041", driver: "P. Martin", provider: "Webfleet", remainingDriving: "—", nextBreak: "—", navigationEta: "21:10", adjustedEta: "—", adr: "NO", status: "NO VIABLE", reason: "Vehículo no habilitado para la mercancía ADR asignada." },
  { expedition: "EX-260081", route: "Valencia → Madrid", vehicle: "TRK-052", driver: "A. García", provider: "Sin datos", remainingDriving: "—", nextBreak: "—", navigationEta: "13:55", adjustedEta: "13:55*", adr: "N/A", status: "RIESGO", reason: "Sin telemática autorizada: ETA sin validar contra tacógrafo." },
];
