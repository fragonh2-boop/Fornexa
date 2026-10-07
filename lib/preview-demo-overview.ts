import type { ControlTowerOverview } from "../app/components/ControlTowerView";

// Synthetic presentation-only values. These are not tenant or business records.
export const previewDemoOverview: ControlTowerOverview = {
  metrics: [
    ["3", "Expediciones activas", "Datos ficticios"],
    ["4", "Partidas abiertas", "Datos ficticios"],
    ["1", "Viajes en curso", "Datos ficticios"],
    ["0", "CMR emitidos", ""],
  ],
  shipments: [
    ["DEMO-EX-001", "Valencia → Lyon", "3 partidas", "En tránsito", "Hoy 18:30", "transit"],
    ["DEMO-EX-002", "Barcelona → Marseille", "2 partidas", "Planificada", "Mañana 08:00", "planned"],
    ["DEMO-EX-003", "Madrid → Toulouse", "1 partida", "Entregada", "Hoy 11:42", "delivered"],
  ],
  parts: [
    ["DEMO-PT-001", "DEMO · Distribución y componentes de denominación extensa para comprobar el ajuste visual", "Valencia → Lyon", "Preparada"],
    ["DEMO-PT-002", "DEMO · Distribución Norte", "Barcelona → Marseille", "Pendiente"],
    ["DEMO-PT-003", "DEMO · Componentes", "Madrid → Toulouse", "Asignada"],
  ],
  trips: [
    ["DEMO-VJ-001", "2 expediciones", "La Jonquera", "En ruta"],
    ["DEMO-VJ-002", "1 expedición", "Barcelona", "Carga prevista"],
    ["DEMO-VJ-003", "1 expedición", "Toulouse", "Finalizado"],
  ],
};
