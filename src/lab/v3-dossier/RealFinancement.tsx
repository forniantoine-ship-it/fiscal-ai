"use client";

/**
 * R15 — Financement réel : panneau et espace de travail, alimentés UNIQUEMENT par `FinancingView` (donnée réelle).
 * Aucune importation de fixture, de démo ni de lecture simulée. Pas de correction inline : la seule action est le lien
 * vers le chemin propriétaire F011 déjà scopé.
 */
import type { ReactNode } from "react";
import type { FinancingAction, FinancingView, LoanFactView, LoanView } from "./financing-view-model";
import { PiecesList, RestitutionTable, ResultHeadline, SourceLink, StatusMark, type Column } from "./restitution";
import styles from "./prototype.module.css";

const NOT_PROVIDED = "Non renseigné";

const FACT_COLUMNS: Column<LoanFactView>[] = [
  { key: "label", label: "Information", render: row => row.label },
  { key: "value", label: "Valeur", numeric: true, render: row => row.value === null ? <span>{NOT_PROVIDED}</span> : <strong>{row.value}</strong> },
  {
    key: "source", label: "Source",
    render: row => row.origin?.document ? <SourceLink source={{ document: row.origin.document }} /> : <span>{row.origin ? "—" : "Provenance indisponible"}</span>,
  },
  { key: "state", label: "État", render: row => row.origin ? <StatusMark tone={row.origin.tone} label={row.origin.label} showLabel /> : <span>—</span> },
];

export function ReviewLink({ action, variant = "secondary" }: { action: FinancingAction | null; variant?: "primary" | "secondary" }) {
  if (!action) return <p className={styles.tableNote} role="status">Le lien vers l’Assistant Financement n’est pas disponible tant que le dossier et l’exercice ne sont pas vérifiés.</p>;
  return <a className={variant === "primary" ? styles.primaryButton : styles.secondaryButton} href={action.href}>{action.label}</a>;
}

function LoanBlock({ loan, showExercise }: { loan: LoanView; showExercise: boolean }) {
  return <section className={styles.panelSection} aria-label={loan.label}>
    <h3 className={styles.eyebrow}>{loan.label}</h3>
    {loan.attention.length > 0 ? <ul className={styles.findings}>{loan.attention.map(text => <li key={text}><span aria-hidden="true">!</span>{text}</li>)}</ul> : null}
    <RestitutionTable caption={`Informations retenues pour ${loan.label}`} columns={FACT_COLUMNS} rows={loan.facts} rowKey={row => row.id} />
    {showExercise && loan.exercise.length > 0 ? <dl className={styles.calcDetail}>
      {loan.exercise.map(line => <div key={line.label}><dt>{line.label}</dt><dd>{line.value}</dd></div>)}
    </dl> : null}
  </section>;
}

function ScheduleSection({ view }: { view: FinancingView }) {
  const schedule = view.schedule;
  return <section className={styles.panelSection} aria-labelledby="v3r-mensuel">
    <h3 id="v3r-mensuel" className={styles.eyebrow}>Détail mois par mois</h3>
    {schedule.kind === "table"
      ? <RestitutionTable
        caption={schedule.caption}
        rows={schedule.rows}
        rowKey={row => row.key}
        columns={[
          { key: "month", label: "Mois", render: row => row.month },
          { key: "mensualite", label: "Mensualité", numeric: true, render: row => row.mensualite },
          { key: "interets", label: "Intérêts", numeric: true, render: row => row.interets },
          { key: "assurance", label: "Assurance", numeric: true, render: row => row.assurance },
          { key: "capital", label: "Capital", numeric: true, render: row => row.capital },
        ]}
      />
      : <p className={styles.panelLead}>{schedule.message}</p>}
  </section>;
}

function StateNotice({ view, children }: { view: FinancingView; children?: ReactNode }) {
  if (view.state === "unsupported") return <p className={styles.panelLead}>Ce dossier concerne plusieurs biens : le financement n’est pas présenté ici.</p>;
  if (view.state === "none") return <>
    <p className={styles.panelLead}>Vous avez déclaré ne pas avoir de prêt pour ce logement.</p>
    {children}
  </>;
  return <>
    <p className={styles.panelLead}>Aucun financement n’est enregistré pour ce dossier.</p>
    {children}
  </>;
}

