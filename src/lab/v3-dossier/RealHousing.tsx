"use client";

/**
 * R15.5 — Logement réel : panneau et espace de travail, alimentés UNIQUEMENT par `HousingView` (donnée F010 réelle,
 * attribuée à UN bien). Aucune importation de fixture, de démo ni de lecture simulée. Pas de correction inline : la seule
 * action est le lien vers l'Assistant Logement déjà scopé, sous la coque V3 ; sans scope résolu, aucun lien.
 */
import type { ReactNode } from "react";
import type { HousingAction, HousingFactView, HousingView } from "./housing-view-model";
import { PiecesList, RestitutionTable, StatusMark, type Column } from "./restitution";
import styles from "./prototype.module.css";

type KnownView = Extract<HousingView, { state: "known" }>;

const FACT_COLUMNS: Column<HousingFactView>[] = [
  { key: "label", label: "Information", render: row => row.label },
  { key: "value", label: "Valeur", render: row => <strong>{row.value}</strong> },
  { key: "source", label: "Source", render: row => <span>{row.source?.label ?? "—"}</span> },
  { key: "state", label: "État", render: row => <StatusMark tone={row.tone} label={row.stateLabel} showLabel /> },
];

export function HousingReviewLink({ action, variant = "secondary" }: { action: HousingAction | null; variant?: "primary" | "secondary" }) {
  if (!action) return <p className={styles.tableNote} role="status">Le lien vers l’Assistant Logement n’est pas disponible tant que le logement, le dossier et l’exercice ne sont pas vérifiés.</p>;
  return <a className={variant === "primary" ? styles.primaryButton : styles.secondaryButton} href={action.href}>{action.label}</a>;
}

function Unresolved({ view }: { view: Extract<HousingView, { state: "scope_unresolved" }> }) {
  return <p className={styles.panelLead} role="status">{view.message}</p>;
}

function FactsSection({ view }: { view: KnownView }) {
  return <section className={styles.panelSection} aria-labelledby="v3r-log-retenu">
    <h3 id="v3r-log-retenu" className={styles.eyebrow}>Ce que j’ai retenu</h3>
    {view.facts.length > 0
      ? <RestitutionTable caption="Informations du logement" columns={FACT_COLUMNS} rows={view.facts} rowKey={row => row.id} />
      : <p className={styles.panelLead}>Aucune information de logement n’est enregistrée pour l’instant.</p>}
    {view.unsupportedNotice ? <p className={styles.tableNote} role="status">{view.unsupportedNotice}</p> : null}
  </section>;
}

function EntryLine({ view }: { view: KnownView }) {
  if (!view.entry) return null; // undetermined: the whole line and its explanation are hidden
  return <>
    <p className={styles.tableNote}>Situation d’entrée : <strong>{view.entry.label}</strong></p>
    {view.entry.notes.map(note => <p key={note} className={styles.tableNote}>{note}</p>)}
  </>;
}

function TodoList({ view }: { view: KnownView }) {
  const { questions, toConfirm, decisions, notes } = view.todo;
  if (view.support === "facts_only") return <p className={styles.panelLead}>{view.unsupportedNotice}</p>;
  if (questions.length + toConfirm.length + decisions.length + notes.length === 0) {
    return <p className={styles.panelLead}>Rien ne reste à régler dans les informations enregistrées.</p>;
  }
  return <>
    {decisions.length > 0 ? <ul className={styles.findings}>{decisions.map(text => <li key={text}><span aria-hidden="true">!</span>{text}</li>)}</ul> : null}
    {toConfirm.length > 0 ? <ul className={styles.findings}>{toConfirm.map(text => <li key={`c-${text}`}><span aria-hidden="true">!</span>{text} · à confirmer</li>)}</ul> : null}
    {questions.length > 0 ? <ul className={styles.findings}>{questions.map(text => <li key={`q-${text}`}><span aria-hidden="true">·</span>{text}</li>)}</ul> : null}
    {notes.length > 0 ? <ul className={styles.findings}>{notes.map(text => <li key={text}><span aria-hidden="true">·</span>{text}</li>)}</ul> : null}
  </>;
}

