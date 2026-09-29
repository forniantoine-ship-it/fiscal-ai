"use client";

import { useEffect, useReducer, useRef, useState, type Dispatch, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import {
  DEMO, DOCUMENTS, DOMAIN_LABELS, DOMAIN_ORDER, INITIAL_SCHEDULE, LOAN_AMENDMENT, LOAN_FACTS, LOAN_OFFER, LOAN_SCHEDULE,
  MONTHLY_SCHEDULE, RESTITUTION_SHAPES, type DomainId, type LoanFact, type LoanFieldId, type MonthRow, type SourceRef,
} from "./fixtures";
import {
  chargesDeductibles, documentsAnalysed, domainStatus, illustrativeResult, initialState, interventionPosition, loanStatus,
  pendingInterventions, reduceLab, type InterventionId, type LabAction, type LabState, type Scenario, type View,
} from "./model";
import {
  DocumentReading, Findings, PiecesList, RestitutionShape, RestitutionTable, ResultHeadline, SourceLink, StatusMark, money,
  type Column, type Piece,
} from "./restitution";
import styles from "./prototype.module.css";

type Props = { state: LabState; dispatch: Dispatch<LabAction> };

const dateLabel = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

const INTERVENTION_DOMAIN: Record<InterventionId, DomainId> = {
  "logement-date": "logement",
  "financement-docs": "financement",
  "charges-taxe": "charges",
};

/* ====================== Interventions (une décision) ====================== */

function DateQuestion({ dispatch }: { dispatch: Dispatch<LabAction> }) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft) { setError("Indiquez une date pour continuer."); return; }
    dispatch({ type: "answer-date", value: draft });
  }
  return <form className={styles.intervention} onSubmit={submit}>
    <label htmlFor="v3-available-date" className={styles.question}>À quelle date le logement était-il disponible à la location ?</label>
    <div className={styles.formLine}>
      <input id="v3-available-date" type="date" value={draft} min="2025-09-15" max="2026-12-31" onChange={event => { setDraft(event.target.value); setError(""); }} />
      <button type="submit" className={styles.primaryButton}>Continuer</button>
    </div>
    {error ? <p role="alert" className={styles.formError}>{error}</p> : null}
    <details className={styles.why}><summary>Pourquoi cette date ?</summary><p>L’acte donne la date d’achat, pas celle à partir de laquelle le logement pouvait être loué. Vous êtes la seule personne à la connaître.</p></details>
  </form>;
}

function TaxChoice({ dispatch }: { dispatch: Dispatch<LabAction> }) {
  const options: Array<{ value: number; source: SourceRef }> = [
    { value: DEMO.taxeFonciere.avis, source: { document: "Avis de taxe foncière 2026.pdf", detail: "page 1 · montant à payer" } },
    { value: DEMO.taxeFonciere.releve, source: { document: "Relevé de gestion 2026.pdf", detail: "ligne « taxe foncière » · octobre 2026" } },
  ];
  return <div className={styles.intervention}>
    <p className={styles.question}>Deux pièces donnent deux montants de taxe foncière. Lequel dois-je retenir ?</p>
    <div className={styles.choices}>{options.map(option => <div key={option.value} className={styles.choice}>
      <strong>{money(option.value)}</strong>
      <SourceLink source={option.source} prefix />
      <button type="button" className={styles.secondaryButton} onClick={() => dispatch({ type: "answer-tax", value: option.value })}>Retenir {money(option.value)}</button>
    </div>)}</div>
    <details className={styles.why}><summary>Pourquoi vous demander ?</summary><p>L’avis indique ce qui était dû, le relevé ce que l’agence a payé. Je ne tranche pas seul une différence entre deux documents.</p></details>
  </div>;
}

/** Demande de pièces de prêt : document d’abord, lecture sur place, sans changer de vue. */
function LoanDocumentsRequest({ state, dispatch }: Props) {
  if (state.loanDocuments === "reading") {
    return <DocumentReading files={[LOAN_OFFER, LOAN_SCHEDULE]} onComplete={() => dispatch({ type: "loan-reading", reading: "done" })} />;
  }
  return <div className={styles.intervention}>
    <p className={styles.question}>Votre acte mentionne un prêt. Ajoutez l’offre de prêt et l’échéancier : je retrouverai le capital, le taux, la durée et vos intérêts {DEMO.year}.</p>
    <div className={styles.documentFirst}>
      <button type="button" className={styles.primaryButton} onClick={() => dispatch({ type: "loan-reading", reading: "reading" })}>Ajouter mes documents de prêt</button>
      <div className={styles.secondaryLinks}>
        <button type="button" className={styles.textButton} onClick={() => dispatch({ type: "open-workspace", focus: "manquant" })}>Renseigner manuellement</button>
        <button type="button" className={styles.textButton} onClick={() => dispatch({ type: "loan-none", none: true })}>Je n’ai pas de prêt pour ce logement</button>
      </div>
    </div>
    <p className={styles.labNote}>Simulation : aucun fichier n’est demandé ni lu.</p>
  </div>;
}

