"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type { PortalView } from "@/lib/dock-portal";
import styles from "./portal.module.css";
type Booking = {
  code: string;
  start: string;
  end: string;
  status: string;
  warning?: boolean;
};
export default function DockPortalClient({ token }: { token: string }) {
  const [data, setData] = useState<PortalView | null>(null),
    [date, setDate] = useState(""),
    [rule, setRule] = useState(""),
    [direction, setDirection] = useState("INBOUND"),
    [selected, setSelected] = useState(""),
    [plate, setPlate] = useState(""),
    [reference, setReference] = useState(""),
    [packages, setPackages] = useState("1"),
    [weight, setWeight] = useState("1"),
    [notes, setNotes] = useState(""),
    [message, setMessage] = useState(""),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [retryPending, setRetryPending] = useState(false),
    [booking, setBooking] = useState<Booking | null>(null);
  const key = useRef<string | null>(null),
    payload = useRef<string | null>(null),
    mutex = useRef(false),
    requestId = useRef(0);
  const endpoint = `/api/dock-portal/${encodeURIComponent(token)}`;
  const load = useCallback(async () => {
    const current = ++requestId.current;
    setLoading(true);
    setMessage("");
    try {
      const params = new URLSearchParams({ direction });
      if (date) params.set("date", date);
      if (rule) params.set("rule", rule);
      const res = await fetch(`${endpoint}?${params}`, {
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Acceso no disponible.");
      if (current === requestId.current) setData(body);
    } catch (e) {
      if (current === requestId.current) {
        setData(null);
        setMessage(e instanceof Error ? e.message : "Acceso no disponible.");
      }
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, [endpoint, date, rule, direction]);
  useEffect(() => {
    void load();
    return () => {
      requestId.current += 1;
    };
  }, [load]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (mutex.current || !selected || !data || data.suspended) return;
    mutex.current = true;
    setSaving(true);
    setMessage("");
    key.current ??= crypto.randomUUID().replaceAll("-", "");
    payload.current ??= JSON.stringify({
      plate,
      reference,
      packages: Number(packages),
      weight_kg: Number(weight),
      notes,
      start: selected,
      rule_code: data.selectedRule,
      direction,
      idempotency_key: key.current,
    });
    setRetryPending(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        headers: { "Content-Type": "application/json" },
        body: payload.current,
      });
      const body = await res.json();
      if (!res.ok) {
        // A server rejection is definitive. An interrupted response must retry the frozen payload.
        payload.current = null;
        key.current = null;
        setRetryPending(false);
        throw new Error(body.error || "No se pudo reservar.");
      }
      setBooking(body.booking);
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "No se pudo reservar.");
    } finally {
      setSaving(false);
      mutex.current = false;
    }
  };
  const time = (value: string) =>
    new Intl.DateTimeFormat("es-ES", {
      timeZone: data?.timezone ?? "Europe/Madrid",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <span className={styles.brand}>FORNEXA</span>
        <h1>{data?.warehouse ?? "Reserva de muelle"}</h1>
      </header>
      {loading && <p role="status">Cargando disponibilidad…</p>}
      {message && (
        <p role="alert" className={styles.notice}>
          {message}
        </p>
      )}
      {data && (
        <>
          {data.warning && (
            <p role="status" className={styles.notice}>
              Tu transportista tiene un aviso activo. Confirma las condiciones
              con el planificador.
            </p>
          )}
          {data.suspended && (
            <p role="alert" className={styles.notice}>
              Autoservicio suspendido. Contacta con el planificador para
              reservar.
            </p>
          )}
          {booking ? (
            <section className={styles.panel}>
              <p className={styles.eyebrow}>CONFIRMACIÓN</p>
              <h2>{booking.code}</h2>
              <p>
                {time(booking.start)} – {time(booking.end)}
              </p>
              <p>
                Reserva confirmada. Consulta las instrucciones del centro antes
                de llegar.
              </p>
              {booking.warning && (
                <p className={styles.notice}>Reserva con aviso operativo.</p>
              )}
              <button
                type="button"
                onClick={() => {
                  setBooking(null);
                  setSelected("");
                  key.current = null;
                  payload.current = null;
                  setRetryPending(false);
                }}
              >
                Nueva solicitud
              </button>
            </section>
          ) : (
            <form className={styles.panel} onSubmit={submit}>
              <fieldset disabled={saving || data.suspended || retryPending}>
                <legend>Identificación y referencia</legend>
                <div className={styles.grid}>
                  <label>
                    Matrícula del viaje
                    <input
                      value={plate}
                      onChange={(e) => setPlate(e.target.value.toUpperCase())}
                      pattern="[A-Z0-9-]{4,12}"
                      maxLength={12}
                      autoComplete="off"
                      required
                    />
                  </label>
                  <label>
                    Referencia del pedido o expedición
                    <input
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                      pattern="[A-Za-z0-9._/\-]{1,40}"
                      maxLength={40}
                      autoComplete="off"
                      required
                    />
                  </label>
                  <label>
                    Bultos
                    <input
                      type="number"
                      min={1}
                      max={60}
                      step={1}
                      value={packages}
                      onChange={(e) => setPackages(e.target.value)}
                      required
                    />
                  </label>
                  <label>
                    Peso bruto (kg)
                    <input
                      type="number"
                      min={1}
                      max={44000}
                      step="0.001"
                      value={weight}
                      onChange={(e) => setWeight(e.target.value)}
                      required
                    />
                  </label>
                  <label>
                    Operación
                    <select
                      value={direction}
                      onChange={(e) => {
                        setDirection(e.target.value);
                        setRule("");
                        setSelected("");
                      }}
                    >
                      <option value="INBOUND">Entrada · descarga</option>
                      <option value="OUTBOUND">Salida · carga</option>
                    </select>
                  </label>
                  <label>
                    Tipo de carga
                    <select
                      value={data.selectedRule}
                      onChange={(e) => {
                        setRule(e.target.value);
                        setSelected("");
                      }}
                    >
                      {data.rules.map((r) => (
                        <option key={r.code} value={r.code}>
                          {r.cargo} · {r.minutes} min
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </fieldset>
              <fieldset disabled={saving || data.suspended || retryPending}>
                <legend>Ventana</legend>
                <label>
                  Fecha
                  <input
                    type="date"
                    value={date || data.date}
                    onChange={(e) => {
                      setDate(e.target.value);
                      setSelected("");
                    }}
                    required
                  />
                </label>
                <div className={styles.slots}>
                  {data.slots.map((s) => (
                    <button
                      type="button"
                      key={s.start}
                      disabled={!s.remaining || loading}
                      aria-pressed={selected === s.start}
                      className={selected === s.start ? styles.selected : ""}
                      onClick={() => setSelected(s.start)}
                    >
                      <b>
                        {new Intl.DateTimeFormat("es-ES", {
                          timeZone: data.timezone,
                          hour: "2-digit",
                          minute: "2-digit",
                        }).format(new Date(s.start))}
                      </b>
                      <span>
                        {s.remaining} / {s.capacity} plazas
                      </span>
                    </button>
                  ))}
                </div>
                {!data.slots.length && (
                  <p>
                    No hay ventanas disponibles para esta fecha. Elige otro día.
                  </p>
                )}
              </fieldset>
              <fieldset disabled={saving || data.suspended || retryPending}>
                <legend>Observaciones</legend>
                <label>
                  Indicaciones para el centro
                  <input
                    value={notes}
                    maxLength={500}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </label>
              </fieldset>
              <div className={styles.footer}>
                <span>
                  {selected ? time(selected) : "Selecciona una ventana"}
                </span>
                <button
                  type="submit"
                  disabled={!selected || saving || loading || data.suspended}
                >
                  {saving
                    ? "Reservando…"
                    : retryPending
                      ? "Reintentar la misma reserva"
                      : "Confirmar reserva"}
                </button>
              </div>
            </form>
          )}
          {data.instructions && (
            <section className={styles.panel}>
              <p className={styles.eyebrow}>ACCESO</p>
              <h2>Instrucciones del centro</h2>
              <p>{data.instructions}</p>
            </section>
          )}
          <section className={styles.panel}>
            <p className={styles.eyebrow}>TRANSPORTISTA</p>
            <h2>Tus citas</h2>
            <ul className={styles.list}>
              {data.appointments.map((a) => (
                <li key={a.code}>
                  <strong>{a.code}</strong>
                  <span>
                    {time(a.start)} – {time(a.end)}
                  </span>
                  <span>
                    {(
                      {
                        CONFIRMED: "Confirmada",
                        CHECKED_IN: "En patio",
                        AT_DOCK: "En muelle",
                        OPERATION_ENDED: "Operación terminada",
                        COMPLETED: "Completada",
                        CANCELLED: "Cancelada",
                        NO_SHOW: "No presentada",
                      } as Record<string, string>
                    )[a.status] ?? a.status}
                  </span>
                </li>
              ))}
            </ul>
            {!data.appointments.length && (
              <p>No hay citas registradas para tu transporte.</p>
            )}
          </section>
        </>
      )}
    </main>
  );
}
