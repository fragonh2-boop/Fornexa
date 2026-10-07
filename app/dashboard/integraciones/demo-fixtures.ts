// Illustrative data shown ONLY outside production (see lib/demo-mode.ts).
import type { Connector } from "./IntegracionesClient";

export const demoConnectors: Connector[] = [
  { id: "CN-001", name: "Correo comercial", partner: "FORNEXA", family: "Comunicaciones", type: "Email / Resend", direction: "Salida", format: "HTML + PDF", schedule: "Tiempo real", status: "Pendiente", lastRun: "Hoy 14:42" },
  { id: "CN-002", name: "Pedidos cliente EDI", partner: "Cliente demo", family: "Integraciones", type: "EDI", direction: "Entrada", format: "ORDERS", schedule: "Cada 15 min", status: "Activo", lastRun: "Hoy 15:02" },
  { id: "CN-003", name: "Alta expediciones carrier", partner: "Colaborador demo", family: "Integraciones", type: "SOAP", direction: "Bidireccional", format: "XML", schedule: "Tiempo real", status: "Activo", lastRun: "Hoy 14:58" },
  { id: "CN-004", name: "Intercambio nocturno", partner: "Cliente demo", family: "Integraciones", type: "SFTP", direction: "Bidireccional", format: "CSV", schedule: "02:00 diario", status: "Activo", lastRun: "Hoy 02:01" },
  { id: "CN-005", name: "Estados por webhook", partner: "ERP externo", family: "Integraciones", type: "Webhook / REST", direction: "Salida", format: "JSON", schedule: "Por evento", status: "Error", lastRun: "Hoy 14:51" },
];

export const demoQueue: string[][] = [
  ["EV-90821", "EDI · ORDERS", "Pedido 84722", "Procesado", "15:02:14"],
  ["EV-90820", "SOAP · XML", "EX-260071", "Procesado", "14:58:31"],
  ["EV-90819", "Webhook · JSON", "Estado EX-260070", "Reintento", "14:51:08"],
  ["EV-90818", "Email", "OF-260118", "Pendiente dominio", "14:42:55"],
];

export const demoMappings: string[][] = [
  ["SHIP_TO", "destinatario", "Texto", "Obligatorio"],
  ["PICKUP_DATE", "fecha_recogida", "Fecha", "Obligatorio"],
  ["WEIGHT", "peso_bruto", "Decimal", "Opcional"],
  ["VOLUME", "volumen", "Decimal", "Opcional"],
  ["REFERENCE", "referencia_cliente", "Texto", "Obligatorio"],
];

export const demoEventsToday = "1.284";
