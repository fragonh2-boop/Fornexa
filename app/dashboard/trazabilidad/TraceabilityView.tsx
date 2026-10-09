"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { DashboardBasePath } from "../../components/DashboardNavigation";
import { MetricGrid, ScreenHeader, screenButton, screenPanelClass } from "../../components/ScreenChrome";
import { TRACE_DOMAINS, TRACE_LIMIT, countByDomain, formatTraceDate, hasValidGtinCheckDigit, isGtinLike, type TraceDomain, type TraceResult } from "@/lib/traceability";
import styles from "./trazabilidad.module.css";

const DOMAIN_TONE: Record<TraceDomain, string> = {
  Partida: styles.toneOrder,
  Expediente: styles.toneOrder,
  Viaje: styles.toneTrip,
  Carga: styles.toneTrip,
  Descarga: styles.toneTrip,
  Documento: styles.toneDocument,
  Aduana: styles.toneCustoms,
  Almacén: styles.toneWarehouse,
  Registro: styles.toneRecord,
};

const EXAMPLES = ["EAN / GTIN", "SKU", "Nombre del artículo", "Lote", "Nº de serie"];

export default function TraceabilityView({ result, basePath = "/dashboard", simulation = false }: { result: TraceResult; basePath?: DashboardBasePath; simulation?: boolean }) {
  const [domain, setDomain] = useState<TraceDomain | "Todos">("Todos");
  const counts = useMemo(() => countByDomain(result.events), [result.events]);
  const visibleEvents = domain === "Todos" ? result.events : result.events.filter(event => event.domain === domain);
  const href = (path?: string) => (path ? `${basePath}${path}` : undefined);
  const prefetch = simulation ? false : undefined;
  const gtinWarning = isGtinLike(result.query) && !hasValidGtinCheckDigit(result.query);
  const action = `${basePath}/trazabilidad`;

  return <div className={styles.page}>
    <ScreenHeader eyebrow="TRAZABILIDAD" title="Trazabilidad">
      {result.status === "found" && <Link href={action} prefetch={prefetch} className={screenButton.secondary}>Nueva búsqueda</Link>}
    </ScreenHeader>

    <form className={`${screenPanelClass} ${styles.search}`} action={action} method="get" role="search">
      <label htmlFor="trace-query">¿Qué artículo quieres rastrear?</label>
      <div className={styles.searchRow}>
        <input id="trace-query" name="q" defaultValue={result.query} autoFocus={result.status === "empty"} autoComplete="off" enterKeyHint="search" inputMode="search" maxLength={120} placeholder="Escanea o escribe un EAN, SKU, nombre, lote o número de serie" />
        <button type="submit" className={screenButton.primary}>Rastrear</button>
      </div>
      <p className={styles.hint}>Acepta {EXAMPLES.join(" · ")}. Se busca solo dentro de tu empresa.</p>
      {gtinWarning && <p className={styles.warning} role="status">El dígito de control de este código no es válido: revisa si se tecleó mal. Se busca igualmente tal cual.</p>}
    </form>

    {result.status === "empty" && <section className={`${screenPanelClass} ${styles.intro}`}>
      <h2>Del código al recorrido completo</h2>
      <ol>
        <li><strong>Identifica</strong> el artículo con el código que tengas a mano.</li>
        <li><strong>Sigue</strong> sus partidas, expedientes y los viajes que lo cargaron y descargaron.</li>
        <li><strong>Comprueba</strong> despachos de aduana, movimientos de almacén y quién intervino en cada paso.</li>
      </ol>
    </section>}

    {result.status === "error" && <p className={styles.error} role="alert">No se ha podido completar la búsqueda. Inténtalo de nuevo en unos minutos.</p>}

    {result.status === "none" && <section className={`${screenPanelClass} ${styles.empty}`} role="status">
      <h2>Sin resultados para «{result.query}»</h2>
      <p>No hay ningún artículo, línea de partida, lote ni número de serie con ese código en tu empresa. Comprueba el código o busca por parte del nombre.</p>
      <Link href={`${basePath}/articulos`} prefetch={prefetch}>Abrir el maestro de artículos</Link>
    </section>}

    {result.status === "choose" && <section className={screenPanelClass} aria-labelledby="trace-matches">
      <div className={styles.panelHead}><div><p className={styles.eyebrow}>{result.matches.length} COINCIDENCIAS · {result.matchedBy}</p><h2 id="trace-matches">Elige el artículo</h2></div></div>
      <div className={styles.tableWrap}><table>
        <thead><tr><th>SKU</th><th>Artículo</th><th>EAN / GTIN</th><th>Cliente propietario</th><th>Estado</th><th><span className={styles.srOnly}>Acción</span></th></tr></thead>
        <tbody>{result.matches.map(item => <tr key={item.id}>
          <td><strong>{item.sku}</strong></td><td>{item.name}</td><td>{item.gtin || "—"}</td><td>{item.owner}</td><td>{item.status}</td>
          <td><Link className={styles.rowAction} prefetch={prefetch} href={`${action}?q=${encodeURIComponent(result.query)}&p=${encodeURIComponent(item.id)}`}>Rastrear</Link></td>
        </tr>)}</tbody>
      </table></div>
    </section>}

    {result.status === "found" && <>
      <section className={`${screenPanelClass} ${styles.identity}`} aria-label="Artículo rastreado">
        {result.product ? <>
          <div><p className={styles.eyebrow}>ARTÍCULO · {result.matchedBy}</p><h2>{result.product.sku} · {result.product.name}</h2></div>
          <dl>
            <div><dt>EAN / GTIN</dt><dd>{result.product.gtin || "—"}</dd></div>
            <div><dt>Cliente propietario</dt><dd>{result.product.owner}</dd></div>
            <div><dt>Unidad</dt><dd>{result.product.uom}</dd></div>
            <div><dt>Estado</dt><dd>{result.product.status}</dd></div>
          </dl>
        </> : <div><p className={styles.eyebrow}>{result.matchedBy}</p><h2>{result.query}</h2><p className={styles.note}>Código presente en líneas de partida pero no vinculado a un artículo del maestro.</p></div>}
      </section>

      <MetricGrid label="Resumen de trazabilidad" prefetch={prefetch} items={[
        { label: "Partidas", value: result.orders.length, href: "#trazabilidad-partidas" },
        { label: "Viajes", value: result.trips.length, detail: `${counts.Carga} ${counts.Carga === 1 ? "carga" : "cargas"} · ${counts.Descarga} ${counts.Descarga === 1 ? "descarga" : "descargas"}`, href: "#trazabilidad-viajes" },
        { label: "Aduanas", value: result.customs.length, href: "#trazabilidad-aduanas" },
        { label: "Movimientos de almacén", value: result.movements.length, href: "#trazabilidad-almacen" },
        { label: "Personas", value: result.people.length, href: "#trazabilidad-personas" },
      ]} />

      {result.truncated && <p className={styles.warning} role="status">Hay más registros de los que se muestran: se presentan los {TRACE_LIMIT} más recientes de cada tipo.</p>}

      <section className={screenPanelClass} aria-labelledby="trace-timeline">
        <div className={styles.panelHead}><div><p className={styles.eyebrow}>QUÉ · DÓNDE · CUÁNDO · QUIÉN</p><h2 id="trace-timeline">Recorrido del artículo</h2></div><span>{visibleEvents.length} eventos</span></div>
        <div className={styles.filters} role="group" aria-label="Filtrar el recorrido">
          {(["Todos", ...TRACE_DOMAINS] as const).filter(item => item === "Todos" || counts[item] > 0).map(item => <button key={item} type="button" aria-pressed={domain === item} className={domain === item ? styles.filterActive : styles.filter} onClick={() => setDomain(item)}>{item}{item !== "Todos" && <span>{counts[item]}</span>}</button>)}
        </div>
        {visibleEvents.length ? <ol className={styles.timeline}>
          {visibleEvents.map(event => <li key={event.id}>
            <span className={`${styles.badge} ${DOMAIN_TONE[event.domain]}`}>{event.domain}</span>
            <div className={styles.eventBody}>
              <p className={styles.eventTitle}>{event.label}{event.reference && <> · {event.href ? <Link href={href(event.href)!} prefetch={prefetch}>{event.reference}</Link> : <strong>{event.reference}</strong>}</>}</p>
              {(event.place || event.detail) && <p className={styles.eventMeta}>{[event.place, event.detail].filter(Boolean).join(" · ")}</p>}
              {event.actor && <p className={styles.eventActor}>Por {event.actor}</p>}
            </div>
            <time dateTime={event.at ?? undefined}>{formatTraceDate(event.at)}</time>
          </li>)}
        </ol> : <p className={styles.muted}>Todavía no hay eventos registrados para este artículo.</p>}
      </section>

      <div className={styles.grid}>
        <section id="trazabilidad-viajes" className={screenPanelClass} aria-labelledby="trace-trips">
          <div className={styles.panelHead}><div><p className={styles.eyebrow}>TRANSPORTE</p><h2 id="trace-trips">Viajes, cargas y descargas</h2></div></div>
          {result.trips.length ? <div className={styles.tableWrap}><table>
            <thead><tr><th>Viaje</th><th>Vehículo</th><th>Conductor</th><th>Carga</th><th>Descarga</th><th>Estado</th></tr></thead>
            <tbody>{result.trips.map(trip => <tr key={trip.code}>
              <td>{trip.href ? <Link href={href(trip.href)!} prefetch={prefetch}><strong>{trip.code}</strong></Link> : <strong>{trip.code}</strong>}<small>{trip.expeditions.join(" · ")}</small></td>
              <td>{trip.vehicle}</td><td>{trip.driver}</td>
              <td>{formatTraceDate(trip.loadedAt)}<small>{trip.loadPlace}</small></td>
              <td>{formatTraceDate(trip.unloadedAt)}<small>{trip.unloadPlace}</small></td>
              <td>{trip.status}</td>
            </tr>)}</tbody>
          </table></div> : <p className={styles.muted}>No consta en ningún viaje.</p>}
        </section>

        <section id="trazabilidad-partidas" className={screenPanelClass} aria-labelledby="trace-orders">
          <div className={styles.panelHead}><div><p className={styles.eyebrow}>PEDIDOS</p><h2 id="trace-orders">Partidas y documentos</h2></div></div>
          {result.orders.length ? <ul className={styles.list}>{result.orders.map(order => <li key={order.code}><strong>{order.code}</strong><span>{order.customer}{order.reference ? ` · Ref. ${order.reference}` : ""}</span><small>{order.status} · {formatTraceDate(order.createdAt)}</small></li>)}</ul> : <p className={styles.muted}>No figura en ninguna partida.</p>}
          {!!result.documents.length && <ul className={styles.list}>{result.documents.map(doc => <li key={doc.number}>{doc.href ? <Link href={href(doc.href)!} prefetch={prefetch}><strong>{doc.number}</strong></Link> : <strong>{doc.number}</strong>}<span>CMR · {doc.status}</span><small>{formatTraceDate(doc.issuedAt)}</small></li>)}</ul>}
        </section>

        <section id="trazabilidad-aduanas" className={screenPanelClass} aria-labelledby="trace-customs">
          <div className={styles.panelHead}><div><p className={styles.eyebrow}>ADUANAS</p><h2 id="trace-customs">Despachos aduaneros</h2></div></div>
          {result.customs.length ? <ul className={styles.list}>{result.customs.map(item => <li key={item.reference}>{item.href ? <Link href={href(item.href)!} prefetch={prefetch}><strong>{item.mrn !== "—" ? item.mrn : item.reference}</strong></Link> : <strong>{item.mrn}</strong>}<span>{item.direction} · {item.system} · {item.status}</span><small>Vinculado por {item.linkedBy.toLowerCase()} · {formatTraceDate(item.updatedAt)}</small></li>)}</ul> : <p className={styles.muted}>Sin despachos vinculados. Solo se muestran expedientes cuya referencia o MRN coincide con una partida, expediente, viaje, CMR, SKU o EAN del artículo.</p>}
        </section>

        <section id="trazabilidad-personas" className={screenPanelClass} aria-labelledby="trace-people">
          <div className={styles.panelHead}><div><p className={styles.eyebrow}>QUIÉN</p><h2 id="trace-people">Personas que intervinieron</h2></div></div>
          {result.people.length ? <ul className={styles.list}>{result.people.map(person => <li key={person.name}><strong>{person.name}</strong><span>{person.actions.join(" · ")}</span><small>{person.count} {person.count === 1 ? "acción" : "acciones"} · última {formatTraceDate(person.lastAt)}</small></li>)}</ul> : <p className={styles.muted}>Ningún registro identifica todavía a un usuario.</p>}
        </section>
      </div>

      <section id="trazabilidad-almacen" className={screenPanelClass} aria-labelledby="trace-warehouse">
        <div className={styles.panelHead}><div><p className={styles.eyebrow}>ALMACÉN</p><h2 id="trace-warehouse">Movimientos y stock</h2></div><span>{result.stock.length ? `${result.stock.length} ubicaciones con stock` : "Sin stock actual"}</span></div>
        {result.movements.length ? <div className={styles.tableWrap}><table>
          <thead><tr><th>Fecha</th><th>Movimiento</th><th>Almacén</th><th>Origen → destino</th><th>Cantidad</th><th>Lote / serie</th><th>Operario</th></tr></thead>
          <tbody>{result.movements.map(item => <tr key={item.number}><td>{formatTraceDate(item.at)}</td><td><strong>{item.type}</strong><small>{item.number} · {item.status}</small></td><td>{item.warehouse}</td><td>{item.from} → {item.to}</td><td>{item.quantity}</td><td>{item.batch}<small>{item.serial}</small></td><td>{item.operator}</td></tr>)}</tbody>
        </table></div> : <p className={styles.muted}>Sin movimientos de almacén registrados.</p>}
        {!!result.stock.length && <ul className={styles.stock}>{result.stock.map(item => <li key={`${item.warehouse}-${item.bin}-${item.batch}`}><strong>{item.quantity}</strong><span>{item.warehouse} · {item.bin}</span><small>Lote {item.batch} · {item.status}</small></li>)}</ul>}
      </section>
    </>}
  </div>;
}
