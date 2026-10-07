import { DEMO_CUSTOMERS } from "./preview-demo-master-lists";

// UI fixtures only. Reserved email domains and DEMO ids never identify real users.
export const DEMO_EDITOR_COUNTRIES = [
  { code: "ES", name: "España" }, { code: "FR", name: "Francia" }, { code: "PT", name: "Portugal" },
];
export const DEMO_EDITOR_SUBDIVISIONS = {
  ES: [{ id: "DEMO-SUB-ES-46", code: "46", name: "Valencia · DEMO", postalPrefix: "46" }],
  FR: [{ id: "DEMO-SUB-FR-66", code: "66", name: "Pyrénées-Orientales · DEMO", postalPrefix: "66" }],
};
export const DEMO_EDITOR_USERS = [
  { id: "DEMO-USER-001", name: "Responsable ficticio de demostración", email: "responsable@example.invalid", role: "DEMO" },
];

export function demoCustomerEditor(id: string) {
  const customer = DEMO_CUSTOMERS.find(item => item.code === id);
  return {
    legalName: customer ? `${customer.tradeName} · Empresa ficticia` : "",
    tradeName: customer?.tradeName ?? "", status: customer?.status ?? "Activo",
    // All-zero placeholder, never a verified fiscal identifier.
    taxId: id === "nuevo" ? "" : "B00000000",
    billingEmail: id === "nuevo" ? "" : "facturacion@example.invalid",
    salesEmail: id === "nuevo" ? "" : "comercial@example.invalid",
    notes: "DEMO · Datos ficticios; cambios temporales sin persistencia ni validez operativa.",
  };
}

export function demoCustomerAddresses(id: string) {
  if (id === "nuevo" || id === "DEMO-C03") return [];
  return [{
    id: `DEMO-ADDR-${id}`, code: `DEMO-DIR-${id}`, persisted: false,
    name: "Centro ficticio de demostración", street: "Calle Ficticia, 1", postalCode: "46000",
    city: "Ciudad de Muestra", province: "Valencia · DEMO", subdivisionKey: "DEMO-SUB-ES-46",
    country: "ES", contact: "Contacto ficticio", phone: "", email: "contacto@example.invalid",
    restrictions: "DEMO · Instrucciones ficticias", active: true, useForPickup: true, useForDelivery: true,
    isDefaultPickup: false, isDefaultDelivery: false, assignedCustomerCodes: [id], hasDock: true,
    needsForklift: false, requiresAppointment: false, palletExchange: false, adrCapable: false,
    temperatureControlled: false, temperatureMin: "", temperatureMax: "", geofenceRadiusM: "", averageWaitMinutes: "",
  }];
}

export const DEMO_EDITOR_CONTACTS = [{
  id: "DEMO-CONTACT-001", name: "Contacto ficticio de tráfico", role: "Tráfico", department: "Operaciones DEMO",
  phone: "", email: "trafico@example.invalid", language: "es", isPrimary: true,
}];
export const DEMO_EDITOR_SERVICES = [
  { code: "DEMO-EST", name: "Servicio ficticio estándar" },
  { code: "DEMO-EXP", name: "Servicio ficticio exprés" },
];
export const DEMO_EDITOR_TARIFFS = [{
  id: "DEMO-TARIFF-001", code: "DEMO-TF-001", name: "Tarifa ficticia estándar", status: "ACTIVE", version: 1,
  valid_from: "2026-10-01", valid_to: null, currency: "EUR", service: DEMO_EDITOR_SERVICES[0],
  lines: [{ pricing_unit: "SHIPMENT", unit_price: 25 }],
}];
export const DEMO_EDITOR_FISCAL_ADDRESS = {
  id: "DEMO-FISCAL-001", name: "Domicilio fiscal ficticio", addressLine1: "Calle Ficticia, 1",
  addressLine2: "Edificio DEMO", postalCode: "46000", city: "Ciudad de Muestra", region: "Provincia de Muestra", countryCode: "ES",
};
export const DEMO_EDITOR_SERVICE_CATALOG = [{
  id: "DEMO-SERVICE-001", code: "DEMO-EST", name: "Servicio ficticio estándar",
  description: "Ejemplo visual sin contrato, precio o asignación operativa.", mode: "Terrestre",
  service_type: "DEMO", unit: "Envío", assignment: null,
}, {
  id: "DEMO-SERVICE-002", code: "DEMO-EXP", name: "Servicio ficticio exprés con denominación extensa",
  description: "Ejemplo de catálogo para probar búsqueda y lectura.", mode: "Terrestre",
  service_type: "DEMO", unit: "Envío", assignment: null,
}];
