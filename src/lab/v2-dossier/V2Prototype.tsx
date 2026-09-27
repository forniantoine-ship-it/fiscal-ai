"use client";

import { useEffect, useReducer, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { ANALYSIS_STEPS, DOCUMENTS, DOMAIN_LABELS, TAX_ANALYSIS_STEPS } from "./fixtures";
import {
  INITIAL_STATE, illustrativeResult, motionDelay, nextAction, pendingCount, reduceDemo,
  type DemoDocument, type DemoState, type DomainId, type EntryStage, type ProcessingStep, type Resolution, type Scenario, type View,
} from "./model";
import { resolveV3Activity, resolveV3Amortization, resolveV3Charges, resolveV3Declaration, resolveV3Financing, resolveV3Property, resolveV3Revenue, type V3DeclarationReadModel, type V3DomainReadModel, type V3PrototypeSource } from "./read-model";
import styles from "./prototype.module.css";

const money = (value: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value) + " €";
const dateLabel = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "orange" | "green" }) {
  return <span className={`${styles.pill} ${styles[`pill_${tone}`]}`}>{children}</span>;
}

function Arrow() { return <span aria-hidden="true">↗</span>; }

function Heading({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
  return <div className={styles.pageHeading}>
    <p className={styles.eyebrow}>{eyebrow}</p>
    <h1>{title}</h1>
    {description ? <p className={styles.lead}>{description}</p> : null}
  </div>;
}

function DocumentSketch({ working = false }: { working?: boolean }) {
  return <div className={`${styles.documentSketch} ${working ? styles.documentSketchWorking : ""}`} aria-hidden="true">
    <div className={styles.sketchBack} />
    <div className={styles.sketchFront}>
      <span className={styles.sketchTop}><span className={styles.sketchSeal}>✳</span> L’ASSISTANT DU RÉEL</span>
      <i /><i /><i className={styles.sketchShort} />
      <span className={styles.sketchFooter}>DOSSIER 2026 <span>↗</span></span>
    </div>
    <div className={styles.sketchCheck}>✓</div>
  </div>;
}

function FlowRail({ active }: { active: number }) {
  const labels = ["Document", "Information", "Dossier", "Résultat"];
  return <div className={styles.flowRail} aria-label="Du document au résultat">
    {labels.map((label, index) => <div key={label} className={index < active ? styles.flowPast : index === active ? styles.flowActive : ""}>
      <span className={styles.flowNode}>{index < active ? "✓" : index + 1}</span><span>{label}</span>
    </div>)}
  </div>;
}

function EntryGate({ stage, choice, source, onChoice, onUnsure, onBack }: {
  stage: EntryStage; choice: "first" | "takeover" | null; source: "question" | "unsure";
  onChoice: (choice: "first" | "takeover") => void; onUnsure: () => void; onBack: () => void;
}) {
  const confirming = stage === "confirm";
  const unsure = stage === "unsure" || (confirming && source === "unsure");
  return <section className={styles.entryScene} aria-live="polite">
    <div className={styles.entryIntroduction}>
      <p className={styles.eyebrow}>L’ASSISTANT DU RÉEL · VOTRE POINT DE DÉPART</p>
      <h1>{unsure ? "Regardons simplement ce que vous avez déjà fait." : "Commençons par votre situation."}</h1>
      <p>{unsure ? "Un document de l’année précédente suffit souvent à reconnaître une déclaration au réel. Aucun numéro ni calcul n’est nécessaire pour répondre." : "Est-ce votre première déclaration LMNP au régime réel ? Une réponse suffit pour que je prépare la suite adaptée à votre dossier."}</p>
    </div>
    <div className={`${styles.entryChoices} ${confirming ? styles.entryChoicesConfirming : ""}`}>
      <button disabled={confirming} className={`${styles.entryChoice} ${choice === "first" ? styles.entryChoiceSelected : confirming ? styles.entryChoiceQuiet : ""}`} onClick={() => onChoice("first")}>
        <span className={styles.entryChoiceIcon}>{choice === "first" ? "✓" : "01"}</span><span><strong>{unsure ? "Non, je n’ai jamais déclaré au réel" : "Oui, c’est ma première déclaration"}</strong><small>{unsure ? "Je démarre mon LMNP au réel cette année." : "Je démarre mon activité ou je déclare ce logement au réel pour la première fois."}</small></span><Arrow />
      </button>
      <button disabled={confirming} className={`${styles.entryChoice} ${choice === "takeover" ? styles.entryChoiceSelected : confirming ? styles.entryChoiceQuiet : ""}`} onClick={() => onChoice("takeover")}>
        <span className={styles.entryChoiceIcon}>{choice === "takeover" ? "✓" : "02"}</span><span><strong>{unsure ? "Oui, j’ai une déclaration ou une comptabilité antérieure" : "Non, j’ai déjà déclaré au réel"}</strong><small>{unsure ? "Une liasse fiscale ou un registre de l’année précédente peut le montrer." : "J’ai déjà déposé une déclaration LMNP au réel pour un exercice précédent."}</small></span><Arrow />
      </button>
      {!unsure ? <button disabled={confirming} className={`${styles.entryChoice} ${styles.entryChoiceHelp} ${confirming ? styles.entryChoiceQuiet : ""}`} onClick={onUnsure}>
        <span className={styles.entryChoiceIcon}>?</span><span><strong>Je ne sais pas</strong><small>Aidez-moi à reconnaître ma situation, sans jargon.</small></span><Arrow />
      </button> : confirming ? null : <div className={styles.entryHelp}><strong>Encore un doute ?</strong><p>Si vous trouvez une liasse fiscale ou un registre d’une année précédente, choisissez « Oui ». Si c’est votre première année au réel, choisissez « Non ». Vous pouvez revenir ici à tout moment avec « Recommencer ».</p><button className={styles.textButton} onClick={onBack}>Revoir la question initiale</button></div>}
    </div>
    {confirming ? <div className={styles.entryAnswer} role="status"><span>✓</span><div><strong>Très bien, j’ai compris votre situation.</strong><p>{choice === "first" ? "Je prépare votre premier dossier 2026." : "Je prépare la reprise de votre comptabilité existante."}</p></div></div> : null}
    <p className={styles.smallNote}>Parcours illustratif · aucune donnée enregistrée ou transmise.</p>
  </section>;
}

function EntryWorking({ choice }: { choice: "first" | "takeover" }) {
  const subjects = ["Activité", "Logement", "Financement", "Loyers", "Dépenses"];
  return <section className={styles.entryWorking} role="status" aria-live="polite">
    <div className={styles.entryWorkingMark}>✳</div>
    <p className={styles.eyebrow}>L’ASSISTANT DU RÉEL ORGANISE LA SUITE</p>
    <h1>{choice === "first" ? "Très bien. Préparons votre dossier 2026." : "Nous allons reprendre votre comptabilité existante."}</h1>
    <p>{choice === "first" ? "Je prépare les sujets utiles en arrière-plan. Vous n’aurez à intervenir que lorsqu’une information manque." : "Je repère les pièces qui permettront de repartir sur des bases fiables."}</p>
    <div className={styles.entrySubjectCloud} aria-label={choice === "first" ? "Sujets du dossier en préparation" : "Pièces nécessaires à la reprise"}>
      {(choice === "first" ? subjects : ["Dernière liasse fiscale", "Registre des immobilisations"]).map((item, index) => <span key={item} style={{ animationDelay: `${index * 95}ms` }}><span>✳</span>{item}</span>)}
    </div>
  </section>;
}

function Intro({ onReceive, onManual }: { onReceive: () => void; onManual: () => void }) {
  return <div className={styles.introGrid}>
    <div>
      <Heading eyebrow="PREMIÈRE DÉCLARATION · 2026" title="Je prépare votre dossier." description="Ajoutez les pièces de démonstration disponibles : je les organiserai par sujet et je viendrai vous demander uniquement ce que je ne peux pas retrouver." />
      <div className={styles.introActions}>
        <button className={styles.primaryButton} onClick={onReceive}>Ajouter les documents de démonstration <Arrow /></button>
        <button className={styles.textButton} onClick={onManual}>Je n’ai pas ces documents · continuer sans eux <span aria-hidden="true">→</span></button>
      </div>
      <p className={styles.smallNote}>Laboratoire interactif · pièces et montants fictifs · aucun fichier n’est envoyé.</p>
      <div className={styles.introGuidance}><span>✳</span><p>Je m’occupe de rapprocher les informations. La prochaine question viendra directement à vous.</p></div>
    </div>
    <aside className={styles.introAside}>
      <DocumentSketch />
      <div className={styles.asideCaption}><span className={styles.sparkle}>✳</span><div><strong>Un dossier qui avance avec vous</strong><p>Chaque information retrouvée trouve sa place dans votre dossier.</p></div></div>
    </aside>
  </div>;
}

function Working({ step }: { step: ProcessingStep }) {
  const facts = [
    { step: 1, label: "Logement", value: "Adresse à Bordeaux retrouvée" },
    { step: 2, label: "Financement", value: "Capital et échéances rapprochés" },
    { step: 3, label: "Loyers", value: "Recettes retrouvées · deux dates à vérifier" },
  ];
  return <section className={styles.workingScene} aria-live="polite">
    <div className={styles.workingGraphic}><DocumentSketch working /><div className={styles.workingOrbit} /></div>
    <div className={styles.workingContent}>
      <Pill tone="orange"><span className={styles.liveDot} /> L’Assistant du Réel travaille</Pill>
      <h1>Vos documents prennent place.</h1>
      <p>Les pièces de démonstration sont lues par sujet. Vous voyez ce qu’elles apportent au dossier.</p>
      <FlowRail active={Math.min(step, 3)} />
      <div className={styles.workingTrack} aria-hidden="true"><span style={{ width: `${(step + 1) * 20}%` }} /></div>
      <ol className={styles.workingSteps}>
        {ANALYSIS_STEPS.map((label, index) => <li key={label} className={index === step ? styles.currentStep : index < step ? styles.pastStep : ""}>
          <span>{index < step ? "✓" : String(index + 1).padStart(2, "0")}</span>{label}
        </li>)}
      </ol>
      <div className={styles.workingFindings}>{facts.filter(item => item.step <= step).map(item => <div key={item.label} className={styles.stateReveal}><strong>{item.label}</strong><span>{item.value}</span><span aria-hidden="true">✓</span></div>)}</div>
      {step >= 2 ? <div className={styles.workingHandoff} role="status"><span>Document lu</span><span className={styles.handoffBeam} aria-hidden="true">→</span><strong>{step === 2 ? "Financement mis à jour ✓" : "Loyers rapprochés ✓"}</strong></div> : null}
      {step === 3 ? <p className={styles.workingNext}>Il me reste quelques informations à vous demander. Je vous les présenterai une à une.</p> : null}
      <p className={styles.smallNote}>Analyse simulée et spécialisée par sujet · aucune extraction réelle.</p>
    </div>
  </section>;
}

function domainStatus(state: DemoState, id: DomainId) {
  if (id === "home" && !state.availableDate) return "Une date à préciser";
  if (id === "income" && !state.manual && !state.conflictChoice) return "Deux dates à départager";
  if (id === "expenses" && state.taxAmount === null) return state.taxDocumentStep === 4 ? "Un montant à confirmer" : "Une dépense à compléter";
  if (id === "amortization") return "Aperçu illustratif";
  if (id === "history") return "À reprendre";
  return "Prêt";
}

function realDomainFor(id: DomainId, activity?: V3DomainReadModel, property?: V3DomainReadModel, financing?: V3DomainReadModel, revenue?: V3DomainReadModel, charges?: V3DomainReadModel, amortization?: V3DomainReadModel): V3DomainReadModel | undefined {
  if (id === "activity") return activity;
  if (id === "home") return property;
  if (id === "loan") return financing;
  if (id === "income") return revenue;
  if (id === "expenses") return charges;
  if (id === "amortization") return amortization;
  return undefined;
}

function DomainList({ state, activity, property, financing, revenue, charges, amortization, onOpen }: { state: DemoState; activity?: V3DomainReadModel; property?: V3DomainReadModel; financing?: V3DomainReadModel; revenue?: V3DomainReadModel; charges?: V3DomainReadModel; amortization?: V3DomainReadModel; onOpen: (id: DomainId) => void }) {
  const domains: DomainId[] = ["activity", "home", "loan", "income", "expenses", "amortization"];
  return <section className={styles.domainSection}>
    <div className={styles.sectionTitle}><div><p className={styles.eyebrow}>CONSULTER À VOTRE RYTHME</p><h2>Votre dossier en détail</h2></div><span>Pour comprendre, vérifier ou corriger</span></div>
    <div className={styles.domainList}>
      {domains.map((id, index) => {
        const real = realDomainFor(id, activity, property, financing, revenue, charges, amortization);
        const status = real ? real.summary : domainStatus(state, id);
        const done = real ? real.status === "complete" : status === "Prêt";
        return <button key={id} className={styles.domainRow} onClick={() => onOpen(id)} style={{ animationDelay: `${index * 45}ms` }}>
          <span className={`${styles.domainMark} ${done ? styles.domainMarkDone : styles.domainMarkPending}`}>{done ? "✓" : "·"}</span>
          <span className={styles.domainName}>{DOMAIN_LABELS[id]}</span>
          <span className={styles.domainStatus}>{status}</span><span className={styles.rowArrow} aria-hidden="true">↗</span>
        </button>;
      })}
    </div>
    <p className={styles.underList}>Les amortissements restent derrière le résultat : vous pouvez en comprendre l’effet dans Ma déclaration.</p>
  </section>;
}

function DateIntervention({ onResolve, manual }: { onResolve: (value: string) => void; manual: boolean }) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft) { setError("Indiquez une date pour continuer."); return; }
    onResolve(draft);
  }
  return <form onSubmit={submit} className={styles.interventionForm}>
    <label htmlFor="v2-available-date">À quelle date le logement était-il disponible à la location ?</label>
    <p>{manual ? "Vous êtes la meilleure personne pour préciser cette date. Les autres données sont des exemples locaux." : "L’acte donne la date d’acquisition, mais pas celle à laquelle le logement pouvait être loué."}</p>
    <div className={styles.formLine}><input id="v2-available-date" type="date" value={draft} onChange={event => { setDraft(event.target.value); setError(""); }} min="2025-09-15" max="2026-12-31" /><button className={styles.primaryButton} type="submit">Continuer <Arrow /></button></div>
    {error ? <p role="alert" className={styles.formError}>{error}</p> : null}
    <details className={styles.explain}><summary>Pourquoi cette date ?</summary><p>Elle aide à situer la mise en location. Elle ne peut pas être déduite avec certitude de la date d’acquisition.</p></details>
  </form>;
}

