import Link from "next/link";
import DashboardSidebarView from "../components/DashboardSidebarView";
import styles from "../dashboard/layout.module.css";

export default function DemoSidebar() {
  return <DashboardSidebarView basePath="/demo" sessionAction={<Link href="/demo" prefetch={false} className={styles.signOut}>Volver al inicio</Link>} />;
}
