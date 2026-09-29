"use client";

/**
 * R15.1 — coque V3 des assistants propriétaires (F009–F014). Elle ne remplace que la coque : le moteur, le panneau,
 * la persistance et la sauvegarde de l'assistant sont ceux de la route historique, rendus tels quels en `children`.
 * Aucune donnée de démonstration, aucune importation de fixture.
 */
import { useEffect, type ReactNode } from "react";
import { resolveAutosaveDisplay } from "@/lib/lmnp/store/workspace-autosave-display";
import type { AutosaveStatus } from "@/lib/lmnp/store/persistence";
import styles from "./prototype.module.css";

export type V3AssistantShellProps = {
  /** Rubrique de l'assistant (« Financement »…), issue de la liste explicite de routes. */
  title: string;
  year: number;
  /** État d'enregistrement déjà tenu par le provider ; la coque ne le calcule ni ne le persiste. */
  autosaveStatus: AutosaveStatus;
  persistenceUserId: string | null;
  /** Contrôle « Retour à mon dossier » (sauvegarde confirmée), fourni par l'appelant. */
  returnControl: ReactNode;
  children: ReactNode;
};

function SaveState({ status, persistenceUserId }: { status: AutosaveStatus; persistenceUserId: string | null }) {
  const display = resolveAutosaveDisplay(status, persistenceUserId);
  if (!display) return null;
  return <span className={styles.saveState} data-tone={display.tone} aria-live="polite"><span className={styles.saveDot} aria-hidden="true" />{display.label}</span>;
}

export function V3AssistantShell({ title, year, autosaveStatus, persistenceUserId, returnControl, children }: V3AssistantShellProps) {
  useEffect(() => {
    const previous = document.title;
    document.title = `L’Assistant du Réel · ${title}`;
    return () => { document.title = previous; };
  }, [title]);

  return <div className={styles.assistantRoot}>
    <div className={styles.labBar}><span><span className={styles.labDot} aria-hidden="true" /> LAB UX V3 · dossier réel · {title} · exercice {year}</span></div>
    <header className={styles.header}>
      <span className={styles.brand}><span className={styles.brandMark} aria-hidden="true">✳</span>L’Assistant du Réel</span>
      <nav aria-label="Navigation principale" className={styles.nav}>{returnControl}</nav>
      <span className={styles.assistantHeaderRight}>
        <SaveState status={autosaveStatus} persistenceUserId={persistenceUserId} />
        <span className={styles.assistantRubrique}>{title} · {year}</span>
        <span className={styles.avatar} aria-hidden="true">✳</span>
      </span>
    </header>
    <main className={styles.main}>{children}</main>
    <footer className={styles.assistantFooter}>
      <span>Vos modifications sont enregistrées dans votre dossier réel</span>
      <span>L’Assistant du Réel · laboratoire V3</span>
    </footer>
  </div>;
}

/** Contrôle de retour de la coque : bouton de navigation V3, même mécanisme de sauvegarde confirmée. */
export function V3ReturnControl({ available, status, onReturn }: { available: boolean; status: "idle" | "saving" | "error"; onReturn: () => void }) {
  if (!available) return null;
  return <>
    <button type="button" onClick={onReturn} disabled={status === "saving"}>
      {status === "saving" ? "Enregistrement en cours…" : "← Retour à mon dossier"}
    </button>
    {status === "error" ? <span role="alert">La sauvegarde n’a pas pu être confirmée. Réessayez avant de revenir.</span> : null}
  </>;
}
