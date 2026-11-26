"use client";

import { startTransition, useActionState, useEffect, useRef, useState, type ClipboardEvent, type FormEvent, type ReactNode } from "react";
import Image from "next/image";
import {
  ticketAreas, ticketAttachmentCount, ticketAttachmentError, ticketAttachmentLimit,
  ticketCategories, ticketPriorities, ticketScreenshotMarker, ticketScreenshotTypes, ticketStatuses,
} from "@/lib/user-tickets";
import { commentOnTicket, createTicket, manageTicket } from "./actions";
import styles from "./tickets.module.css";

type Result = { error: string };
type TicketAction = (state: Result, form: FormData) => Promise<Result>;

function TicketForm({ action, submit, children, prepare }: { action: TicketAction; submit: string; children: ReactNode; prepare?: (form: FormData) => void }) {
  const [state, dispatch, pending] = useActionState(action, { error: "" });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    prepare?.(form);
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

type DraftAttachment = { id: string; file: File; screenshot: boolean };

function ScreenshotPreview({ file, name }: { file: File; name: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const reader = new FileReader();
    reader.onload = () => setUrl(String(reader.result));
    reader.readAsDataURL(file);
    return () => {
      if (reader.readyState === FileReader.LOADING) reader.abort();
    };
  }, [file]);

  return url && <Image className={styles.screenshot} src={url} alt={name} width={640} height={360} unoptimized />;
}

export function NewTicketForm() {
  const nextFile = useRef(1);
  const [description, setDescription] = useState("");
  const [attachments, setAttachments] = useState<DraftAttachment[]>([]);
  const [uploadError, setUploadError] = useState("");
  const active = attachments.filter(({ id, screenshot }) => !screenshot || description.includes(ticketScreenshotMarker(id)));

  function addAttachments(files: File[], screenshot: boolean) {
    if (files.some((file) => !file.size || file.name.length > 180)) {
      setUploadError("Los archivos deben contener datos y su nombre debe tener hasta 180 caracteres.");
      return [];
    }
    if (active.length + files.length > ticketAttachmentCount ||
        [...active.map(({ file }) => file), ...files].reduce((total, file) => total + file.size, 0) > ticketAttachmentLimit) {
      setUploadError(ticketAttachmentError);
      return [];
    }
    const added = files.map((file) => ({ file, screenshot, id: `f${nextFile.current++}` }));
    setUploadError("");
    setAttachments([...active, ...added]);
    return added;
  }

  function pasteScreenshot(event: ClipboardEvent<HTMLTextAreaElement>) {
    const images = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
    if (!images.length) return;
    event.preventDefault();
    if (images.some((image) => !ticketScreenshotTypes.some((type) => type === image.type))) {
      setUploadError("Pega capturas en formato PNG, JPEG o WebP.");
      return;
    }

    const editor = event.currentTarget;
    const { selectionStart, selectionEnd } = editor;
    const markersLength = images.reduce((length, _, index) =>
      length + ticketScreenshotMarker(`f${nextFile.current + index}`).length, 0);
    if (description.length - (selectionEnd - selectionStart) + markersLength > 6000) {
      setUploadError("La descripción admite hasta 6.000 caracteres.");
      return;
    }
    const added = addAttachments(images, true);
    if (!added.length) return;
    const markers = added.map(({ id }) => ticketScreenshotMarker(id)).join("");
    editor.setRangeText(markers, selectionStart, selectionEnd, "end");
    setDescription(editor.value);
  }

  function removeAttachment({ id, screenshot }: DraftAttachment) {
    setAttachments(attachments.filter((entry) => entry.id !== id));
    if (screenshot) setDescription(description.replaceAll(ticketScreenshotMarker(id), ""));
    setUploadError("");
  }

  function prepare(form: FormData) {
    form.delete("attachment");
    for (const { id, file, screenshot } of active) {
      form.append(screenshot ? `screenshot:${id}` : `attachment:${id}`, file);
    }
  }

  function attachmentList(isScreenshot: boolean) {
    const entries = active.filter(({ screenshot }) => screenshot === isScreenshot);
    if (!entries.length) return null;
    return <ul className={styles.attachments}>{entries.map((entry) => {
      const name = isScreenshot ? `Captura ${entry.id.slice(1)}` : entry.file.name;
      return <li key={entry.id}>
        {isScreenshot && <ScreenshotPreview file={entry.file} name={name} />}
        <span>{name}</span>{" "}
        <button type="button" onClick={() => removeAttachment(entry)} aria-label={`Quitar ${name}`}>Quitar</button>
      </li>;
    })}</ul>;
  }

  return (
    <TicketForm action={createTicket} submit="Enviar ticket" prepare={prepare}>
      <div className={styles.fields}>
        <label>Categoría <select name="category" required defaultValue="">
          <option value="" disabled>Selecciona una categoría</option><Options values={ticketCategories} />
        </select></label>
        <label>Módulo <select name="area" required defaultValue="">
          <option value="" disabled>Selecciona un módulo</option><Options values={ticketAreas} />
        </select></label>
      </div>
      <label>Resumen <input name="title" required maxLength={160} placeholder="Ej. El corresponsal no ha recibido el EDI" /></label>
      <div>
        <label>Descripción <textarea name="description" required maxLength={6000} rows={6}
          value={description} onChange={(event) => setDescription(event.target.value)} onPaste={pasteScreenshot}
          aria-describedby="ticket-paste-help" placeholder="Qué ocurrió, qué esperabas y cómo se puede reproducir." />
          <small id="ticket-paste-help">Puedes pegar capturas directamente en la descripción.</small>
        </label>
        {attachmentList(true)}
      </div>
      <label>Referencia operativa <input name="reference" maxLength={100} placeholder="Viaje, partida, expedición o documento" /></label>
      <div>
        <label>Adjuntos <input name="attachment" type="file" multiple onChange={(event) => {
          addAttachments(Array.from(event.currentTarget.files ?? []), false);
          event.currentTarget.value = "";
        }} /><small>Opcional · {ticketAttachmentError}</small></label>
        {attachmentList(false)}
      </div>
      {uploadError && <p className={styles.error} role="alert">{uploadError}</p>}
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