function InterventionBody({ id, state, dispatch }: Props & { id: InterventionId }) {
  if (id === "logement-date") return <DateQuestion dispatch={dispatch} />;
  if (id === "charges-taxe") return <TaxChoice dispatch={dispatch} />;
  return <LoanDocumentsRequest state={state} dispatch={dispatch} />;
}

function NeedYouCard({ state, dispatch }: Props) {
  const pending = pendingInterventions(state);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const current = pending[0];
  const resolution = state.resolution;

  useEffect(() => {
    if (!resolution || resolution.findings) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => dispatch({ type: "settle" }), reduced ? 400 : 1600);
    return () => window.clearTimeout(timer);
  }, [resolution, dispatch]);

  useEffect(() => {
    if (!resolution) headingRef.current?.focus({ preventScroll: true });
  }, [resolution, current]);

  if (resolution) {
    const remaining = pending.length;
    return <section className={`${styles.needCard} ${styles.needCardResolved}`} role="status" aria-live="polite">
      <div className={styles.resolved}>
        <span className={styles.resolvedMark} aria-hidden="true">✓</span>
        <div>
          <p className={styles.eyebrow}>C’est réglé</p>
          <h2>{resolution.message}</h2>
          {resolution.findings ? <Findings items={resolution.findings} /> : null}
          <p className={styles.resolvedNext}>{remaining === 0 ? "Plus rien ne m’attend de votre part." : `Il reste ${remaining} information${remaining > 1 ? "s" : ""}.`}</p>
          {resolution.findings ? <div className={styles.actionsRow}>
            <button type="button" className={styles.primaryButton} onClick={() => { dispatch({ type: "settle" }); dispatch({ type: "open-domain", id: "financement" }); }}>Voir ce que j’ai retenu</button>
            <button type="button" className={styles.textButton} onClick={() => dispatch({ type: "settle" })}>Continuer</button>
          </div> : null}
        </div>
      </div>
    </section>;
  }

  if (!current) {
    return <section className={`${styles.needCard} ${styles.needCardDone}`}>
      <p className={styles.eyebrow}>Votre dossier</p>
      <h2 ref={headingRef} tabIndex={-1}>Plus rien ne m’attend de votre part.</h2>
      <p>Toutes les informations utiles sont réunies. Vous pouvez vérifier chaque rubrique à votre rythme.</p>
    </section>;
  }

  const position = interventionPosition(state);
  const domain = INTERVENTION_DOMAIN[current];
  return <section className={styles.needCard} aria-labelledby="v3-need-title">
    <div className={styles.needTop}>
      <p className={styles.eyebrow}>J’ai besoin de vous</p>
      <span className={styles.needCount}>{position.index} sur {position.total}</span>
    </div>
    <p className={styles.needDomain}>{DOMAIN_LABELS[domain]}</p>
    <h2 id="v3-need-title" ref={headingRef} tabIndex={-1} className={styles.srOnly}>Intervention {DOMAIN_LABELS[domain]}</h2>
    <InterventionBody id={current} state={state} dispatch={dispatch} />
  </section>;
}

/* ============================ Mon dossier ============================ */

function domainFigures(state: LabState, id: DomainId): string[] {
  const status = loanStatus(state);
  switch (id) {
    case "activite": return ["LMNP au réel", `Exercice ${DEMO.year}`];
    case "logement": return ["1 bien", `Acquis ${money(DEMO.acquisition)}`];
    case "financement":
      if (status === "none") return ["Aucun prêt", "déclaré par vous"];
      if (status === "missing") return ["En attente", "de vos documents de prêt"];
      return [`${money(DEMO.financement.total)} déductibles`, `dont ${money(DEMO.financement.interets)} d’intérêts`];
    case "revenus": return [money(DEMO.recettes), "de recettes locatives"];
    case "charges": return [`${money(chargesDeductibles(state))} déductibles`, status === "known" ? `dont financement ${money(DEMO.financement.total)}` : "hors financement"];
    case "amortissements": return [`${money(DEMO.amortissements)} calculés`, `pour ${DEMO.year}`];
  }
}