function ConflictIntervention({ onResolve, onSource }: { onResolve: (value: "2026-01-10" | "2026-01-12") => void; onSource: (id: string) => void }) {
  return <div className={styles.interventionForm}>
    <p>Le bail et le relevé de gestion indiquent deux dates de début de location. Quelle date devons-nous retenir dans cette démonstration ?</p>
    <div className={styles.sourceChoices}>
      <button className={styles.sourceChoice} onClick={() => onResolve("2026-01-10")}><small>Bail de location.pdf</small><strong>10 janvier 2026</strong><span>Retenir cette date <Arrow /></span></button>
      <button className={styles.sourceChoice} onClick={() => onResolve("2026-01-12")}><small>Relevé de gestion.pdf</small><strong>12 janvier 2026</strong><span>Retenir cette date <Arrow /></span></button>
    </div>
    <div className={styles.sourceLinks}><button className={styles.inlineLink} onClick={() => onSource("lease")}>Voir le bail</button><button className={styles.inlineLink} onClick={() => onSource("income")}>Voir le relevé</button></div>
    <details className={styles.explain}><summary>Pourquoi vérifier cette date ?</summary><p>Les deux sources ne concordent pas. Votre choix résout cette différence dans le prototype ; aucun calcul fiscal réel ne dépend ici de cette date fictive.</p></details>
  </div>;
}

