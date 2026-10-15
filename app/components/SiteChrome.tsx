"use client";

import Link from "next/link";
import { SITE_LANGUAGES, type Language, type SiteCopy } from "./site-copy";

/** Cabecera pública compartida por la portada, la página de plataforma y contacto. */
export function SiteHeader({
  language,
  onLanguage,
  t,
}: {
  language: Language;
  onLanguage: (language: Language) => void;
  t: SiteCopy;
}) {
  return (
    <header className="topbar">
      <Link className="brand" href="/">
        FORNEXA
      </Link>
      <nav className="topnav" aria-label="FORNEXA">
        <Link href="/plataforma">{t.nav.platform}</Link>
        <Link href="/#capacidades">{t.nav.capabilities}</Link>
        <Link href="/#modulos">{t.nav.modules}</Link>
        <Link className="tracking-nav" href="/tracking">
          {t.nav.tracking}
        </Link>
        <Link href="/contacto">{t.nav.contact}</Link>
        <label className="language-select">
          <span>{t.language}</span>
          <select
            value={language}
            aria-label={t.language}
            onChange={(event) => onLanguage(event.target.value as Language)}
          >
            {SITE_LANGUAGES.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <Link className="login-trigger" href="/login">
          {t.login}
        </Link>
      </nav>
    </header>
  );
}

/** Pie público. Sin enlaces a superficies que devuelvan 404 en producción. */
export function SiteFooter({ t }: { t: SiteCopy }) {
  return (
    <footer className="site-footer">
      <p>{t.footer.note}</p>
      <nav aria-label="FORNEXA">
        <Link href="/plataforma">{t.nav.platform}</Link>
        <Link href="/tracking">{t.footer.tracking}</Link>
        <Link href="/memorandum">{t.footer.memorandum}</Link>
        <Link href="/contacto">{t.nav.contact}</Link>
        <Link href="/login">{t.footer.login}</Link>
      </nav>
    </footer>
  );
}
