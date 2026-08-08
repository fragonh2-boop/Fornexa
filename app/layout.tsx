import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import "./brand.css";

const fornexaFont = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-fornexa",
});

export const metadata: Metadata = {
  title: {
    default: "FORNEXA",
    template: "%s | FORNEXA",
  },
  description: "Plataforma logística y TMS para operaciones de transporte.",
  applicationName: "FORNEXA",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: "/icon.svg",
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#eef3f9",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className={fornexaFont.variable}>{children}</body>
    </html>
  );
}
