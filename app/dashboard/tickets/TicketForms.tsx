"use client";

import { startTransition, useActionState, type FormEvent, type ReactNode } from "react";
import { ticketAreas, ticketCategories, ticketPriorities, ticketStatuses } from "@/lib/user-tickets";
import { commentOnTicket, createTicket, manageTicket } from "./actions";
import styles from "./tickets.module.css";

type Result = { error: string };
type TicketAction = (state: Result, form: FormData) => Promise<Result>;

function TicketForm({ action, submit, children }: { action: TicketAction; submit: string; children: ReactNode }) {
  const [state, dispatch, pending] = useActionState(action, { error: "" });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    startTransition(() => dispatch(form));
  }

  return (
    <form className={styles.form} action={dispatch} onSubmit={handleSubmit}>
      {children}
      {state.error && <p className={styles.error} role="alert">{state.error}</p>}
      <div><button type="submit" className={styles.primary} disabled={pending}>{pending ? "Guardando…" : submit}</button></div>
    </form>
  );
}

function Options({ values }: { values: readonly string[] }) {
  return values.map((value) => <option key={value}>{value}</option>);
}

export function NewTicketForm() {
  return (
    <TicketForm action={createTicket} submit="Enviar ticket">
      <div className={styles.fields}>
        <label>Categoría <select name="category" required defaultValue="">
          <option value="" disabled>Selecciona una categoría</option><Options values={ticketCategories} />
        </select></label>
        <label>Módulo <select name="area" required defaultValue="">
          <option value="" disabled>Selecciona un módulo</option><Options values={ticketAreas} />
        </select></label>
      </div>
      <label>Resumen <input name="title" required maxLength={160} placeholder="Ej. El corresponsal no ha recibido el EDI" /></label>
      <label>Descripción <textarea name="description" required maxLength={6000} rows={6} placeholder="Qué ocurrió, qué esperabas y cómo se puede reproducir." /></label>
      <label>Referencia operativa <input name="reference" maxLength={100} placeholder="Viaje, partida, expedición o documento" /></label>
      <label>Adjunto <input name="attachment" type="file" /><small>Opcional · Un archivo de hasta 3 MB</small></label>
    </TicketForm>
  );
}

export function TicketCommentForm({ id }: { id: string }) {
  return (
    <TicketForm action={commentOnTicket.bind(null, id)} submit="Enviar comentario">
      <label>Comentario <textarea name="body" required maxLength={4000} rows={3} /></label>
    </TicketForm>
  );
}

export function TicketManagementForm({ id, updatedAt, status, priority }: {
  id: string; updatedAt: string; status: string; priority: string;
}) {
  return (
    <TicketForm action={manageTicket.bind(null, id, updatedAt)} submit="Guardar cambios">
      <label>Estado <select name="status" defaultValue={status}><Options values={ticketStatuses} /></select></label>
      <label>Prioridad <select name="priority" defaultValue={priority}><Options values={ticketPriorities} /></select></label>
      <label>Asignación <select name="assignment" defaultValue="keep">
        <option value="keep">Mantener asignación</option>
        <option value="mine">Asignármelo</option>
        <option value="none">Dejar sin asignar</option>
      </select></label>
    </TicketForm>
  );
}
