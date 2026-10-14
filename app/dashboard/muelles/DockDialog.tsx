"use client";
import { useEffect, useRef, type ReactNode } from "react";
import styles from "./docks.module.css";
export default function DockDialog({
  title,
  onClose,
  children,
  locked = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  locked?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    opener.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const dialog = ref.current;
    dialog?.showModal();
    dialog?.querySelector<HTMLElement>("select,input,textarea")?.focus();
    return () => {
      dialog?.close();
      opener.current?.focus();
    };
  }, []);
  const close = () => {
    if (locked) return;
    ref.current?.close();
    onClose();
    opener.current?.focus();
  };
  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === ref.current) close();
      }}
    >
      <div className={styles.dialogHead}>
        <div>
          <p className={styles.eyebrow}>MUELLES</p>
          <h2>{title}</h2>
        </div>
        <button type="button" onClick={close} aria-label="Cerrar ventana">
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
