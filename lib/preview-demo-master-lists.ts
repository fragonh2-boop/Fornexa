import type { CustomerListItem } from "../app/dashboard/clientes/CustomersListView";
import type { CustomsListItem } from "../app/dashboard/aduanas/CustomsListView";
import type { GridRow } from "../app/components/DataGrid";

// Presentation-only examples; identifiers are visibly synthetic, never backend ids.
export const DEMO_CUSTOMERS: CustomerListItem[] = [
  {
    code: "DEMO-C01", tradeName: "Cliente ficticio Aurora", taxId: "DEMO-NIF-001",
    location: "Provincia de Muestra · Ciudad de Muestra", segment: "Ejemplo industrial",
    adrControl: "N", addresses: 2, shipments: 1, openOffers: 1,
    accountManager: "Responsable ficticio de demostración", status: "Activo",
  },
  {
    code: "DEMO-C02", tradeName: "Cliente ficticio Horizonte de Pruebas y Maquetas con una denominación extensa",
    taxId: "DEMO-NIF-002", location: "Provincia ficticia Horizonte · Destino ficticio de ensayo y demostración",
    segment: "Ejemplo de denominaciones largas", adrControl: "S", addresses: 2,
    shipments: 1, openOffers: 0, accountManager: "—", status: "Activo",
  },
  {
    code: "DEMO-C03", tradeName: "Cliente ficticio Archivo", taxId: "—", location: "—",
    segment: "—", adrControl: "N", addresses: 0, shipments: 0, openOffers: 0,
    accountManager: "—", status: "Inactivo",
  },
];

export const DEMO_CUSTOMS_CASES: CustomsListItem[] = [
  {
    id: "DEMO-AD-001", direction: "Importación", system: "Sistema ficticio de demostración",
    status: "Control aduanero", mrn: "DEMO-MRN-001", country: "ES",
    declarant: "DEMO-EORI-001", representative: "DEMO-EORI-REP-001",
    updatedAt: "07/10/2026, 10:00", payload: {},
  },
  {
    id: "DEMO-AD-002", direction: "Exportación", system: "Sistema ficticio con denominación extensa para validar lectura",
    status: "Presentado", mrn: "DEMO-MRN-002", country: "FR",
    declarant: "DEMO-EORI-002", representative: "—",
    updatedAt: "06/10/2026, 12:30", payload: {},
  },
  {
    id: "DEMO-AD-003", direction: "Tránsito", system: "—", status: "Cerrado",
    mrn: "—", country: "—", declarant: "—", representative: "—",
    updatedAt: "05/10/2026, 09:00", payload: {},
  },
];

export const DEMO_CMR_ROWS: GridRow[] = [
  {
    cmr: "DEMO-CMR-001", expedicion: "DEMO-EXP-001", viaje: "DEMO-VJ-001",
    ruta: "Ciudad de Muestra → Villa de Pruebas", fecha: "07/10/2026",
    firmas: "1/3", reservas: "Sin reservas", estado: "Emitido",
  },
  {
    cmr: "DEMO-CMR-002", expedicion: "DEMO-EXP-002", viaje: "—",
    ruta: "Centro ficticio Horizonte para pruebas de textos extensos → Destino ficticio de ensayo y demostración",
    fecha: "06/10/2026", firmas: "0/3",
    reservas: "DEMO · Observación ficticia para validar textos largos, sin evidencia operativa.", estado: "Borrador",
  },
  {
    cmr: "DEMO-CMR-003", expedicion: "DEMO-EXP-003", viaje: "DEMO-VJ-003",
    ruta: "— → —", fecha: "05/10/2026", firmas: "3/3", reservas: "Sin reservas", estado: "Entregado",
  },
];