function TaxIntervention({ state, onResolve, onShowSource, onStartDocument, onManual, onDocuments }: {
  state: DemoState; onResolve: (value: number) => void; onShowSource: () => void; onStartDocument: () => void; onManual: () => void; onDocuments: () => void;
}) {
  const [correcting, setCorrecting] = useState(false);
  const [draft, setDraft] = useState("1250");
  const [error, setError] = useState("");
  const fromDocument = state.taxDocumentStep === 4;
  const entering = state.manual || state.taxManualEntry || correcting;
  function submit(event: FormEvent) {
    event.preventDefault();
    const amount = Number(draft.replace(",", "."));
    if (!Number.isFinite(amount) || amount < 0 || amount > 5000) { setError("Saisissez un montant entre 0 et 5 000 €."); return; }
    onResolve(amount);
  }
  return <div className={styles.interventionForm}>
    {state.taxDocumentStep !== null && state.taxDocumentStep < 4 ? <div className={styles.analysisPending}><Pill tone="orange"><span className={styles.liveDot} /> Analyse en cours</Pill><p>L’avis est en cours de lecture. Vous pourrez confirmer le montant dès que la proposition sera prête.</p><button className={styles.secondaryButton} onClick={onDocuments}>Suivre dans Mes documents <Arrow /></button></div> : fromDocument ? <>
      <p className={styles.proposalLabel}>RETROUVÉ DANS L’AVIS DE TAXE FONCIÈRE</p>
      <div className={styles.proposalAmount}>1 250 <span>€</span></div>
      <p>Ce montant est proposé pour votre dossier 2026. Confirmez-le ou corrigez-le avant qu’il soit intégré au résultat illustratif.</p>
      <div className={styles.proposalActions}><button className={styles.primaryButton} onClick={() => onResolve(1250)}>Confirmer 1 250 € <Arrow /></button><button className={styles.secondaryButton} onClick={() => setCorrecting(!correcting)}>Corriger le montant</button></div>
      <button className={styles.inlineLink} onClick={onShowSource}>Vérifier l’avis et la provenance <span aria-hidden="true">↗</span></button>
    </> : <>
      <p>{state.manual || state.taxManualEntry ? "Indiquez le montant de taxe foncière pour compléter les dépenses de cette démonstration." : "Il manque la taxe foncière pour compléter les dépenses de cette démonstration. Choisissez le chemin le plus simple pour vous."}</p>
      {!state.manual && !state.taxManualEntry ? <div className={styles.documentOptions}>
        <button className={styles.optionCard} onClick={onStartDocument}><span className={styles.optionGlyph}>▤</span><strong>Ajouter l’avis de taxe foncière</strong><small>Voir comment un document renseigne votre dossier.</small><Arrow /></button>
        <button className={styles.optionCard} onClick={onManual}><span className={styles.optionGlyph}>✎</span><strong>Renseigner le montant moi-même</strong><small>Le document n’est pas nécessaire pour essayer ce parcours.</small><Arrow /></button>
      </div> : null}
    </>}
    {entering ? <form onSubmit={submit} className={styles.correctionForm}><label htmlFor="v2-tax">Montant de taxe foncière à retenir</label><div className={styles.formLine}><input id="v2-tax" type="number" inputMode="decimal" min="0" max="5000" step="0.01" value={draft} onChange={event => { setDraft(event.target.value); setError(""); }} /><button className={styles.primaryButton} type="submit">Intégrer ce montant</button></div>{error ? <p role="alert" className={styles.formError}>{error}</p> : null}</form> : null}
  </div>;
}

function InterventionCard({ state, onDate, onConflict, onTax, onSource, onStartDocument, onManualTax, onDocuments }: {
  state: DemoState; onDate: (value: string) => void; onConflict: (value: "2026-01-10" | "2026-01-12") => void;
  onTax: (value: number) => void; onSource: (id: string) => void; onStartDocument: () => void; onManualTax: () => void; onDocuments: () => void;
}) {
  const next = nextAction(state);
  if (!next) return null;
  const title = next === "date" ? "Une date que vous seul connaissez." : next === "conflict" ? "Deux dates à départager." : state.taxDocumentStep === 4 ? "Un montant à confirmer." : state.taxDocumentStep !== null ? "L’avis est en cours d’analyse." : "Une dépense à compléter.";
  const domain = next === "date" ? "Logement" : next === "conflict" ? "Loyers" : "Dépenses";
  return <section key={next} className={`${styles.actionCard} ${styles.enterCard}`} aria-live="polite">
    <div className={styles.actionHeader}><div><p className={styles.eyebrow}>UNE CHOSE À ME PRÉCISER</p><h2 data-next-action tabIndex={-1}>{title}</h2></div><Pill tone="orange">{domain}</Pill></div>
    {next === "date" ? <DateIntervention onResolve={onDate} manual={state.manual} /> : next === "conflict" ? <ConflictIntervention onResolve={onConflict} onSource={onSource} /> : <TaxIntervention state={state} onResolve={onTax} onShowSource={() => onSource("tax")} onStartDocument={onStartDocument} onManual={onManualTax} onDocuments={onDocuments} />}
  </section>;
}

function ResolutionCard({ kind, state }: { kind: Resolution; state: DemoState }) {
  const message = kind === "date" ? `Date intégrée · ${dateLabel(state.availableDate)}` : kind === "conflict" ? `Date retenue · ${dateLabel(state.conflictChoice)}` : `Dépense intégrée · ${money(state.taxAmount ?? 0)}`;
  const domain = kind === "date" ? "Logement" : kind === "conflict" ? "Loyers" : "Dépenses";
  const updated = kind === "date" ? "Logement mis à jour" : kind === "conflict" ? "Loyers mis à jour" : "Dépenses mises à jour";
  return <section className={styles.resolutionCard} role="status" aria-live="polite"><span className={styles.resolutionCheck}>✓</span><div><strong>{message}</strong><p>{kind === "tax" ? "Je vérifie maintenant l’effet sur le résultat." : `Je mets à jour ${domain}, puis je vous présente la prochaine chose utile.`}</p><div className={styles.resolutionPath}><span>Réponse intégrée</span><i aria-hidden="true">→</i><span>{updated}</span><i aria-hidden="true">→</i><span>{kind === "tax" ? "Vérification" : "Suite du dossier"}</span></div></div></section>;
}

function RecalculationCard() {
  return <section className={`${styles.recalculationCard} ${styles.enterCard}`} role="status" aria-live="polite">
    <div className={styles.recalculationMark} aria-hidden="true"><span>✳</span></div>
    <div><p className={styles.eyebrow}>DERNIÈRE INFORMATION INTÉGRÉE</p><h2>Je vérifie le dossier et recalcule le résultat.</h2><p>La taxe foncière change les dépenses, puis le résultat avant amortissements.</p><div className={styles.reviewSteps}><span>✓ Dépenses mises à jour</span><span>✳ Vérification du dossier</span><span>Résultat en préparation</span></div><div className={styles.recalculationTrack} aria-hidden="true"><span /></div></div>
  </section>;
}

function ResultLines({ tax, highlight = false }: { tax: number; highlight?: boolean }) {
  const result = illustrativeResult(tax);
  return <div className={`${styles.resultLines} ${highlight ? styles.resultUpdated : ""}`}>
    <div><span>Recettes</span><strong>{money(result.income)}</strong></div>
    <div className={highlight ? styles.changedLine : ""}><span>− Dépenses <small>dont taxe foncière {money(tax)}</small></span><strong>{money(result.expenses)}</strong></div>
    <div className={`${styles.subtotal} ${highlight ? styles.changedLine : ""}`}><span>Résultat avant amortissements</span><strong>{money(result.beforeAmortization)}</strong></div>
    <div><span>− Amortissements utilisés · illustration</span><strong>{money(result.amortization)}</strong></div>
    <div className={`${styles.total} ${highlight ? styles.changedLine : ""}`}><span>Résultat fiscal LMNP illustratif</span><strong>{money(result.fiscal)}</strong></div>
  </div>;
}

