"use client";
import { useCallback, useEffect, useState } from "react";
import { dockMutation } from "@/lib/dock-client";
import { screenButton, screenPanelClass } from "../../components/ScreenChrome";
import styles from "../muelles/docks.module.css";
type Access = {
  id: string;
  carrier_party_id: string;
  expires_at: string;
  revoked_at: string | null;
};
export default function DockPortalAccessManager({
  warehouseId,
  carriers,
  disabled,
}: {
  warehouseId: string;
  carriers: { id: string; legal_name: string }[];
  disabled: boolean;
}) {
  const [items, setItems] = useState<Access[]>([]),
    [eligible, setEligible] = useState<string[]>([]),
    [carrier, setCarrier] = useState(""),
    [days, setDays] = useState(7),
    [message, setMessage] = useState(""),
    [issued, setIssued] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (disabled) return;
    try {
      const res = await fetch(
        `/api/docks/portal-access?warehouseId=${encodeURIComponent(warehouseId)}`,
        { cache: "no-store" },
      );
      const b = await res.json();
      if (!res.ok) throw new Error(b.error);
      setItems(b.items);
      setEligible(b.carrierIds);
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "No se pudieron cargar los accesos.",
      );
    }
  }, [warehouseId, disabled]);
  useEffect(() => {
    void load();
  }, [load]);
  const label = (id: string) =>
    carriers.find((c) => c.id === id)?.legal_name ?? "Transportista";
  return (
    <section className={`${screenPanelClass} ${styles.panel}`}>
      <div className={styles.panelHead}>
        <div>
          <p className={styles.eyebrow}>TRANSPORTISTAS</p>
          <h2>Accesos al portal</h2>
        </div>
      </div>
      <form
        className={styles.toolbar}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setMessage("");
          setIssued("");
          try {
            const r = await dockMutation("/api/docks/portal-access", {
              action: "CREATE",
              carrierId: carrier || eligible[0],
              warehouseId,
              expires: new Date(Date.now() + days * 86400000).toISOString(),
            });
            setIssued(`${location.origin}${r.path}`);
            await load();
          } catch (err) {
            setMessage(
              err instanceof Error ? err.message : "No se pudo crear.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className={styles.field}>
          Transportista
          <select
            value={carrier || eligible[0] || ""}
            onChange={(e) => setCarrier(e.target.value)}
            disabled={disabled || busy}
            required
          >
            {eligible.map((id) => (
              <option key={id} value={id}>
                {label(id)}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          Validez (días)
          <input
            type="number"
            min={1}
            max={30}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            disabled={disabled || busy}
            required
          />
        </label>
        <button
          type="submit"
          className={screenButton.primary}
          disabled={disabled || busy || !eligible.length}
        >
          Crear acceso
        </button>
      </form>
      {message && (
        <p role="alert" className={styles.notice}>
          {message}
        </p>
      )}
      {issued && (
        <label className={styles.field}>
          Enlace del transportista · cópialo ahora
          <input readOnly value={issued} onFocus={(e) => e.target.select()} />
          <button
            type="button"
            className={screenButton.secondary}
            onClick={() => setIssued("")}
          >
            Ocultar enlace
          </button>
        </label>
      )}
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Transportista</th>
              <th>Caduca</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <tr key={a.id}>
                <td>{label(a.carrier_party_id)}</td>
                <td>{new Date(a.expires_at).toLocaleString("es-ES")}</td>
                <td>
                  {a.revoked_at
                    ? "Revocado"
                    : Date.parse(a.expires_at) < Date.now()
                      ? "Caducado"
                      : "Activo"}
                </td>
                <td>
                  <button
                    type="button"
                    className={screenButton.secondary}
                    disabled={disabled || busy || !!a.revoked_at}
                    onClick={async () => {
                      setBusy(true);
                      setMessage("");
                      try {
                        await dockMutation("/api/docks/portal-access", {
                          action: "REVOKE",
                          id: a.id,
                        });
                        setIssued("");
                        await load();
                      } catch (err) {
                        setMessage(
                          err instanceof Error
                            ? err.message
                            : "No se pudo revocar.",
                        );
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Revocar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
