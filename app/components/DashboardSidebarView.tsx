"use client";

import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import styles from "../dashboard/layout.module.css";
import FornexaLogo from "./FornexaLogo";
import { activeDashboardHref, createDashboardHref, dashboardHref, dashboardNavigation, isPlusShortcut, type DashboardBasePath } from "./DashboardNavigation";

export default function DashboardSidebarView({ basePath = "/dashboard", sessionAction }: { basePath?: DashboardBasePath; sessionAction: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const currentHref = activeDashboardHref(pathname, basePath);
  const demo = basePath === "/demo";

  useEffect(() => {
    function openNewRecord(event: KeyboardEvent) {
      if (!isPlusShortcut(event) || event.repeat) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || Boolean(target.closest("input, textarea, select, [contenteditable='true']")))) return;
      const href = createDashboardHref(pathname, currentHref, basePath);
      if (!href) return;
      event.preventDefault();
      window.scrollTo(0, 0);
      router.push(href);
    }
    window.addEventListener("keydown", openNewRecord);
    return () => window.removeEventListener("keydown", openNewRecord);
  }, [router, pathname, currentHref, basePath]);

  return (
    <aside className={styles.sidebar}>
      <Link href={basePath} prefetch={demo ? false : undefined} className={styles.brand}><FornexaLogo className={styles.brandLogo} /></Link>
      <nav className={styles.nav} aria-label="Navegación principal">
        {dashboardNavigation.map(([label, suffix]) => {
          const href = dashboardHref(basePath, suffix);
          const active = href === currentHref;
          return <Link key={href} href={href} prefetch={demo ? false : undefined} scroll className={active ? styles.active : ""} aria-current={active ? "page" : undefined} onClick={() => window.scrollTo(0, 0)}>{label}</Link>;
        })}
      </nav>
      <div className={styles.footer}>
        <Link href={demo ? "/demo/memorandum" : "/memorandum"} prefetch={demo ? false : undefined} className={styles.aboutLink}>Acerca de</Link>
        <span>FORNEXA</span>
        <small>Supply Chain Suite</small>
        {sessionAction}
      </div>
    </aside>
  );
}
