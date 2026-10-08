import type { AddressOption, CustomerOption, PartidaDemoData, ServiceOption } from "../app/dashboard/nuevo/partida/PartidaForm";
import { PREVIEW_DEMO_CATALOG } from "./preview-demo-catalog.ts";

// Synthetic form options only; no records, addresses or ADR classifications are queried.
export const PREVIEW_DEMO_PARTIDA: {
  customers: CustomerOption[]; addresses: AddressOption[]; services: ServiceOption[]; demoData: PartidaDemoData;
} = {
  customers: [
    { code: "DEMO-C01", name: "Cliente ficticio Aurora", adrControl: false, adrFrequency: "NEVER", adrPolicy: "INFO", preferredClasses: [] },
    { code: "DEMO-C02", name: "Cliente ficticio Horizonte de Pruebas y Maquetas", adrControl: true, adrFrequency: "SOMETIMES", adrPolicy: "WARNING", preferredClasses: [] },
    { code: "DEMO-C03", name: "Cliente ficticio sin ruta ni artículos", adrControl: false, adrFrequency: "NEVER", adrPolicy: "INFO", preferredClasses: [] },
  ],
  addresses: [
    {
      id: "preview-demo-address-01", code: "DEMO-REC-01", name: "Almacén ficticio de origen",
      address: "Calle Ficticia de la Muestra, 10", postalCode: "00001", city: "Ciudad de Muestra", countryCode: "ES", partyCode: "DEMO-C01",
      assignments: [{ customerCode: "DEMO-C01", useForPickup: true, useForDelivery: false }],
    },
    {
      id: "preview-demo-address-02", code: "DEMO-ENT-01", name: "Destino ficticio Aurora",
      address: "Avenida Ficticia de las Maquetas, 20", postalCode: "00002", city: "Villa de Pruebas", countryCode: "ES", partyCode: "DEMO-C01",
      assignments: [{ customerCode: "DEMO-C01", useForPickup: false, useForDelivery: true }],
    },
    {
      id: "preview-demo-address-03", code: "DEMO-REC-02", name: "Centro ficticio Horizonte para pruebas de textos extensos",
      address: "Polígono Ficticio de Demostración, Avenida de los Ejemplos, parcela 30, nave de muestra A", postalCode: "00003", city: "Municipio Ficticio Horizonte", countryCode: "ES", partyCode: "DEMO-C02",
      assignments: [{ customerCode: "DEMO-C02", useForPickup: true, useForDelivery: false }],
    },
    {
      id: "preview-demo-address-04", code: "DEMO-ENT-02", name: "Destino ficticio Horizonte",
      address: "Camino Ficticio de los Ejemplos, 40", postalCode: "00004", city: "Ciudad de Ensayo", countryCode: "ES", partyCode: "DEMO-C02",
      assignments: [{ customerCode: "DEMO-C02", useForPickup: false, useForDelivery: true }],
    },
  ],
  services: [
    { code: "DEMO-EST", name: "Servicio ficticio estándar" },
    { code: "DEMO-EXP", name: "Servicio ficticio exprés" },
  ],
  demoData: {
    products: PREVIEW_DEMO_CATALOG.items.map(item => ({
      id: item.id, sku: item.sku, name: item.name, description: item.description,
      uomBase: item.uomBase, ownerCustomerCode: item.ownerCustomerCode, status: item.status,
    })),
  },
};