function DomainGrid({ state, dispatch }: Props) {
  return <section className={styles.domains} aria-labelledby="v3-domains-title">
    <h2 id="v3-domains-title" className={styles.sectionTitle}>Votre dossier en six rubriques</h2>
    <ul className={styles.domainGrid}>{DOMAIN_ORDER.map(id => {
      const status = domainStatus(state, id);
      const [main, sub] = domainFigures(state, id);
      return <li key={id}>
        <button type="button" className={styles.domainCard} onClick={() => dispatch({ type: "open-domain", id })} aria-haspopup="dialog">
          <span className={styles.domainName}>{DOMAIN_LABELS[id]}</span>
          <span className={`${styles.domainStatus} ${status.tone === "ok" ? styles.toneOk : styles.toneAttention}`}><span aria-hidden="true">{status.tone === "ok" ? "✓" : "!"}</span> {status.label}</span>
          <span className={styles.domainMain}>{main}</span>
          <span className={styles.domainSub}>{sub}</span>
          <span className={styles.domainChevron} aria-hidden="true">›</span>
        </button>
      </li>;
    })}</ul>
  </section>;
}

function ResultSummary({ state }: { state: LabState }) {
  const [open, setOpen] = useState(false);
  const result = illustrativeResult(state);
  const status = loanStatus(state);
  const taxe = state.taxChoice ?? DEMO.taxeFonciere.avis;
  return <section className={styles.resultCard} aria-labelledby="v3-result-title">
    <div className={styles.resultHead}>
      <h2 id="v3-result-title" className={styles.eyebrow}>Résultat fiscal estimé {DEMO.year}</h2>
      <span className={styles.labTag}>Simulation</span>
    </div>
    <div className={styles.resultEquation}>
      <div><span>Recettes locatives</span><strong>{money(result.recettes)}</strong></div>
      <span className={styles.operator} aria-hidden="true">−</span>
      <div><span>Charges déductibles</span><strong>{money(result.charges)}</strong></div>
      <span className={styles.operator} aria-hidden="true">−</span>
      <div><span>Amortissements</span><strong>{money(result.amortissements)}</strong></div>
      <span className={styles.operator} aria-hidden="true">=</span>
      <div className={styles.resultTotal}><span>Résultat fiscal LMNP</span><strong>{money(result.resultat)}</strong></div>
    </div>
    <button type="button" className={styles.textButton} aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? "Masquer le détail du calcul" : "Voir le détail du calcul"}</button>
    {open ? <dl className={styles.calcDetail}>
      <div><dt>Recettes locatives</dt><dd>{money(result.recettes)} <small>Revenus</small></dd></div>
      <div><dt>Taxe foncière{state.taxChoice === null ? " (proposée, à confirmer)" : ""}</dt><dd>{money(taxe)} <small>Charges</small></dd></div>
      <div><dt>Autres charges</dt><dd>{money(DEMO.autresCharges)} <small>Charges</small></dd></div>
      <div><dt>Charges de financement</dt><dd>{status === "known" ? money(DEMO.financement.total) : status === "none" ? "0 € · aucun prêt" : "en attente"} <small>Financement</small></dd></div>
      <div><dt>Amortissements</dt><dd>{money(result.amortissements)} <small>Amortissements</small></dd></div>
      <p className={styles.labNote}>Chiffres de démonstration. Aucun moteur fiscal n’est appelé dans ce LAB.</p>
    </dl> : null}
  </section>;
}

function DossierView({ state, dispatch }: Props) {
  const remaining = pendingInterventions(state).length;
  return <>
    <header className={styles.pageHead}>
      <p className={styles.eyebrow}>Mon dossier {DEMO.year}</p>
      <h1>{remaining > 0
        ? <>J’ai analysé {documentsAnalysed(state)} documents. Il me reste {remaining} point{remaining > 1 ? "s" : ""} à vérifier pour finaliser votre dossier.</>
        : <>J’ai analysé {documentsAnalysed(state)} documents. Votre dossier est complet.</>}</h1>
    </header>
    <NeedYouCard state={state} dispatch={dispatch} />
    <DomainGrid state={state} dispatch={dispatch} />
    <ResultSummary state={state} />
  </>;
}

/* ====================== Financement : données affichées ====================== */

type FactView = LoanFact & { tone: "ok" | "corrected"; note?: string };

function loanFacts(state: LabState): FactView[] {
  return LOAN_FACTS.map(fact => {
    const correction = fact.correctable ? state.corrections[fact.id as LoanFieldId] : undefined;
    if (!correction) return { ...fact, tone: "ok" };
    const source: SourceRef = correction.source === "amendment"
      ? { document: LOAN_AMENDMENT, detail: "page 1 · nouvelle valeur" }
      : { document: "Corrigé par vous", detail: `${fact.source.document} indiquait ${fact.value}` };
    return { ...fact, value: correction.value, source, tone: "corrected", note: `${fact.source.document} indiquait ${fact.value}` };
  });
}

