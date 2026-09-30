"use client";

/**
 * R15.8 — Amortissements réels : panneau et espace de travail, alimentés UNIQUEMENT par `AmortizationView` (plan F014
 * réel, attribué à UN bien). Aucune importation de fixture, de démo ni de lecture simulée. Pas de correction inline : la
 * seule action est le lien vers l'Assistant Amortissements déjà scopé, sous la coque V3 ; sans scope résolu, aucun lien.
 */
import type { ReactNode } from "react";
import type { AmortizationAction, AmortizationRowView, AmortizationView } from "./amortization-view-model";
import { RestitutionTable, StatusMark, type Column } from "./restitution";
import styles from "./prototype.module.css";

type KnownView = Extract<AmortizationView, { state: "known" }>;

function columnsFor(year: number): Column<AmortizationRowView>[] {
  return [
    { key: "label", label: "Élément", render: row => <span>{row.label}{row.note ? <small> · {row.note}</small> : null}</span> },
    { key: "base", label: "Base amortissable", numeric: true, render: row => <span>{row.base}</span> },
    { key: "duration", label: "Durée", numeric: true, render: row => <span>{row.duration}</span> },
    { key: "dotation", label: `Dotation ${year}`, numeric: true, render: row => <strong>{row.dotation}</strong> },
    { key: "source", label: "Source", render: row => <span>{row.source?.label ?? "—"}</span> },
    { key: "state", label: "État", render: row => <StatusMark tone={row.tone} label={row.stateLabel} showLabel /> },
  ];
}

export function AmortizationReviewLink({ action, variant = "secondary" }: { action: AmortizationAction | null; variant?: "primary" | "secondary" }) {
  if (!action) return <p className={styles.tableNote} role="status">Le lien vers l’Assistant Amortissements n’est pas disponible tant que le logement, le dossier et l’exercice ne sont pas vérifiés.</p>;
  return <a className={variant === "primary" ? styles.primaryButton : styles.secondaryButton} href={action.href}>{action.label}</a>;
}

function Headline({ view }: { view: KnownView }) {
  if (!view.headline) return <p className={styles.panelLead}>{view.summary}</p>;
  return <section className={styles.headline} aria-label="Ce que ça donne">
    <p className={styles.eyebrow}>{view.headline.title}</p>
    {view.headline.value !== null ? <p className={styles.headlineAmount}>{view.headline.value}</p> : null}
    <p className={styles.headlineCaption}>{view.headline.caption}</p>
    <p className={styles.tableNote}><strong>{view.headline.stateLabel}</strong></p>
    {view.headline.fiscalNote ? <p className={styles.tableNote}>{view.headline.fiscalNote}</p> : null}
    {view.headline.kind === "takeover" ? null : <p className={styles.panelLead}>{view.summary}</p>}
  </section>;
}

function Context({ view }: { view: KnownView }) {
  return <>
    {view.serviceDateLine ? <p className={styles.tableNote}>{view.serviceDateLine}</p> : null}
    {view.profile ? <p className={styles.tableNote}>Profil du plan : {view.profile}</p> : null}
    {view.takeoverFacts.map(fact => <p key={fact} className={styles.tableNote}>{fact}</p>)}
  </>;
}

function RowsSection({ view }: { view: KnownView }) {
  return <section className={styles.panelSection} aria-labelledby="v3r-amo-retenu">
    <h3 id="v3r-amo-retenu" className={styles.eyebrow}>Ce que j’ai retenu</h3>
    {view.rows.length > 0
      ? <RestitutionTable caption="Éléments amortis sur l’exercice" columns={columnsFor(view.year)} rows={view.rows} rowKey={row => row.id} />
      : <p className={styles.panelLead}>{view.unsupportedNotice ?? (view.headline?.kind === "takeover" ? "Le détail des amortissements repris n’est pas présenté ici." : "Le détail du plan n’est pas présenté pour l’instant.")}</p>}
    {view.land ? <dl className={styles.calcDetail}><div><dt>{view.land.label}<small>{view.land.note}</small></dt><dd>{view.land.value}</dd></div></dl> : null}
  </section>;
}

function TodoList({ view }: { view: KnownView }) {
  const { decisions, notes } = view.todo;
  if (decisions.length + notes.length === 0) {
    if (view.headline?.kind === "takeover") return <p className={styles.panelLead}>Aucune action n’est proposée ici pour les amortissements repris.</p>;
    return <p className={styles.panelLead}>{view.support === "facts_only" ? (view.unsupportedNotice ?? "") : "Rien ne reste à régler dans les informations enregistrées."}</p>;
  }
  return <>
    {decisions.length > 0 ? <ul className={styles.findings}>{decisions.map(text => <li key={`d-${text}`}><span aria-hidden="true">!</span>{text}</li>)}</ul> : null}
    {notes.length > 0 ? <ul className={styles.findings}>{notes.map(text => <li key={`n-${text}`}><span aria-hidden="true">·</span>{text}</li>)}</ul> : null}
  </>;
}

/** Contenu du panneau « Amortissements ». */
export function RealAmortizationReport({ view }: { view: AmortizationView }) {
  if (view.state === "scope_unresolved") return <p className={styles.panelLead} role="status">{view.message}</p>;
  return <>
    <Headline view={view} />
    <Context view={view} />
    <RowsSection view={view} />
    <section className={styles.panelSection} aria-labelledby="v3r-amo-todo">
      <h3 id="v3r-amo-todo" className={styles.eyebrow}>Ce qui reste à régler</h3>
      <TodoList view={view} />
    </section>
    <section className={styles.panelSection} aria-labelledby="v3r-amo-docs">
      <h3 id="v3r-amo-docs" className={styles.eyebrow}>Documents utilisés</h3>
      <p className={styles.panelLead}>{view.documentsNote}</p>
    </section>
    <footer className={styles.drawerActions}>
      <AmortizationReviewLink action={view.action} variant="primary" />
    </footer>
  </>;
}

/** Espace de travail Amortissements (lecture) : ce que j'ai retenu, ce qui reste à régler, mes documents. */
export function RealAmortizationWorkspace({ view, back }: { view: AmortizationView; back: ReactNode }) {
  return <>
    <nav className={styles.breadcrumb} aria-label="Fil d’Ariane">{back}</nav>
    <header className={styles.pageHead}>
      <p className={styles.eyebrow}>Espace de travail</p>
      <h1>Amortissements</h1>
      <p className={styles.lead}>{view.state === "known" ? view.summary : view.message}</p>
    </header>
    {view.state === "known" ? <>
      <div className={styles.workspace}>
        <section className={styles.zone} aria-labelledby="v3r-amo-ws-known">
          <h2 id="v3r-amo-ws-known" className={styles.zoneTitle}>Ce que j’ai retenu</h2>
          <Headline view={view} />
          <Context view={view} />
          <RowsSection view={view} />
        </section>
        <section className={styles.zone} aria-labelledby="v3r-amo-ws-todo">
          <h2 id="v3r-amo-ws-todo" className={styles.zoneTitle}>Ce qui reste à régler</h2>
          <TodoList view={view} />
        </section>
        <section className={styles.zone} aria-labelledby="v3r-amo-ws-docs">
          <h2 id="v3r-amo-ws-docs" className={styles.zoneTitle}>Documents utilisés</h2>
          <p className={styles.panelLead}>{view.documentsNote}</p>
        </section>
      </div>
      <div className={styles.workspaceFooter}><AmortizationReviewLink action={view.action} variant="primary" /></div>
    </> : null}
  </>;
}
