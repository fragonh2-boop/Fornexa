export type TelematicsProviderStatus = "Pendiente autorización" | "Disponible" | "No configurado";

export type TelematicsProvider = {
  id: string;
  name: string;
  auth: string;
  status: TelematicsProviderStatus;
  capabilities: string[];
  liveDriverTimes: boolean;
  gps: boolean;
  tachographFiles: boolean;
  webhooks: boolean;
  baseUrl?: string;
  notes: string;
};

export const telematicsProviders: TelematicsProvider[] = [
  { id: "SAM", name: "Samsara", auth: "OAuth 2.0 / Bearer", status: "Pendiente autorización", capabilities: ["GPS", "Tacógrafo live", "Actividad conductor", "DDD conductor", "DDD vehículo"], liveDriverTimes: true, gps: true, tachographFiles: true, webhooks: true, baseUrl: "https://api.eu.samsara.com", notes: "Proveedor prioritario para validar el contrato canónico de conducción live." },
  { id: "VDO", name: "VDO / Continental", auth: "API credentials / contrato", status: "Pendiente autorización", capabilities: ["GPS", "Driving & resting times", "VDO Link", "Remote DL", "Vehículo"], liveDriverTimes: true, gps: true, tachographFiles: true, webhooks: false, notes: "Integración estratégica por proximidad al propio tacógrafo y VDO Fleet Data Services." },
  { id: "WBF", name: "Webfleet", auth: "OAuth 2.0 / .connect", status: "Pendiente autorización", capabilities: ["GPS", "WEBFLEET.connect", "TachoShare.connect", "DDD"], liveDriverTimes: false, gps: true, tachographFiles: true, webhooks: true, notes: "Buen encaje TMS; activar capacidades concretas según contrato del cliente." },
  { id: "VOL", name: "Volvo Connect", auth: "OAuth / suscripción OEM", status: "Pendiente autorización", capabilities: ["GPS", "Driver Times", "Tachograph Files", "Vehículo"], liveDriverTimes: true, gps: true, tachographFiles: true, webhooks: false, notes: "Conector OEM; Driver Times condiciona disponibilidad de datos de conductor." },
  { id: "SCN", name: "Scania", auth: "Partner / OAuth", status: "No configurado", capabilities: ["GPS", "Vehículo", "Servicios OEM"], liveDriverTimes: false, gps: true, tachographFiles: false, webhooks: false, notes: "Preparado como adaptador OEM; capacidades finales dependerán del servicio contratado." },
  { id: "MAN", name: "MAN DigitalServices", auth: "Partner / OAuth", status: "No configurado", capabilities: ["GPS", "Vehículo", "Servicios OEM"], liveDriverTimes: false, gps: true, tachographFiles: false, webhooks: false, notes: "Preparado como adaptador OEM." },
  { id: "FG0", name: "FleetGO", auth: "Bearer / partner", status: "Pendiente autorización", capabilities: ["GPS", "Tacógrafo", "DDD", "Actividad"], liveDriverTimes: false, gps: true, tachographFiles: true, webhooks: false, notes: "API REST disponible; validar endpoint live exacto durante onboarding." },
  { id: "CTR", name: "Cartrack", auth: "API credentials", status: "Pendiente autorización", capabilities: ["GPS", "Driving times", "Vehículo"], liveDriverTimes: true, gps: true, tachographFiles: false, webhooks: false, notes: "Incluye datos de tiempos de conducción; frecuencia efectiva dependerá del contrato." },
  { id: "GEO", name: "Geotab", auth: "API / marketplace", status: "No configurado", capabilities: ["GPS", "CAN", "Vehículo", "Marketplace"], liveDriverTimes: false, gps: true, tachographFiles: false, webhooks: true, notes: "Integrar mediante adaptador y add-ins disponibles para tacógrafo cuando proceda." },
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
};

export type RouteFeasibility = {
  expedition: string;
  route: string;
  vehicle: string;
  driver: string;
  provider: string;
  remainingDriving: string;
  nextBreak: string;
  navigationEta: string;
  adjustedEta: string;
  adr: "OK" | "NO" | "N/A";
  status: "VIABLE" | "RIESGO" | "NO VIABLE";
  reason: string;
};

export const routeFeasibilityDemo: RouteFeasibility[] = [
  { expedition: "EX-260071", route: "Lyon → Valencia", vehicle: "TRK-023", driver: "Jean Dupont", provider: "Samsara", remainingDriving: "7 h 38 min", nextBreak: "2 h 04 min", navigationEta: "17:25", adjustedEta: "18:12", adr: "OK", status: "VIABLE", reason: "Incluye pausa reglamentaria en el ETA." },
  { expedition: "EX-260074", route: "Toulouse → Barcelona", vehicle: "TRK-015", driver: "Marc Robert", provider: "VDO", remainingDriving: "1 h 12 min", nextBreak: "0 h 31 min", navigationEta: "16:40", adjustedEta: "18:06", adr: "OK", status: "RIESGO", reason: "Conducción disponible insuficiente sin descanso intermedio." },
  { expedition: "EX-260078", route: "Zaragoza → Marseille", vehicle: "TRK-041", driver: "P. Martin", provider: "Webfleet", remainingDriving: "—", nextBreak: "—", navigationEta: "21:10", adjustedEta: "—", adr: "NO", status: "NO VIABLE", reason: "Vehículo no habilitado para la mercancía ADR asignada." },
  { expedition: "EX-260081", route: "Valencia → Madrid", vehicle: "TRK-052", driver: "A. García", provider: "Sin datos", remainingDriving: "—", nextBreak: "—", navigationEta: "13:55", adjustedEta: "13:55*", adr: "N/A", status: "RIESGO", reason: "Sin telemática autorizada: ETA sin validar contra tacógrafo." },
];
