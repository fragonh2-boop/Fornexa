"use client";
import { useState, type FormEvent } from "react";
import {
  CARGO_PROFILES,
  DEFAULT_DOCK_POLICY,
  POLICY_FIELDS,
  type Dock,
  type DockRule,
} from "@/lib/docks";
import {
  closedOpeningHours,
  validateOpeningHours,
  validateHolidayExceptions,
  WEEK_DAYS,
  type OpeningHours,
} from "@/lib/operational-calendar";
import { dockMutation, useDockData } from "@/lib/dock-client";
import { screenButton, screenPanelClass } from "../../components/ScreenChrome";
import DockDialog from "../muelles/DockDialog";
import styles from "../muelles/docks.module.css";
const today = new Date().toISOString().slice(0, 10);
const from = `${today}T00:00:00Z`,
  until = `${today}T23:59:59Z`;
function rangesText(ranges: { from: string; to: string }[]) {
  return ranges.map((r) => `${r.from}-${r.to}`).join(",");
}
function rangesValue(text: string) {
  return text.trim()
    ? text.split(",").map((value) => {
        const [from, to] = value.trim().split("-");
        return { from, to };
      })
    : [];
}
function CalendarForm({
  warehouseId,
  openingValue,
  holidayValue,
  reload,
  disabled,
}: {
  warehouseId: string;
  openingValue: unknown;
  holidayValue: unknown;
  reload: () => Promise<void>;
  disabled: boolean;
}) {
  let initial = closedOpeningHours(),
    invalid = false;
  try {
    initial = validateOpeningHours(openingValue);
    validateHolidayExceptions(holidayValue);
  } catch {
    invalid = true;
  }
  const [opening, setOpening] = useState<OpeningHours>(initial),
    [holidays, setHolidays] = useState(() => {
      try {
        return validateHolidayExceptions(holidayValue).map((row) => ({
          date: row.date,
          closed: "closed" in row,
          ranges: "ranges" in row ? rangesText(row.ranges) : "",
          reason: row.reason ?? "",
        }));
      } catch {
        return [] as {
          date: string;
          closed: boolean;
          ranges: string;
          reason: string;
        }[];
      }
    }),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [days, setDays] = useState(
    Object.fromEntries(WEEK_DAYS.map((d) => [d, rangesText(initial.days[d])])),
  );
  const [peaks, setPeaks] = useState(
    Object.fromEntries(
      WEEK_DAYS.map((d) => [d, rangesText(initial.peak?.[d] ?? [])]),
    ),
  );
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      const hours = validateOpeningHours({
        ...opening,
        days: Object.fromEntries(
          WEEK_DAYS.map((d) => [d, rangesValue(days[d])]),
        ),
        peak: Object.fromEntries(
          WEEK_DAYS.map((d) => [d, rangesValue(peaks[d])]),
        ),
      });
      await dockMutation("/api/docks/config", {
        kind: "calendar",
        values: {
          warehouse_id: warehouseId,
          opening_hours: hours,
          holiday_exceptions: validateHolidayExceptions(
            holidays.map((row) => ({
              date: row.date,
              ...(row.closed
                ? { closed: true }
                : { ranges: rangesValue(row.ranges) }),
              ...(row.reason ? { reason: row.reason } : {}),
            })),
          ),
        },
      });
      await reload();
      setNotice("Horario guardado.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Horario no válido.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className={`${screenPanelClass} ${styles.form}`} onSubmit={save}>
      <div className={styles.panelHead}>
        <div>
          <p className={styles.eyebrow}>ALMACÉN</p>
          <h2>Horario de servicio</h2>
        </div>
      </div>
      {invalid && (
        <p role="alert" className={styles.notice}>
          El horario existente no cumple el contrato. Introduce las siete
          jornadas y guarda para corregirlo.
        </p>
      )}
      <label>
        Zona horaria
        <input
          value={opening.timezone}
          onChange={(e) => setOpening({ ...opening, timezone: e.target.value })}
          disabled={disabled}
        />
      </label>
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Día</th>
              <th>Abierto (HH:MM-HH:MM, …)</th>
              <th>Hora punta (opcional)</th>
            </tr>
          </thead>
          <tbody>
            {WEEK_DAYS.map((d, i) => (
              <tr key={d}>
                <td>
                  {
                    [
                      "Lunes",
                      "Martes",
                      "Miércoles",
                      "Jueves",
                      "Viernes",
                      "Sábado",
                      "Domingo",
                    ][i]
                  }
                </td>
                <td>
                  <input
                    aria-label={`Horario ${d}`}
                    value={days[d]}
                    onChange={(e) => setDays({ ...days, [d]: e.target.value })}
                    disabled={disabled}
                  />
                </td>
                <td>
                  <input
                    aria-label={`Punta ${d}`}
                    value={peaks[d]}
                    onChange={(e) =>
                      setPeaks({ ...peaks, [d]: e.target.value })
                    }
                    disabled={disabled}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <fieldset>
        <legend>Festivos y excepciones</legend>
        {holidays.map((row, index) => (
          <div className={styles.grid} key={index}>
            <label>
              Fecha
              <input
                type="date"
                value={row.date}
                required
                disabled={disabled}
                onChange={(e) =>
                  setHolidays(
                    holidays.map((h, i) =>
                      i === index ? { ...h, date: e.target.value } : h,
                    ),
                  )
                }
              />
            </label>
            <label>
              Cerrado
              <input
                type="checkbox"
                checked={row.closed}
                disabled={disabled}
                onChange={(e) =>
                  setHolidays(
                    holidays.map((h, i) =>
                      i === index ? { ...h, closed: e.target.checked } : h,
                    ),
                  )
                }
              />
            </label>
            {!row.closed && (
              <label>
                Horario especial
                <input
                  value={row.ranges}
                  placeholder="06:00-14:00"
                  disabled={disabled}
                  onChange={(e) =>
                    setHolidays(
                      holidays.map((h, i) =>
                        i === index ? { ...h, ranges: e.target.value } : h,
                      ),
                    )
                  }
                />
              </label>
            )}
            <label>
              Motivo
              <input
                value={row.reason}
                maxLength={200}
                disabled={disabled}
                onChange={(e) =>
                  setHolidays(
                    holidays.map((h, i) =>
                      i === index ? { ...h, reason: e.target.value } : h,
                    ),
                  )
                }
              />
            </label>
            <button
              type="button"
              className={screenButton.secondary}
              disabled={disabled}
              onClick={() =>
                setHolidays(holidays.filter((_, i) => i !== index))
              }
            >
              Quitar excepción
            </button>
          </div>
        ))}
        <button
          type="button"
          className={screenButton.secondary}
          disabled={disabled || holidays.length >= 366}
          onClick={() =>
            setHolidays([
              ...holidays,
              { date: "", closed: true, ranges: "", reason: "" },
            ])
          }
        >
          + Excepción
        </button>
      </fieldset>
      {notice && (
        <p role="status" className={styles.notice}>
          {notice}
        </p>
      )}
      <button
        type="submit"
        className={screenButton.primary}
        disabled={disabled || busy}
      >
        Guardar horario
      </button>
    </form>
  );
}
function PolicyForm({
  wid,
  initial,
  notifications,
  disabled,
  reload,
}: {
  wid: string;
  initial: typeof DEFAULT_DOCK_POLICY;
  notifications: Record<string, boolean>;
  disabled: boolean;
  reload: () => Promise<void>;
}) {
  const [parameters, setParameters] = useState(initial),
    [notices, setNotices] = useState(notifications),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      className={`${screenPanelClass} ${styles.form}`}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMessage("");
        try {
          await dockMutation("/api/docks/config", {
            kind: "policy",
            values: { warehouse_id: wid, parameters, notifications: notices },
          });
          await reload();
          setMessage("Política guardada.");
        } catch (error) {
          setMessage(
            error instanceof Error ? error.message : "No se pudo guardar.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className={styles.panelHead}>
        <div>
          <p className={styles.eyebrow}>VENTANA DE RESERVA</p>
          <h2>Parámetros y notificaciones</h2>
        </div>
      </div>
      <div className={styles.grid}>
        {Object.entries(POLICY_FIELDS).map(([key, spec]) => (
          <label key={key}>
            {spec[0]}
            {typeof spec[1] === "boolean" ? (
              <input
                type="checkbox"
                checked={parameters[key as keyof typeof parameters] as boolean}
                onChange={(e) =>
                  setParameters({ ...parameters, [key]: e.target.checked })
                }
                disabled={disabled}
              />
            ) : (
              <input
                type="number"
                min={spec[2]}
                max={spec[3]}
                step={key === "compensation_hour_eur" ? "0.01" : "1"}
                value={parameters[key as keyof typeof parameters] as number}
                onChange={(e) =>
                  setParameters({
                    ...parameters,
                    [key]: Number(e.target.value),
                  })
                }
                disabled={disabled}
              />
            )}
          </label>
        ))}
      </div>
      <fieldset>
        <legend>Notificaciones</legend>
        <div className={styles.grid}>
          {["confirmation", "reminder", "late", "release"].map((key, i) => (
            <label key={key}>
              {["Confirmación", "Recordatorio", "Retraso", "Liberación"][i]}
              <input
                type="checkbox"
                checked={notices[key] ?? false}
                onChange={(e) =>
                  setNotices({ ...notices, [key]: e.target.checked })
                }
                disabled={disabled}
              />
            </label>
          ))}
        </div>
      </fieldset>
      {message && (
        <p role="status" className={styles.notice}>
          {message}
        </p>
      )}
      <button
        type="submit"
        className={screenButton.primary}
        disabled={disabled || busy}
      >
        Guardar parámetros
      </button>
    </form>
  );
}
export default function DockConfigWorkspace() {
  const { data, error, load } = useDockData(from, until),
    [warehouse, setWarehouse] = useState(""),
    [editor, setEditor] = useState<{
      kind: "dock" | "rule";
      id?: string;
      values: Record<string, unknown>;
    } | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const wid = warehouse || data.warehouses[0]?.id || "",
    profile = data.profiles.find(
      (p) =>
        p.address_id === data.warehouses.find((w) => w.id === wid)?.address_id,
    ),
    policy = data.policies.find((p) => p.warehouse_id === wid);
  const disabled = !data.canConfigure || !wid;
  const openDock = (row?: Dock) => {
    setMessage("");
    setEditor({
      kind: "dock",
      id: row?.id,
      values: row
        ? Object.fromEntries(
            Object.entries(row).filter(
              ([k]) =>
                !["id", "tenant_id", "created_at", "updated_at"].includes(k),
            ),
          )
        : {
            warehouse_id: wid,
            zone_id: null,
            code: "",
            name: "",
            status: "ACTIVE",
            max_weight_t: null,
            max_vehicle_length_m: null,
            is_leveler: false,
            has_scale: false,
            has_pit: false,
            has_spill_basin: false,
            temperature_regime: "AMBIENT",
            cargo_profiles: ["DRY_PALLETIZED"],
            default_operation_minutes: 60,
            buffer_minutes: 10,
            sort_order: 0,
            is_active: true,
          },
    });
  };
  const openRule = (row?: DockRule) => {
    setMessage("");
    setEditor({
      kind: "rule",
      id: row?.id,
      values: row
        ? Object.fromEntries(
            Object.entries(row).filter(
              ([k]) =>
                !["id", "tenant_id", "created_at", "updated_at"].includes(k),
            ),
          )
        : {
            warehouse_id: wid,
            code: "",
            direction: "BOTH",
            cargo_profile: "DRY_PALLETIZED",
            default_duration_minutes: 60,
            min_duration_minutes: 30,
            max_duration_minutes: 240,
            max_appointments_per_slot: 1,
            requires_driver_checkin: true,
            is_active: true,
          },
    });
  };
  return (
    <div className={styles.page}>
      {error && (
        <p role="alert" className={styles.notice}>
          {error}
        </p>
      )}
      <label className={styles.field}>
        Almacén
        <select value={wid} onChange={(e) => setWarehouse(e.target.value)}>
          {data.warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.code} · {w.name}
            </option>
          ))}
        </select>
      </label>
      {!wid && <p>No hay almacenes disponibles.</p>}
      {wid && (
        <>
          <CalendarForm
            key={`calendar-${wid}`}
            warehouseId={wid}
            openingValue={profile?.opening_hours}
            holidayValue={profile?.holiday_exceptions}
            disabled={disabled}
            reload={load}
          />
          <PolicyForm
            key={`policy-${wid}`}
            wid={wid}
            initial={policy?.parameters ?? DEFAULT_DOCK_POLICY}
            notifications={
              policy?.notifications ?? {
                confirmation: true,
                reminder: true,
                late: true,
                release: true,
              }
            }
            disabled={disabled}
            reload={load}
          />
          <section className={`${screenPanelClass} ${styles.panel}`}>
            <div className={styles.panelHead}>
              <div>
                <p className={styles.eyebrow}>COMPATIBILIDAD</p>
                <h2>Muelles</h2>
              </div>
              <button
                type="button"
                className={screenButton.secondary}
                disabled={disabled}
                onClick={() => openDock()}
              >
                + Nuevo muelle
              </button>
            </div>
            <div className={styles.scroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Muelle</th>
                    <th>Zona / régimen</th>
                    <th>Compatibilidad</th>
                    <th>Límites</th>
                    <th>Duración / buffer</th>
                    <th>Estado</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.docks
                    .filter((d) => d.warehouse_id === wid)
                    .map((d) => (
                      <tr key={d.id}>
                        <td>
                          {d.code} · {d.name}
                        </td>
                        <td>
                          {data.zones.find((z) => z.id === d.zone_id)
                            ?.zone_name ?? "—"}
                          <small>{d.temperature_regime}</small>
                        </td>
                        <td>{d.cargo_profiles.join(" · ")}</td>
                        <td>
                          {d.max_weight_t ?? "—"} t /{" "}
                          {d.max_vehicle_length_m ?? "—"} m
                        </td>
                        <td>
                          {d.default_operation_minutes} / {d.buffer_minutes} min
                        </td>
                        <td>{d.status}</td>
                        <td>
                          <button
                            type="button"
                            className={screenButton.secondary}
                            disabled={disabled}
                            onClick={() => openDock(d)}
                          >
                            Editar
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className={`${screenPanelClass} ${styles.panel}`}>
            <div className={styles.panelHead}>
              <div>
                <p className={styles.eyebrow}>MOTOR</p>
                <h2>Reglas de cita</h2>
              </div>
              <button
                type="button"
                className={screenButton.secondary}
                disabled={disabled}
                onClick={() => openRule()}
              >
                + Nueva regla
              </button>
            </div>
            <div className={styles.scroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Regla</th>
                    <th>Dirección / carga</th>
                    <th>Duración</th>
                    <th>Capacidad</th>
                    <th>Check-in</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.rules
                    .filter((r) => r.warehouse_id === wid)
                    .map((r) => (
                      <tr key={r.id}>
                        <td>{r.code}</td>
                        <td>
                          {r.direction} · {r.cargo_profile}
                        </td>
                        <td>
                          {r.default_duration_minutes} min (
                          {r.min_duration_minutes}–{r.max_duration_minutes})
                        </td>
                        <td>{r.max_appointments_per_slot}</td>
                        <td>
                          {r.requires_driver_checkin
                            ? "Obligatorio"
                            : "Opcional"}
                        </td>
                        <td>
                          <button
                            type="button"
                            className={screenButton.secondary}
                            disabled={disabled}
                            onClick={() => openRule(r)}
                          >
                            Editar
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
      {editor && (
        <DockDialog
          locked={busy}
          title={editor.kind === "dock" ? "Muelle" : "Regla de cita"}
          onClose={() => {
            if (!busy) setEditor(null);
          }}
        >
          <form
            className={styles.form}
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setMessage("");
              try {
                await dockMutation("/api/docks/config", editor);
                await load();
                setEditor(null);
              } catch (err) {
                setMessage(
                  err instanceof Error ? err.message : "No se pudo guardar.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className={styles.grid}>
              {Object.entries(editor.values)
                .filter(
                  ([k]) => !["warehouse_id", "cargo_profiles"].includes(k),
                )
                .map(([key, value]) => {
                  const patch = (v: unknown) =>
                    setEditor({
                      ...editor,
                      values: { ...editor.values, [key]: v },
                    });
                  const options: Record<string, string[]> = {
                    status: ["ACTIVE", "MAINTENANCE", "OUT_OF_SERVICE"],
                    temperature_regime: [
                      "AMBIENT",
                      "CHILLED",
                      "FROZEN",
                      "CONTROLLED",
                    ],
                    direction: [
                      "BOTH",
                      "INBOUND",
                      "OUTBOUND",
                      "INTERNAL",
                      "RETURN",
                      "TRANSFER",
                    ],
                    cargo_profile: [...CARGO_PROFILES],
                  };
                  return (
                    <label key={key}>
                      {(
                        {
                          code: "Código",
                          name: "Nombre",
                          status: "Estado",
                          zone_id: "Zona",
                          temperature_regime: "Temperatura",
                          direction: "Dirección",
                          cargo_profile: "Tipo de carga",
                          is_active: "Activo",
                          buffer_minutes: "Buffer (min)",
                          default_operation_minutes: "Duración (min)",
                          max_weight_t: "Peso máximo (t)",
                          max_vehicle_length_m: "Longitud máxima (m)",
                          is_leveler: "Niveladora",
                          has_scale: "Báscula",
                          has_pit: "Fosa",
                          has_spill_basin: "Cubeto",
                          sort_order: "Orden",
                          default_duration_minutes: "Duración estándar",
                          min_duration_minutes: "Duración mínima",
                          max_duration_minutes: "Duración máxima",
                          max_appointments_per_slot: "Máximo por franja",
                          requires_driver_checkin: "Check-in obligatorio",
                        } as Record<string, string>
                      )[key] ?? key}
                      {key === "zone_id" ? (
                        <select
                          value={String(value ?? "")}
                          onChange={(e) => patch(e.target.value || null)}
                        >
                          <option value="">Sin zona</option>
                          {data.zones
                            .filter((z) => z.warehouse_id === wid)
                            .map((z) => (
                              <option key={z.id} value={z.id}>
                                {z.zone_name}
                              </option>
                            ))}
                        </select>
                      ) : options[key] ? (
                        <select
                          value={String(value)}
                          onChange={(e) => patch(e.target.value)}
                        >
                          {options[key].map((o) => (
                            <option key={o}>{o}</option>
                          ))}
                        </select>
                      ) : typeof value === "boolean" ? (
                        <input
                          type="checkbox"
                          checked={value}
                          onChange={(e) => patch(e.target.checked)}
                        />
                      ) : (
                        <input
                          type={
                            typeof value === "number" || key.startsWith("max_")
                              ? "number"
                              : "text"
                          }
                          value={String(value ?? "")}
                          onChange={(e) =>
                            patch(
                              typeof value === "number" ||
                                key.startsWith("max_")
                                ? e.target.value === ""
                                  ? null
                                  : Number(e.target.value)
                                : e.target.value,
                            )
                          }
                          step="any"
                          required={
                            !["max_weight_t", "max_vehicle_length_m"].includes(
                              key,
                            )
                          }
                        />
                      )}
                    </label>
                  );
                })}
            </div>
            {editor.kind === "dock" && (
              <fieldset>
                <legend>Compatibilidad de carga</legend>
                <div className={styles.grid}>
                  {CARGO_PROFILES.map((c) => (
                    <label key={c}>
                      {c}
                      <input
                        type="checkbox"
                        checked={(
                          editor.values.cargo_profiles as string[]
                        ).includes(c)}
                        onChange={(e) => {
                          const old = editor.values.cargo_profiles as string[];
                          setEditor({
                            ...editor,
                            values: {
                              ...editor.values,
                              cargo_profiles: e.target.checked
                                ? [...old, c]
                                : old.filter((x) => x !== c),
                            },
                          });
                        }}
                      />
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            {message && (
              <p role="alert" className={styles.notice}>
                {message}
              </p>
            )}
            <button
              type="submit"
              className={screenButton.primary}
              disabled={busy}
            >
              Guardar
            </button>
          </form>
        </DockDialog>
      )}
    </div>
  );
}
