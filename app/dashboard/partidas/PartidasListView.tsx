import Link from "next/link";
import AppShell from "../../components/AppShell";
import DataGrid from "../../components/DataGrid";
import { MetricGrid, ScreenHeader, screenButton, screenPanelClass } from "../../components/ScreenChrome";
import styles from "../expediciones/expediciones.module.css";

export type PartidaListItem = {
  id: string;
  customer: string;
  customerCode: string;
  reference: string;
  route: string;
  goods: string;
  service: string;
  adr: string;
  expedition: string | null;
  status: string;
  createdAt: string;
};

export default function PartidasListView({ items, basePath = "/dashboard" }: {
  items: PartidaListItem[];
  basePath?: "/dashboard" | "/demo";
}) {
  const demo = basePath === "/demo";
  const abiertas = items.filter(item => !["Completada", "Cancelada"].includes(item.status)).length;
  const pendientes = items.filter(item => !item.expedition && !["Completada", "Cancelada"].includes(item.status)).length;
  const adr = items.filter(item => item.adr.startsWith("ADR")).length;
  const rows = items.map(item => ({
    id: item.id,
    cliente: `${item.customerCode} · ${item.customer}`,
    referencia: item.reference,
    ruta: item.route,
    mercancia: item.goods,
    servicio: item.service,
    adr: item.adr,
    expedicion: item.expedition ?? "Sin asignar",
    estado: item.status,
  }));

  return <AppShell><div className={styles.page}>
    <ScreenHeader eyebrow="PEDIDOS DE CLIENTE" title="Partidas" description="Pedidos persistentes del tenant. Una partida debe incorporarse a un expediente antes de viajar.">
      <Link href={`${basePath}/importar?entidad=partidas`} className={screenButton.secondary}>Importar Excel</Link>
      <Link href={`${basePath}/nuevo/partida`} className={screenButton.primary}>+ Nueva partida</Link>
    </ScreenHeader>
    <MetricGrid items={[
      { label: "Abiertas", value: abiertas },
      { label: "Pendientes de expediente", value: pendientes },
      { label: "ADR", value: adr },
      { label: "Última partida", value: items[0]?.id ?? "—", text: true },
    ]} />
    <section className={screenPanelClass}>
      <DataGrid
        storageKey={demo ? "demo-partidas-canonical" : "partidas-canonical"}
        persistPreferences={!demo}
        columns={[
          { key: "id", label: "Partida" },
          { key: "cliente", label: "Cliente" },
          { key: "referencia", label: "Referencia" },
          { key: "ruta", label: "Origen / destino" },
          { key: "mercancia", label: "Mercancía" },
          { key: "servicio", label: "Servicio" },
          { key: "adr", label: "ADR" },
          { key: "expedicion", label: "Expediente" },
          { key: "estado", label: "Estado" },
        ]}
        rows={rows}
        searchPlaceholder="Buscar por partida, cliente, referencia, ruta, servicio, ADR o expediente"
        emptyMessage="No hay partidas persistidas todavía."
      />
    </section>
  </div></AppShell>;
}
