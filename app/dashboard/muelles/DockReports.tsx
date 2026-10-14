"use client";
import { useState } from "react";
import { appointmentKpis, DEFAULT_DOCK_POLICY } from "@/lib/docks";
import {
  shiftDate,
  validateOpeningHours,
  validateHolidayExceptions,
  WEEK_DAYS,
  calendarParts,
} from "@/lib/operational-calendar";
import { useDockData } from "@/lib/dock-client";
import {
  MetricGrid,
  ScreenHeader,
  screenPanelClass,
} from "../../components/ScreenChrome";
import { STATUS_LABEL, transportFor } from "./DocksWorkspace";
import styles from "./docks.module.css";
const today = () => calendarParts(new Date(), "Europe/Madrid").date;
export default function DockReports() {
  const [end, setEnd] = useState(today),
    [warehouse, setWarehouse] = useState("");
  const begin = shiftDate(end, -29),
    { data, error, loading } = useDockData(
      `${begin}T00:00:00Z`,
      `${shiftDate(end, 1)}T00:00:00Z`,
    );
  const wid = warehouse || data.warehouses[0]?.id || "",
    appointments = data.appointments.filter((a) => a.warehouse_id === wid),
    policy =
      data.policies.find((p) => p.warehouse_id === wid)?.parameters ??
      DEFAULT_DOCK_POLICY;
  const kpis = appointmentKpis(
    appointments,
    data.events,
    policy.punctuality_minutes,
  );
  const statuses = Object.entries(STATUS_LABEL).map(([status, label]) => ({
    label,
    count: appointments.filter((a) => a.status === status).length,
  }));
  const carriers = [
    ...new Set(appointments.map((a) => transportFor(data, a).carrier)),
  ].map((carrier) => {
    const own = appointments.filter(
      (a) => transportFor(data, a).carrier === carrier,
    );
    return {
      carrier,
      count: own.length,
      kpis: appointmentKpis(own, data.events, policy.punctuality_minutes),
    };
  });
  const causes = new Map<string, number>();
  for (const a of appointments) {
    const cause =
      a.cancellation_reason ||
      (a.status === "NO_SHOW"
        ? String(a.metadata.no_show_reason ?? "No presentada")
        : "");
    if (cause) causes.set(cause, (causes.get(cause) ?? 0) + 1);
  }
  let openMinutes = 0,
    calendarError = "";
  try {
    const profile = data.profiles.find(
        (p) =>
          p.address_id ===
          data.warehouses.find((w) => w.id === wid)?.address_id,
      ),
      opening = validateOpeningHours(profile?.opening_hours),
      holidays = validateHolidayExceptions(profile?.holiday_exceptions);
    const minutes = (v: string) =>
      Number(v.slice(0, 2)) * 60 + Number(v.slice(3));
    for (let i = 0; i < 30; i++) {
      const date = shiftDate(begin, i),
        dayIndex = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7,
        exception = holidays.find((h) => h.date === date),
        ranges = exception
          ? "closed" in exception
            ? []
            : exception.ranges
          : opening.days[WEEK_DAYS[dayIndex]];
      openMinutes += ranges.reduce(
        (sum, r) => sum + minutes(r.to) - minutes(r.from),
        0,
      );
    }
  } catch {
    calendarError = "No se puede calcular utilización sin un horario canónico.";
  }
  return (
    <main className={styles.page}>
      <ScreenHeader eyebrow="INFORMES" title="Muelles" />
      <div className={styles.toolbar}>
        <label>
          Almacén{" "}
          <select value={wid} onChange={(e) => setWarehouse(e.target.value)}>
            {data.warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code} · {w.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Hasta{" "}
          <input
            type="date"
            value={end}
            onChange={(e) => {
              if (e.target.value) setEnd(e.target.value);
            }}
          />
        </label>
        <span>
          {begin} – {end}
        </span>
      </div>
      {error && (
        <p role="alert" className={styles.notice}>
          {error}
        </p>
      )}
      {loading && <p role="status">Cargando informe…</p>}
      {data.truncated && (
        <p className={styles.notice}>
          Informe parcial: se alcanzó el límite de consulta.
        </p>
      )}
      <MetricGrid
        items={[
          {
            label: "Puntualidad",
            value: kpis.punctuality === null ? "—" : `${kpis.punctuality} %`,
          },
          {
            label: "Espera media",
            value: kpis.wait === null ? "—" : `${kpis.wait} min`,
          },
          {
            label: "Permanencia media",
            value: kpis.dwell === null ? "—" : `${kpis.dwell} min`,
          },
          { label: "No presentadas", value: kpis.noShows },
        ]}
      />
      <section className={`${screenPanelClass} ${styles.panel}`}>
        <div className={styles.panelHead}>
          <div>
            <p className={styles.eyebrow}>RECURSOS</p>
            <h2>Utilización por muelle</h2>
          </div>
        </div>
        {calendarError && <p role="alert">{calendarError}</p>}
        {data.docks
          .filter((d) => d.warehouse_id === wid)
          .map((d) => {
            const own = appointments.filter(
                (a) =>
                  a.dock_id === d.id &&
                  !["DRAFT", "CANCELLED", "NO_SHOW"].includes(a.status) &&
                  a.booking_kind === "FIRM",
              ),
              reserved = own.reduce(
                (sum, a) =>
                  sum +
                  (Date.parse(a.planned_end) - Date.parse(a.planned_start)) /
                    60000,
                0,
              ),
              executed = own.reduce((sum, a) => {
                const start = data.events.find(
                    (e) =>
                      e.dock_appointment_id === a.id &&
                      e.event_type === "DOCK_OPERATION_START",
                  ),
                  end = data.events.find(
                    (e) =>
                      e.dock_appointment_id === a.id &&
                      e.event_type === "DOCK_OPERATION_END",
                  );
                return (
                  sum +
                  (start && end
                    ? Math.max(
                        0,
                        (Date.parse(end.occurred_at) -
                          Date.parse(start.occurred_at)) /
                          60000,
                      )
                    : 0)
                );
              }, 0);
            const pct = openMinutes
              ? Math.round((100 * reserved) / openMinutes)
              : null;
            return (
              <div key={d.id}>
                <strong>
                  {d.code} · {pct === null ? "—" : `${pct} % reservado`}
                </strong>
                <small>
                  {" "}
                  · {Math.round(reserved)} min previstos /{" "}
                  {Math.round(executed)} min ejecutados
                </small>
                <div className={styles.progress}>
                  <span style={{ width: `${Math.min(100, pct ?? 0)}%` }} />
                </div>
              </div>
            );
          })}
      </section>
      <section className={`${screenPanelClass} ${styles.panel}`}>
        <div>
          <p className={styles.eyebrow}>RESULTADO</p>
          <h2>Estados</h2>
        </div>
        <div className={styles.cards}>
          {statuses.map((s) => (
            <article key={s.label} className={styles.card}>
              <b>{s.label}</b>
              <span>{s.count}</span>
            </article>
          ))}
        </div>
      </section>
      <section className={`${screenPanelClass} ${styles.panel}`}>
        <div>
          <p className={styles.eyebrow}>TRANSPORTISTAS</p>
          <h2>Puntualidad y espera</h2>
        </div>
        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Transportista</th>
                <th>Citas</th>
                <th>Puntualidad</th>
                <th>Espera</th>
                <th>No-show</th>
              </tr>
            </thead>
            <tbody>
              {carriers.map((c) => (
                <tr key={c.carrier}>
                  <td>{c.carrier}</td>
                  <td>{c.count}</td>
                  <td>
                    {c.kpis.punctuality === null
                      ? "—"
                      : `${c.kpis.punctuality} %`}
                  </td>
                  <td>{c.kpis.wait === null ? "—" : `${c.kpis.wait} min`}</td>
                  <td>{c.kpis.noShows}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className={`${screenPanelClass} ${styles.panel}`}>
        <div>
          <p className={styles.eyebrow}>DESVIACIONES</p>
          <h2>Causas registradas</h2>
        </div>
        <ul className={styles.list}>
          {[...causes].map(([cause, count]) => (
            <li key={cause}>
              {cause} · {count}
            </li>
          ))}
        </ul>
        {!causes.size && <p>Sin causas registradas.</p>}
      </section>
    </main>
  );
}
