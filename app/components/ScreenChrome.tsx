import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import styles from "./screen.module.css";

/** Class names for header actions: every module uses the Control Tower buttons. */
export const screenButton = {
  primary: `${styles.button} ${styles.primary}`,
  secondary: `${styles.button} ${styles.secondary}`,
} as const;

export const screenPanelClass = styles.panel;

export function ScreenHeader({ eyebrow, title, description, back, children }: {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  back?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className={styles.header}>
      <div className={styles.heading}>
        {back}
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h1 className={styles.title}>{title}</h1>
        {description && <p className={styles.description}>{description}</p>}
      </div>
      <div className={styles.actions}>
        {children}
        <div className={styles.avatar} aria-hidden="true">FG</div>
      </div>
    </header>
  );
}

export const screenBackClass = styles.back;

export type ScreenMetric = {
  label: string;
  value: ReactNode;
  /** Short qualifier shown on the right of the label, as in Control Tower. */
  note?: ReactNode;
  /** Identifiers and other text values use a smaller size and never wrap. */
  text?: boolean;
  tone?: "success" | "warning" | "error";
  /** Secondary line under the value. */
  detail?: ReactNode;
  /** Optional destination: the whole card becomes a link (for example a filtered grid). */
  href?: string;
};

export function MetricGrid({ items, label, prefetch }: { items: ScreenMetric[]; label?: string; prefetch?: false }) {
  if (!items.length) return null;
  const style = { "--metric-count": Math.max(1, items.length) } as CSSProperties;
  return (
    <section className={styles.metrics} style={style} aria-label={label}>
      {items.map(item => {
        const title = typeof item.value === "string" || typeof item.value === "number" ? String(item.value) : undefined;
        const valueClass = [styles.metricValue, item.text ? styles.metricText : "", item.tone ? styles[item.tone] : ""].filter(Boolean).join(" ");
        const body = <>
          <div className={styles.metricTop}><span>{item.label}</span>{item.note && <strong>{item.note}</strong>}</div>
          <b className={valueClass} title={title}>{item.value}</b>
          {item.detail && <small className={styles.metricDetail}>{item.detail}</small>}
        </>;
        return item.href
          ? <Link key={item.label} href={item.href} prefetch={prefetch} className={`${styles.metric} ${styles.metricLink}`}>{body}</Link>
          : <article key={item.label} className={styles.metric}>{body}</article>;
      })}
    </section>
  );
}
