import Link from "next/link";

const metrics = [
  ["128", "Expediciones activas", "+8,4%"],
  ["34", "Entregas previstas hoy", "92% a tiempo"],
  ["7", "Incidencias abiertas", "2 críticas"],
  ["62", "Colaboradores disponibles", "11 en ruta"],
];

const shipments = [
  ["FX-260071", "Valencia → Lyon", "Mediterránea Retail", "En tránsito", "Hoy 18:30"],
  ["FX-260070", "Barcelona → Marseille", "Nova Distribution", "Planificada", "Mañana 08:00"],
  ["FX-260069", "Madrid → Toulouse", "Atlas Components", "Entregada", "Hoy 11:42"],
  ["FX-260068", "Alicante → Paris", "Nordic Home", "Incidencia", "Revisión"],
];

export default function DashboardPage() {
  return (
    <main className="app-shell">
      <aside className="app-sidebar">
        <Link href="/dashboard" className="app-brand">FORNEXA</Link>
        <nav className="app-nav" aria-label="Navegación principal">
          <Link className="active" href="/dashboard">Control Tower</Link>
          <a href="#">Expediciones</a>
          <a href="#">Ofertas y tarifas</a>
          <a href="#">Clientes</a>
          <a href="#">Colaboradores</a>
          <a href="#">Tracking</a>
          <a href="#">ePOD & CMR</a>
          <a href="#">Informes</a>
        </nav>
        <div className="app-sidebar-footer">
          <span>FORNEXA Suite</span>
          <small>Entorno de demostración</small>
        </div>
      </aside>

      <section className="app-content">
        <header className="app-header">
          <div>
            <p className="eyebrow">CONTROL TOWER</p>
            <h1>Buenos días, Fran</h1>
            <p>Resumen operativo de tu cadena de suministro.</p>
          </div>
          <div className="app-header-actions">
            <button type="button" className="secondary-button">Importar</button>
            <button type="button">+ Nueva expedición</button>
            <div className="user-avatar" aria-label="Perfil de usuario">FG</div>
          </div>
        </header>

        <section className="app-metrics" aria-label="Indicadores operativos">
          {metrics.map(([value, label, note]) => (
            <article key={label}>
              <div className="metric-top"><span>{label}</span><strong>{note}</strong></div>
              <b>{value}</b>
            </article>
          ))}
        </section>

        <section className="app-grid">
          <article className="app-panel app-panel-wide">
            <div className="app-panel-title">
              <div><p className="eyebrow">OPERATIVA</p><h2>Últimas expediciones</h2></div>
              <button type="button" className="text-button">Ver todas</button>
            </div>
            <div className="app-table">
              <div className="app-table-row app-table-head"><span>ID</span><span>Ruta</span><span>Cliente</span><span>Estado</span><span>Previsión</span></div>
              {shipments.map(([id, route, client, status, eta]) => (
                <div className="app-table-row" key={id}>
                  <strong>{id}</strong><span>{route}</span><span>{client}</span>
                  <span className={`app-status ${status.toLowerCase().replace(" ", "-")}`}>{status}</span><span>{eta}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="app-panel">
            <div className="app-panel-title"><div><p className="eyebrow">ALERTAS</p><h2>Prioridades</h2></div></div>
            <div className="alert-list">
              <div><strong>2</strong><span>Entregas con riesgo de demora</span></div>
              <div><strong>3</strong><span>POD pendientes de validar</span></div>
              <div><strong>1</strong><span>Tarifa próxima a caducar</span></div>
            </div>
          </article>

          <article className="app-panel">
            <div className="app-panel-title"><div><p className="eyebrow">CAPACIDAD</p><h2>Red disponible</h2></div></div>
            <div className="capacity-card"><span>Capacidad confirmada</span><strong>84%</strong><div><i /></div><small>52 de 62 colaboradores disponibles</small></div>
          </article>
        </section>
      </section>
    </main>
  );
}