function MainDossier({ state, activity, property, financing, revenue, charges, amortization, onDate, onConflict, onTax, onSource, onDomain, onDeclaration, onDocuments, onStartDocument, onManualTax }: {
  state: DemoState; onDate: (value: string) => void; onConflict: (value: "2026-01-10" | "2026-01-12") => void;
  activity?: V3DomainReadModel; property?: V3DomainReadModel; financing?: V3DomainReadModel; revenue?: V3DomainReadModel; charges?: V3DomainReadModel; amortization?: V3DomainReadModel;
  onTax: (value: number) => void; onSource: (id: string) => void; onDomain: (id: DomainId) => void;
  onDeclaration: () => void; onDocuments: () => void; onStartDocument: () => void; onManualTax: () => void;
}) {
  const pending = pendingCount(state);
  const visiblePending = pending + Number(state.resolution !== null);
  const ready = pending === 0 && !state.resolution && !state.recalculating;
  return <>
    <div className={styles.dossierTop}>
      <div><p className={styles.eyebrow}>ANNÉE 2026 · BORDEAUX</p><h1>Votre dossier 2026</h1><p className={styles.lead}>{ready ? "L’Assistant du Réel a terminé la préparation de votre dossier." : state.recalculating ? "Votre dernière réponse est intégrée. Je vérifie le dossier et mets le résultat à jour." : "L’Assistant du Réel prépare votre dossier et vous sollicite uniquement lorsqu’une information manque."}</p></div>
      <div className={`${styles.interventionSummary} ${ready ? styles.interventionSummaryReady : ""}`} aria-live="polite"><strong>{ready ? "✓" : state.recalculating ? "✳" : visiblePending}</strong><span>{ready ? "Dossier prêt" : state.recalculating ? "Vérification en cours" : `${visiblePending} intervention${visiblePending > 1 ? "s" : ""} utile${visiblePending > 1 ? "s" : ""}`}</span></div>
    </div>
    {state.resolution ? <ResolutionCard kind={state.resolution} state={state} /> : state.recalculating ? <RecalculationCard /> : pending > 0 ? <InterventionCard state={state} onDate={onDate} onConflict={onConflict} onTax={onTax} onSource={onSource} onStartDocument={onStartDocument} onManualTax={onManualTax} onDocuments={onDocuments} /> : null}
    {ready && state.taxAmount !== null ? <>
      <section className={`${styles.completionCard} ${styles.enterCard}`} aria-live="polite"><div className={styles.completionFlare} /><div className={styles.completionIcon}>✳</div><div><p className={styles.eyebrow}>VÉRIFICATION TERMINÉE · DOSSIER PRÊT</p><h2 data-completion-heading tabIndex={-1}>Votre dossier est prêt.</h2><p>L’Assistant du Réel a terminé la préparation des éléments nécessaires au calcul de cette démonstration.</p><button className={styles.primaryButton} onClick={onDeclaration}>Voir mon résultat <Arrow /></button></div></section>
      <section className={`${styles.impactCard} ${styles.impactActive} ${styles.enterCard}`} aria-live="polite"><div><Pill tone="green">Résultat recalculé</Pill><h3>La dépense confirmée a changé le résultat.</h3><p>Taxe foncière intégrée : {money(state.taxAmount)}. Les autres lignes restent stables.</p></div><div className={styles.impactNumbers}><span>Avant cette dépense</span><small>{money(illustrativeResult(0).beforeAmortization)}</small><span>Après intégration</span><strong>{money(illustrativeResult(state.taxAmount).beforeAmortization)}</strong></div></section>
    </> : null}
    {!ready ? <div className={styles.preparedBrief}><span className={styles.preparedMark}>✳</span><div><strong>{state.manual ? "Votre dossier se construit." : `${state.taxDocumentStep === 4 ? 7 : 6} documents parcourus par sujet.`}</strong><p>{state.manual ? "Je réunis les informations déjà disponibles et quelques exemples locaux." : "Activité, logement et financement ont avancé. Vous pouvez vérifier les sources quand vous le souhaitez."}</p></div></div> : null}
    <details className={styles.dossierDetails}><summary><span><strong>Votre dossier en détail</strong><small>Consulter les sujets, les sources et les informations préparées</small></span><span aria-hidden="true">⌄</span></summary><div className={styles.dossierColumns}><DomainList state={state} activity={activity} property={property} financing={financing} revenue={revenue} charges={charges} amortization={amortization} onOpen={onDomain} /><aside className={styles.sideColumn}>
      <div className={styles.workSummary}><p className={styles.eyebrow}>LE TRAVAIL DÉJÀ FAIT</p><h2>{state.manual ? "J’organise les informations disponibles." : `${state.taxDocumentStep === 4 ? 7 : 6} documents parcourus.`}</h2><p>{state.manual ? "La saisie guidée utilise des exemples locaux pour les montants non renseignés." : "Logement, financement et recettes ont été rapprochés. Les sources restent accessibles."}</p><button className={styles.inlineLink} onClick={onDocuments}>Voir les documents et leurs apports <span aria-hidden="true">↗</span></button></div>
      <div className={styles.propertyNote}><span className={styles.propertyGlyph}>⌂</span><div><small>LOGEMENT DE CETTE DÉMONSTRATION</small><strong>Bordeaux</strong><span>Un logement présenté ici</span></div></div>
    </aside></div></details>
  </>;
}

function documentUsed(doc: DemoDocument, state: DemoState): string[] {
  if (doc.id === "tax") return state.taxAmount === null ? [] : [`Taxe foncière retenue · ${money(state.taxAmount)}`];
  const used = [...doc.contribution];
  if (doc.id === "lease" && state.conflictChoice === "2026-01-10") used.push("Date de début de location retenue · 10 janvier 2026");
  if (doc.id === "income" && state.conflictChoice === "2026-01-12") used.push("Date de début de location retenue · 12 janvier 2026");
  return used;
}

function TaxAnalysisScene({ step, onDossier }: { step: ProcessingStep; onDossier: () => void }) {
  const complete = step === 4;
  return <section className={`${styles.taxAnalysisScene} ${complete ? styles.taxAnalysisComplete : ""}`} aria-live="polite">
    <div className={styles.taxAnalysisHeader}><span className={styles.fileGlyph}>▤</span><div><p className={styles.eyebrow}>AVIS DE TAXE FONCIÈRE · DÉMONSTRATION</p><h2>{complete ? "Le document a fait avancer le dossier." : "L’Assistant du Réel analyse l’avis."}</h2></div><Pill tone="orange">{complete ? "À confirmer" : "Analyse en cours"}</Pill></div>
    <FlowRail active={Math.min(step, 3)} />
    <ol className={styles.analysisEvents}>{TAX_ANALYSIS_STEPS.map((label, index) => <li key={label} className={index <= step ? styles.analysisEventActive : ""}><span>{index < step ? "✓" : index + 1}</span>{label}</li>)}</ol>
    {step >= 2 ? <div className={`${styles.analysisFinding} ${styles.stateReveal}`}><span>Information retrouvée</span><strong>Taxe foncière proposée · 1 250 €</strong><small>Dépenses · avis fictif 2026</small></div> : null}
    {complete ? <div className={`${styles.analysisOutcome} ${styles.stateReveal}`}><strong>Dépenses mises à jour avec une proposition.</strong><p>Le montant a été retrouvé. Je vous présente maintenant sa confirmation dans Mon dossier.</p><button className={styles.primaryButton} onClick={onDossier}>Continuer vers la confirmation <Arrow /></button><small>Le parcours continue automatiquement après cette transition.</small></div> : null}
    <p className={styles.smallNote}>Animation sur données fictives locales · aucun vrai fichier n’est lu ni transmis.</p>
  </section>;
}

