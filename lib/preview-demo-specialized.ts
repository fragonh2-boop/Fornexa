import type { DecisionCenterData } from "../app/dashboard/decision-center/DecisionCenterView";
import type { IntegrationsData } from "../app/dashboard/integraciones/IntegracionesClient";
import type { EmailEvent } from "../app/dashboard/integraciones/EmailWorkspace";
import { telematicsProviders } from "./telematics/providers";

export const previewDemoDecisions: DecisionCenterData = {
  routes: [
    { expedition: "DEMO-EX-001", route: "Lyon → Valencia", vehicle: "DEMO-TRK-001", driver: "Conductor DEMO 01", provider: "Samsara (demo)", remainingDriving: "7 h 38 min", nextBreak: "2 h 04 min", navigationEta: "17:25", adjustedEta: "18:12", adr: "OK", status: "VIABLE", reason: "Escenario ilustrativo, sin cálculo normativo ni telemática real." },
    { expedition: "DEMO-EX-002", route: "Toulouse → Barcelona", vehicle: "DEMO-TRK-002", driver: "Conductor DEMO 02", provider: "VDO (demo)", remainingDriving: "1 h 12 min", nextBreak: "0 h 31 min", navigationEta: "16:40", adjustedEta: "18:06", adr: "OK", status: "RIESGO", reason: "Ejemplo ficticio de conducción disponible insuficiente sin descanso." },
    { expedition: "DEMO-EX-003", route: "Zaragoza → Marseille", vehicle: "DEMO-TRK-003", driver: "Conductor DEMO 03", provider: "Webfleet (demo)", remainingDriving: "—", nextBreak: "—", navigationEta: "21:10", adjustedEta: "—", adr: "NO", status: "NO VIABLE", reason: "Ejemplo ficticio de bloqueo ADR, no válido para una operación real." },
    { expedition: "DEMO-EX-004", route: "Valencia → Madrid", vehicle: "DEMO-TRK-004", driver: "Conductor DEMO 04", provider: "Sin datos (demo)", remainingDriving: "—", nextBreak: "—", navigationEta: "13:55", adjustedEta: "13:55*", adr: "N/A", status: "RIESGO", reason: "Sin telemática conectada: los valores se muestran sólo para validar esta pantalla." },
  ],
  recommendations: [
    { priority: "Crítica", title: "Reasignar la expedición DEMO-EX-001", summary: "Escenario ficticio con una descripción extensa para comprobar la legibilidad del panel y el ajuste del contenido sin ocultar información en pantallas pequeñas.", action: "Revisar alternativa", confidence: 94, impact: "+8 puntos OTIF", cost: "+86 €", reason: ["Disponibilidad ilustrativa", "Capacidad simulada", "ETA ficticia"] },
    { priority: "Alta", title: "Consolidar dos expediciones DEMO", summary: "DEMO-EX-002 y DEMO-EX-004 comparten un corredor ilustrativo.", action: "Crear viaje consolidado", confidence: 89, impact: "-312 €", cost: "-146 km", reason: ["Ocupación ficticia 87%", "Mismo corredor de ejemplo", "Sin cambios operativos"] },
    { priority: "Media", title: "Solicitar POD pendiente DEMO", summary: "Ejemplo de entrega sin prueba documental simulada.", action: "Solicitar POD", confidence: 99, impact: "Cierre documental", cost: "0 €", reason: ["Entrega ilustrativa", "Sin documento real", "No se envían comunicaciones"] },
  ],
  scenarios: [["Servicio prioritario", "96,4%", "12.840 €", "31 viajes"], ["Equilibrado", "94,1%", "11.920 €", "29 viajes"], ["Coste mínimo", "90,8%", "0 €", "0 viajes"]],
  sourceCount: 0,
  unauthorizedRoutes: 4,
};

export const previewDemoIntegrations: IntegrationsData = {
  connectors: [
    { id: "DEMO-CN-001", name: "Correo comercial DEMO", partner: "DEMO · Empresa ficticia", family: "Comunicaciones", type: "Email / Resend", direction: "Salida", format: "HTML + PDF", schedule: "Tiempo real", status: "Pendiente", lastRun: "Sin conexión" },
    { id: "DEMO-CN-002", name: "Pedidos cliente EDI DEMO", partner: "DEMO · Cliente con denominación extensa para validar la tabla", family: "Integraciones", type: "EDI", direction: "Entrada", format: "ORDERS", schedule: "Cada 15 min", status: "Activo", lastRun: "Simulado" },
    { id: "DEMO-CN-003", name: "Alta expediciones DEMO", partner: "DEMO · Colaborador", family: "Integraciones", type: "SOAP", direction: "Bidireccional", format: "XML", schedule: "Tiempo real", status: "Activo", lastRun: "Simulado" },
    { id: "DEMO-CN-004", name: "Intercambio nocturno DEMO", partner: "DEMO · Cliente", family: "Integraciones", type: "SFTP", direction: "Bidireccional", format: "CSV", schedule: "02:00 diario", status: "Activo", lastRun: "Simulado" },
    { id: "DEMO-CN-005", name: "Estados por webhook DEMO", partner: "DEMO · ERP", family: "Integraciones", type: "Webhook / REST", direction: "Salida", format: "JSON", schedule: "Por evento", status: "Error", lastRun: "Error simulado" },
  ],
  queue: [["DEMO-EV-001", "EDI · ORDERS", "Pedido DEMO-001", "Simulado", "15:02:14"], ["DEMO-EV-002", "SOAP · XML", "DEMO-EX-001", "Simulado", "14:58:31"], ["DEMO-EV-003", "Webhook · JSON", "Estado DEMO-EX-002", "Reintento ficticio", "14:51:08"]],
  mappings: [],
  eventsToday: "0",
};

export const previewDemoEmailHistory: EmailEvent[] = [{ id: "DEMO-EMAIL-001", to: "destinatario@example.invalid", subject: "DEMO · Comunicación ilustrativa", related: "Cliente · DEMO-C01", sentAt: "2026-10-07T12:00:00.000Z", status: "Simulado" }];

// Provider descriptions are public static metadata, not configured connections.
export const previewDemoTelematicsProviders = telematicsProviders.map(provider => ({ ...provider, id: `DEMO-${provider.id}`, env: [] }));
export const previewDemoTelematicsReadiness = previewDemoTelematicsProviders.map(provider => ({ slug: provider.slug, configured: false, missingEnv: [] as string[] }));
