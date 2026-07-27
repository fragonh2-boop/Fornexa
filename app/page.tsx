"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const copy = {
  es: {
    tagline: "Supply chain orchestration",
    title: "Una plataforma; control total",
    lead: "Tecnología conectada para dirigir toda tu cadena de suministro.",
    login: "Iniciar sesión",
    demo: "Ver demo",
    modules: "Módulos",
    language: "Idioma",
    email: "Correo electrónico",
    password: "Contraseña",
    access: "Entrar en FORNEXA",
    forgot: "¿Has olvidado la contraseña?",
    secure: "Acceso seguro para operadores, cargadores, transportistas y receptores.",
    dashboard: "Vista operativa",
    shipments: "Expediciones activas",
    incidents: "Incidencias abiertas",
    deliveries: "Entregas previstas hoy",
    carriers: "Colaboradores disponibles",
    recent: "Últimas expediciones",
    status: "Estado",
    route: "Ruta",
    client: "Cliente",
    planned: "Planificada",
    transit: "En tránsito",
    delivered: "Entregada"
  },
  en: {
    tagline: "Supply chain orchestration",
    title: "One platform; total control",
    lead: "Connected technology to manage your entire supply chain.",
    login: "Sign in",
    demo: "View demo",
    modules: "Modules",
    language: "Language",
    email: "Email address",
    password: "Password",
    access: "Enter FORNEXA",
    forgot: "Forgot your password?",
    secure: "Secure access for operators, shippers, carriers and receivers.",
    dashboard: "Operational view",
    shipments: "Active shipments",
    incidents: "Open incidents",
    deliveries: "Deliveries due today",
    carriers: "Available partners",
    recent: "Latest shipments",
    status: "Status",
    route: "Route",
    client: "Customer",
    planned: "Planned",
    transit: "In transit",
    delivered: "Delivered"
  },
  fr: {
    tagline: "Supply chain orchestration",
    title: "Une plateforme ; un contrôle total",
    lead: "Une technologie connectée pour piloter toute votre supply chain.",
    login: "Se connecter",
    demo: "Voir la démo",
    modules: "Modules",
    language: "Langue",
    email: "Adresse e-mail",
    password: "Mot de passe",
    access: "Accéder à FORNEXA",
    forgot: "Mot de passe oublié ?",
    secure: "Accès sécurisé pour opérateurs, chargeurs, transporteurs et destinataires.",
    dashboard: "Vue opérationnelle",
    shipments: "Expéditions actives",
    incidents: "Incidents ouverts",
    deliveries: "Livraisons prévues aujourd'hui",
    carriers: "Partenaires disponibles",
    recent: "Dernières expéditions",
    status: "Statut",
    route: "Trajet",
    client: "Client",
    planned: "Planifiée",
    transit: "En transit",
    delivered: "Livrée"
  }
};

const rotatingSolutions = [
  "Supply Chain Suite",
  "eCRM",
  "ePODs",
  "BI by AI",
  "Reports by AI",
  "Smart Blockchain",
  "Smart Solutions"
];

type Language = keyof typeof copy;

const shipments = [
  ["FX-260071", "Valencia → Lyon", "Mediterránea Retail", "transit"],
  ["FX-260070", "Barcelona → Marseille", "Nova Distribution", "planned"],
  ["FX-260069", "Madrid → Toulouse", "Atlas Components", "delivered"]
];

export default function Home() {
  const [language, setLanguage] = useState<Language>("es");
  const [solutionIndex, setSolutionIndex] = useState(0);
  const t = copy[language];

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSolutionIndex((current) => (current + 1) % rotatingSolutions.length);
    }, 2300);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <main>
      <header className="topbar">
        <div className="brand">FORNEXA</div>
        <nav className="topnav">
          <a href="#dashboard">{t.demo}</a>
          <a href="#modules">{t.modules}</a>
          <label className="language-select">
            <span>{t.language}</span>
            <select value={language} onChange={(event) => setLanguage(event.target.value as Language)}>
              <option value="es">ES</option>
              <option value="en">EN</option>
              <option value="fr">FR</option>
            </select>
          </label>
          <Link className="login-trigger" href="/login">{t.login}</Link>
        </nav>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">{t.tagline}</p>
          <h1>{t.title}</h1>
          <div className="rotating-message" aria-live="polite">
            <span className="rotating-label">FORNEXA</span>
            <strong key={solutionIndex}>{rotatingSolutions[solutionIndex]}</strong>
          </div>
          <p className="lead">{t.lead}</p>
          <div className="actions">
            <Link className="login-trigger" href="/login">{t.login}</Link>
            <a href="#dashboard">{t.demo}</a>
          </div>
        </div>

        <aside className="login-card">
          <span className="card-kicker">FORNEXA ACCESS</span>
          <h2>{t.login}</h2>
          <p>{t.secure}</p>
          <label>{t.email}<input type="email" placeholder="nombre@empresa.com" /></label>
          <label>{t.password}<input type="password" placeholder="••••••••" /></label>
          <Link className="login-trigger" href="/login">{t.access}</Link>
          <Link href="/login">{t.forgot}</Link>
        </aside>
      </section>

      <section id="dashboard" className="dashboard-section">
        <div className="section-heading">
          <p className="eyebrow">{t.dashboard}</p>
          <h2>FORNEXA Control Tower</h2>
        </div>
        <div className="metrics">
          <article><span>128</span><p>{t.shipments}</p></article>
          <article><span>7</span><p>{t.incidents}</p></article>
          <article><span>34</span><p>{t.deliveries}</p></article>
          <article><span>62</span><p>{t.carriers}</p></article>
        </div>
        <div className="shipments-panel">
          <div className="panel-title"><h3>{t.recent}</h3><span>Live demo</span></div>
          <div className="table-row table-head"><span>ID</span><span>{t.route}</span><span>{t.client}</span><span>{t.status}</span></div>
          {shipments.map(([id, route, client, status]) => (
            <div className="table-row" key={id}>
              <strong>{id}</strong><span>{route}</span><span>{client}</span>
              <span className={`status ${status}`}>{t[status as "planned" | "transit" | "delivered"]}</span>
            </div>
          ))}
        </div>
      </section>

      <section id="modules" className="modules-strip">
        {["TMS", "CRM", "POD & CMR", "Tracking", "Tarifas", "Colaboradores"].map((module) => <span key={module}>{module}</span>)}
      </section>
    </main>
  );
}