function DocumentsView({ state, real, onDocument, onDossier, onStartDocument }: { state: DemoState; real: boolean; onDocument: (id: string) => void; onDossier: () => void; onStartDocument: () => void }) {
  const docs = DOCUMENTS.filter(doc => (!real || (doc.domain !== "activity" && doc.domain !== "home" && doc.domain !== "loan" && doc.domain !== "income" && doc.domain !== "expenses")) && (doc.id !== "tax" || state.taxDocumentStep === 4));
  return <>
    <Heading eyebrow="MES DOCUMENTS · 2026" title="Vos documents, leurs apports." description="Pour chaque pièce, voyez ce qui a été retrouvé, ce qui a été retenu et où l’information a été utilisée." />
    {state.scenario !== "first" ? <div className={styles.emptyCard}><h2>{state.scenario === "takeover" ? "L’historique reste à recevoir." : "La formalité se prépare dans Mon dossier."}</h2><p>{state.scenario === "takeover" ? "La liasse et le registre sont simulés dans Mon dossier. Aucun document réel n’est importé dans cette variante." : "Cette variante illustre les informations utiles à la formalité INPI. Aucun justificatif n’est importé."}</p><button className={styles.primaryButton} onClick={onDossier}>Voir cette étape <Arrow /></button></div>
      : !state.received ? <div className={styles.emptyCard}><h2>Aucun document dans cette démonstration.</h2><p>Commencez dans Mon dossier pour voir l’analyse simulée.</p><button className={styles.primaryButton} onClick={onDossier}>Aller à mon dossier <Arrow /></button></div>
      : state.processing !== 4 ? <div className={styles.emptyCard}><Pill tone="orange"><span className={styles.liveDot} /> Analyse en cours</Pill><h2>Les documents trouvent leur place.</h2><p>Revenez dans Mon dossier pour suivre les informations retrouvées.</p><button className={styles.primaryButton} onClick={onDossier}>Suivre l’analyse <Arrow /></button></div>
      : state.manual ? <div className={styles.emptyCard}><h2>Vous avez choisi la saisie guidée.</h2><p>Aucun document n’a été ajouté. Les montants non saisis sont des exemples locaux.</p><button className={styles.primaryButton} onClick={onDossier}>Revenir au dossier</button></div>
      : <>
        {state.taxDocumentStep !== null && state.taxAmount === null ? <TaxAnalysisScene step={state.taxDocumentStep} onDossier={onDossier} /> : state.taxDocumentStep === null ? <div className={styles.documentPrompt}><div><p className={styles.eyebrow}>{state.taxAmount === null ? "UNE PIÈCE PEUT COMPLÉTER VOTRE DOSSIER" : "MONTANT RENSEIGNÉ SANS DOCUMENT"}</p><strong>Avis de taxe foncière</strong><p>{state.taxAmount === null ? "Ajoutez la pièce de démonstration pour voir l’information circuler jusqu’aux Dépenses." : "Vous avez saisi directement le montant de la dépense. Aucun avis n’a été ajouté."}</p></div>{state.taxAmount === null ? <button className={styles.primaryButton} onClick={onStartDocument}>Ajouter l’avis de démonstration <Arrow /></button> : null}</div> : null}
        <div className={styles.documentsGrid}>{docs.map((doc, index) => {
          const used = documentUsed(doc, state);
          return <button key={doc.id} className={styles.documentCard} onClick={() => onDocument(doc.id)} style={{ animationDelay: `${index * 45}ms` }}><div className={styles.documentCardTop}><span className={styles.fileGlyph}>▤</span><Pill tone={used.length ? "green" : "orange"}>{used.length ? "Analysé · simulation" : "À confirmer"}</Pill></div><strong>{doc.name}</strong><small>Utilisé dans : {(doc.usedIn ?? [doc.domain]).map(id => DOMAIN_LABELS[id]).join(", ")}</small><div className={styles.documentContribution}><span>{used.length ? `${used.length} information${used.length > 1 ? "s" : ""} utilisée${used.length > 1 ? "s" : ""}` : "Information retrouvée · à confirmer"}</span>{(used.length ? used : doc.found).slice(0, 3).map(item => <p key={item}><span>{used.length ? "✓" : "·"}</span>{item}</p>)}</div><span className={styles.cardLink}>Voir ce qui a été retenu <Arrow /></span></button>;
        })}</div>
      </>}
    <p className={styles.labFootnote}>Pièces fictives locales. Le prototype n’accepte ni n’analyse un vrai fichier.</p>
  </>;
}

function RealDeclarationView({ declaration }: { declaration: V3DeclarationReadModel }) {
  const title = declaration.status === "generated" ? "Votre déclaration"
    : declaration.status === "computed" ? "Résultat fiscal calculé" : "Résultat fiscal non disponible";
  return <>
    <Heading eyebrow="MA DÉCLARATION" title={title} description="Cette vue reflète directement le résultat calculé par l’Assistant (F006), jamais une seconde estimation ni un recalcul." />
    <div className={styles.declarationGrid}><section className={styles.declarationMain}>
      <div className={styles.declarationTop}><Pill tone={declaration.status === "unavailable" ? "orange" : "green"}>{declaration.summary}</Pill></div>
      <h2>Ce que dit votre dossier réel</h2>
      <ul className={styles.panelFindings}>{declaration.facts.map(fact => <li key={fact.id}>
        <span>{fact.value === null ? "·" : "✓"}</span>{fact.label} · {fact.value ?? "Non disponible"}
      </li>)}</ul>
      {declaration.deliverables.length ? <><h3>Documents</h3><ul className={styles.panelFindings}>{declaration.deliverables.map(item => <li key={item.id}>
        <span>{item.status === "generated" ? "✓" : "·"}</span>{item.label} · {item.status === "generated" ? "généré" : "non généré"}
      </li>)}</ul></> : null}
      <p className={styles.panelDisclaimer}>Provenance : calcul produit par l’Assistant à partir de votre dossier — pas une source documentaire directe.</p>
    </section></div>
  </>;
}

