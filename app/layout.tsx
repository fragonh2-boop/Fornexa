import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FORNEXA",
  description: "Plataforma logística y TMS para operaciones de transporte.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
