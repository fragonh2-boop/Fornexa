import Link from "next/link";
import AppShell from "../../components/AppShell";
import DataGrid from "../../components/DataGrid";
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
    <header className={styles.header}>
      <div>
        <p className={styles.eyebrow}>PEDIDOS DE CLIENTE</p>
        <h1>Partidas</h1>
        <p>Pedidos persistentes del tenant. Una partida debe incorporarse a un expediente antes de viajar.</p>
      </div>
      <div className={styles.actions}>
        <Link href={`${basePath}/importar?entidad=partidas`} className={styles.secondary}>Importar Excel</Link>
        <Link href={`${basePath}/nuevo/partida`} className={styles.primary}>+ Nueva partida</Link>
        <div className={styles.avatar}>FG</div>
      </div>
    </header>
    <section className={styles.metrics}>
      <article><span>Abiertas</span><strong>{abiertas}</strong></article>
      <article><span>Pendientes de expediente</span><strong>{pendientes}</strong></article>
      <article><span>ADR</span><strong>{adr}</strong></article>
      <article><span>Última partida</span><strong className={styles.lastId}>{items[0]?.id ?? "—"}</strong></article>
    </section>
    <section className={styles.panel}>
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
