"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SiteFooter, SiteHeader } from "./components/SiteChrome";
import {
  fornexaModules,
  rotatingCapabilities,
  siteCopy,
  type Language,
} from "./components/site-copy";

/** Cadena operativa: cardinalidad real del modelo canónico, no una métrica. */
const operationalChain: Record<Language, string[]> = {
  es: ["Orden", "Expedición", "Viaje", "Paradas", "Documento", "Eventos"],
  en: ["Order", "Shipment", "Trip", "Stops", "Document", "Events"],
  fr: ["Commande", "Expédition", "Voyage", "Arrêts", "Document", "Événements"],
};

const chainNote: Record<Language, string> = {
  es: "Una expedición no es un viaje. Cada eslabón tiene su propia pantalla y su propia verdad.",
  en: "A shipment is not a trip. Each link has its own screen and its own truth.",
  fr: "Une expédition n’est pas un voyage. Chaque maillon a son propre écran et sa propre vérité.",
};

export default function HomeView() {
  const [language, setLanguage] = useState<Language>("es");
  const [capabilityIndex, setCapabilityIndex] = useState(0);
  const t = siteCopy[language];
  const rotating = rotatingCapabilities[language];

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCapabilityIndex((current) => (current + 1) % rotating.length);
    }, 2300);

    return () => window.clearInterval(timer);
  }, [rotating.length]);

  return (
    <main>
      <SiteHeader language={language} onLanguage={setLanguage} t={t} />

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">{t.tagline}</p>
          <h1>{t.hero.title}</h1>
          <div className="rotating-message" aria-live="polite">
            <span className="rotating-label">{t.hero.rotatingLabel}</span>
            <strong key={capabilityIndex}>{rotating[capabilityIndex % rotating.length]}</strong>
          </div>
          <p className="lead">{t.hero.lead}</p>
          <div className="actions">
            <Link className="primary-cta" href="/plataforma">
              {t.hero.platformCta}
            </Link>
            <Link className="secondary-cta" href="/tracking">
              {t.hero.trackingCta}
            </Link>
          </div>
        </div>

        <aside className="login-card">
          <span className="card-kicker">{t.hero.accessKicker}</span>
          <h2>{t.login}</h2>
          <p>{t.hero.accessNote}</p>
          <Link className="login-trigger" href="/login">
            {t.hero.access}
          </Link>
        </aside>
      </section>

      <section className="overview-section">
        <div className="section-heading">
          <p className="eyebrow">{t.what.eyebrow}</p>
          <h2>{t.what.title}</h2>
        </div>
        <p className="section-body">{t.what.body}</p>
        <ol className="chain" aria-label={t.what.title}>
          {operationalChain[language].map((step, index) => (
            <li key={step}>
              <span className="chain-step">{String(index + 1).padStart(2, "0")}</span>
              <strong>{step}</strong>
            </li>
          ))}
        </ol>
        <p className="chain-note">{chainNote[language]}</p>
      </section>

      <section id="capacidades" className="capabilities-section">
        <div className="section-heading">
          <p className="eyebrow">{t.capabilities.eyebrow}</p>
          <h2>{t.capabilities.title}</h2>
          <p className="section-lead">{t.capabilities.lead}</p>
        </div>
        <div className="capability-grid">
          {t.capabilities.items.map((capability) => (
            <article className="capability-card" key={capability.title}>
              <h3>{capability.title}</h3>
              <p>{capability.summary}</p>
              <ul>
                {capability.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="advantages-section">
        <div className="section-heading">
          <p className="eyebrow">{t.advantages.eyebrow}</p>
          <h2>{t.advantages.title}</h2>
        </div>
        <div className="advantage-grid">
          {t.advantages.items.map((advantage) => (
            <article key={advantage.title}>
              <h3>{advantage.title}</h3>
              <p>{advantage.summary}</p>
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
        <div className="module-grid">
          {fornexaModules.map((module) => (
            <Link className="module-tile" href={module.href} key={module.name}>
              {module.name}
            </Link>
          ))}
        </div>
        <p className="chain-note">{t.modules.note}</p>
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