function loanPieces(state: LabState): Piece[] {
  const pieces: Piece[] = [{ name: LOAN_OFFER, state: "done" }, { name: LOAN_SCHEDULE, state: "done" }];
  if (state.firstPayment?.source === "document") pieces.push({ name: INITIAL_SCHEDULE, state: "done" });
  if (Object.values(state.corrections).some(correction => correction?.source === "amendment")) pieces.push({ name: LOAN_AMENDMENT, state: "done" });
  if (state.extraPieceName && state.extraPiece !== "idle") pieces.push({ name: state.extraPieceName, state: state.extraPiece === "done" ? "done" : "reading", note: state.extraPiece === "done" ? "Aucune différence avec votre dossier" : undefined });
  return pieces;
}

const FACT_COLUMNS: Column<FactView>[] = [
  { key: "label", label: "Information", render: row => row.label },
  { key: "value", label: "Valeur", numeric: true, render: row => <strong>{row.value}</strong> },
  { key: "source", label: "Source", render: row => <SourceLink source={row.source} /> },
  { key: "state", label: "État", render: row => <StatusMark tone={row.tone} label={row.tone === "ok" ? "Retenu" : "Corrigé"} /> },
];

const sum = (key: keyof Pick<MonthRow, "mensualite" | "interets" | "assurance" | "capital" | "deductible">) => MONTHLY_SCHEDULE.reduce((total, row) => total + row[key], 0);

const MONTH_COLUMNS: Column<MonthRow>[] = [
  { key: "month", label: "Mois", render: row => row.month },
  { key: "mensualite", label: "Mensualité", numeric: true, render: row => money(row.mensualite), total: money(sum("mensualite")) },
  { key: "interets", label: "Intérêts", numeric: true, render: row => money(row.interets), total: money(sum("interets")) },
  { key: "assurance", label: "Assurance", numeric: true, render: row => money(row.assurance), total: money(sum("assurance")) },
  { key: "capital", label: "Capital", numeric: true, render: row => money(row.capital), total: money(sum("capital")) },
  { key: "deductible", label: "Déductible", numeric: true, render: row => <strong>{money(row.deductible)}</strong>, total: <strong>{money(sum("deductible"))}</strong> },
  { key: "source", label: "Source", render: row => <SourceLink source={row.source} /> },
];

/* ============================ Panneau ============================ */

