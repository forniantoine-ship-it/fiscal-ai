/**
 * LAB V3 — état d’interface du prototype. Pur, sans moteur, sans persistance.
 *
 * Les seuls calculs sont des sommes de montants de démonstration pour que
 * Mon dossier reste cohérent quand l’utilisateur répond ; aucune règle
 * fiscale n’est encodée ici.
 */

import { DEMO, LOAN_FINDINGS, type DomainId, type LoanFieldId } from "./fixtures";

export type Scenario = "analysed" | "loan-missing";
export type View = "dossier" | "documents" | "declaration" | "workspace";
export type Reading = "idle" | "reading" | "done";
export type InterventionId = "logement-date" | "financement-docs" | "charges-taxe";

export type Correction = { value: string; source: "manual" | "amendment" };

export type Resolution = { intervention: InterventionId; message: string; findings?: string[] };

export type LabState = {
  scenario: Scenario;
  view: View;
  /** Nombre d’interventions à l’ouverture du scénario (pour « 1 sur N »). */
  sessionTotal: number;
  availableDate: string | null;
  taxChoice: number | null;
  loanDocuments: Reading;
  loanDeclaredNone: boolean;
  resolution: Resolution | null;
  openDomain: DomainId | null;
  monthlyOpen: boolean;
  /** Espace de travail : champ à mettre en avant à l’ouverture. */
  workspaceFocus: LoanFieldId | "pieces" | "manquant" | null;
  corrections: Partial<Record<LoanFieldId, Correction>>;
  firstPayment: { value: string; source: "manual" | "document" } | null;
  /** Pièce ajoutée volontairement (sans changement du dossier). */
  extraPiece: Reading;
  extraPieceName: string | null;
};

export type LabAction =
  | { type: "scenario"; scenario: Scenario }
  | { type: "view"; view: View }
  | { type: "answer-date"; value: string }
  | { type: "answer-tax"; value: number }
  | { type: "loan-reading"; reading: Reading }
  | { type: "loan-none"; none: boolean }
  | { type: "settle" }
  | { type: "open-domain"; id: DomainId | null }
  | { type: "toggle-monthly" }
  | { type: "open-workspace"; focus: LabState["workspaceFocus"] }
  | { type: "correct"; field: LoanFieldId; correction: Correction }
  | { type: "first-payment"; value: string; source: "manual" | "document" }
  | { type: "extra-piece"; reading: Reading; name?: string };

export function initialState(scenario: Scenario = "analysed"): LabState {
  const base: LabState = {
    scenario,
    view: "dossier",
    sessionTotal: 0,
    availableDate: null,
    taxChoice: null,
    loanDocuments: scenario === "analysed" ? "done" : "idle",
    loanDeclaredNone: false,
    resolution: null,
    openDomain: null,
    monthlyOpen: false,
    workspaceFocus: null,
    corrections: {},
    firstPayment: null,
    extraPiece: "idle",
    extraPieceName: null,
  };
  return { ...base, sessionTotal: pendingInterventions(base).length };
}

export function reduceLab(state: LabState, action: LabAction): LabState {
  switch (action.type) {
    case "scenario":
      return initialState(action.scenario);
    case "view":
      return { ...state, view: action.view, openDomain: null, workspaceFocus: action.view === "workspace" ? state.workspaceFocus : null };
    case "answer-date":
      return { ...state, availableDate: action.value, resolution: { intervention: "logement-date", message: "Date enregistrée · Logement mis à jour" } };
    case "answer-tax":
      return { ...state, taxChoice: action.value, resolution: { intervention: "charges-taxe", message: "Montant retenu · Charges mises à jour" } };
    case "loan-reading":
      if (action.reading !== "done") return { ...state, loanDocuments: action.reading };
      return {
        ...state,
        loanDocuments: "done",
        loanDeclaredNone: false,
        resolution: { intervention: "financement-docs", message: "Vos documents de prêt sont lus", findings: [...LOAN_FINDINGS] },
      };
    case "loan-none":
      return action.none
        ? { ...state, loanDeclaredNone: true, resolution: { intervention: "financement-docs", message: "Aucun prêt · Financement mis à jour" } }
        : { ...state, loanDeclaredNone: false };
    case "settle":
      return { ...state, resolution: null };
    case "open-domain":
      return { ...state, openDomain: action.id, monthlyOpen: false };
    case "toggle-monthly":
      return { ...state, monthlyOpen: !state.monthlyOpen };
    case "open-workspace":
      return { ...state, view: "workspace", openDomain: null, workspaceFocus: action.focus };
    case "correct":
      return { ...state, corrections: { ...state.corrections, [action.field]: action.correction } };
    case "first-payment":
      return { ...state, firstPayment: { value: action.value, source: action.source } };
    case "extra-piece":
      return { ...state, extraPiece: action.reading, extraPieceName: action.name ?? state.extraPieceName };
  }
}

/** File « J’ai besoin de vous », dans l’ordre de présentation. */
export function pendingInterventions(state: LabState): InterventionId[] {
  const pending: InterventionId[] = [];
  if (!state.availableDate) pending.push("logement-date");
  if (loanStatus(state) === "missing") pending.push("financement-docs");
  if (state.taxChoice === null) pending.push("charges-taxe");
  return pending;
}

export type LoanStatus = "known" | "none" | "missing";

export function loanStatus(state: LabState): LoanStatus {
  if (state.loanDeclaredNone) return "none";
  return state.loanDocuments === "done" ? "known" : "missing";
}

export type DomainStatus = { tone: "ok" | "attention"; label: string };

/** Une seule source pour le statut des rubriques, du panneau et du compteur. */
export function domainStatus(state: LabState, id: DomainId): DomainStatus {
  const pending = pendingInterventions(state);
  if (id === "logement" && pending.includes("logement-date")) return { tone: "attention", label: "1 information à préciser" };
  if (id === "charges" && pending.includes("charges-taxe")) return { tone: "attention", label: "1 information à préciser" };
  if (id === "financement" && pending.includes("financement-docs")) return { tone: "attention", label: "Documents de prêt attendus" };
  return { tone: "ok", label: "Complet" };
}

export function financementDeductible(state: LabState): number {
  return loanStatus(state) === "known" ? DEMO.financement.total : 0;
}

/** Charges déductibles de démonstration, financement inclus. */
export function chargesDeductibles(state: LabState): number {
  return DEMO.autresCharges + (state.taxChoice ?? DEMO.taxeFonciere.avis) + financementDeductible(state);
}

export function illustrativeResult(state: LabState) {
  const charges = chargesDeductibles(state);
  return {
    recettes: DEMO.recettes,
    charges,
    amortissements: DEMO.amortissements,
    resultat: DEMO.recettes - charges - DEMO.amortissements,
  };
}

export function documentsAnalysed(state: LabState): number {
  return state.scenario === "analysed" || state.loanDocuments === "done" ? DEMO.documentsAnalysed : DEMO.documentsWithoutLoan;
}

/** Position affichée dans « J’ai besoin de vous » : « 1 sur 2 », puis « 2 sur 2 ». */
export function interventionPosition(state: LabState): { index: number; total: number } {
  const remaining = pendingInterventions(state).length;
  const total = Math.max(state.sessionTotal, remaining);
  return { index: total - remaining + 1, total };
}
