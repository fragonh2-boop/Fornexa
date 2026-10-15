import type { Metadata } from "next";
import ContactView from "./ContactView";

export const metadata: Metadata = {
  title: "Contacto",
  description:
    "Hablemos de tu operación logística. Escríbenos y te proponemos un recorrido sobre tus propios procesos.",
  alternates: { canonical: "/contacto" },
};

export default function ContactPage() {
  return <ContactView />;
}
