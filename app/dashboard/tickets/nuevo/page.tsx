import Link from "next/link";
import { ticketsPath } from "@/lib/user-tickets";
import { NewTicketForm } from "../TicketForms";
import styles from "../tickets.module.css";

export default function NewTicketPage() {
  return (
    <>
      <Link href={ticketsPath}>← Volver a soporte</Link>
      <header className={styles.header}><div><h1>Nuevo ticket</h1><p>Describe la incidencia, consulta o mejora.</p></div></header>
      <section className={`${styles.card} ${styles.content} ${styles.newTicket}`} aria-label="Formulario de nuevo ticket">
        <NewTicketForm />
      </section>
    </>
  );
}
