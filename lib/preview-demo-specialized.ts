import type { IntegrationsData } from "../app/dashboard/integraciones/IntegracionesClient";
import type { EmailEvent } from "../app/dashboard/integraciones/EmailWorkspace";
import { telematicsProviders } from "./telematics/providers";

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