function Drawer({ title, status, onClose, children }: { title: string; status: ReactNode; onClose: () => void; children: ReactNode }) {
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

function FinancementReport({ state, dispatch }: Props) {
  const [picking, setPicking] = useState(false);
  const status = loanStatus(state);
  if (status === "none") {
    return <>
      <ResultHeadline amount="0 €" caption={`de charges de financement en ${DEMO.year} : vous avez déclaré ne pas avoir de prêt pour ce logement.`} />
      <button type="button" className={styles.textButton} onClick={() => dispatch({ type: "loan-none", none: false })}>J’ai finalement un prêt</button>
    </>;
  }
  if (status === "missing") {
    return <>
      <p className={styles.panelLead}>Je n’ai pas encore de document de prêt pour ce logement.</p>
      <LoanDocumentsRequest state={state} dispatch={dispatch} />
    </>;
  }
  const facts = loanFacts(state);
  return <>
    <ResultHeadline amount={money(DEMO.financement.total)} caption={`de charges de financement déductibles en ${DEMO.year}`}
      breakdown={[{ amount: money(DEMO.financement.interets), label: "Intérêts d’emprunt" }, { amount: money(DEMO.financement.assurance), label: "Assurance emprunteur" }]} />

    <section className={styles.panelSection} aria-labelledby="v3-retenu">
      <h3 id="v3-retenu" className={styles.eyebrow}>Ce que j’ai retenu</h3>
      <RestitutionTable caption="Informations retenues pour le financement" columns={FACT_COLUMNS} rows={facts} rowKey={row => row.id} />
    </section>

    <section className={styles.panelSection} aria-labelledby="v3-mensuel">
      <button type="button" id="v3-mensuel" className={styles.disclosure} aria-expanded={state.monthlyOpen} aria-controls="v3-mensuel-table" onClick={() => dispatch({ type: "toggle-monthly" })}>
        <span>Détail mois par mois</span><small>12 échéances · {LOAN_SCHEDULE}</small><span aria-hidden="true" className={styles.disclosureMark}>{state.monthlyOpen ? "−" : "+"}</span>
      </button>
      {state.monthlyOpen ? <div id="v3-mensuel-table">
        <RestitutionTable caption={`Échéances ${DEMO.year} du prêt`} columns={MONTH_COLUMNS} rows={MONTHLY_SCHEDULE} rowKey={row => row.month} totalLabel={`Total ${DEMO.year}`} />
        <p className={styles.tableNote}>Seuls les intérêts et l’assurance sont déductibles. Le capital remboursé ne l’est jamais : c’est normal.</p>
      </div> : null}
    </section>

    <section className={styles.panelSection} aria-labelledby="v3-pieces">
      <h3 id="v3-pieces" className={styles.eyebrow}>Pièces utilisées</h3>
      <PiecesList pieces={loanPieces(state)} />
    </section>

    <footer className={styles.drawerActions}>
      {picking ? <div className={styles.picker} role="group" aria-label="Quelle information corriger ?">
        <p>Quelle information voulez-vous corriger ?</p>
        <ul>{facts.filter(fact => fact.correctable).map(fact => <li key={fact.id}>
          <button type="button" className={styles.pickerItem} onClick={() => dispatch({ type: "open-workspace", focus: fact.id as LoanFieldId })}><span>{fact.label}</span><strong>{fact.value}</strong><span aria-hidden="true">›</span></button>
        </li>)}</ul>
        <button type="button" className={styles.textButton} onClick={() => setPicking(false)}>Annuler</button>
      </div> : <>
        <button type="button" className={styles.secondaryButton} onClick={() => setPicking(true)}>Corriger une information</button>
        <button type="button" className={styles.secondaryButton} onClick={() => dispatch({ type: "open-workspace", focus: "pieces" })}>Ajouter une pièce</button>
        <button type="button" className={styles.textButton} onClick={() => dispatch({ type: "open-workspace", focus: null })}>Tout revoir</button>
      </>}
    </footer>
  </>;
}

function GenericReport({ state, dispatch, id }: Props & { id: DomainId }) {
  const [main, sub] = domainFigures(state, id);
  const pending = pendingInterventions(state).find(item => INTERVENTION_DOMAIN[item] === id);
  return <>
    <ResultHeadline amount={main} caption={sub} />
    {pending ? <section className={styles.panelSection} aria-label="Information à préciser">
      <p className={styles.eyebrow}>Une information à préciser</p>
      <InterventionBody id={pending} state={state} dispatch={dispatch} />
    </section> : null}
    {id === "logement" && state.availableDate ? <p className={styles.panelLead}>Disponible à la location depuis le {dateLabel(state.availableDate)} · précisé par vous.</p> : null}
    <section className={styles.panelSection}>
      <h3 className={styles.eyebrow}>Ce que j’ai retenu</h3>
      <RestitutionShape columns={RESTITUTION_SHAPES[id]} />
      <p className={styles.labNote}>Seul Financement est simulé en détail dans ce LAB. Les colonnes ci-dessus montrent la grammaire prévue pour {DOMAIN_LABELS[id]}.</p>
    </section>
  </>;
}

function DomainPanel({ state, dispatch }: Props) {
  const id = state.openDomain;
  if (!id) return null;
  const status = domainStatus(state, id);
  return <Drawer title={DOMAIN_LABELS[id]} onClose={() => dispatch({ type: "open-domain", id: null })}
    status={<span className={`${styles.domainStatus} ${status.tone === "ok" ? styles.toneOk : styles.toneAttention}`}><span aria-hidden="true">{status.tone === "ok" ? "✓" : "!"}</span> {status.label}</span>}>
    {id === "financement" ? <FinancementReport state={state} dispatch={dispatch} /> : <GenericReport state={state} dispatch={dispatch} id={id} />}
  </Drawer>;
}

/* ====================== Espace de travail Financement ====================== */

function FactRow({ fact, focused, dispatch }: { fact: FactView; focused: boolean; dispatch: Dispatch<LabAction> }) {
  const [mode, setMode] = useState<"view" | "edit" | "confirm" | "amendment">(focused ? "edit" : "view");
  const [draft, setDraft] = useState(fact.value);
  const [justCorrected, setJustCorrected] = useState(false);
  const rowRef = useRef<HTMLLIElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const field = fact.id as LoanFieldId;
  const original = LOAN_FACTS.find(item => item.id === fact.id)!;

  useEffect(() => {
    if (!focused) return;
    rowRef.current?.scrollIntoView({ block: "center" });
    inputRef.current?.focus();
  }, [focused]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = draft.trim();
    if (!value || value === fact.value) { setMode("view"); return; }
    setMode("confirm");
  }
  function retain(source: "manual" | "amendment") {
    dispatch({ type: "correct", field, correction: { value: draft.trim(), source } });
    setMode("view");
    setJustCorrected(true);
  }

  return <li ref={rowRef} className={`${styles.fact} ${mode !== "view" ? styles.factEditing : ""}`}>
    <div className={styles.factMain}>
      <span className={styles.factLabel}>{fact.label}</span>
      <strong className={styles.factValue}>{fact.value}</strong>
      <SourceLink source={fact.source} prefix />
      {fact.correctable && mode === "view" ? <button type="button" className={styles.smallButton} onClick={() => { setDraft(fact.value); setMode("edit"); }}>Corriger</button> : null}
      {!fact.correctable ? <span className={styles.factComputed}>Calculé</span> : null}
    </div>
    {mode === "edit" ? <form className={styles.correction} onSubmit={submit}>
      <label htmlFor={`v3-fix-${field}`}>Valeur à retenir pour « {fact.label} »</label>
      <div className={styles.formLine}>
        <input ref={inputRef} id={`v3-fix-${field}`} value={draft} onChange={event => setDraft(event.target.value)} />
        <button type="submit" className={styles.primaryButton}>Valider</button>
        <button type="button" className={styles.textButton} onClick={() => setMode("view")}>Annuler</button>
      </div>
      <p className={styles.sourceQuote}>{original.source.document} · {original.source.detail} : « {original.value} »</p>
    </form> : null}
    {mode === "confirm" ? <div className={styles.correction} role="group" aria-label="Confirmer la correction">
      <p><strong>{original.source.document} indique {original.value}.</strong> Un avenant a-t-il modifié cette information ?</p>
      <div className={styles.documentFirst}>
        <button type="button" className={styles.primaryButton} onClick={() => setMode("amendment")}>Ajouter l’avenant</button>
        <div className={styles.secondaryLinks}>
          <button type="button" className={styles.textButton} onClick={() => retain("manual")}>Retenir {draft.trim()} sans document</button>
          <button type="button" className={styles.textButton} onClick={() => setMode("view")}>Annuler</button>
        </div>
      </div>
    </div> : null}
    {mode === "amendment" ? <div className={styles.correction}><DocumentReading title="Je lis votre avenant…" files={[LOAN_AMENDMENT]} onComplete={() => retain("amendment")} /></div> : null}
    {justCorrected && fact.tone === "corrected" ? <p className={styles.impact} role="status">✓ Correction enregistrée. {fact.note}. Vos montants {DEMO.year} sont lus dans l’échéancier : ils ne changent pas.</p> : null}
  </li>;
}

function FirstPaymentMissing({ state, dispatch, focused }: Props & { focused: boolean }) {
  const [manual, setManual] = useState(false);
  const [reading, setReading] = useState(false);
  const [draft, setDraft] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (focused) ref.current?.scrollIntoView({ block: "center" }); }, [focused]);

  if (state.firstPayment) {
    return <p className={styles.impact} role="status">✓ Première mensualité : {dateLabel(state.firstPayment.value)} · {state.firstPayment.source === "document" ? `retrouvée dans ${INITIAL_SCHEDULE}` : "précisée par vous"}.</p>;
  }
  return <div ref={ref} className={styles.missingItem}>
    <p className={styles.missingTitle}>Date de première mensualité</p>
    <p>L’échéancier {DEMO.year} commence en janvier : la toute première mensualité du prêt n’y figure pas. Elle ne change pas vos montants {DEMO.year}.</p>
    {reading ? <DocumentReading files={[INITIAL_SCHEDULE]} onComplete={() => dispatch({ type: "first-payment", value: "2025-11-05", source: "document" })} />
      : <div className={styles.documentFirst}>
        <button type="button" className={styles.primaryButton} onClick={() => setReading(true)}>Ajouter mon échéancier</button>
        {!manual ? <div className={styles.secondaryLinks}><button type="button" className={styles.textButton} onClick={() => setManual(true)}>Renseigner manuellement</button></div> : null}
      </div>}
    {manual && !reading ? <form className={styles.correction} onSubmit={event => { event.preventDefault(); if (draft) dispatch({ type: "first-payment", value: draft, source: "manual" }); }}>
      <label htmlFor="v3-first-payment">Date de la première mensualité</label>
      <div className={styles.formLine}>
        <input id="v3-first-payment" type="date" value={draft} onChange={event => setDraft(event.target.value)} autoFocus />
        <button type="submit" className={styles.primaryButton} disabled={!draft}>Enregistrer</button>
      </div>
    </form> : null}
  </div>;
}

