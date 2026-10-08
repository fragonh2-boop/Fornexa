import type { ReactNode } from "react";
import styles from "./screen.module.css";

/** Page frame shared by module screens; spacing matches Control Tower. */
export default function AppShell({ children }: { children: ReactNode }) {
  return <main className={styles.page}><section className={styles.pageContent}>{children}</section></main>;
}
