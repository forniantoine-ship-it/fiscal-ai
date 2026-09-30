"use client";

/**
 * R15.6 — Revenus réels : panneau et espace de travail, alimentés UNIQUEMENT par `RevenueView` (donnée F013 réelle,
 * attribuée à UN bien). Aucune importation de fixture, de démo ni de lecture simulée. Pas de correction inline : la seule
 * action est le lien vers l'Assistant Revenus déjà scopé, sous la coque V3 ; sans scope résolu, aucun lien.
 */
import type { ReactNode } from "react";
import type { RevenueAction, RevenueRowView, RevenueView } from "./revenue-view-model";
import { PiecesList, RestitutionTable, StatusMark, type Column } from "./restitution";
import styles from "./prototype.module.css";

type KnownView = Extract<RevenueView, { state: "known" }>;

const ROW_COLUMNS: Column<RevenueRowView>[] = [
  { key: "label", label: "Nature", render: row => <span>{row.label}{row.note ? <small> · {row.note}</small> : null}</span> },
  { key: "value", label: "Montant", numeric: true, render: row => <strong>{row.value}</strong> },
  { key: "source", label: "Source", render: row => <span>{row.source?.label ?? "—"}</span> },
  { key: "state", label: "État", render: row => <StatusMark tone={row.tone} label={row.stateLabel} showLabel /> },
];

export function RevenueReviewLink({ action, variant = "secondary" }: { action: RevenueAction | null; variant?: "primary" | "secondary" }) {
  if (!action) return <p className={styles.tableNote} role="status">Le lien vers l’Assistant Revenus n’est pas disponible tant que le logement, le dossier et l’exercice ne sont pas vérifiés.</p>;
  return <a className={variant === "primary" ? styles.primaryButton : styles.secondaryButton} href={action.href}>{action.label}</a>;
}

function Headline({ view }: { view: KnownView }) {
  if (!view.headline) return <p className={styles.panelLead}>{view.summary}</p>;
  return <section className={styles.headline} aria-label="Ce que ça donne">
    <p className={styles.eyebrow}>{view.headlineTitle}</p>
    <p className={styles.headlineAmount}>{view.headline.value}</p>
    <p className={styles.headlineCaption}>{view.headline.caption}</p>
    <p className={styles.tableNote}><strong>{view.headline.stateLabel}</strong></p>
    <p className={styles.panelLead}>{view.summary}</p>
  </section>;
}

function Context({ view }: { view: KnownView }) {
  return <>
    {view.serviceDateLine ? <p className={styles.tableNote}>{view.serviceDateLine}</p> : null}
    {view.entry ? <>
      <p className={styles.tableNote}>Situation d’entrée : <strong>{view.entry.label}</strong></p>
      {view.entry.notes.map(note => <p key={note} className={styles.tableNote}>{note}</p>)}
    </> : null}
  </>;
}

function Estimation({ view }: { view: KnownView }) {
  if (!view.estimation) return null;
  return <section className={styles.panelSection} aria-label={view.estimation.title}>
    <h3 className={styles.eyebrow}>{view.estimation.title}</h3>
    <dl className={styles.calcDetail}>
      {view.estimation.lines.map(line => <div key={line.label}><dt>{line.label}</dt><dd>{line.value}</dd></div>)}
    </dl>
    <p className={styles.tableNote}>{view.estimation.note}</p>
  </section>;
}

function RowsSection({ view }: { view: KnownView }) {
  return <section className={styles.panelSection} aria-labelledby="v3r-rev-retenu">
    <h3 id="v3r-rev-retenu" className={styles.eyebrow}>Ce que j’ai retenu</h3>
    {view.rows.length > 0
      ? <RestitutionTable caption="Recettes de l’exercice par nature" columns={ROW_COLUMNS} rows={view.rows} rowKey={row => row.id} />
      : <p className={styles.panelLead}>{view.unsupportedNotice ?? "Aucun détail de recettes n’est enregistré pour l’instant."}</p>}
    {view.rows.length > 0 && view.unsupportedNotice ? <p className={styles.tableNote} role="status">{view.unsupportedNotice}</p> : null}
  </section>;
}

