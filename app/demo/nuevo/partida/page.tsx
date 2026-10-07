import Link from "next/link";
import PartidaForm from "@/app/dashboard/nuevo/partida/PartidaForm";
import styles from "@/app/dashboard/nuevo/partida/partida-form.module.css";
import { PREVIEW_DEMO_PARTIDA } from "@/lib/preview-demo-partida";

export default function DemoNewPartidaPage() {
  return <main className={styles.page}>
    <header className={styles.header}><div><p>PEDIDO DE CLIENTE</p><h1>Nueva partida</h1><span>Alta persistente sobre el modelo operativo. El Customer ID, la ruta, ADR y magnitudes se conservarán hasta Expediente, Viaje y CMR.</span></div><Link href="/demo/partidas">Volver a Partidas</Link></header>
    <PartidaForm {...PREVIEW_DEMO_PARTIDA} />
  </main>;
}