function DeclarationView({ state, declaration, onDossier }: { state: DemoState; declaration?: V3DeclarationReadModel; onDossier: () => void }) {
  if (declaration) return <RealDeclarationView declaration={declaration} />;
  if (state.scenario !== "first") return <>
    <Heading eyebrow="MA DÉCLARATION · 2026" title="Ce scénario s’arrête avant le résultat." description="Cette variante montre une situation particulière du dossier, sans inventer de calcul fiscal." />
    <div className={styles.emptyCard}><Pill tone="orange">Résultat non simulé</Pill><h2>{state.scenario === "takeover" ? "L’historique doit être repris et validé." : "La formalité INPI est présentée dans Mon dossier."}</h2><p>Le résultat chiffré illustratif est disponible dans le scénario Première année.</p><button className={styles.primaryButton} onClick={onDossier}>Revenir au dossier <Arrow /></button></div>
  </>;
  const ready = state.received && state.processing === 4 && pendingCount(state) === 0 && !state.resolution && !state.recalculating;
  const analyzing = state.received && state.processing !== 4;
  const waitingTitle = state.recalculating ? "Recalcul en cours" : analyzing ? "Analyse en cours" : state.received ? `${pendingCount(state)} intervention${pendingCount(state) > 1 ? "s" : ""} à résoudre` : "Commencez votre dossier";
  const result = illustrativeResult(state.taxAmount ?? 0);
  return <>
    <Heading eyebrow="MA DÉCLARATION · 2026" title={ready ? "Votre déclaration 2026" : state.recalculating ? "Votre résultat se met à jour." : "Le résultat viendra après la préparation."} description={ready ? "Le résultat se construit à partir des informations retenues dans votre dossier." : "L’Assistant du Réel présente le résultat une fois les informations utiles réunies et intégrées."} />
    {!ready ? <div className={styles.emptyCard}><Pill tone="orange">Dossier en préparation</Pill><h2>{waitingTitle}</h2><p>{state.recalculating ? "Votre dernière réponse change les dépenses et le résultat illustratif." : "Un résultat incomplet risquerait de vous induire en erreur."}</p><button className={styles.primaryButton} onClick={onDossier}>Continuer mon dossier <Arrow /></button></div>
      : <div className={styles.declarationGrid}><section className={styles.declarationMain}>
        <div className={styles.declarationTop}><Pill tone="green">Dossier préparé · simulation</Pill><span>EXERCICE 2026</span></div>
        <h2>Du dossier au résultat</h2><p>Cette lecture est illustrative. Elle ne constitue ni un calcul fiscal validé ni une déclaration déposée.</p>
        <ResultLines tax={state.taxAmount ?? 0} highlight={state.highlightedResult} />
        <div className={styles.notTax}><strong>Résultat fiscal LMNP ≠ impôt personnel.</strong><span> L’impôt dépend de votre situation globale et n’est pas calculé ici.</span></div>
        <div className={styles.resultDetails}>
          <details className={styles.explain}><summary>Comprendre mon résultat</summary><p>Les recettes de {money(result.income)} diminuent des dépenses de {money(result.expenses)}. Les amortissements illustratifs de {money(result.amortization)} sont ensuite présentés séparément. Aucun déficit antérieur ni report n’est simulé.</p></details>
          <details className={styles.explain}><summary>Vérifier les calculs et les sources</summary><p>{money(result.income)} − {money(result.expenses)} = {money(result.beforeAmortization)} avant amortissements ; puis {money(result.beforeAmortization)} − {money(result.amortization)} = {money(result.fiscal)}.</p><p>{state.manual ? "Recettes, intérêts et amortissements sont des exemples locaux. La date et la taxe foncière ont été renseignées dans le parcours." : "Recettes : relevé de gestion fictif. Intérêts : échéancier fictif. Taxe foncière : montant confirmé à partir de l’avis ou saisi par vous."} Ces montants restent illustratifs.</p></details>
        </div>
      </section><aside className={styles.declarationAside}>
        <div className={styles.accomplishment}><span>✳</span><p className={styles.eyebrow}>C’EST FAIT</p><h3>Votre dossier est prêt.</h3><p>L’Assistant du Réel a terminé la préparation de cette démonstration.</p></div>
        <div className={styles.outputNotice}><strong>Et la déclaration officielle ?</strong><p>Ce prototype ne génère ni liasse, ni aide 2042-C-PRO, ni dépôt. Dans le produit, ces sorties dépendent de contrôles de complétude et de validité.</p></div>
      </aside></div>}
  </>;
}

function DetailPanel({ title, subtitle, children, onClose }: { title: string; subtitle?: string; children: ReactNode; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    closeRef.current?.focus();
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  function onPanelKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab" || !panelRef.current) return;
    const focusable = [...panelRef.current.querySelectorAll<HTMLElement>("button, input, select, summary, a[href]")].filter(element => !element.hasAttribute("disabled"));
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first && last) { event.preventDefault(); last.focus(); }
    if (!event.shiftKey && document.activeElement === last && first) { event.preventDefault(); first.focus(); }
  }
  return <div className={styles.panelBackdrop} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section ref={panelRef} className={styles.detailPanel} role="dialog" aria-modal="true" aria-label={title} onKeyDown={onPanelKeyDown}><div className={styles.panelTop}><span>VÉRIFIER LE DOSSIER</span><button ref={closeRef} onClick={onClose} aria-label="Fermer le détail">×</button></div><h2>{title}</h2>{subtitle ? <p className={styles.panelSubtitle}>{subtitle}</p> : null}{children}</section></div>;
}

function DocumentDetail({ doc, state }: { doc: DemoDocument; state: DemoState }) {
  const used = documentUsed(doc, state);
  return <>
    <div className={styles.panelStatus}><Pill tone={used.length ? "green" : "orange"}>{used.length ? "Analysé · simulation" : "À confirmer"}</Pill><span>Utilisé dans {(doc.usedIn ?? [doc.domain]).map(id => DOMAIN_LABELS[id]).join(", ")}</span></div>
    <h3>Informations retrouvées</h3><ul className={styles.panelFindings}>{doc.found.map(item => <li key={item}><span>✓</span>{item}</li>)}</ul>
    <h3>Informations retenues dans le dossier</h3>{used.length ? <ul className={styles.panelFindings}>{used.map(item => <li key={item}><span>✓</span>{item}</li>)}</ul> : <p className={styles.domainDetailLead}>Le montant a été proposé mais n’est pas encore retenu. Votre confirmation est nécessaire.</p>}
    {(doc.id === "lease" || doc.id === "income") && !state.conflictChoice ? <p className={styles.panelHint}>La date de début de location reste à départager entre deux pièces.</p> : null}
    <h3>Provenance</h3><div className={styles.sourceExcerpt}>{doc.source}</div><p className={styles.panelDisclaimer}>Extrait fictif. Aucune lecture de PDF réel n’a eu lieu.</p>
  </>;
}

function DomainDetail({ state, domain, activity, property, financing, revenue, charges, amortization, onDocument, onAction }: { state: DemoState; domain: DomainId; activity?: V3DomainReadModel; property?: V3DomainReadModel; financing?: V3DomainReadModel; revenue?: V3DomainReadModel; charges?: V3DomainReadModel; amortization?: V3DomainReadModel; onDocument: (id: string) => void; onAction: () => void }) {
  const real = realDomainFor(domain, activity, property, financing, revenue, charges, amortization);
  if (real) return <RealDomainDetail domain={real} />;
  const docs = state.manual ? [] : DOCUMENTS.filter(doc => (doc.usedIn ?? [doc.domain]).includes(domain) && (doc.id !== "tax" || state.taxDocumentStep === 4));
  const facts: Record<DomainId, string[]> = {
    activity: ["Activité · location meublée", "Exploitant · Antoine Martin"],
    home: ["Logement · Bordeaux", "Acquisition · 15 septembre 2025", state.availableDate ? `Disponible à la location · ${dateLabel(state.availableDate)}` : "Disponibilité · à préciser"],
    loan: ["Capital initial · 140 000 €", "Taux · 3,45 %", "Durée · 20 ans", "Assurance · 0,25 %"],
    income: ["Recettes illustratives · 14 400 €", state.manual ? "Début de location · exemple local" : state.conflictChoice ? `Début de location retenu · ${dateLabel(state.conflictChoice)}` : "Début de location · deux sources différentes"],
    expenses: ["Autres dépenses illustratives · 2 350 €", "Intérêts illustratifs · 2 100 €", state.taxAmount !== null ? `Taxe foncière retenue · ${money(state.taxAmount)}` : state.taxDocumentStep === 4 ? "Taxe foncière proposée · 1 250 €" : "Taxe foncière · à compléter"],
    // Deliberately qualitative: no fictional depreciation amount is derived from the other
    // illustrative domains here, since that would require a business calculation this lab never does.
    amortization: ["Amortissements · rubrique illustrative, sans montant fictif dans cette démonstration", "Le calcul réel provient de l’Assistant Amortissements (F014)"],
    history: ["Aucune reprise externe dans ce scénario"],
  };
  const needsAction = (domain === "home" && !state.availableDate) || (domain === "income" && !state.manual && !state.conflictChoice) || (domain === "expenses" && state.taxAmount === null);
  return <>
    <div className={styles.panelStatus}><Pill tone={needsAction ? "orange" : "green"}>{needsAction ? "Une information attend votre réponse" : domain === "amortization" ? "Aperçu illustratif" : "Prêt · simulation"}</Pill></div>
    <p className={styles.domainDetailLead}>{domain === "loan" ? "L’offre et l’échéancier apportent des informations complémentaires sur le financement." : "Voici ce qui est connu dans cette démonstration. Vous pouvez vérifier chaque pièce sans suivre un tunnel imposé."}</p>
    <h3>Ce que le dossier sait</h3><ul className={styles.panelFindings}>{facts[domain].map(item => <li key={item}><span>{item.includes("à préciser") || item.includes("à compléter") || item.includes("différentes") ? "·" : "✓"}</span>{item}</li>)}</ul>
    {needsAction ? <button className={`${styles.primaryButton} ${styles.panelAction}`} onClick={onAction}>Revenir à l’action utile <Arrow /></button> : null}
    <h3>Sources associées</h3>{docs.length ? <ul className={styles.panelFindings}>{docs.map(doc => <li key={doc.id}><button className={styles.inlineLink} onClick={() => onDocument(doc.id)}>{doc.name} <span aria-hidden="true">↗</span></button></li>)}</ul> : <p className={styles.domainDetailLead}>Aucune pièce ajoutée pour ce sujet dans cette branche.</p>}
    <details className={styles.explain}><summary>Comprendre ce sujet</summary><p>Une information trouvée dans un document est proposée, puis retenue seulement quand elle est suffisamment claire ou confirmée. Les calculs affichés restent des illustrations locales.</p></details>
  </>;
}

