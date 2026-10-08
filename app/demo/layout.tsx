import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { isPreviewDemoEnabled } from "@/lib/preview-demo";
import DemoSidebar from "./DemoSidebar";
import styles from "../dashboard/layout.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function DemoLayout({ children }: { children: ReactNode }) {
  if (!isPreviewDemoEnabled()) notFound();

  return (
    <div className={styles.frame}>
      <DemoSidebar />
      <div className={styles.stage}>
        <p role="note" className={styles.demoNotice}>Demo de Preview · Datos ficticios · Operaciones simuladas, sin guardar ni conectar con producción.</p>
        {children}
      </div>
    </div>
  );
}
