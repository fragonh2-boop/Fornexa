"use client";

import Link from "next/link";
import { useState } from "react";
import { SiteFooter, SiteHeader } from "../components/SiteChrome";
import { CONTACT_EMAIL, siteCopy, type Language } from "../components/site-copy";

export default function ContactView() {
  const [language, setLanguage] = useState<Language>("es");
  const t = siteCopy[language];

  return (
    <main>
      <SiteHeader language={language} onLanguage={setLanguage} t={t} />

      <section className="page-hero">
        <p className="eyebrow">{t.contact.eyebrow}</p>
        <h1>{t.contact.title}</h1>
        <p className="lead">{t.contact.body}</p>
      </section>

      <section className="contact-section">
        <article className="contact-card">
          <span className="card-kicker">{t.contact.emailLabel}</span>
          <a className="contact-mail" href={`mailto:${CONTACT_EMAIL}`}>
            {t.contact.email}
          </a>
          <p>{t.contact.note}</p>
        </article>

        <article className="contact-card contact-card-muted">
          <h2>{t.contact.noFormTitle}</h2>
          <p>{t.contact.noForm}</p>
          <div className="contact-links">
            <Link href="/tracking">{t.nav.tracking}</Link>
            <Link href="/memorandum">{t.footer.memorandum}</Link>
            <Link href="/plataforma">{t.nav.platform}</Link>
          </div>
        </article>
      </section>

      <SiteFooter t={t} />
    </main>
  );
}