function RealDomainDetail({ domain }: { domain: V3DomainReadModel }) {
  return <>
    <div className={styles.panelStatus}><Pill tone={domain.status === "complete" ? "green" : "orange"}>{domain.summary}</Pill></div>
    <p className={styles.domainDetailLead}>Données du dossier réel · source métier : {domain.owner}.</p>
    <h3>Ce que le dossier sait</h3>
    <ul className={styles.panelFindings}>{domain.facts.map(fact => <li key={fact.id}>
      <span>{fact.value === null ? "·" : "✓"}</span>{fact.label} · {fact.value ?? "Non renseigné"}
    </li>)}</ul>
    <h3>Sources associées</h3>
    {domain.sources.length ? <ul className={styles.panelFindings}>{domain.sources.map(source => <li key={source.id}><span>▤</span>{source.label}</li>)}</ul>
      : <p className={styles.domainDetailLead}>Aucune source documentaire disponible pour ce sujet.</p>}
    {domain.facts.some(fact => fact.evidence) ? <ul className={styles.panelFindings}>{domain.facts.filter(fact => fact.evidence).map(fact => <li key={fact.id}><span>↳</span>{fact.label} · {fact.evidence}{fact.confidence === undefined ? null : ` · confiance ${Math.round(fact.confidence * 100)} %`}</li>)}</ul> : null}
    <p className={styles.panelDisclaimer}>Provenance {domain.provenance === "complete" ? "documentée" : domain.provenance === "partial" ? "partielle" : "indisponible"}.</p>
  </>;
}

function Takeover({ state, onIntake, onToggle }: { state: DemoState; onIntake: () => void; onToggle: (name: "liasse" | "register") => void }) {
  return <><Heading eyebrow="REPRISE COMPTABLE · 2026" title="Nous allons reprendre votre comptabilité existante." description="Pour repartir sur des bases fiables, j’ai besoin de deux éléments de votre dernière comptabilité." />
    <section className={`${styles.actionCard} ${styles.takeoverGuide}`}><Pill tone="orange">La prochaine chose utile</Pill><h2>{state.takeoverLiasse && state.takeoverRegister ? "Les deux pièces sont reçues dans la simulation." : "Rassemblons l’historique nécessaire."}</h2><p>La dernière liasse fiscale et le registre des immobilisations sont nécessaires avant toute reprise. Je ne présenterai pas de résultat tant qu’ils ne sont pas réellement analysés et validés.</p>
      {!state.takeoverIntake ? <button className={styles.primaryButton} onClick={onIntake}>Ajouter mes documents <Arrow /></button> : <div className={`${styles.takeoverRows} ${styles.stateReveal}`}><button onClick={() => onToggle("liasse")}><span>{state.takeoverLiasse ? "✓" : "01"}</span><strong>Dernière liasse fiscale</strong><small>{state.takeoverLiasse ? "Reçue dans la simulation" : "Simuler la réception"}</small></button><button onClick={() => onToggle("register")}><span>{state.takeoverRegister ? "✓" : "02"}</span><strong>Registre des immobilisations</strong><small>{state.takeoverRegister ? "Reçu dans la simulation" : "Simuler la réception"}</small></button></div>}
      {state.takeoverLiasse && state.takeoverRegister ? <div className={`${styles.takeoverNote} ${styles.stateReveal}`} role="status">Les justificatifs sont présents dans cette démonstration. Une vraie reprise demanderait encore leur analyse et leur validation ; aucun résultat n’est simulé.</div> : null}
      <p className={styles.smallNote}>Cette démonstration n’importe aucun fichier réel.</p>
    </section></>;
}

function Inpi({ state, onShow, onSiret }: { state: DemoState; onShow: (show: boolean) => void; onSiret: () => void }) {
  return <><Heading eyebrow="VARIANTE · SANS SIRET" title="Le dossier avance avant la formalité." description="L’absence de SIRET est repérée tôt. Les informations utiles sont préparées avant de proposer la formalité INPI." />
    <section className={styles.actionCard}><Pill tone={state.siretReceived ? "green" : "orange"}>{state.siretReceived ? "SIRET reçu · simulation" : "Activité · formalité à préparer"}</Pill><h2>{state.siretReceived ? "L’activité a été mise à jour." : "Votre formalité INPI peut être préparée."}</h2><p>Dans cette démonstration, l’identité, l’activité et l’adresse du logement sont connues. La formalité reste distincte du travail comptable et ne bloque pas tout le dossier.</p><div className={styles.proposalActions}><button className={styles.primaryButton} onClick={() => onShow(true)}>Voir le compagnon INPI <Arrow /></button>{!state.siretReceived ? <button className={styles.primaryButton} onClick={onSiret}>J’ai reçu mon SIRET</button> : null}</div><p className={styles.smallNote}>Le bouton simule uniquement le statut reçu ; aucun numéro n’est saisi ni transmis.</p></section>
    {state.showInpi ? <div className={styles.inpiPanel}><div><p className={styles.eyebrow}>COMPAGNON · APERÇU</p><h2>Nous repartons de ce qui est connu.</h2></div><ul><li><span>✓</span> Identité retrouvée · à confirmer</li><li><span>✓</span> Activité de location meublée · à confirmer</li><li><span>✓</span> Adresse du logement connue · établissement à préciser</li><li><span>·</span> Domiciliation · votre décision</li><li><span>{state.siretReceived ? "✓" : "·"}</span> {state.siretReceived ? "SIRET reçu dans la simulation" : "SIRET · à renseigner à réception"}</li></ul><p>Simulation d’orientation uniquement. La formalité s’effectue sur le site officiel ; aucune soumission ni synchronisation INPI ici.</p><button className={styles.secondaryButton} onClick={() => onShow(false)}>Refermer</button></div> : null}
  </>;
}

