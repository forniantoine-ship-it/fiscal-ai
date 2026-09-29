"use client";

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import styles from "./prototype.module.css";

/** Panneau latéral modal, commun aux chemins DEMO et RÉEL (aucune donnée, uniquement de la structure et du focus). */
export function Drawer({ title, status, onClose, children }: { title: string; status: ReactNode; onClose: () => void; children: ReactNode }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    closeRef.current?.focus();
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") { onClose(); return; }
    if (event.key !== "Tab" || !panelRef.current) return;
    const focusable = [...panelRef.current.querySelectorAll<HTMLElement>("button, input, summary, a[href]")].filter(element => !element.hasAttribute("disabled"));
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first && last) { event.preventDefault(); last.focus(); }
    if (!event.shiftKey && document.activeElement === last && first) { event.preventDefault(); first.focus(); }
  }
  return <div className={styles.scrim} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={panelRef} className={styles.drawer} role="dialog" aria-modal="true" aria-label={title} onKeyDown={onKeyDown}>
      <header className={styles.drawerHead}>
        <div><h2>{title}</h2>{status}</div>
        <button ref={closeRef} type="button" className={styles.closeButton} onClick={onClose} aria-label="Fermer et revenir au dossier">×</button>
      </header>
      <div className={styles.drawerBody}>{children}</div>
    </section>
  </div>;
}
