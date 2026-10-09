import Link from "next/link";
import PartidaForm from "@/app/dashboard/nuevo/partida/PartidaForm";
import styles from "@/app/dashboard/nuevo/partida/partida-form.module.css";
import { PREVIEW_DEMO_PARTIDA } from "@/lib/preview-demo-partida";

export default function DemoNewPartidaPage() {
  return <main className={styles.page}>
    <header className={styles.header}><div><p>PEDIDO DE CLIENTE</p><h1>Nueva orden</h1></div><Link href="/demo/partidas">Volver a Órdenes</Link></header>
    <PartidaForm {...PREVIEW_DEMO_PARTIDA} />
  </main>;
}