function ManualLoanEntry({ startOpen }: { startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [submitted, setSubmitted] = useState(false);
  if (submitted) return <p className={styles.impact} role="status">Réponses notées. Dans le produit, l’Assistant Financement reconstitue l’échéancier à partir de ces quatre informations. Ce calcul n’est pas simulé dans ce LAB.</p>;
  return <div className={styles.missingItem}>
    <p className={styles.missingTitle}>Votre prêt</p>
    <p>Avec l’offre et l’échéancier, je retrouve tout. Sans eux, quatre informations suffisent pour un résultat aussi précis.</p>
    {!open ? <div className={styles.secondaryLinks}><button type="button" className={styles.textButton} onClick={() => setOpen(true)}>Renseigner manuellement</button></div>
      : <form className={styles.manualGrid} onSubmit={event => { event.preventDefault(); setSubmitted(true); }}>
        <label>Montant emprunté<input inputMode="decimal" placeholder="140 000 €" /></label>
        <label>Taux annuel<input inputMode="decimal" placeholder="3,45 %" /></label>
        <label>Durée<input inputMode="numeric" placeholder="20 ans" /></label>
        <label>Première mensualité<input type="date" /></label>
        <button type="submit" className={styles.primaryButton}>Enregistrer</button>
      </form>}
  </div>;
}

function AddPiece({ state, dispatch, focused }: Props & { focused: boolean }) {
  const [open, setOpen] = useState(focused);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (focused) ref.current?.scrollIntoView({ block: "center" }); }, [focused]);
  const name = "Attestation assurance emprunteur.pdf";
  if (state.extraPiece === "reading") return <DocumentReading files={[name]} onComplete={() => dispatch({ type: "extra-piece", reading: "done" })} />;
  if (state.extraPiece === "done") return <p className={styles.impact} role="status">✓ {name} lue. Elle confirme ce que je savais déjà : rien ne change dans votre dossier.</p>;
  return <div ref={ref}>
    {open ? <div className={styles.dropzone}>
      <p>Déposez une pièce : je la lis et je vous dis si elle change quelque chose. Une pièce ne remplace jamais en silence une information déjà retenue.</p>
      <button type="button" className={styles.primaryButton} onClick={() => dispatch({ type: "extra-piece", reading: "reading", name })}>Simuler l’ajout d’une attestation d’assurance</button>
    </div> : <button type="button" className={styles.secondaryButton} onClick={() => setOpen(true)}>Ajouter une pièce</button>}
  </div>;
}

