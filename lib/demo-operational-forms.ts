import type { AvailableOrder } from "../app/dashboard/nuevo/expedicion/ExpeditionForm";
import type { DriverOption, ExpeditionOption, VehicleOption } from "../app/dashboard/nuevo/viaje/TripForm";
import type { TripDetailData } from "../app/dashboard/viajes/[id]/TripDetailView";
import { DEMO_EXPEDICIONES, DEMO_PARTIDAS, DEMO_VIAJES } from "./demo-operational-lists.ts";

export const DEMO_AVAILABLE_ORDERS: AvailableOrder[] = DEMO_PARTIDAS
  .filter(item => !item.expedition && !["Completada", "Cancelada"].includes(item.status))
  .map(item => ({
    code: item.id, customer: item.customer, customerCode: item.customerCode,
    route: item.route, service: item.service, goods: item.goods, adr: item.adr,
  }));

export const DEMO_TRIP_OPTIONS: {
  expeditions: ExpeditionOption[]; vehicles: VehicleOption[]; drivers: DriverOption[];
} = {
  expeditions: DEMO_EXPEDICIONES.filter(item => !["Entregado", "Cerrado", "Cancelado"].includes(item.estado)).map(item => ({
    code: item.id, orderCode: item.pedido ?? "—", route: `${item.origen ?? "—"} → ${item.destino ?? "—"}`,
    service: item.servicio ?? "Sin servicio", status: item.estado === "En tránsito" ? "IN_TRANSIT" : "DRAFT",
  })),
  vehicles: [
    { registration: "DEMO-VEH-01", vehicleType: "Vehículo ficticio de muestra" },
    { registration: "DEMO-VEH-02", vehicleType: "Vehículo ficticio para textos largos" },
  ],
  drivers: [
    { code: "DEMO-DRV-01", name: "Conductor ficticio de muestra", adrQualified: false },
    { code: "DEMO-DRV-02", name: "Conductor ficticio Horizonte para comprobar textos largos", adrQualified: false },
  ],
};

// Static display data only. Mobile access remains unissued, without synthetic tokens.
export const DEMO_TRIP_DETAILS: TripDetailData[] = DEMO_VIAJES.map(trip => ({
  code: trip.id,
  status: trip.status === "En curso" ? "IN_PROGRESS" : trip.status === "Finalizado" ? "COMPLETED" : "DRAFT",
  planned_start: trip.plannedStart,
  planned_end: trip.plannedStart ? "2026-10-07T18:00:00Z" : null,
  trailer_registration: null,
  carrier: { trade_name: trip.carrier },
  vehicle: trip.vehicle === "—" ? null : { registration: trip.vehicle, vehicle_type: "Vehículo ficticio" },
  driver: trip.driver === "—" ? null : { name: trip.driver },
  trip_expeditions: trip.expeditions.map((code, index) => ({
    sequence: index + 1,
    expedition: {
      code, status: trip.status === "Finalizado" ? "DELIVERED" : "IN_TRANSIT",
      order: { code: code === "DEMO-EXP-001" ? "DEMO-PAR-001" : "DEMO-PAR-003", packages: index ? 0 : 12, gross_weight: index ? null : 180, volume: 1.5, linear_meters: 0 },
    },
  })),
  trip_stops: Array.from({ length: trip.stops }, (_, index) => ({
    sequence: index + 1,
    stop_type: index === 0 ? "PICKUP" : "DELIVERY",
    company_name: index === 0 ? "Almacén ficticio de muestra" : "Destino ficticio de ensayo y demostración con denominación extensa",
    full_address: index === 0 ? "Calle Ficticia de la Muestra, 10 · Ciudad de Muestra" : "Avenida Ficticia de los Ejemplos, nave de demostración, parcela 20 · Villa de Pruebas",
    window_start: index === 0 ? "2026-10-07T09:00:00Z" : null,
    window_end: index === 0 ? "2026-10-07T10:00:00Z" : null,
    status: trip.status === "Finalizado" ? "COMPLETED" : index === 0 ? "ARRIVED" : "PENDING",
    operational_reference: index === 0 ? "DEMO-REF-001" : null,
  })),
}));
