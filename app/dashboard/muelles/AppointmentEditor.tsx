"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  availableDocks,
  DIRECTIONS,
  type Appointment,
  type DockData,
} from "@/lib/docks";
import {
  calendarParts,
  isWithinOpeningHours,
  validateOpeningHours,
  validateHolidayExceptions,
  zonedInstant,
} from "@/lib/operational-calendar";
import { dockMutation } from "@/lib/dock-client";
import { screenButton } from "../../components/ScreenChrome";
import DockDialog from "./DockDialog";
import styles from "./docks.module.css";
export default function AppointmentEditor({
  data,
  warehouseId,
  date,
  appointment,
  slot,
  onClose,
  onSaved,
}: {
  data: DockData;
  warehouseId: string;
  date: string;
  appointment: Appointment | null;
  slot: { dock: string; start: string } | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [current, setCurrent] = useState(appointment),
    [wid, setWid] = useState(appointment?.warehouse_id ?? warehouseId),
    [rid, setRid] = useState(
      appointment?.rule_id ??
        data.rules.find((r) => r.warehouse_id === warehouseId && r.is_active)
          ?.id ??
        "",
    ),
    [dock, setDock] = useState(appointment?.dock_id ?? slot?.dock ?? ""),
    [stop, setStop] = useState(appointment?.trip_stop_id ?? ""),
    [order, setOrder] = useState(appointment?.order_id ?? ""),
    [expedition, setExpedition] = useState(appointment?.expedition_id ?? ""),
    [day, setDay] = useState(
      appointment
        ? calendarParts(new Date(appointment.planned_start), "Europe/Madrid")
            .date
        : date,
    ),
    [time, setTime] = useState(
      appointment
        ? calendarParts(new Date(appointment.planned_start), "Europe/Madrid")
            .time
        : slot
          ? calendarParts(new Date(slot.start), "Europe/Madrid").time
          : "08:00",
    ),
    [direction, setDirection] = useState(appointment?.direction ?? "INBOUND"),
    [kind, setKind] = useState(appointment?.booking_kind ?? "FIRM"),
    [priority, setPriority] = useState(appointment?.priority ?? "NORMAL"),
    [status, setStatus] = useState(appointment?.status ?? "CONFIRMED"),
    [notes, setNotes] = useState(String(appointment?.metadata.notes ?? "")),
    [override, setOverride] = useState(false),
    [reason, setReason] = useState(""),
    [message, setMessage] = useState(""),
    [saving, setSaving] = useState(false);
  const form = useRef<HTMLFormElement>(null),
    keep = useRef(false),
    mutex = useRef(false);
  const rule = data.rules.find((r) => r.id === rid),
    profile = data.profiles.find(
      (p) =>
        p.address_id === data.warehouses.find((w) => w.id === wid)?.address_id,
    );
  let start = "",
    end = "",
    validation = "";
  try {
    const opening = validateOpeningHours(profile?.opening_hours),
      holidays = validateHolidayExceptions(profile?.holiday_exceptions);
    start = zonedInstant(day, time, opening.timezone);
    end = new Date(
      Date.parse(start) +
        (current?.status === "CHECKED_IN"
          ? (Date.parse(current.planned_end) -
              Date.parse(current.planned_start)) /
            60000
          : (rule?.default_duration_minutes ?? 60)) *
          60000,
    ).toISOString();
    if (!rule) validation = "Selecciona una regla activa.";
    else if (!isWithinOpeningHours(start, end, opening, holidays) && !override)
      validation = "La ventana está fuera del horario de servicio.";
    else if (
      dock &&
      !availableDocks(
        data.docks.filter((d) => d.warehouse_id === wid),
        data.appointments,
        start,
        end,
        current?.id,
        rule.cargo_profile,
      ).some((d) => d.id === dock)
    )
      validation =
        "El muelle no es compatible o hay un conflicto de ventana y buffer.";
  } catch {
    validation = "Configura un horario canónico para el almacén.";
  }
  const free =
    start && end
      ? availableDocks(
          data.docks.filter((d) => d.warehouse_id === wid),
          data.appointments,
          start,
          end,
          current?.id,
          rule?.cargo_profile,
        )
      : [];
  const trip = data.trips.find(
    (t) => t.id === data.stops.find((s) => s.id === stop)?.trip_id,
  );
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.key === "F4" || e.key === "F2") && !saving) {
        e.preventDefault();
        keep.current = e.key === "F4";
        form.current?.requestSubmit();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [saving]);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (mutex.current || validation || !start || !end) return;
    mutex.current = true;
    setSaving(true);
    setMessage("");
    try {
      const body = {
        ...(current ? { id: current.id, expected: current.updated_at } : {}),
        ...(override ? { reason } : {}),
        values: {
          warehouse_id: wid,
          dock_id: kind === "FIRM" ? dock || null : null,
          trip_stop_id: stop || null,
          order_id: order || null,
          expedition_id: expedition || null,
          rule_id: rid,
          direction,
          planned_start: start,
          planned_end: end,
          requested_start: current?.requested_start ?? null,
          requested_end: current?.requested_end ?? null,
          status,
          booking_kind: kind,
          priority,
          metadata: { notes, holiday_override: override },
        },
      };
      const result = await dockMutation("/api/docks", body);
      setCurrent(result.item);
      await onSaved();
      if (keep.current) setMessage("Guardada.");
      else onClose();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
      mutex.current = false;
    }
  };
  return (
    <DockDialog
      locked={saving}
      title={current ? `Cita ${current.code}` : "Nueva cita"}
      onClose={() => {
        if (!saving) onClose();
      }}
    >
      <form ref={form} onSubmit={save}>
        <div className={styles.form}>
          <fieldset>
            <legend>Operación y ventana</legend>
            <div className={styles.grid}>
              <label>
                Almacén
                <select
                  autoFocus
                  value={wid}
                  onChange={(e) => {
                    setWid(e.target.value);
                    setDock("");
                    setStop("");
                    setRid(
                      data.rules.find(
                        (r) => r.warehouse_id === e.target.value && r.is_active,
                      )?.id ?? "",
                    );
                  }}
                  required
                >
                  {data.warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.code} · {w.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Dirección
                <select
                  value={direction}
                  onChange={(e) => setDirection(e.target.value)}
                >
                  {DIRECTIONS.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </label>
              <label>
                Regla
                <select
                  value={rid}
                  onChange={(e) => setRid(e.target.value)}
                  required
                >
                  <option value="">Seleccionar</option>
                  {data.rules
                    .filter((r) => r.warehouse_id === wid && r.is_active)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.code} · {r.default_duration_minutes} min ·{" "}
                        {r.cargo_profile}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Fecha
                <input
                  type="date"
                  value={day}
                  onChange={(e) => setDay(e.target.value)}
                  required
                />
              </label>
              <label>
                Inicio
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  required
                />
              </label>
              <label>
                Fin (regla)
                <input
                  readOnly
                  value={
                    end
                      ? calendarParts(
                          new Date(end),
                          validateOpeningHours(profile?.opening_hours).timezone,
                        ).time
                      : ""
                  }
                />
              </label>
              <label>
                Reserva
                <select
                  value={kind}
                  onChange={(e) => {
                    setKind(e.target.value);
                    if (e.target.value !== "FIRM") setDock("");
                  }}
                >
                  <option>FIRM</option>
                  <option>PROVISIONAL</option>
                  <option>WAITLIST</option>
                </select>
              </label>
              <label>
                Muelle
                <select
                  value={dock}
                  onChange={(e) => setDock(e.target.value)}
                  disabled={kind !== "FIRM"}
                >
                  <option value="">Sin asignar</option>
                  {data.docks
                    .filter((d) => d.warehouse_id === wid)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.code}
                        {free.some((f) => f.id === d.id)
                          ? " · libre"
                          : " · conflicto"}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Estado
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  disabled={current?.status === "CHECKED_IN"}
                >
                  {current?.status === "CHECKED_IN" && (
                    <option value="CHECKED_IN">En patio</option>
                  )}
                  <option value="DRAFT">Borrador</option>
                  <option value="CONFIRMED">Confirmada</option>
                </select>
              </label>
              <label>
                Prioridad
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                >
                  {["LOW", "NORMAL", "HIGH", "URGENT"].map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
            </div>
            {validation && (
              <p role="alert" className={styles.notice}>
                {validation}
              </p>
            )}
          </fieldset>
          <fieldset>
            <legend>Transporte enlazado</legend>
            <div className={styles.grid}>
              <label>
                Parada
                <select value={stop} onChange={(e) => setStop(e.target.value)}>
                  <option value="">Sin viaje todavía</option>
                  {data.stops.map((s) => (
                    <option key={s.id} value={s.id}>
                      {data.trips.find((t) => t.id === s.trip_id)?.code} ·{" "}
                      {s.sequence} · {s.full_address}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Matrícula
                <input
                  readOnly
                  value={
                    data.vehicles.find((v) => v.id === trip?.vehicle_id)
                      ?.registration ?? "—"
                  }
                />
              </label>
              <label>
                Remolque
                <input readOnly value={trip?.trailer_registration ?? "—"} />
              </label>
              <label>
                Conductor
                <input
                  readOnly
                  value={
                    data.drivers.find((d) => d.id === trip?.driver_id)?.name ??
                    "—"
                  }
                />
              </label>
            </div>
          </fieldset>
          <fieldset>
            <legend>Referencias</legend>
            <div className={styles.grid}>
              <label>
                Pedido
                <select
                  value={order}
                  onChange={(e) => setOrder(e.target.value)}
                >
                  <option value="">Sin pedido</option>
                  {data.orders.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.code}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Expedición
                <select
                  value={expedition}
                  onChange={(e) => setExpedition(e.target.value)}
                >
                  <option value="">Sin expedición</option>
                  {data.expeditions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.code}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Observaciones
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={500}
              />
            </label>
            <label>
              <span>
                <input
                  type="checkbox"
                  checked={override}
                  onChange={(e) => setOverride(e.target.checked)}
                />{" "}
                Solicitar excepción de horario
              </span>
            </label>
            {override && (
              <label>
                Motivo (administrador)
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={500}
                  required
                />
              </label>
            )}
          </fieldset>
          {message && (
            <p role="status" className={styles.notice}>
              {message}
            </p>
          )}
        </div>
        <div className={styles.footer}>
          <span>F4 Guardar y mantener · F2 Guardar y salir</span>
          <div className={styles.toolbar}>
            <button
              type="button"
              className={screenButton.secondary}
              disabled={saving}
              onClick={onClose}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className={screenButton.secondary}
              disabled={saving || !!validation || data.truncated}
              onClick={() => {
                keep.current = true;
              }}
            >
              Guardar y mantener
            </button>
            <button
              type="submit"
              className={screenButton.primary}
              disabled={saving || !!validation || data.truncated}
              onClick={() => {
                keep.current = false;
              }}
            >
              {saving ? "Guardando…" : "Guardar y salir"}
            </button>
          </div>
        </div>
      </form>
    </DockDialog>
  );
}
