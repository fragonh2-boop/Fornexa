import { redirect, notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getAuthenticatedOrReviewContext } from "@/lib/auth-context";
import styles from "./tickets.module.css";

export default async function TicketsLayout({ children }: { children: ReactNode }) {
  const auth = await getAuthenticatedOrReviewContext();
  if (!auth) redirect("/login");
  if (auth.isReview) notFound();
  return <main className={styles.page}>{children}</main>;
}
