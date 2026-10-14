"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MetricGrid,
  ScreenHeader,
  screenButton,
  screenPanelClass,
} from "../../components/ScreenChrome";
import {
  appointmentKpis,
  availableDocks,
  ACTIVE_DOCK_STATUSES,
  DIRECTIONS,
  DEFAULT_DOCK_POLICY,
  type Appointment,
  type DockData,
} from "@/lib/docks";
import {
  calendarParts,
  shiftDate,
  zonedInstant,
} from "@/lib/operational-calendar";
import { dockMutation, useDockData } from "@/lib/dock-client";
import DockDialog from "./DockDialog";
import AppointmentEditor from "./AppointmentEditor";
import styles from "./docks.module.css";
export const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Borrador",
  CONFIRMED: "Confirmada",
  CHECKED_IN: "En patio",
  AT_DOCK: "En muelle",
  OPERATION_ENDED: "Operación terminada",
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
  NO_SHOW: "No presentada",
};
export const EVENT_LABEL: Record<string, string> = {
  DOCK_GATE_IN: "Entrada al recinto",
  DOCK_CHECK_IN: "Check-in",
  DOCK_OPERATION_START: "Inicio de operación",
  DOCK_OPERATION_END: "Fin de operación",
  DOCK_CHECK_OUT: "Check-out",
};
export function transportFor(data: DockData, row: Appointment) {
  const stop = data.stops.find((s) => s.id === row.trip_stop_id),
    trip = data.trips.find((t) => t.id === stop?.trip_id);
  return {
    trip,
    carrier:
      data.carriers.find((c) => c.id === trip?.carrier_id)?.legal_name ??
      "Sin viaje enlazado",
    vehicle:
      data.vehicles.find((v) => v.id === trip?.vehicle_id)?.registration ?? "—",
    driver: data.drivers.find((d) => d.id === trip?.driver_id)?.name ?? "—",
    trailer: trip?.trailer_registration ?? "—",
  };
}
function today() {
  return calendarParts(new Date(), "Europe/Madrid").date;
}
export default function DocksWorkspace() {
  const [date, setDate] = useState(today),
    [period, setPeriod] = useState("Día"),
    [view, setView] = useState("Planificación"),
    [warehouse, setWarehouse] = useState(""),
    [zone, setZone] = useState(""),
    [direction, setDirection] = useState(""),
    [selected, setSelected] = useState<string | null>(null),
    [editing, setEditing] = useState<Appointment | "new" | null>(null),
    [slot, setSlot] = useState<{ dock: string; start: string } | null>(null),
    [now, setNow] = useState(Date.now()),
    [busy, setBusy] = useState(false),
    [reason, setReason] = useState("");
  const interval = useMemo(() => {
    const first = period === "Mes" ? `${date.slice(0, 7)}-01` : date;
    const next =
      period === "Mes"
        ? new Date(
            Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 1),
          )
            .toISOString()
            .slice(0, 10)
        : shiftDate(date, period === "Semana" ? 7 : 1);
    return {
      from: zonedInstant(first, "00:00", "Europe/Madrid"),
      until: zonedInstant(next, "00:00", "Europe/Madrid"),
      first,
      next,
    };
  }, [date, period]);
  const { data, error, loading, load, setError } = useDockData(
    interval.from,
    interval.until,
  );
  const wid = warehouse || data.warehouses[0]?.id || "",
    policy =
      data.policies.find((p) => p.warehouse_id === wid)?.parameters ??
      DEFAULT_DOCK_POLICY;
  const appointments = data.appointments.filter(
    (a) => a.warehouse_id === wid && (!direction || a.direction === direction),
  );
  const docks = data.docks.filter(
    (d) => d.warehouse_id === wid && (!zone || d.zone_id === zone),
  );
  const visible = appointments.filter(
    (a) => !zone || docks.some((d) => d.id === a.dock_id),
  );
  const kpis = appointmentKpis(
    appointments,
    data.events,
    policy.punctuality_minutes,
  );
  const detail = data.appointments.find((a) => a.id === selected);
  const newButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const refresh = setInterval(() => {
      setNow(Date.now());
      void load();
    }, 30000);
    return () => clearInterval(refresh);
  }, [load]);
  const newAppointment = useCallback(() => {
    if (data.canEdit && wid) {
      setSlot(null);
      setEditing("new");
    }
  }, [data.canEdit, wid]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.key === "+" &&
        !editing &&
        !selected &&
        !e.ctrlKey &&
        !e.metaKey &&
        !(
          e.target instanceof HTMLElement &&
          e.target.closest("input,textarea,select")
        )
      ) {
        e.preventDefault();
        newAppointment();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [editing, selected, newAppointment]);
  const action = async (row: Appointment, name: string) => {
    setBusy(true);
    setError("");
    try {
      await dockMutation("/api/docks", {
        id: row.id,
        expected: row.updated_at,
        action: name,
        ...(["CANCEL", "NO_SHOW"].includes(name) ? { reason } : {}),
      });
      setReason("");
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo registrar el hito.",
      );
    } finally {
      setBusy(false);
    }
  };
  const time = (s: string) =>
    new Intl.DateTimeFormat("es-ES", {
      timeZone: "Europe/Madrid",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(s));
  const start = Date.parse(
      period === "Día"
        ? zonedInstant(date, "06:00", "Europe/Madrid")
        : interval.from,
    ),
    end = Date.parse(
      period === "Día"
        ? zonedInstant(date, "22:00", "Europe/Madrid")
        : interval.until,
    );
  const incidents = appointments.filter(
    (a) =>
      a.status === "NO_SHOW" ||
      (a.status === "CONFIRMED" && Date.parse(a.planned_end) < now) ||
      a.booking_kind === "WAITLIST",
  );
  const queue = appointments
    .filter((a) => a.status === "CHECKED_IN")
    .sort(
      (a, b) =>
        Date.parse(a.planned_start) - Date.parse(b.planned_start) ||
        ["URGENT", "HIGH", "NORMAL", "LOW"].indexOf(a.priority) -
          ["URGENT", "HIGH", "NORMAL", "LOW"].indexOf(b.priority),
    );
  return (
    <main className={styles.page}>
      <ScreenHeader eyebrow={view.toUpperCase()} title="Muelles">
        <button
          type="button"
          className={screenButton.secondary}
          onClick={() => void load()}
          disabled={loading}
        >
          Actualizar
        </button>
        <button
          ref={newButton}
          type="button"
          className={screenButton.primary}
          onClick={newAppointment}
          disabled={!data.canEdit || !wid}
        >
          + Nueva cita
        </button>
      </ScreenHeader>
      {error && (
        <p role="alert" className={styles.notice}>
          {error}
        </p>
      )}
      {data.truncated && (
        <p role="status" className={styles.notice}>
          Se alcanzó el límite de consulta. Acota las fechas antes de
          planificar.
        </p>
      )}
      <MetricGrid
        items={[
          { label: "Citas", value: appointments.length },
          {
            label: "Puntualidad",
            value: kpis.punctuality === null ? "—" : `${kpis.punctuality} %`,
          },
          {
            label: view === "Patio" ? "En patio" : "Incidencias",
            value: view === "Patio" ? queue.length : incidents.length,
            tone: "warning",
          },
          {
            label: "Espera media",
            value: kpis.wait === null ? "—" : `${kpis.wait} min`,
          },
        ]}
      />
      <section className={`${screenPanelClass} ${styles.panel}`}>
        <div className={styles.panelHead}>
          <div>
            <p className={styles.eyebrow}>{date}</p>
            <h2>
              {view === "Patio"
                ? "Estado de los muelles"
                : "Ocupación por muelle"}
            </h2>
          </div>
          <div className={styles.toolbar}>
            {["Planificación", "Patio"].map((v) => (
              <button
                type="button"
                key={v}
                aria-pressed={view === v}
                className={view === v ? styles.selected : ""}
                onClick={() => setView(v)}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.toolbar}>
          <label>
            Almacén{" "}
            <select
              aria-label="Almacén"
              value={wid}
              onChange={(e) => {
                setWarehouse(e.target.value);
                setZone("");
              }}
            >
              {data.warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} · {w.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            aria-label="Periodo anterior"
            onClick={() =>
              setDate(
                period === "Mes"
                  ? new Date(
                      Date.UTC(
                        Number(date.slice(0, 4)),
                        Number(date.slice(5, 7)) - 2,
                        1,
                      ),
                    )
                      .toISOString()
                      .slice(0, 10)
                  : shiftDate(date, period === "Día" ? -1 : -7),
              )
            }
          >
            ‹
          </button>
          <input
            type="date"
            aria-label="Fecha"
            value={date}
            onChange={(e) => {
              if (e.target.value) setDate(e.target.value);
            }}
          />
          <button
            type="button"
            aria-label="Periodo siguiente"
            onClick={() =>
              setDate(
                period === "Mes"
                  ? new Date(
                      Date.UTC(
                        Number(date.slice(0, 4)),
                        Number(date.slice(5, 7)),
                        1,
                      ),
                    )
                      .toISOString()
                      .slice(0, 10)
                  : shiftDate(date, period === "Día" ? 1 : 7),
              )
            }
          >
            ›
          </button>
          <button type="button" onClick={() => setDate(today())}>
            Hoy
          </button>
          {view === "Planificación" && (
            <select
              aria-label="Escala del Gantt"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            >
              {["Día", "Semana", "Mes"].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          )}
          <select
            aria-label="Zona"
            value={zone}
            onChange={(e) => setZone(e.target.value)}
          >
            <option value="">Todas las zonas</option>
            {data.zones
              .filter((z) => z.warehouse_id === wid)
              .map((z) => (
                <option value={z.id} key={z.id}>
                  {z.zone_name}
                </option>
              ))}
          </select>
          <select
            aria-label="Dirección"
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
          >
            <option value="">Entrada y salida</option>
            {DIRECTIONS.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </div>
        {!loading && !docks.length && (
          <p>No hay muelles configurados para este almacén.</p>
        )}
        {loading && <p role="status">Cargando muelles…</p>}
        {view === "Planificación" ? (
          <>
            {period === "Día" && (
              <div className={styles.histogram} aria-label="Carga por hora">
                {Array.from({ length: 16 }, (_, i) => {
                  const a = start + i * 3600000,
                    used = appointments.filter(
                      (row) =>
                        row.booking_kind === "FIRM" &&
                        ACTIVE_DOCK_STATUSES.includes(row.status) &&
                        Date.parse(row.planned_start) < a + 3600000 &&
                        Date.parse(row.planned_end) > a,
                    ).length;
                  const pct = Math.min(
                    100,
                    docks.length ? (100 * used) / docks.length : 0,
                  );
                  return (
                    <div
                      key={i}
                      style={{ height: `${pct}%` }}
                      title={`${i + 6}:00 · ${Math.round(pct)} %`}
                    >
                      <small>{i + 6}</small>
                    </div>
                  );
                })}
              </div>
            )}
            <div className={styles.scroll}>
              <div className={styles.gantt}>
                <div className={styles.axis}>
                  <b>Muelle</b>
                  <div className={styles.ticks}>
                    {Array.from(
                      {
                        length:
                          period === "Día" ? 9 : period === "Semana" ? 7 : 8,
                      },
                      (_, i) => (
                        <span key={i}>
                          {period === "Día"
                            ? `${6 + i * 2}:00`
                            : time(
                                new Date(
                                  start +
                                    ((end - start) * i) /
                                      (period === "Semana" ? 7 : 8),
                                ).toISOString(),
                              ).slice(0, 5)}
                        </span>
                      ),
                    )}
                  </div>
                </div>
                {docks.map((d) => (
                  <div className={styles.row} key={d.id}>
                    <div>
                      <strong>{d.code}</strong>
                      <small>
                        {d.temperature_regime} · {d.status}
                      </small>
                    </div>
                    <div className={styles.track}>
                      {visible
                        .filter(
                          (a) =>
                            a.dock_id === d.id &&
                            Date.parse(a.planned_end) > start &&
                            Date.parse(a.planned_start) < end,
                        )
                        .map((a) => {
                          const left = Math.max(
                              0,
                              ((Date.parse(a.planned_start) - start) /
                                (end - start)) *
                                100,
                            ),
                            right = Math.min(
                              100,
                              ((Date.parse(a.planned_end) - start) /
                                (end - start)) *
                                100,
                            );
                          return (
                            <button
                              type="button"
                              key={a.id}
                              className={`${styles.bar} ${a.direction === "OUTBOUND" ? styles.outbound : ""} ${a.status === "NO_SHOW" ? styles.risk : ""}`}
                              style={{
                                left: `${left}%`,
                                width: `${right - left}%`,
                              }}
                              onClick={() => setSelected(a.id)}
                              title={`${a.code} · ${transportFor(data, a).carrier} · ${time(a.planned_start)} · ${STATUS_LABEL[a.status]}`}
                            >
                              <b>{a.code}</b>
                              <small>{STATUS_LABEL[a.status]}</small>
                            </button>
                          );
                        })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {data.canEdit && period === "Día" && (
              <div className={styles.toolbar}>
                <span>Reservar un hueco:</span>
                {Array.from({ length: 16 }, (_, i) => {
                  const s = new Date(start + i * 3600000).toISOString(),
                    e = new Date(start + (i + 1) * 3600000).toISOString(),
                    free = availableDocks(docks, appointments, s, e);
                  return (
                    <button
                      type="button"
                      key={i}
                      disabled={!free.length || data.truncated}
                      onClick={() => {
                        setSlot({ dock: free[0].id, start: s });
                        setEditing("new");
                      }}
                    >
                      {i + 6}:00
                    </button>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <div className={styles.cards}>
            {docks.map((d) => {
              const row = visible.find(
                  (a) => a.dock_id === d.id && a.status === "AT_DOCK",
                ),
                begun =
                  row &&
                  data.events.find(
                    (e) =>
                      e.dock_appointment_id === row.id &&
                      e.event_type === "DOCK_OPERATION_START",
                  ),
                elapsed = begun
                  ? Math.max(
                      0,
                      Math.floor((now - Date.parse(begun.occurred_at)) / 60000),
                    )
                  : 0;
              return (
                <article key={d.id} className={styles.card}>
                  <strong>
                    {d.code} ·{" "}
                    {row
                      ? "En operación"
                      : d.status === "ACTIVE"
                        ? "Libre"
                        : d.status}
                  </strong>
                  {row ? (
                    <>
                      <p>{transportFor(data, row).carrier}</p>
                      <span className={styles.timer}>{elapsed} min</span>
                      <small>
                        Previsto:{" "}
                        {Math.round(
                          (Date.parse(row.planned_end) -
                            Date.parse(row.planned_start)) /
                            60000,
                        )}{" "}
                        min
                      </small>
                      <button
                        type="button"
                        className={screenButton.secondary}
                        onClick={() => setSelected(row.id)}
                      >
                        Ficha
                      </button>
                      <button
                        type="button"
                        className={screenButton.primary}
                        disabled={busy || !data.canEdit}
                        onClick={() => void action(row, "DOCK_OPERATION_END")}
                      >
                        Finalizar
                      </button>
                    </>
                  ) : (
                    <small>{d.cargo_profiles.join(" · ")}</small>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
      <section className={`${screenPanelClass} ${styles.panel}`}>
        <div className={styles.panelHead}>
          <div>
            <p className={styles.eyebrow}>
              {view === "Patio" ? "VENTANA Y PRIORIDAD" : "REQUIERE DECISIÓN"}
            </p>
            <h2>{view === "Patio" ? "Cola de patio" : "Incidencias"}</h2>
          </div>
        </div>
        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Cita</th>
                <th>Transporte</th>
                <th>Ventana</th>
                <th>Estado</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {(view === "Patio" ? queue : incidents).map((a) => (
                <tr key={a.id}>
                  <td>{a.code}</td>
                  <td>
                    {transportFor(data, a).carrier}
                    <small>{transportFor(data, a).vehicle}</small>
                  </td>
                  <td>{time(a.planned_start)}</td>
                  <td>
                    {STATUS_LABEL[a.status]}
                    <small>{a.booking_kind}</small>
                  </td>
                  <td>
                    <button
                      type="button"
                      className={screenButton.secondary}
                      onClick={() => setSelected(a.id)}
                    >
                      Ficha y acciones
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!(view === "Patio" ? queue : incidents).length && (
            <p>Sin {view === "Patio" ? "citas en espera" : "incidencias"}.</p>
          )}
        </div>
      </section>
      <section className={`${screenPanelClass} ${styles.panel}`}>
        <div className={styles.panelHead}>
          <div>
            <p className={styles.eyebrow}>OPERACIÓN</p>
            <h2>Citas del periodo</h2>
          </div>
        </div>
        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Cita</th>
                <th>Muelle</th>
                <th>Inicio / fin</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((a) => (
                <tr key={a.id}>
                  <td>
                    {a.code}
                    <small>{transportFor(data, a).vehicle}</small>
                  </td>
                  <td>
                    {docks.find((d) => d.id === a.dock_id)?.code ??
                      "Sin asignar"}
                  </td>
                  <td>
                    {time(a.planned_start)} / {time(a.planned_end)}
                  </td>
                  <td>{STATUS_LABEL[a.status]}</td>
                  <td>
                    <button
                      type="button"
                      className={screenButton.secondary}
                      onClick={() => setSelected(a.id)}
                    >
                      Ficha 360°
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {detail && (
        <DockDialog
          locked={busy}
          title={`Ficha 360° · ${detail.code}`}
          onClose={() => {
            if (!busy) setSelected(null);
          }}
        >
          <div className={styles.details}>
            {error && (
              <p role="alert" className={styles.notice}>
                {error}
              </p>
            )}
            <div className={styles.grid}>
              <p>
                <b>Estado</b>
                <br />
                {STATUS_LABEL[detail.status]}
              </p>
              <p>
                <b>Ventana</b>
                <br />
                {time(detail.planned_start)} – {time(detail.planned_end)}
              </p>
              <p>
                <b>Transporte</b>
                <br />
                {transportFor(data, detail).carrier}
                <br />
                {transportFor(data, detail).vehicle} ·{" "}
                {transportFor(data, detail).trailer}
                <br />
                {transportFor(data, detail).driver}
              </p>
              <p>
                <b>Reserva</b>
                <br />
                {detail.booking_kind} · {detail.priority} · {detail.booked_via}
              </p>
            </div>
            <h3>Alternativos y conflicto</h3>
            <p>
              {availableDocks(
                docks,
                appointments,
                detail.planned_start,
                detail.planned_end,
                detail.id,
                data.rules.find((r) => r.id === detail.rule_id)?.cargo_profile,
              )
                .map((d) => d.code)
                .join(" · ") ||
                "No hay otro muelle compatible libre en esta ventana."}
            </p>
            <h3>Línea de tiempo</h3>
            <ul className={styles.list}>
              {data.events
                .filter((e) => e.dock_appointment_id === detail.id)
                .map((e) => (
                  <li key={e.id}>
                    {EVENT_LABEL[e.event_type]} · {time(e.occurred_at)} ·{" "}
                    {data.actorNames[e.actor_user_id] ??
                      "Usuario de la empresa"}
                  </li>
                ))}
            </ul>
            <h3>Trazabilidad</h3>
            <ul className={styles.list}>
              {data.audits
                .filter((a) => a.entity_id === detail.id)
                .map((a) => (
                  <li key={a.id}>
                    {a.action} · {time(a.occurred_at)} ·{" "}
                    {a.source_channel === "PORTAL" ? "Transportista · Portal" :
                      (a.actor_user_id && data.actorNames[a.actor_user_id]) || "Usuario de la empresa"}{" "}
                    {a.reason && `· ${a.reason}`}
                  </li>
                ))}
            </ul>
            {data.canEdit && (
              <>
                <label className={styles.field}>
                  Motivo de cancelación o no-show
                  <input
                    value={reason}
                    maxLength={500}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                <div className={styles.toolbar}>
                  {["DRAFT", "CONFIRMED", "CHECKED_IN"].includes(
                    detail.status,
                  ) && (
                    <button
                      type="button"
                      className={screenButton.secondary}
                      disabled={busy}
                      onClick={() => {
                        setEditing(detail);
                        setSelected(null);
                      }}
                    >
                      Mover / editar
                    </button>
                  )}
                  {detail.status === "CONFIRMED" && (
                    <>
                      <button
                        type="button"
                        className={screenButton.primary}
                        disabled={busy}
                        onClick={() => void action(detail, "DOCK_GATE_IN")}
                      >
                        Entrada
                      </button>
                      <button
                        type="button"
                        className={screenButton.primary}
                        disabled={busy}
                        onClick={() => void action(detail, "DOCK_CHECK_IN")}
                      >
                        Check-in
                      </button>
                    </>
                  )}
                  {detail.status === "CHECKED_IN" && (
                    <button
                      type="button"
                      className={screenButton.primary}
                      disabled={busy || !detail.dock_id}
                      onClick={() =>
                        void action(detail, "DOCK_OPERATION_START")
                      }
                    >
                      Iniciar operación
                    </button>
                  )}
                  {detail.status === "AT_DOCK" && (
                    <button
                      type="button"
                      className={screenButton.primary}
                      disabled={busy}
                      onClick={() => void action(detail, "DOCK_OPERATION_END")}
                    >
                      Finalizar operación
                    </button>
                  )}
                  {detail.status === "OPERATION_ENDED" && (
                    <button
                      type="button"
                      className={screenButton.primary}
                      disabled={busy}
                      onClick={() => void action(detail, "DOCK_CHECK_OUT")}
                    >
                      Check-out
                    </button>
                  )}
                  {["DRAFT", "CONFIRMED"].includes(detail.status) && (
                    <button
                      type="button"
                      className={screenButton.secondary}
                      disabled={busy || !reason.trim()}
                      onClick={() => void action(detail, "CANCEL")}
                    >
                      Cancelar cita
                    </button>
                  )}
                  {detail.status === "CONFIRMED" && (
                    <button
                      type="button"
                      className={screenButton.secondary}
                      disabled={
                        busy ||
                        !reason.trim() ||
                        now <
                          Date.parse(detail.planned_end) +
                            policy.no_show_minutes * 60000
                      }
                      onClick={() => void action(detail, "NO_SHOW")}
                    >
                      No presentada
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </DockDialog>
      )}
      {editing && (
        <AppointmentEditor
          data={data}
          warehouseId={wid}
          date={date}
          appointment={editing === "new" ? null : editing}
          slot={slot}
          onClose={() => setEditing(null)}
          onSaved={load}
        />
      )}
    </main>
  );
}
