import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import DashboardSidebar from "../components/DashboardSidebar";
import LocalStorageMigrator from "../components/LocalStorageMigrator";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getAuthenticatedContext } from "@/lib/auth-context";
import styles from "./layout.module.css";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");

  const auth = await getAuthenticatedContext();
  if (!auth) redirect("/access-denied");

  return (
    <div className={styles.frame}>
      <LocalStorageMigrator />
      <DashboardSidebar />
      <div className={styles.stage}>{children}</div>
    </div>
  );
}