function PiecesSection({ view }: { view: KnownView }) {
  return view.pieces.length > 0 ? <PiecesList pieces={view.pieces} /> : <p className={styles.panelLead}>Aucun document n’est rattaché à ces informations.</p>;
}

function ComputedList({ view }: { view: KnownView }) {
  if (view.computed.length === 0) return null;
  return <dl className={styles.calcDetail}>
    {view.computed.map(line => <div key={line.label}><dt>{line.label}</dt><dd>{line.value}</dd></div>)}
  </dl>;
}

/** Contenu du panneau « Logement ». */
export function RealHousingReport({ view }: { view: HousingView }) {
  if (view.state === "scope_unresolved") return <Unresolved view={view} />;
  return <>
    <section className={styles.headline} aria-label="Ce que ça donne">
      <p className={styles.eyebrow}>Ce que ça donne</p>
      <p className={styles.panelLead}>{view.title}{view.address ? ` · ${view.address}` : ""}</p>
      <p className={styles.panelLead}>{view.summary}</p>
      <ComputedList view={view} />
      <EntryLine view={view} />
    </section>
    <FactsSection view={view} />
    <section className={styles.panelSection} aria-labelledby="v3r-log-todo">
      <h3 id="v3r-log-todo" className={styles.eyebrow}>Ce qui reste à régler</h3>
      <TodoList view={view} />
    </section>
    <section className={styles.panelSection} aria-labelledby="v3r-log-docs">
      <h3 id="v3r-log-docs" className={styles.eyebrow}>Documents utilisés</h3>
      <PiecesSection view={view} />
    </section>
    <footer className={styles.drawerActions}>
      <HousingReviewLink action={view.action} variant="primary" />
    </footer>
  </>;
}

/** Espace de travail Logement (lecture) : ce que j'ai retenu, ce qui reste à régler, mes documents. */
export function RealHousingWorkspace({ view, back }: { view: HousingView; back: ReactNode }) {
  return <>
    <nav className={styles.breadcrumb} aria-label="Fil d’Ariane">{back}</nav>
    <header className={styles.pageHead}>
      <p className={styles.eyebrow}>Espace de travail</p>
      <h1>Logement</h1>
      <p className={styles.lead}>{view.state === "known" ? view.summary : view.message}</p>
    </header>
    {view.state === "known" ? <>
      <div className={styles.workspace}>
        <section className={styles.zone} aria-labelledby="v3r-log-ws-known">
          <h2 id="v3r-log-ws-known" className={styles.zoneTitle}>Ce que j’ai retenu</h2>
          {view.facts.length > 0
            ? <RestitutionTable caption="Informations du logement" columns={FACT_COLUMNS} rows={view.facts} rowKey={row => row.id} />
            : <p className={styles.panelLead}>Rien d’enregistré pour l’instant.</p>}
          <ComputedList view={view} />
          <EntryLine view={view} />
          {view.unsupportedNotice ? <p className={styles.tableNote} role="status">{view.unsupportedNotice}</p> : null}
        </section>
        <section className={styles.zone} aria-labelledby="v3r-log-ws-todo">
          <h2 id="v3r-log-ws-todo" className={styles.zoneTitle}>Ce qui reste à régler</h2>
          <TodoList view={view} />
        </section>
        <section className={styles.zone} aria-labelledby="v3r-log-ws-docs">
          <h2 id="v3r-log-ws-docs" className={styles.zoneTitle}>Documents utilisés</h2>
          <PiecesSection view={view} />
        </section>
      </div>
      <div className={styles.workspaceFooter}><HousingReviewLink action={view.action} variant="primary" /></div>
    </> : null}
  </>;
}
