import type { ReactNode } from "react";
import DashboardSidebar from "../components/DashboardSidebar";
import styles from "./layout.module.css";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.frame}>
      <DashboardSidebar />
      <div className={styles.stage}>{children}</div>
    </div>
  );
}
