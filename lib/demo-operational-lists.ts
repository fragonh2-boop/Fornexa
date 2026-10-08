import type { PartidaListItem } from "../app/dashboard/partidas/PartidasListView";
import type { ExpedicionListItem } from "../app/dashboard/expediciones/ExpedicionesListView";
import type { ViajeListItem } from "../app/dashboard/viajes/ViajesListView";

// Interface examples only. No identifier corresponds to a backend record.
export const DEMO_PARTIDAS: PartidaListItem[] = [
  {
    id: "DEMO-PAR-001", customer: "Cliente ficticio Aurora", customerCode: "DEMO-C01",
    reference: "DEMO-REF-001", route: "Ciudad de Muestra → Villa de Pruebas",
    goods: "12 bultos · 180 kg · 1,5 m³", service: "Servicio ficticio estándar",
    adr: "No ADR", expedition: "DEMO-EXP-001", status: "Preparada", createdAt: "2026-10-07T08:00:00Z",
  },
  {
    id: "DEMO-PAR-002", customer: "Cliente ficticio Horizonte de Pruebas y Maquetas con una denominación extensa",
    customerCode: "DEMO-C02", reference: "DEMO-REFERENCIA-LARGA-002-PARA-VALIDAR-LECTURA",
    route: "Centro ficticio Horizonte para pruebas de textos extensos → Destino ficticio de ensayo y demostración",
    goods: "0 bultos · 0 kg · 0 m³", service: "Servicio ficticio exprés con descripción larga",
    adr: "Sin declarar", expedition: null, status: "Borrador", createdAt: "2026-10-06T08:00:00Z",
  },
  {
    id: "DEMO-PAR-003", customer: "Cliente ficticio Archivo", customerCode: "DEMO-C03",
    reference: "—", route: "— → —", goods: "—", service: "—",
    adr: "—", expedition: null, status: "Completada", createdAt: "2026-10-05T08:00:00Z",
  },
];

export const DEMO_EXPEDICIONES: ExpedicionListItem[] = [
  {
    id: "DEMO-EXP-001", pedido: "DEMO-PAR-001", albaranesCount: 2,
    origen: "Ciudad de Muestra", destino: "Villa de Pruebas", servicio: "Servicio ficticio estándar",
    estado: "En tránsito", viajesCount: 2, viajeActual: "DEMO-VJ-001", createdAt: "2026-10-07T08:00:00Z",
  },
  {
    id: "DEMO-EXP-002", pedido: "DEMO-PAR-002", albaranesCount: 0,
    origen: "Centro ficticio Horizonte para pruebas de textos extensos",
    destino: "Destino ficticio de ensayo y demostración con una denominación larga",
    servicio: null, estado: "Borrador", viajesCount: 0, viajeActual: null, createdAt: "2026-10-06T08:00:00Z",
  },
  {
    id: "DEMO-EXP-003", pedido: null, albaranesCount: 1, origen: null, destino: null,
    servicio: null, estado: "Entregado", viajesCount: 1, viajeActual: "DEMO-VJ-003", createdAt: "2026-10-05T08:00:00Z",
  },
];

export const DEMO_VIAJES: ViajeListItem[] = [
  {
    id: "DEMO-VJ-001", expeditions: ["DEMO-EXP-001"], vehicle: "DEMO-VEH-01",
    driver: "Conductor ficticio de muestra", carrier: "Transportista ficticio Aurora",
    stops: 3, plannedStart: "2026-10-07T09:00:00Z", status: "En curso",
  },
  {
    id: "DEMO-VJ-002", expeditions: [], vehicle: "—", driver: "—",
    carrier: "Transportista ficticio Horizonte de Pruebas y Maquetas con denominación extensa",
    stops: 0, plannedStart: null, status: "Borrador",
  },
  {
    id: "DEMO-VJ-003", expeditions: ["DEMO-EXP-003"], vehicle: "DEMO-VEH-03",
    driver: "Conductor ficticio de ensayo", carrier: "Transportista ficticio Archivo",
    stops: 2, plannedStart: "2026-10-05T09:00:00Z", status: "Finalizado",
  },
];
