import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import DashboardSidebar from "../components/DashboardSidebar";
import LocalStorageMigrator from "../components/LocalStorageMigrator";
import { getAuthenticatedOrReviewContext } from "@/lib/auth-context";
import styles from "./layout.module.css";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const auth = await getAuthenticatedOrReviewContext();
  if (!auth) redirect("/login");

  return (
    <div className={styles.frame}>
      {!auth.isReview && <LocalStorageMigrator />}
      <DashboardSidebar />
      <div className={styles.stage}>{children}</div>
    </div>
  );
}