export function V2Prototype({ source = { mode: "demo" } }: { source?: V3PrototypeSource }) {
  const [state, dispatch] = useReducer(reduceDemo, INITIAL_STATE);
  const activity = resolveV3Activity(source);
  const property = resolveV3Property(source);
  const financing = resolveV3Financing(source);
  const revenue = resolveV3Revenue(source);
  const charges = resolveV3Charges(source);
  const amortization = resolveV3Amortization(source);
  const declaration = resolveV3Declaration(source);
  const mainRef = useRef<HTMLElement>(null);
  const activeDetail = state.selectedDocument
    ? DOCUMENTS.find(doc => doc.id === state.selectedDocument && (source.mode === "demo" || (doc.domain !== "activity" && doc.domain !== "home" && doc.domain !== "loan" && doc.domain !== "income" && doc.domain !== "expenses")))
    : null;
  const remaining = pendingCount(state);

  useEffect(() => {
    if (state.entryStage !== "confirm" && state.entryStage !== "organize") return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const next = state.entryStage === "confirm" ? "organize" : state.entryChoice === "first" ? "invite" : "done";
    const timer = window.setTimeout(() => dispatch({ type: "entry-stage", stage: next }), motionDelay(state.entryStage === "confirm" ? "entry" : "organize", reduced));
    return () => window.clearTimeout(timer);
  }, [state.entryStage, state.entryChoice]);

  useEffect(() => {
    if (state.entryStage === "question" || state.entryStage === "done") return;
    mainRef.current?.focus({ preventScroll: true });
  }, [state.entryStage]);

  useEffect(() => {
    if (state.entryStage !== "done" || state.scenario !== "first" || state.view !== "dossier" || state.processing !== 4 || state.resolution || state.recalculating) return;
    const target = remaining > 0 ? "[data-next-action]" : "[data-completion-heading]";
    mainRef.current?.querySelector<HTMLElement>(target)?.focus({ preventScroll: true });
  }, [state.entryStage, state.scenario, state.view, state.processing, state.resolution, state.recalculating, remaining]);

  useEffect(() => {
    if (state.processing === null || state.processing === 4) return;
    const step = state.processing;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => dispatch({ type: "processing", step: reduced ? 4 : (step + 1) as ProcessingStep }), motionDelay("document", reduced));
    return () => window.clearTimeout(timer);
  }, [state.processing]);

  useEffect(() => {
    if (state.taxDocumentStep === null || state.taxDocumentStep === 4) return;
    const step = state.taxDocumentStep;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => dispatch({ type: "tax-document-progress", step: reduced ? 4 : (step + 1) as ProcessingStep }), motionDelay("tax-document", reduced));
    return () => window.clearTimeout(timer);
  }, [state.taxDocumentStep]);

  useEffect(() => {
    if (state.taxDocumentStep !== 4 || state.taxAmount !== null || state.view !== "documents" || state.selectedDocument) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => {
      dispatch({ type: "view", view: "dossier" });
      window.scrollTo({ top: 0, behavior: "instant" });
      window.setTimeout(() => mainRef.current?.focus({ preventScroll: true }), 0);
    }, motionDelay("handoff", reduced));
    return () => window.clearTimeout(timer);
  }, [state.taxDocumentStep, state.taxAmount, state.view, state.selectedDocument]);

  useEffect(() => {
    if (!state.resolution) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => dispatch({ type: "settle-resolution" }), motionDelay("resolution", reduced));
    return () => window.clearTimeout(timer);
  }, [state.resolution]);

  useEffect(() => {
    if (!state.recalculating) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => dispatch({ type: "recalculated" }), motionDelay("recalculation", reduced));
    return () => window.clearTimeout(timer);
  }, [state.recalculating]);

  useEffect(() => {
    if (!state.highlightedResult) return;
    const timer = window.setTimeout(() => dispatch({ type: "clear-highlight" }), 4500);
    return () => window.clearTimeout(timer);
  }, [state.highlightedResult]);

  useEffect(() => {
    if (!state.selectedDocument && !state.selectedDomain) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") dispatch({ type: state.selectedDocument ? "document" : "domain", id: null }); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [state.selectedDocument, state.selectedDomain]);

  function changeView(view: View) {
    dispatch({ type: "view", view });
    window.scrollTo({ top: 0, behavior: "instant" });
    window.setTimeout(() => mainRef.current?.focus({ preventScroll: true }), 0);
  }
  function changeScenario(scenario: Scenario) {
    dispatch({ type: "scenario", scenario });
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function startTaxDocument() {
    dispatch({ type: "tax-document-start" });
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  return <div className={styles.root}>
    <div className={styles.labBar}><div><span className={styles.labDot} /> LABORATOIRE UX V3.1 <span className={styles.labDivider}>/</span> {source.mode === "real" ? "Activité, logement, financement, loyers, dépenses et amortissements réels" : "Données fictives, aucun dossier réel"}</div><div className={styles.labControls}><label htmlFor="v2-scenario">Scénario</label><select id="v2-scenario" value={state.scenario} onChange={event => changeScenario(event.target.value as Scenario)}><option value="first">Première année · 2026</option><option value="takeover">Reprise externe</option><option value="inpi">Sans SIRET</option></select><button onClick={() => changeScenario(state.scenario)}>Recommencer</button></div></div>
    <header className={styles.header}><div className={styles.brand}><span className={styles.brandMark}>✳</span><span>L’Assistant du Réel<small>VOTRE COMPTABILITÉ LMNP</small></span></div>{state.entryStage === "done" ? <nav aria-label="Navigation principale" className={styles.nav}><button aria-current={state.view === "dossier" ? "page" : undefined} onClick={() => changeView("dossier")}>Mon dossier</button><button aria-current={state.view === "documents" ? "page" : undefined} onClick={() => changeView("documents")}>Mes documents</button><button aria-current={state.view === "declaration" ? "page" : undefined} onClick={() => changeView("declaration")}>Ma déclaration</button></nav> : null}{state.entryStage === "done" ? <div className={styles.headerRight}><span>{activity?.facts.find(fact => fact.id === "identity")?.value ?? (source.mode === "real" ? "Dossier réel" : "Antoine Martin")}</span><span className={styles.avatar}>{source.mode === "real" ? "✳" : "AM"}</span></div> : null}</header>
    <main ref={mainRef} tabIndex={-1} className={styles.main}>
      {state.entryStage === "question" || state.entryStage === "unsure" || state.entryStage === "confirm" ? <EntryGate stage={state.entryStage} choice={state.entryChoice} source={state.entrySource} onChoice={choice => dispatch({ type: "entry-choice", choice })} onUnsure={() => dispatch({ type: "entry-unsure" })} onBack={() => changeScenario("first")} />
        : state.entryStage === "organize" && state.entryChoice ? <EntryWorking choice={state.entryChoice} />
        : state.entryStage === "invite" ? <Intro onReceive={() => dispatch({ type: "receive" })} onManual={() => dispatch({ type: "manual" })} />
        : state.view === "dossier" ? state.scenario === "first" ? !state.received ? <Intro onReceive={() => dispatch({ type: "receive" })} onManual={() => dispatch({ type: "manual" })} /> : state.processing !== 4 ? <Working step={state.processing ?? 0} /> : <MainDossier state={state} activity={activity} property={property} financing={financing} revenue={revenue} charges={charges} amortization={amortization} onDate={value => dispatch({ type: "date", value })} onConflict={value => dispatch({ type: "conflict", value })} onTax={value => dispatch({ type: "tax", value })} onSource={id => dispatch({ type: "document", id })} onDomain={id => dispatch({ type: "domain", id })} onDeclaration={() => changeView("declaration")} onDocuments={() => changeView("documents")} onStartDocument={startTaxDocument} onManualTax={() => dispatch({ type: "tax-manual" })} /> : state.scenario === "takeover" ? <Takeover state={state} onIntake={() => dispatch({ type: "takeover-intake" })} onToggle={document => dispatch({ type: "takeover", document })} /> : <Inpi state={state} onShow={show => dispatch({ type: "inpi", show })} onSiret={() => dispatch({ type: "siret-received" })} /> : state.view === "documents" ? <DocumentsView state={state} real={source.mode === "real"} onDocument={id => dispatch({ type: "document", id })} onDossier={() => changeView("dossier")} onStartDocument={startTaxDocument} /> : <DeclarationView state={state} declaration={declaration} onDossier={() => changeView("dossier")} />}
    </main>
    <footer className={styles.footer}><span>Prototype UX isolé · aucune donnée sauvegardée</span><span>L’Assistant du Réel · laboratoire V3.1</span></footer>
    {activeDetail ? <DetailPanel title={activeDetail.name} subtitle={activeDetail.category} onClose={() => dispatch({ type: "document", id: null })}><DocumentDetail doc={activeDetail} state={state} /></DetailPanel> : null}
    {state.selectedDomain ? <DetailPanel title={DOMAIN_LABELS[state.selectedDomain]} subtitle="Comprendre et vérifier" onClose={() => dispatch({ type: "domain", id: null })}><DomainDetail state={state} domain={state.selectedDomain} activity={activity} property={property} financing={financing} revenue={revenue} charges={charges} amortization={amortization} onDocument={id => dispatch({ type: "document", id })} onAction={() => dispatch({ type: "domain", id: null })} /></DetailPanel> : null}
  </div>;
}
