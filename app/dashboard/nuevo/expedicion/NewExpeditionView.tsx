import Link from "next/link";
import ExpeditionForm, { type AvailableOrder } from "./ExpeditionForm";
import styles from "./expedition-form.module.css";

export default function NewExpeditionView({ orders, readOnly = false, simulation = false, basePath = "/dashboard" }: {
  orders: AvailableOrder[]; readOnly?: boolean; simulation?: boolean; basePath?: "/dashboard" | "/demo";
}) {
  const returnBasePath = simulation || basePath === "/demo" ? "/demo" : basePath;
  return <main className={styles.page}>
    <header className={styles.header}>
      <div>
        <p>EXPEDIENTE LOGÍSTICO</p>
        <h1>Nuevo expediente</h1>
        <span>Cada Partida pertenece a un único Expediente. Los datos operativos se heredan del pedido para mantener una única fuente de verdad.</span>
      </div>
      <Link href={`${returnBasePath}/expediciones`}>Volver a expedientes</Link>
    </header>
    <ExpeditionForm orders={orders} readOnly={readOnly} simulation={simulation} basePath={basePath} />
  </main>;
}
