"use client";

import { useState, type ReactNode } from "react";

export default function SimulationButton({ children, className, enabled = false }: { children: ReactNode; className?: string; enabled?: boolean }) {
  const [simulated, setSimulated] = useState(false);
  return <><button type="button" className={className} onClick={enabled ? () => setSimulated(true) : undefined}>{children}</button>{simulated && <span role="status">Acción simulada; no se han guardado cambios ni contactado con servicios externos.</span>}</>;
}
