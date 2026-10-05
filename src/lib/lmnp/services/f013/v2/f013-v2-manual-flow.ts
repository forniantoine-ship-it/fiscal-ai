/**
 * F013 v2 — parcours manuel « par exception » : réponses de l'utilisateur → faits F013 v2.
 *
 * Fonctions pures. Aucune formule ici : le total vient exclusivement du moteur (`evaluateRentReconciliation`).
 * Règles : une réponse absente reste `UNKNOWN` ; seul un « non » EXPLICITE devient `VALIDATED(0)` ; une exception
 * déclarée n'est jamais traitée fiscalement (→ `OUT_OF_DOMAIN`).
 */
import type { FactProvenance, MoneyFact, OutOfDomainTreatment } from "./f013-v2-contract";
import type { ReconciliationResult, ReconciliationScope } from "./f013-v2-engine";
import {
  applyFactsChange,
  evaluateRentReconciliation,
  type RentFactsChange,
  type RentReconciliationV2State,
} from "./f013-v2-state";

const USER: FactProvenance = { kind: "user_declaration" };

export type BalanceKey = "openingReceivables" | "closingReceivables" | "openingAdvances" | "closingAdvances";
export type BalanceAnswer = { answer: "none" } | { answer: "some"; amountCents: number };
export type ExceptionsAnswer = { answer: "none" } | { answer: "some"; treatments: readonly OutOfDomainTreatment[] };

export type ManualStep = "collections" | "coverage" | "opening" | "closing" | "exceptions" | "summary";

export type ManualAnswerResult =
  | { ok: true; state: RentReconciliationV2State }
  | { ok: false; reason: "INVALID_AMOUNT" | "EMPTY_TREATMENTS" };

const isPositiveCents = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n > 0;
const isCents = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;

/**
 * Saisie d'un montant en euros → centimes entiers, sans passer par un flottant. Une saisie vide n'est JAMAIS zéro.
 * Accepte « 12000 », « 12 000,50 », « 12000.5 » ; refuse négatif, > 2 décimales, texte.
 */
export function parseEurosToCents(raw: string): number | null {
  const cleaned = raw.replace(/[\s  ]/g, "").replace(",", ".");
  if (cleaned === "" || !/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [euros, decimals = ""] = cleaned.split(".");
  const cents = Number(euros) * 100 + Number(decimals.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

function validated(amountCents: number): MoneyFact {
  return { status: "VALIDATED", amountCents, provenance: USER };
}

export function answerCollections(state: RentReconciliationV2State, amountCents: number): ManualAnswerResult {
  if (!isCents(amountCents)) return { ok: false, reason: "INVALID_AMOUNT" };
  return { ok: true, state: applyFactsChange(state, { collections: validated(amountCents) }) };
}

export function answerCoverage(state: RentReconciliationV2State, answer: "all" | "not_all"): RentReconciliationV2State {
  return applyFactsChange(state, {
    collectionsCoverage: {
      completeness: answer === "all" ? "COMPLETE" : "PARTIAL",
      validation: "VALIDATED",
      provenance: USER,
    },
  });
}

export function answerBalance(state: RentReconciliationV2State, key: BalanceKey, answer: BalanceAnswer): ManualAnswerResult {
  if (answer.answer === "none") return { ok: true, state: applyFactsChange(state, { [key]: validated(0) }) };
  if (!isPositiveCents(answer.amountCents)) return { ok: false, reason: "INVALID_AMOUNT" };
  return { ok: true, state: applyFactsChange(state, { [key]: validated(answer.amountCents) }) };
}

/** Retour à « non répondu » : le fait redevient `UNKNOWN`, jamais zéro. */
export function clearBalance(state: RentReconciliationV2State, key: BalanceKey): RentReconciliationV2State {
  return applyFactsChange(state, { [key]: { status: "UNKNOWN" } satisfies MoneyFact });
}

export function answerExceptions(state: RentReconciliationV2State, answer: ExceptionsAnswer): ManualAnswerResult {
  if (answer.answer === "none") {
    return { ok: true, state: applyFactsChange(state, { exceptionsReviewed: true, outOfDomain: undefined } satisfies RentFactsChange) };
  }
  if (answer.treatments.length === 0) return { ok: false, reason: "EMPTY_TREATMENTS" };
  const treatments = [...new Set(answer.treatments)].sort();
  return { ok: true, state: applyFactsChange(state, { exceptionsReviewed: true, outOfDomain: treatments }) };
}

const known = (fact: MoneyFact) => fact.status !== "UNKNOWN";

/** Prochaine question utile : on ne redemande jamais ce qui est déjà établi. */
export function nextManualStep(state: RentReconciliationV2State): ManualStep {
  const f = state.facts;
  if (!known(f.collections)) return "collections";
  if (f.collectionsCoverage.completeness === "UNKNOWN" || f.collectionsCoverage.completeness === "PARTIAL") return "coverage";
  if (!known(f.openingReceivables) || !known(f.openingAdvances)) return "opening";
  if (!known(f.closingReceivables) || !known(f.closingAdvances)) return "closing";
  if (!f.exceptionsReviewed) return "exceptions";
  return "summary";
}

export interface RecapLine {
  label: string;
  sign: "+" | "−" | "=";
  /** Montant du fait tel que saisi (centimes), ou null s'il est inconnu. */
  amountCents: number | null;
}

export interface ManualSummary {
  result: ReconciliationResult;
  lines: readonly RecapLine[];
  /** Total du moteur — absent tant que le rapprochement n'est pas `SUPPORTED`. */
  totalCents: number | null;
  confirmationFresh: boolean;
  confirmationStale: boolean;
}

const amountOf = (fact: MoneyFact): number | null => (fact.status === "UNKNOWN" ? null : fact.amountCents);

/** Récapitulatif d'affichage : montants des faits + total du MOTEUR (aucun recalcul de la formule ici). */
export function buildManualSummary(state: RentReconciliationV2State, scope: ReconciliationScope): ManualSummary {
  const evaluation = evaluateRentReconciliation(state, scope);
  const f = state.facts;
  const totalCents = evaluation.result.status === "SUPPORTED" ? evaluation.result.loyersAcquisCents : null;
  return {
    result: evaluation.result,
    lines: [
      { label: "Loyers reçus pendant l'année", sign: "+", amountCents: amountOf(f.collections) },
      { label: "Loyers de l'année restant à recevoir au 31 décembre", sign: "+", amountCents: amountOf(f.closingReceivables) },
      { label: "Loyers d'années précédentes restant à recevoir au 1er janvier", sign: "−", amountCents: amountOf(f.openingReceivables) },
      { label: "Loyers déjà reçus avant l'année pour l'année ou après", sign: "+", amountCents: amountOf(f.openingAdvances) },
      { label: "Loyers reçus d'avance au 31 décembre pour après l'année", sign: "−", amountCents: amountOf(f.closingAdvances) },
      { label: `Loyers rattachés à ${scope.fiscalYear}`, sign: "=", amountCents: totalCents },
    ],
    totalCents,
    confirmationFresh: evaluation.confirmationFresh,
    confirmationStale: evaluation.confirmationStale,
  };
}
