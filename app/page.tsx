import type { Metadata } from "next";
import HomeView from "./HomeView";

export const metadata: Metadata = {
  title: "Una plataforma; control total",
  description:
    "Pedidos, expediciones, viajes, documento de transporte, aduanas, almacén, tarifas y tracking sobre un mismo modelo de datos, con aislamiento por organización.",
  alternates: { canonical: "/" },
};

export default function Home() {
  return <HomeView />;
}
