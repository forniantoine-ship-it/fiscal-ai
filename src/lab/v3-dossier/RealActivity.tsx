"use client";

/**
 * R15.3 — Activité réelle : panneau et espace de travail, alimentés UNIQUEMENT par `ActivityView` (donnée F009 réelle).
 * Aucune importation de fixture, de démo ni de lecture simulée. Pas de correction inline : la seule action est le lien
 * vers l'Assistant Activité (F009) déjà scopé, sous la coque V3.
 */
import type { ReactNode } from "react";
import type { ActivityAction, ActivityFactView, ActivityView } from "./activity-view-model";
import { PiecesList, RestitutionTable, SourceLink, StatusMark, type Column } from "./restitution";
import styles from "./prototype.module.css";

const FACT_COLUMNS: Column<ActivityFactView>[] = [
  { key: "label", label: "Information", render: row => row.label },
  { key: "value", label: "Valeur", render: row => <strong>{row.value}</strong> },
  {
    key: "source", label: "Source",
    render: row => row.source?.document ? <SourceLink source={{ document: row.source.document }} /> : <span>{row.source?.label ?? "—"}</span>,
  },
  { key: "state", label: "État", render: row => <StatusMark tone={row.tone} label={row.stateLabel} showLabel /> },
];

export function ActivityReviewLink({ action, variant = "secondary" }: { action: ActivityAction | null; variant?: "primary" | "secondary" }) {
  if (!action) return <p className={styles.tableNote} role="status">Le lien vers l’Assistant Activité n’est pas disponible tant que le dossier et l’exercice ne sont pas vérifiés.</p>;
  return <a className={variant === "primary" ? styles.primaryButton : styles.secondaryButton} href={action.href}>{action.label}</a>;
}

function FactsSection({ view }: { view: ActivityView }) {
  return <section className={styles.panelSection} aria-labelledby="v3r-act-retenu">
    <h3 id="v3r-act-retenu" className={styles.eyebrow}>Ce que j’ai retenu</h3>
    {view.facts.length > 0
      ? <RestitutionTable caption="Informations d’activité" columns={FACT_COLUMNS} rows={view.facts} rowKey={row => row.id} />
      : <p className={styles.panelLead}>Aucune information d’activité n’est enregistrée pour l’instant.</p>}
  </section>;
}

function TodoList({ view }: { view: ActivityView }) {
  const { questions, decisions } = view.todo;
  if (questions.length === 0 && decisions.length === 0) return <p className={styles.panelLead}>Rien ne reste à régler dans les informations enregistrées.</p>;
  return <>
    {decisions.length > 0 ? <ul className={styles.findings}>{decisions.map(text => <li key={text}><span aria-hidden="true">!</span>{text}</li>)}</ul> : null}
    {questions.length > 0 ? <ul className={styles.findings}>{questions.map(text => <li key={text}><span aria-hidden="true">·</span>{text}</li>)}</ul> : null}
  </>;
}

function PiecesSection({ view }: { view: ActivityView }) {
  return view.pieces.length > 0 ? <PiecesList pieces={view.pieces} /> : <p className={styles.panelLead}>Aucun document n’est rattaché à ces informations.</p>;
}

/** Contenu du panneau « Activité ». */
export function RealActivityReport({ view }: { view: ActivityView }) {
  if (view.state === "unsupported") return <p className={styles.panelLead}>{view.summary}</p>;
  return <>
    <section className={styles.headline} aria-label="Ce que ça donne">
      <p className={styles.eyebrow}>Ce que ça donne</p>
      <p className={styles.panelLead}>{view.summary}</p>
    </section>
    <FactsSection view={view} />
    <section className={styles.panelSection} aria-labelledby="v3r-act-todo">
      <h3 id="v3r-act-todo" className={styles.eyebrow}>Ce qui reste à régler</h3>
      <TodoList view={view} />
    </section>
    <section className={styles.panelSection} aria-labelledby="v3r-act-docs">
      <h3 id="v3r-act-docs" className={styles.eyebrow}>Documents utilisés</h3>
      <PiecesSection view={view} />
    </section>
    <footer className={styles.drawerActions}>
      <ActivityReviewLink action={view.action} variant="primary" />
    </footer>
  </>;
}

/** Espace de travail Activité (lecture) : ce que je sais, ce qu'il me manque, mes pièces. */
export function RealActivityWorkspace({ view, back }: { view: ActivityView; back: ReactNode }) {
  return <>
    <nav className={styles.breadcrumb} aria-label="Fil d’Ariane">{back}</nav>
    <header className={styles.pageHead}>
      <p className={styles.eyebrow}>Espace de travail</p>
      <h1>Activité</h1>
      <p className={styles.lead}>{view.summary}</p>
    </header>
    {view.state === "unsupported" ? null : <div className={styles.workspace}>
      <section className={styles.zone} aria-labelledby="v3r-act-ws-known">
        <h2 id="v3r-act-ws-known" className={styles.zoneTitle}>Ce que j’ai retenu</h2>
        {view.facts.length > 0
          ? <RestitutionTable caption="Informations d’activité" columns={FACT_COLUMNS} rows={view.facts} rowKey={row => row.id} />
          : <p className={styles.panelLead}>Rien d’enregistré pour l’instant.</p>}
      </section>
      <section className={styles.zone} aria-labelledby="v3r-act-ws-todo">
        <h2 id="v3r-act-ws-todo" className={styles.zoneTitle}>Ce qui reste à régler</h2>
        <TodoList view={view} />
      </section>
      <section className={styles.zone} aria-labelledby="v3r-act-ws-docs">
        <h2 id="v3r-act-ws-docs" className={styles.zoneTitle}>Documents utilisés</h2>
        <PiecesSection view={view} />
      </section>
    </div>}
    <div className={styles.workspaceFooter}>
      {view.state === "unsupported" ? null : <ActivityReviewLink action={view.action} variant="primary" />}
    </div>
  </>;
}
