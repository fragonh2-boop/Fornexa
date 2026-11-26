import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthenticatedContext } from "@/lib/auth-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  canManageTickets, ticketAreas, ticketCategories, ticketCode, ticketDate,
  ticketPriorities, ticketStatuses, ticketsPath,
} from "@/lib/user-tickets";
import styles from "./tickets.module.css";

type Filters = Record<string, string | string[] | undefined>;
const pageSize = 25;

export default async function TicketsPage({ searchParams }: { searchParams: Promise<Filters> }) {
  const auth = await getAuthenticatedContext();
  if (!auth) redirect("/login");
  const params = await searchParams;
  function value(key: string) {
    const item = params[key];
    return typeof item === "string" ? item : "";
  }
  const management = canManageTickets(auth.role);
  const all = management && value("view") === "all";
  const search = value("q").trim().slice(0, 100);
  const status = ticketStatuses.find((item) => item === value("status"));
  const area = ticketAreas.find((item) => item === value("area"));
  const category = ticketCategories.find((item) => item === value("category"));
  const priority = ticketPriorities.find((item) => item === value("priority"));
  const page = Math.min(10000, Math.max(1, Number.parseInt(value("page"), 10) || 1));
  const offset = (page - 1) * pageSize;

  const supabase = await createServerSupabaseClient();
  let query = supabase.from("user_tickets")
    .select("id,number,title,reference,category,area,status,priority,assignee_id,updated_at", { count: "exact" })
    .eq("tenant_id", auth.tenantId)
    .order("updated_at", { ascending: false }).order("id").range(offset, offset + pageSize - 1);

  if (!all) query = query.eq("reporter_id", auth.userId);
  if (status) query = query.eq("status", status);
  if (area) query = query.eq("area", area);
  if (category) query = query.eq("category", category);
  if (priority) query = query.eq("priority", priority);

  const code = /^TKT-(\d{1,10})$/i.exec(search);
  if (code && Number(code[1]) <= 2147483647) {
    query = query.eq("number", Number(code[1]));
  } else if (search) {
    const pattern = "%" + search.replace(/[\\%_]/g, "\\$&") + "%";
    const quoted = '"' + pattern.replace(/[\\"]/g, "\\$&") + '"';
    query = query.or(`title.ilike.${quoted},reference.ilike.${quoted}`);
  }

  const { data, count, error } = await query;
  const viewUrl = all ? `${ticketsPath}?view=all` : ticketsPath;
  function pageUrl(next: number) {
    const filter = new URLSearchParams();
    for (const [key, item] of Object.entries({ view: all ? "all" : "", q: search, status, area, category, priority })) {
      if (item) filter.set(key, item);
    }
    filter.set("page", String(next));
    return `${ticketsPath}?${filter}`;
  }

  return (
    <>
      <header className={styles.header}>
        <div><h1>Soporte</h1><p>Consulta y gestiona las solicitudes de Fornexa.</p></div>
        <Link className={styles.primary} href={`${ticketsPath}/nuevo`}>+ Nuevo ticket</Link>
      </header>
      {management && <nav className={styles.tabs} aria-label="Vistas de soporte">
        <Link href={ticketsPath} aria-current={!all ? "page" : undefined}>Mis tickets</Link>
        <Link href={`${ticketsPath}?view=all`} aria-current={all ? "page" : undefined}>Bandeja de soporte</Link>
      </nav>}
      <section className={styles.card} aria-labelledby="ticket-list-title">
        <form className={styles.filters} action={ticketsPath}>
          {all && <input type="hidden" name="view" value="all" />}
          <label>Buscar <input name="q" maxLength={100} defaultValue={search} placeholder="Código, resumen o referencia" /></label>
          <Filter name="status" label="Estado" options={ticketStatuses} selected={status} />
          <Filter name="area" label="Módulo" options={ticketAreas} selected={area} />
          <Filter name="category" label="Categoría" options={ticketCategories} selected={category} />
          <Filter name="priority" label="Prioridad" options={ticketPriorities} selected={priority} />
          <button className={styles.secondary}>Filtrar</button>
          <Link href={viewUrl}>Limpiar</Link>
        </form>
        <div className={styles.listHeading}><h2 id="ticket-list-title">{all ? "Tickets de la organización" : "Mis tickets"}</h2>
          {count !== null && <span>{count} {count === 1 ? "ticket" : "tickets"}</span>}</div>
        {error ? <p className={styles.notice} role="alert">No se ha podido cargar la bandeja de tickets.</p> : !data?.length ? (
          <p className={styles.notice}>No hay tickets en esta página con los filtros actuales.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th scope="col">Ticket</th><th scope="col">Módulo</th><th scope="col">Estado</th>
                <th scope="col">Prioridad</th>{all && <th scope="col">Asignación</th>}<th scope="col">Actualizado</th></tr></thead>
              <tbody>{data.map((ticket) => (
                <tr key={ticket.id}>
                  <td><Link href={`${ticketsPath}/${ticket.id}`}>{ticket.title}</Link>
                    <small>{ticketCode(ticket.number)} · {ticket.category}{ticket.reference ? ` · ${ticket.reference}` : ""}</small></td>
                  <td>{ticket.area}</td>
                  <td><span className={styles.status} data-status={ticket.status}>{ticket.status}</span></td>
                  <td>{ticket.priority}</td>
                  {all && <td>{ticket.assignee_id === auth.userId ? "Yo" : ticket.assignee_id ? "Soporte" : "Sin asignar"}</td>}
                  <td><time dateTime={ticket.updated_at}>{ticketDate(ticket.updated_at)}</time></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {(page > 1 || (count ?? 0) > offset + pageSize) && (
          <nav className={styles.pagination} aria-label="Páginas de tickets">
            {page > 1 && <Link href={pageUrl(page - 1)}>Anterior</Link>}
            <span>Página {page}</span>
            {(count ?? 0) > offset + pageSize && page < 10000 && <Link href={pageUrl(page + 1)}>Siguiente</Link>}
          </nav>
        )}
      </section>
    </>
  );
}

function Filter({ name, label, options, selected }: { name: string; label: string; options: readonly string[]; selected?: string }) {
  return <label>{label} <select name={name} defaultValue={selected ?? ""}>
    <option value="">Todos</option>{options.map((option) => <option key={option}>{option}</option>)}
  </select></label>;
}