/** Contenu du panneau « Financement ». */
export function RealFinancementReport({ view }: { view: FinancingView }) {
  if (view.state !== "known") {
    return <StateNotice view={view}>{view.state === "unsupported" ? null : <ReviewLink action={view.action} variant="primary" />}</StateNotice>;
  }
  return <>
    {view.headline
      ? <>
        <ResultHeadline amount={view.headline.amount} caption={view.headline.caption} breakdown={view.headline.breakdown} />
        {view.headline.note ? <p className={styles.tableNote}>{view.headline.note}</p> : null}
      </>
      : <p className={styles.panelLead}>Le résultat de financement de l’exercice {view.year} n’est pas encore disponible pour ce dossier.</p>}
    {view.loans.map(loan => <LoanBlock key={loan.id} loan={loan} showExercise />)}
    <ScheduleSection view={view} />
    <section className={styles.panelSection} aria-labelledby="v3r-pieces">
      <h3 id="v3r-pieces" className={styles.eyebrow}>Pièces utilisées</h3>
      {view.pieces.length > 0 ? <PiecesList pieces={view.pieces} /> : <p className={styles.panelLead}>Aucune pièce n’est rattachée à ces informations.</p>}
    </section>
    <footer className={styles.drawerActions}>
      <ReviewLink action={view.action} variant="primary" />
    </footer>
  </>;
}

/** Espace de travail Financement (lecture) : ce que je sais, ce qu'il me manque, mes pièces. */
export function RealFinancementWorkspace({ view, back }: { view: FinancingView; back: ReactNode }) {
  return <>
    <nav className={styles.breadcrumb} aria-label="Fil d’Ariane">{back}</nav>
    <header className={styles.pageHead}>
      <p className={styles.eyebrow}>Espace de travail</p>
      <h1>Financement</h1>
      <p className={styles.lead}>{view.state === "known"
        ? "Voici ce que votre dossier retient pour votre financement, prêt par prêt, avec l’origine de chaque information."
        : view.state === "none" ? "Vous avez déclaré ne pas avoir de prêt pour ce logement."
          : view.state === "unsupported" ? "Ce dossier concerne plusieurs biens : le financement n’est pas présenté ici."
            : "Aucun financement n’est enregistré pour ce dossier."}</p>
    </header>
    <div className={styles.workspace}>
      <section className={styles.zone} aria-labelledby="v3r-ws-known">
        <h2 id="v3r-ws-known" className={styles.zoneTitle}>Ce que je sais</h2>
        {view.state === "known"
          ? view.loans.map(loan => <LoanBlock key={loan.id} loan={loan} showExercise />)
          : <p className={styles.panelLead}>{view.state === "none" ? "Aucun prêt · déclaré par vous." : "Rien d’enregistré pour l’instant."}</p>}
        {view.state === "known" && view.headline ? <p className={styles.tableNote}>Total : {view.headline.amount} {view.headline.caption}.</p> : null}
      </section>
      <section className={styles.zone} aria-labelledby="v3r-ws-missing">
        <h2 id="v3r-ws-missing" className={styles.zoneTitle}>Ce qu’il me manque</h2>
        {view.state === "known"
          ? (view.missing.length > 0 || view.loans.some(loan => loan.attention.length > 0))
            ? <>
              {view.missing.length > 0 ? <ul className={styles.findings}>{view.missing.map(text => <li key={text}><span aria-hidden="true">·</span>{text}</li>)}</ul> : null}
              {view.loans.flatMap(loan => loan.attention.map(text => <p key={`${loan.id}-${text}`} className={styles.panelLead}>{loan.label} · {text}</p>))}
            </>
            : <p className={styles.panelLead}>Rien ne manque dans les informations enregistrées.</p>
          : <p className={styles.panelLead}>{view.state === "none" ? "Rien : sans prêt, il n’y a pas de charge de financement." : "Les informations de financement restent à renseigner dans l’Assistant Financement."}</p>}
      </section>
      <section className={styles.zone} aria-labelledby="v3r-ws-pieces">
        <h2 id="v3r-ws-pieces" className={styles.zoneTitle}>Mes pièces</h2>
        {view.pieces.length > 0 ? <PiecesList pieces={view.pieces} /> : <p className={styles.panelLead}>Aucune pièce n’est rattachée à ces informations.</p>}
      </section>
      {view.state === "known" ? <section className={styles.zone} aria-label="Échéancier"><ScheduleSection view={view} /></section> : null}
    </div>
    <div className={styles.workspaceFooter}>
      {view.state === "unsupported" ? null : <ReviewLink action={view.action} variant="primary" />}
    </div>
  </>;
}
