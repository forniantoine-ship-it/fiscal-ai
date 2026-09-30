"use client";

/**
 * R15.7 — Charges réelles : panneau et espace de travail, alimentés UNIQUEMENT par `ChargesView` (donnée F012 réelle,
 * attribuée à UN bien). Aucune importation de fixture, de démo ni de lecture simulée. Pas de correction inline : la seule
 * action est le lien vers l'Assistant Charges déjà scopé, sous la coque V3 ; sans scope résolu, aucun lien.
 */
import type { ReactNode } from "react";
import type { ChargesAction, ChargesRowView, ChargesSecondaryView, ChargesView } from "./charges-view-model";
import { PiecesList, RestitutionTable, StatusMark, type Column } from "./restitution";
import styles from "./prototype.module.css";

type KnownView = Extract<ChargesView, { state: "known" }>;

const ROW_COLUMNS: Column<ChargesRowView>[] = [
  { key: "label", label: "Nature", render: row => <span>{row.label}</span> },
  { key: "value", label: "Montant déductible", numeric: true, render: row => <strong>{row.value}</strong> },
  { key: "source", label: "Source", render: row => <span>{row.source?.label ?? "—"}</span> },
  { key: "state", label: "État", render: row => <StatusMark tone={row.tone} label={row.stateLabel} showLabel /> },
];

export function ChargesReviewLink({ action, variant = "secondary" }: { action: ChargesAction | null; variant?: "primary" | "secondary" }) {
  if (!action) return <p className={styles.tableNote} role="status">Le lien vers l’Assistant Charges n’est pas disponible tant que le logement, le dossier et l’exercice ne sont pas vérifiés.</p>;
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

function Secondary({ block }: { block: ChargesSecondaryView }) {
  return <section className={styles.panelSection} aria-label={block.title} data-secondary={block.id}>
    <h3 className={styles.eyebrow}>{block.title}</h3>
    <p className={styles.panelLead}><strong>{block.amount}</strong></p>
    {block.lines.length > 0
      ? <dl className={styles.calcDetail}>{block.lines.map(line => <div key={`${line.label}-${line.value}`}><dt>{line.label}</dt><dd>{line.value}</dd></div>)}</dl>
      : null}
    <p className={styles.tableNote}>{block.note}</p>
  </section>;
}

function RowsSection({ view }: { view: KnownView }) {
  return <section className={styles.panelSection} aria-labelledby="v3r-chg-retenu">
    <h3 id="v3r-chg-retenu" className={styles.eyebrow}>Ce que j’ai retenu</h3>
    {view.rows.length > 0
      ? <RestitutionTable caption="Charges déductibles de l’exercice par nature" columns={ROW_COLUMNS} rows={view.rows} rowKey={row => row.id} />
      : <p className={styles.panelLead}>{view.unsupportedNotice ?? "Aucun détail par nature n’est enregistré pour l’instant."}</p>}
    {view.rows.length > 0 && view.unsupportedNotice ? <p className={styles.tableNote} role="status">{view.unsupportedNotice}</p> : null}
    {view.coverageNotes.map(note => <p key={note} className={styles.tableNote}>{note}</p>)}
    {view.notRetained.length > 0 ? <>
      <h4 className={styles.eyebrow}>Non retenu</h4>
      <dl className={styles.calcDetail}>{view.notRetained.map(item => <div key={`${item.label}-${item.value}`}><dt>{item.label}<small>{item.reason}</small></dt><dd>{item.value}</dd></div>)}</dl>
    </> : null}
  </section>;
}

function TodoList({ view }: { view: KnownView }) {
  const { decisions, notes } = view.todo;
  if (decisions.length + notes.length === 0) {
    return <p className={styles.panelLead}>{view.support === "facts_only" ? (view.unsupportedNotice ?? "") : "Rien ne reste à régler dans les informations enregistrées."}</p>;
  }
  return <>
    {decisions.length > 0 ? <ul className={styles.findings}>{decisions.map(text => <li key={`d-${text}`}><span aria-hidden="true">!</span>{text}</li>)}</ul> : null}
    {notes.length > 0 ? <ul className={styles.findings}>{notes.map(text => <li key={`n-${text}`}><span aria-hidden="true">·</span>{text}</li>)}</ul> : null}
  </>;
}

function PiecesSection({ view }: { view: KnownView }) {
  return view.pieces.length > 0 ? <PiecesList pieces={view.pieces} /> : <p className={styles.panelLead}>Aucun document n’est rattaché à ces informations.</p>;
}

/** Contenu du panneau « Charges ». */
export function RealChargesReport({ view }: { view: ChargesView }) {
  if (view.state === "scope_unresolved") return <p className={styles.panelLead} role="status">{view.message}</p>;
  return <>
    <Headline view={view} />
    <Context view={view} />
    <RowsSection view={view} />
    {view.secondary.map(block => <Secondary key={block.id} block={block} />)}
    <section className={styles.panelSection} aria-labelledby="v3r-chg-todo">
      <h3 id="v3r-chg-todo" className={styles.eyebrow}>Ce qui reste à régler</h3>
      <TodoList view={view} />
    </section>
    <section className={styles.panelSection} aria-labelledby="v3r-chg-docs">
      <h3 id="v3r-chg-docs" className={styles.eyebrow}>Documents utilisés</h3>
      <PiecesSection view={view} />
    </section>
    <footer className={styles.drawerActions}>
      <ChargesReviewLink action={view.action} variant="primary" />
    </footer>
  </>;
}

/** Espace de travail Charges (lecture) : ce que j'ai retenu, ce qui reste à régler, mes documents. */
export function RealChargesWorkspace({ view, back }: { view: ChargesView; back: ReactNode }) {
  return <>
    <nav className={styles.breadcrumb} aria-label="Fil d’Ariane">{back}</nav>
    <header className={styles.pageHead}>
      <p className={styles.eyebrow}>Espace de travail</p>
      <h1>Charges</h1>
      <p className={styles.lead}>{view.state === "known" ? view.summary : view.message}</p>
    </header>
    {view.state === "known" ? <>
      <div className={styles.workspace}>
        <section className={styles.zone} aria-labelledby="v3r-chg-ws-known">
          <h2 id="v3r-chg-ws-known" className={styles.zoneTitle}>Ce que j’ai retenu</h2>
          <Headline view={view} />
          <Context view={view} />
          <RowsSection view={view} />
          {view.secondary.map(block => <Secondary key={block.id} block={block} />)}
        </section>
        <section className={styles.zone} aria-labelledby="v3r-chg-ws-todo">
          <h2 id="v3r-chg-ws-todo" className={styles.zoneTitle}>Ce qui reste à régler</h2>
          <TodoList view={view} />
        </section>
        <section className={styles.zone} aria-labelledby="v3r-chg-ws-docs">
          <h2 id="v3r-chg-ws-docs" className={styles.zoneTitle}>Documents utilisés</h2>
          <PiecesSection view={view} />
        </section>
      </div>
      <div className={styles.workspaceFooter}><ChargesReviewLink action={view.action} variant="primary" /></div>
    </> : null}
  </>;
}
