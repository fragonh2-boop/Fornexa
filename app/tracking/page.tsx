"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

export default function TrackingPage() {
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanCode = code.trim();

    if (cleanCode.length < 6) {
      setMessage("Introduce un código de seguimiento válido.");
      return;
    }

    setMessage(`Consulta preparada para ${cleanCode}. La conexión con expediciones reales se activará en la siguiente fase.`);
  }

  return (
    <main className="tracking-page">
      <header className="tracking-header">
        <Link href="/" className="auth-logo">FORNEXA</Link>
        <Link href="/login" className="tracking-session-link">Mi sesión</Link>
      </header>

      <section className="tracking-hero">
        <div>
          <span className="card-kicker">PUBLIC TRACKING</span>
          <h1>Consulta tu expedición sin iniciar sesión.</h1>
          <p>Accede desde la URL recibida, introduce el código de seguimiento o escanea el QR asociado a la expedición.</p>
        </div>

        <form className="tracking-card" onSubmit={handleSubmit}>
          <label className="auth-field">
            Código de seguimiento
            <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="Ej. FX-260071" autoFocus />
          </label>
          <button className="auth-submit" type="submit">Consultar estado</button>
          <div className="tracking-methods">
            <span>URL segura</span><span>Código QR</span><span>Código manual</span>
          </div>
          {message && <p className="auth-message" role="status">{message}</p>}
        </form>
      </section>

      <section className="tracking-preview">
        <div className="section-heading">
          <p className="eyebrow">Información pública prevista</p>
          <h2>Estado claro, sin exponer datos sensibles</h2>
        </div>
        <div className="metrics">
          <article><span>01</span><p>Estado actual y última actualización</p></article>
          <article><span>02</span><p>Origen, destino y fecha prevista</p></article>
          <article><span>03</span><p>Hitos de recogida, tránsito y entrega</p></article>
          <article><span>04</span><p>Incidencias comunicables y ePOD autorizado</p></article>
        </div>
      </section>
    </main>
  );
}
