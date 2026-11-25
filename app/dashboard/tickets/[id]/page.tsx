import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthenticatedContext } from "@/lib/auth-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { canManageTickets, ticketCode, ticketDate, ticketIdPattern, ticketsPath } from "@/lib/user-tickets";
import { TicketCommentForm, TicketManagementForm } from "../TicketForms";
import styles from "../tickets.module.css";

export default async function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ticketIdPattern.test(id)) notFound();
  const auth = await getAuthenticatedContext();
  if (!auth) redirect("/login");

  const supabase = await createServerSupabaseClient();
  const { data: ticket, error } = await supabase.from("user_tickets")
    .select("id,number,title,description,reference,category,area,status,priority,reporter_id,assignee_id,attachment_name,created_at,updated_at")
    .eq("tenant_id", auth.tenantId).eq("id", id).maybeSingle();
  if (error) return <p role="alert">No se ha podido cargar el ticket.</p>;
  if (!ticket) notFound();

  const { data: activity, error: activityError } = await supabase.from("user_ticket_activity")
    .select("id,author_id,kind,body,created_at").eq("ticket_id", id)
    .order("created_at", { ascending: false }).order("id").limit(100);

  return (
    <>
      <Link href={ticket.reporter_id === auth.userId ? ticketsPath : `${ticketsPath}?view=all`}>← Volver a soporte</Link>
      <header className={styles.header}>
        <div><p>{ticketCode(ticket.number)} · {ticket.category}</p><h1>{ticket.title}</h1></div>
        <span className={styles.status} data-status={ticket.status}>{ticket.status}</span>
      </header>
      <div className={styles.detailGrid}>
        <div className={styles.stack}>
          <section className={`${styles.card} ${styles.content}`} aria-labelledby="ticket-description">
            <h2 id="ticket-description">Descripción</h2>
            <p className={styles.copy}>{ticket.description}</p>
            {ticket.attachment_name && <a href={`${ticketsPath}/${id}/adjunto`} download>Descargar {ticket.attachment_name}</a>}
          </section>
          <section className={`${styles.card} ${styles.content}`} aria-labelledby="ticket-activity">
            <h2 id="ticket-activity">Actividad</h2>
            <TicketCommentForm id={id} />
            {activityError && <p role="alert">No se ha podido cargar la actividad.</p>}
            {activity?.length === 0 && <p>Aún no hay comentarios ni cambios.</p>}
            {activity?.length === 100 && <p>Se muestran los 100 movimientos más recientes.</p>}
            {activity && activity.length > 0 && <ol className={styles.activity}>
              {activity.map((entry) => <li key={entry.id}>
                <div><strong>{entry.author_id === auth.userId ? "Tú" : entry.author_id === ticket.reporter_id ? "Solicitante" : "Soporte"}</strong>
                  <time dateTime={entry.created_at}>{ticketDate(entry.created_at)}</time></div>
                <p className={styles.copy}>{entry.body}</p>
              </li>)}
            </ol>}
          </section>
        </div>
        <aside className={styles.stack}>
          <section className={`${styles.card} ${styles.content}`} aria-labelledby="ticket-info">
            <h2 id="ticket-info">Datos del ticket</h2>
            <dl className={styles.meta}>
              <dt>Módulo</dt><dd>{ticket.area}</dd>
              <dt>Prioridad</dt><dd>{ticket.priority}</dd>
              <dt>Asignación</dt><dd>{ticket.assignee_id === auth.userId ? "Yo" : ticket.assignee_id ? "Soporte" : "Sin asignar"}</dd>
              {ticket.reference && <><dt>Referencia</dt><dd>{ticket.reference}</dd></>}
              <dt>Creado</dt><dd><time dateTime={ticket.created_at}>{ticketDate(ticket.created_at)}</time></dd>
            </dl>
          </section>
          {canManageTickets(auth.role) && <section className={`${styles.card} ${styles.content}`} aria-labelledby="ticket-management">
            <h2 id="ticket-management">Gestión</h2>
            <TicketManagementForm key={ticket.updated_at} id={id} updatedAt={ticket.updated_at} status={ticket.status} priority={ticket.priority} />
          </section>}
        </aside>
      </div>
    </>
  );
}