function TodoList({ view }: { view: KnownView }) {
  const { decisions, notes, blocking } = view.todo;
  if (decisions.length + notes.length + blocking.length === 0) {
    return <p className={styles.panelLead}>{view.support === "facts_only" ? (view.unsupportedNotice ?? "") : "Rien ne reste à régler dans les informations enregistrées."}</p>;
  }
  return <>
    {blocking.length > 0 ? <ul className={styles.findings}>{blocking.map(text => <li key={`b-${text}`}><span aria-hidden="true">!</span>{text}</li>)}</ul> : null}
    {decisions.length > 0 ? <ul className={styles.findings}>{decisions.map(text => <li key={`d-${text}`}><span aria-hidden="true">!</span>{text}</li>)}</ul> : null}
    {notes.length > 0 ? <ul className={styles.findings}>{notes.map(text => <li key={`n-${text}`}><span aria-hidden="true">·</span>{text}</li>)}</ul> : null}
  </>;
}

function PiecesSection({ view }: { view: KnownView }) {
  return view.pieces.length > 0 ? <PiecesList pieces={view.pieces} /> : <p className={styles.panelLead}>Aucun document n’est rattaché à ces informations.</p>;
}

/** Contenu du panneau « Revenus ». */
export function RealRevenueReport({ view }: { view: RevenueView }) {
  if (view.state === "scope_unresolved") return <p className={styles.panelLead} role="status">{view.message}</p>;
  return <>
    <Headline view={view} />
    <Context view={view} />
    <RowsSection view={view} />
    <Estimation view={view} />
    <section className={styles.panelSection} aria-labelledby="v3r-rev-todo">
      <h3 id="v3r-rev-todo" className={styles.eyebrow}>Ce qui reste à régler</h3>
      <TodoList view={view} />
    </section>
    <section className={styles.panelSection} aria-labelledby="v3r-rev-docs">
      <h3 id="v3r-rev-docs" className={styles.eyebrow}>Documents utilisés</h3>
      <PiecesSection view={view} />
    </section>
    <footer className={styles.drawerActions}>
      <RevenueReviewLink action={view.action} variant="primary" />
    </footer>
  </>;
}

/** Espace de travail Revenus (lecture) : ce que j'ai retenu, ce qui reste à régler, mes documents. */
export function RealRevenueWorkspace({ view, back }: { view: RevenueView; back: ReactNode }) {
  return <>
    <nav className={styles.breadcrumb} aria-label="Fil d’Ariane">{back}</nav>
    <header className={styles.pageHead}>
      <p className={styles.eyebrow}>Espace de travail</p>
      <h1>Revenus</h1>
      <p className={styles.lead}>{view.state === "known" ? view.summary : view.message}</p>
    </header>
    {view.state === "known" ? <>
      <div className={styles.workspace}>
        <section className={styles.zone} aria-labelledby="v3r-rev-ws-known">
          <h2 id="v3r-rev-ws-known" className={styles.zoneTitle}>Ce que j’ai retenu</h2>
          <Headline view={view} />
          <Context view={view} />
          <RowsSection view={view} />
          <Estimation view={view} />
        </section>
        <section className={styles.zone} aria-labelledby="v3r-rev-ws-todo">
          <h2 id="v3r-rev-ws-todo" className={styles.zoneTitle}>Ce qui reste à régler</h2>
          <TodoList view={view} />
        </section>
        <section className={styles.zone} aria-labelledby="v3r-rev-ws-docs">
          <h2 id="v3r-rev-ws-docs" className={styles.zoneTitle}>Documents utilisés</h2>
          <PiecesSection view={view} />
        </section>
      </div>
      <div className={styles.workspaceFooter}><RevenueReviewLink action={view.action} variant="primary" /></div>
    </> : null}
  </>;
}
