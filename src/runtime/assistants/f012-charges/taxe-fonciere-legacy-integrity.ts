/**
 * Blocker #3 (F012 V2 — taxe foncière) — Lot A : détection structurelle des
 * dossiers legacy exposés au collapse N-Expenses → last-write-wins, plus
 * contrat du marker d'intégrité et de sa validité.
 *
 * Pure detection / validity only — aucune re-extraction, aucun routage
 * Blocker #1/#2, aucune mutation Registry / UI / generation gate.
 */

import type { Expense } from "../../capabilities/f012/expense";
import type { F012CollectedData } from "./types";

/** Version produit V1 du check d'intégrité — bump futur invalide les markers antérieurs. */
export const TAXE_FONCIERE_INTEGRITY_CHECK_VERSION = 1 as const;

/**
 * Id Expense produit par l'ancien pipeline multi-prélèvements :
 * `deriveExpenseIdFromDocument(documentId, \`prelevement:${n}\`)`
 * → `expense-doc-${documentId}-prelevement:${n}`.
 *
 * Ne matche PAS les ids ChargeProposal `docId:prelevement:N` (sans préfixe
 * `expense-doc-`), ni les ids modernes `taxe-annuelle` / `taxe-fonciere`.
 */
export const LEGACY_PRELEVEMENT_EXPENSE_ID = /^expense-doc-.+-prelevement:\d+$/;

export type TaxeFonciereLegacyRisk =
  | { kind: "none" }
  | {
      kind: "certainly_exposed";
      expense: Expense;
      matchedId: string;
    };

export type TaxeFonciereIntegrityCheckStatus =
  | "verified_match"
  | "verified_user_decision"
  | "user_attested_no_document";

export type TaxeFonciereIntegrityCheck = {
  status: TaxeFonciereIntegrityCheckStatus;
  checkVersion: typeof TAXE_FONCIERE_INTEGRITY_CHECK_VERSION;
  /**
   * Horodatage ISO de la résolution — traçabilité uniquement. V1 n'en fait
   * pas un prédicat de validité (pas de parser de date dans
   * `isTaxeFonciereIntegrityCheckValid`).
   */
  checkedAt: string;
  /**
   * Document contre lequel la vérif a porté.
   * Obligatoire pour `verified_match` / `verified_user_decision`.
   * Doit être absent pour `user_attested_no_document`.
   */
  againstDocumentId?: string;
  /**
   * Montant legacy A au moment où la vérification a commencé — TRAÇABILITÉ
   * uniquement. Après résolution, l'Expense active porte `resolvedMontant`
   * (souvent B ≠ A) : ne jamais exiger
   * `expense.montant === persistedMontantAtCheck` pour valider le marker.
   * Doit rester un nombre fini (garde runtime / persistence malformée).
   */
  persistedMontantAtCheck: number;
  /** Montant finalement retenu après résolution — doit égaler `expense.montant`. */
  resolvedMontant: number;
};

/**
 * Classifie un `collected` F012 : uniquement `certainly_exposed` (V1) ou `none`.
 * Aucune heuristique `possibly_exposed`.
 */
export function detectTaxeFonciereLegacyRisk(input: {
  collected: F012CollectedData;
}): TaxeFonciereLegacyRisk {
  const expense = input.collected.taxeFonciereExpense;
  if (!expense) return { kind: "none" };
  if (expense.category !== "taxe_fonciere") return { kind: "none" };
  if (expense.decision !== "confirmed" && expense.decision !== "modified") return { kind: "none" };
  if (!LEGACY_PRELEVEMENT_EXPENSE_ID.test(expense.id)) return { kind: "none" };
  return { kind: "certainly_exposed", expense, matchedId: expense.id };
}

/**
 * Un marker reste valide uniquement si la donnée vérifiée n'a pas bougé
 * (montant résolu / document / version) et si les montants sont des nombres
 * finis. Aucune tolérance d'arrondi ici.
 *
 * `verified_match` / `verified_user_decision` = preuve documentaire →
 * `againstDocumentId` et `expense.documentId` obligatoires et égaux.
 * `user_attested_no_document` = attestation sans source → `againstDocumentId`
 * interdit.
 */
export function isTaxeFonciereIntegrityCheckValid(input: {
  check: TaxeFonciereIntegrityCheck | undefined;
  expense: Expense | undefined;
  currentCheckVersion: typeof TAXE_FONCIERE_INTEGRITY_CHECK_VERSION;
}): boolean {
  const { check, expense, currentCheckVersion } = input;
  if (!check) return false;
  if (check.checkVersion !== currentCheckVersion) return false;
  if (!expense) return false;
  if (expense.decision !== "confirmed" && expense.decision !== "modified") return false;

  if (
    !Number.isFinite(expense.montant) ||
    !Number.isFinite(check.resolvedMontant) ||
    !Number.isFinite(check.persistedMontantAtCheck)
  ) {
    return false;
  }

  if (expense.montant !== check.resolvedMontant) return false;

  if (check.status === "user_attested_no_document") {
    return check.againstDocumentId === undefined;
  }

  // verified_match | verified_user_decision — preuve documentaire obligatoire.
  if (check.againstDocumentId === undefined) return false;
  if (expense.documentId === undefined) return false;
  if (expense.documentId !== check.againstDocumentId) return false;

  return true;
}
