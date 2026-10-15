import type { Metadata } from "next";
import PlatformView from "./PlatformView";

export const metadata: Metadata = {
  title: "Plataforma",
  description:
    "Capacidades y módulos de FORNEXA: planificación, colaboración, ejecución y control de coste, con el estado real de cada superficie.",
  alternates: { canonical: "/plataforma" },
};

export default function PlatformPage() {
  return <PlatformView />;
}