function WorkspaceFinancement({ state, dispatch }: Props) {
  const status = loanStatus(state);
  const facts = loanFacts(state);
  const focus = state.workspaceFocus;
  return <>
    <nav className={styles.breadcrumb} aria-label="Fil d’Ariane">
      <button type="button" className={styles.backLink} onClick={() => dispatch({ type: "view", view: "dossier" })}>← Mon dossier</button>
    </nav>
    <header className={styles.pageHead}>
      <p className={styles.eyebrow}>Espace de travail</p>
      <h1>Financement</h1>
      <p className={styles.lead}>{status === "known"
        ? "J’ai retrouvé l’essentiel de votre financement. Vous pouvez vérifier ou compléter les informations ci-dessous."
        : status === "none" ? "Vous avez indiqué ne pas avoir de prêt pour ce logement."
          : "Je n’ai pas encore de document de prêt. Ajoutez-les, ou renseignez l’essentiel vous-même."}</p>
    </header>
    <div className={styles.workspace}>
      <section className={styles.zone} aria-labelledby="v3-ws-known">
        <h2 id="v3-ws-known" className={styles.zoneTitle}>Ce que je sais</h2>
        {status === "known" ? <ul className={styles.facts}>{facts.map(fact => <FactRow key={fact.id} fact={fact} focused={focus === fact.id} dispatch={dispatch} />)}</ul>
          : <p className={styles.panelLead}>{status === "none" ? "Aucun prêt · déclaré par vous." : "Rien pour l’instant : aucune pièce de prêt n’a été ajoutée."}</p>}
      </section>
      <section className={styles.zone} aria-labelledby="v3-ws-missing">
        <h2 id="v3-ws-missing" className={styles.zoneTitle}>Ce qu’il me manque</h2>
        {status === "known" ? <FirstPaymentMissing state={state} dispatch={dispatch} focused={focus === "manquant"} />
          : status === "missing" ? <>
            {state.loanDocuments === "reading"
              ? <DocumentReading files={[LOAN_OFFER, LOAN_SCHEDULE]} onComplete={() => dispatch({ type: "loan-reading", reading: "done" })} />
              : <div className={styles.documentFirst}>
                <button type="button" className={styles.primaryButton} onClick={() => dispatch({ type: "loan-reading", reading: "reading" })}>Ajouter mes documents de prêt</button>
              </div>}
            <ManualLoanEntry startOpen={focus === "manquant"} />
          </> : <p className={styles.panelLead}>Rien : sans prêt, il n’y a pas de charge de financement.</p>}
      </section>
      <section className={styles.zone} aria-labelledby="v3-ws-pieces">
        <h2 id="v3-ws-pieces" className={styles.zoneTitle}>Mes pièces</h2>
        {status === "known" ? <>
          <PiecesList pieces={loanPieces(state)} />
          <AddPiece state={state} dispatch={dispatch} focused={focus === "pieces"} />
        </> : <p className={styles.panelLead}>Aucune pièce de prêt.</p>}
      </section>
    </div>
    <div className={styles.workspaceFooter}>
      <button type="button" className={styles.secondaryButton} onClick={() => dispatch({ type: "view", view: "dossier" })}>Revenir à mon dossier</button>
    </div>
  </>;
}

