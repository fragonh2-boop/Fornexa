"use client";

import Link from "next/link";
import { useState } from "react";
import { SiteFooter, SiteHeader } from "../components/SiteChrome";
import { siteCopy, type Language } from "../components/site-copy";

/**
 * Módulos agrupados por el eje de capacidad al que pertenecen. Los nombres de
 * producto no se traducen; el agrupamiento sí es información de producto.
 */
const modulesByCapability: string[][] = [
  ["Control Tower", "Órdenes", "Expediciones", "Viajes", "Muelles"],
  ["Clientes", "Colaboradores", "Ofertas y tarifas"],
  ["Artículos", "Almacenes", "Tracking", "Trazabilidad", "Documentos"],
  ["Aduanas", "Informes", "Configuración"],
];

export default function PlatformView() {
  const [language, setLanguage] = useState<Language>("es");
  const t = siteCopy[language];

  return (
    <main>
      <SiteHeader language={language} onLanguage={setLanguage} t={t} />

      <section className="page-hero">
        <p className="eyebrow">{t.nav.platform}</p>
        <h1>{t.what.title}</h1>
        <p className="lead">{t.what.body}</p>
      </section>

      <section id="capacidades" className="capabilities-section">
        <div className="section-heading">
          <p className="eyebrow">{t.capabilities.eyebrow}</p>
          <h2>{t.capabilities.title}</h2>
          <p className="section-lead">{t.capabilities.lead}</p>
        </div>

        <div className="capability-detail-list">
          {t.capabilities.items.map((capability, index) => (
            <article className="capability-detail" key={capability.title}>
              <header>
                <span className="chain-step">{String(index + 1).padStart(2, "0")}</span>
                <h3>{capability.title}</h3>
              </header>
              <p className="capability-summary">{capability.summary}</p>
              <ul>
                {capability.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <div className="module-chips">
                {modulesByCapability[index].map((module) => (
                  <span className="module-chip" key={module}>
                    {module}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="modulos" className="modules-section">
        <div className="section-heading">
          <p className="eyebrow">{t.modules.eyebrow}</p>
          <h2>{t.modules.title}</h2>
          <p className="section-lead">{t.modules.lead}</p>
        </div>
        <div className="capability-grid">
          {t.capabilities.items.map((capability, index) => (
            <article className="capability-card" key={capability.title}>
              <h3>{capability.title}</h3>
              <ul>
                {modulesByCapability[index].map((module) => (
                  <li key={module}>{module}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="surfaces-section">
        <div className="section-heading">
          <p className="eyebrow">{t.surfaces.eyebrow}</p>
          <h2>{t.surfaces.title}</h2>
          <p className="section-lead">{t.surfaces.lead}</p>
        </div>
        <div className="surface-grid">
          {t.surfaces.items.map((surface) =>
            surface.href ? (
              <Link className="surface-card" href={surface.href} key={surface.label}>
                <h3>{surface.label}</h3>
                <p>{surface.summary}</p>
              </Link>
            ) : (
              <article className="surface-card surface-card-static" key={surface.label}>
                <h3>{surface.label}</h3>
                <p>{surface.summary}</p>
                <span className="surface-badge">{t.surfaces.tokenNote}</span>
              </article>
            ),
          )}
        </div>
      </section>

      <section className="status-section">
        <div className="section-heading">
          <p className="eyebrow">{t.status.eyebrow}</p>
          <h2>{t.status.title}</h2>
          <p className="section-lead">{t.status.lead}</p>
        </div>
        <div className="status-grid">
          <article className="status-card status-live">
            <h3>{t.status.liveTitle}</h3>
            <ul>
              {t.status.live.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
          <article className="status-card status-preparing">
            <h3>{t.status.preparingTitle}</h3>
            <ul>
              {t.status.preparing.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        </div>
      </section>

      <section className="cta-section">
        <h2>{t.cta.title}</h2>
        <p>{t.cta.body}</p>
        <Link className="primary-cta" href="/contacto">
          {t.cta.button}
        </Link>
      </section>

      <SiteFooter t={t} />
    </main>
  );
}
