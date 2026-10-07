import { routeFeasibilityDemo } from "../../../lib/telematics/providers";
import { isDemoDataAllowed } from "@/lib/demo-mode";
import DecisionCenterView, { type DecisionCenterData } from "./DecisionCenterView";

const recommendations = [
  { priority:"Crítica", title:"Reasignar la expedición EX-260071", summary:"El colaborador actual compromete la entrega en Lyon.", action:"Revisar alternativa", confidence:94, impact:"+8 puntos OTIF", cost:"+86 €", reason:["Disponibilidad confirmada","Capacidad ADR válida","ETA ajustada por tacógrafo"] },
  { priority:"Alta", title:"Consolidar dos expediciones a Marseille", summary:"EX-260070 y EX-260074 comparten corredor y ventana.", action:"Crear viaje consolidado", confidence:89, impact:"-312 €", cost:"-146 km", reason:["Ocupación prevista 87%","Mismo corredor","Sin incompatibilidad de mercancía"] },
  { priority:"Media", title:"Solicitar POD pendiente", summary:"EX-260069 figura entregada sin prueba documental.", action:"Solicitar POD", confidence:99, impact:"Cierre documental", cost:"0 €", reason:["Entrega confirmada","Sin POD adjunto","SLA documental excedido"] },
];
const scenarios=[["Servicio prioritario","96,4%","12.840 €","31 viajes"],["Equilibrado","94,1%","11.920 €","29 viajes"],["Coste mínimo","90,8%","11.310 €","27 viajes"]];

export const dynamic = "force-dynamic";

export default function DecisionCenterPage() {
  if (!isDemoDataAllowed()) return <DecisionCenterView />;
  const data: DecisionCenterData = { routes: routeFeasibilityDemo, recommendations, scenarios, sourceCount: 3, unauthorizedRoutes: 1 };
  return <DecisionCenterView data={data} />;
}