/* ====================== Mes documents / Ma déclaration ====================== */

function DocumentsView({ state }: { state: LabState }) {
  const docs = DOCUMENTS.filter(doc => !doc.loan || loanStatus(state) === "known");
  return <>
    <header className={styles.pageHead}><p className={styles.eyebrow}>Mes documents {DEMO.year}</p><h1>{docs.length} documents analysés.</h1></header>
    <ul className={styles.docList}>{docs.map(doc => <li key={doc.name}><span className={styles.fileGlyph} aria-hidden="true">▤</span><strong>{doc.name}</strong><span>Utilisé dans : {doc.usedIn.map(id => DOMAIN_LABELS[id]).join(", ")}</span><span className={styles.pieceDone}>✓ Analyse terminée</span></li>)}</ul>
    <p className={styles.labNote}>Vue simplifiée : cette mission ne porte que sur Mon dossier et Financement.</p>
  </>;
}

function DeclarationView({ dispatch }: { dispatch: Dispatch<LabAction> }) {
  return <>
    <header className={styles.pageHead}><p className={styles.eyebrow}>Ma déclaration {DEMO.year}</p><h1>Non simulée dans ce LAB.</h1><p className={styles.lead}>Le résultat estimé est visible en bas de Mon dossier. Aucune liasse n’est produite ici.</p></header>
    <button type="button" className={styles.secondaryButton} onClick={() => dispatch({ type: "view", view: "dossier" })}>Revenir à mon dossier</button>
  </>;
}

/* ============================ Shell ============================ */

const NAV: Array<{ view: View; label: string }> = [
  { view: "dossier", label: "Mon dossier" },
  { view: "documents", label: "Mes documents" },
  { view: "declaration", label: "Ma déclaration" },
];

export function V3Prototype() {
  const [state, dispatch] = useReducer(reduceLab, "analysed", initialState);
  const mainRef = useRef<HTMLElement>(null);
  const previousView = useRef(state.view);

  useEffect(() => {
    if (previousView.current === state.view) return;
    previousView.current = state.view;
    window.scrollTo({ top: 0, behavior: "instant" });
    if (state.view !== "workspace" || !state.workspaceFocus) mainRef.current?.focus({ preventScroll: true });
  }, [state.view, state.workspaceFocus]);

  const activeNav: View = state.view === "workspace" ? "dossier" : state.view;
  return <div className={styles.root}>
    <div className={styles.labBar}>
      <span><span className={styles.labDot} aria-hidden="true" /> LAB UX V3 · données fictives, aucun moteur, rien n’est enregistré</span>
      <span className={styles.labControls}>
        <label htmlFor="v3-scenario">Scénario</label>
        <select id="v3-scenario" value={state.scenario} onChange={event => dispatch({ type: "scenario", scenario: event.target.value as Scenario })}>
          <option value="analysed">Financement déjà analysé</option>
          <option value="loan-missing">Pièces de prêt manquantes</option>
        </select>
        <button type="button" onClick={() => dispatch({ type: "scenario", scenario: state.scenario })}>Recommencer</button>
      </span>
    </div>
    <header className={styles.header}>
      <span className={styles.brand}><span className={styles.brandMark} aria-hidden="true">✳</span>L’Assistant du Réel</span>
      <nav aria-label="Navigation principale" className={styles.nav}>{NAV.map(item => <button key={item.view} type="button" aria-current={activeNav === item.view ? "page" : undefined} onClick={() => dispatch({ type: "view", view: item.view })}>{item.label}</button>)}</nav>
      <span className={styles.user}><span className={styles.avatar} aria-hidden="true">AM</span><span className={styles.srOnly}>Antoine Martin</span></span>
    </header>
    <main ref={mainRef} tabIndex={-1} className={styles.main}>
      {state.view === "dossier" ? <DossierView state={state} dispatch={dispatch} />
        : state.view === "workspace" ? <WorkspaceFinancement state={state} dispatch={dispatch} />
          : state.view === "documents" ? <DocumentsView state={state} />
            : <DeclarationView dispatch={dispatch} />}
    </main>
    <DomainPanel state={state} dispatch={dispatch} />
  </div>;
}
