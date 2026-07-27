const modules = [
  ["Expediciones", "Altas, planificación, estados e incidencias"],
  ["Clientes", "CRM, contactos, direcciones y condiciones"],
  ["Colaboradores", "Transportistas, coberturas, tarifas y capacidad"],
  ["Documentación", "CMR, POD, etiquetas, fotos y archivos"],
];

export default function Home() {
  return (
    <main>
      <header className="topbar">
        <div className="brand">FORNEXA</div>
        <span className="badge">Entorno inicial</span>
      </header>

      <section className="hero">
        <p className="eyebrow">Supply chain orchestration</p>
        <h1>Control operativo del transporte en una sola plataforma.</h1>
        <p className="lead">
          Base inicial del TMS para gestionar expediciones, clientes, colaboradores,
          documentación y trazabilidad.
        </p>
        <div className="actions">
          <button>Entrar en operaciones</button>
          <a href="#modules">Ver módulos</a>
        </div>
      </section>

      <section id="modules" className="grid">
        {modules.map(([title, description]) => (
          <article key={title}>
            <span>01</span>
            <h2>{title}</h2>
            <p>{description}</p>
          </article>
        ))}
      </section>

      <footer>FORNEXA · TMS en construcción</footer>
    </main>
  );
}
