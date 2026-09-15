/**
 * Blocker #3 (F012 V2 — taxe foncière) — Lot A : détection structurelle +
 * marker d'intégrité ; Lot B : vérification documentaire pure (sans mutation)
 * réutilisant `expensesFromTaxeFonciereCorpus` / Blocker #1.
 */

import type { Expense } from "../../capabilities/f012/expense";
import type { F012CollectedData } from "./types";
import {
  expensesFromTaxeFonciereCorpus,
  taxeFonciereExpenseMissingAmount,
} from "./expense-from-taxe-fonciere";
import { TAXE_FONCIERE_AMOUNT_TOLERANCE } from "./proposals-from-taxe-fonciere";

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

// ---------------------------------------------------------------------------
// Blocker #3 — Lot B : vérification documentaire pure + helpers de marker
// ---------------------------------------------------------------------------

export type TaxeFonciereIntegrityVerifyResult =
  | {
      kind: "match";
      legacyMontant: number;
      resolvedMontant: number;
      candidate: Expense;
    }
  | {
      kind: "amount_divergence";
      legacyMontant: number;
      resolvedMontant: number;
      candidate: Expense;
    }
  | {
      kind: "internal_amount_conflict";
      legacyMontant: number;
      candidate: Expense;
    }
  | { kind: "source_missing"; legacyMontant: number }
  | { kind: "source_unreadable"; legacyMontant: number };

/**
 * Re-lit le document source via le pipeline Expense existant — AUCUNE mutation
 * de `legacyExpense` / collected / Registry / marker / pending.
 */
export async function verifyTaxeFonciereAgainstSource(input: {
  legacyExpense: Expense;
  fiscalYear: number;
  sourceFile: File | null;
  extractText: (file: File) => Promise<string>;
}): Promise<TaxeFonciereIntegrityVerifyResult> {
  const legacyMontant = input.legacyExpense.montant;

  if (input.sourceFile === null) {
    return { kind: "source_missing", legacyMontant };
  }

  // Sans documentId persistant, aucune preuve documentaire traçable n'est
  // possible (un File en mémoire ≠ identité). Pas d'id synthétique.
  const documentId = input.legacyExpense.documentId;
  if (documentId === undefined) {
    return { kind: "source_unreadable", legacyMontant };
  }

  const corpus = (await input.extractText(input.sourceFile)).trim();
  if (!corpus) {
    return { kind: "source_unreadable", legacyMontant };
  }

  const expenses = expensesFromTaxeFonciereCorpus({
    corpus,
    documentId,
    fiscalYear: input.fiscalYear,
  });
  const candidate = expenses[0];
  if (!candidate) {
    return { kind: "source_unreadable", legacyMontant };
  }

  if (candidate.montantConflict) {
    return { kind: "internal_amount_conflict", legacyMontant, candidate };
  }

  if (
    candidate.montantExtrait === undefined ||
    !Number.isFinite(candidate.montant) ||
    taxeFonciereExpenseMissingAmount(candidate)
  ) {
    return { kind: "source_unreadable", legacyMontant };
  }

  // Montant lu dans le document (peut différer de A dans la tolérance).
  const resolvedMontant = candidate.montant;
  const withinTolerance =
    Math.abs(legacyMontant - resolvedMontant) <= TAXE_FONCIERE_AMOUNT_TOLERANCE;

  if (withinTolerance) {
    return { kind: "match", legacyMontant, resolvedMontant, candidate };
  }

  return { kind: "amount_divergence", legacyMontant, resolvedMontant, candidate };
}

/**
 * Marker `verified_match` — A est conservée : `resolvedMontant` = A.montant
 * (pas le montant documentaire éventuellement légèrement différent).
 * Exige un `documentId` réel sur l'Expense legacy.
 */
export function buildTaxeFonciereVerifiedMatchCheck(input: {
  legacyExpense: Expense;
  checkedAt: string;
}): TaxeFonciereIntegrityCheck | undefined {
  const againstDocumentId = input.legacyExpense.documentId;
  if (againstDocumentId === undefined) return undefined;
  if (!Number.isFinite(input.legacyExpense.montant)) {
    return undefined;
  }
  return {
    status: "verified_match",
    checkVersion: TAXE_FONCIERE_INTEGRITY_CHECK_VERSION,
    checkedAt: input.checkedAt,
    againstDocumentId,
    persistedMontantAtCheck: input.legacyExpense.montant,
    resolvedMontant: input.legacyExpense.montant,
  };
}

/**
 * Marker `verified_user_decision` après accept Blocker #2 ouvert par l'intégrité.
 * Exige un `documentId` réel (resolved ou legacy) — jamais d'identité inventée.
 */
export function buildTaxeFonciereVerifiedUserDecisionCheck(input: {
  legacyExpense: Expense;
  resolvedExpense: Expense;
  checkedAt: string;
}): TaxeFonciereIntegrityCheck | undefined {
  const againstDocumentId = input.resolvedExpense.documentId ?? input.legacyExpense.documentId;
  if (againstDocumentId === undefined) return undefined;
  if (!Number.isFinite(input.legacyExpense.montant) || !Number.isFinite(input.resolvedExpense.montant)) {
    return undefined;
  }
  return {
    status: "verified_user_decision",
    checkVersion: TAXE_FONCIERE_INTEGRITY_CHECK_VERSION,
    checkedAt: input.checkedAt,
    againstDocumentId,
    persistedMontantAtCheck: input.legacyExpense.montant,
    resolvedMontant: input.resolvedExpense.montant,
  };
}

/** Marker `user_attested_no_document` — aucune preuve documentaire, escape manuel. */
export function buildTaxeFonciereUserAttestedCheck(input: {
  legacyExpense: Expense;
  resolvedMontant: number;
  checkedAt: string;
}): TaxeFonciereIntegrityCheck | undefined {
  if (!Number.isFinite(input.legacyExpense.montant) || !Number.isFinite(input.resolvedMontant)) {
    return undefined;
  }
  if (!(input.resolvedMontant > 0)) return undefined;
  return {
    status: "user_attested_no_document",
    checkVersion: TAXE_FONCIERE_INTEGRITY_CHECK_VERSION,
    checkedAt: input.checkedAt,
    persistedMontantAtCheck: input.legacyExpense.montant,
    resolvedMontant: input.resolvedMontant,
  };
}

// ---------------------------------------------------------------------------
// Blocker #3 — Lot C : statut d'intégrité dérivé (pure)
// ---------------------------------------------------------------------------

/**
 * Statut produit à partir de détection A + validité marker — aucune I/O.
 * `unresolved` = certainly_exposed et marker absent/invalide (génération bloquée).
 */
export type TaxeFonciereIntegrityStatus =
  | { kind: "none" }
  | {
      kind: "resolved";
      check: TaxeFonciereIntegrityCheck;
      expense: Expense;
    }
  | {
      kind: "unresolved";
      expense: Expense;
      matchedId: string;
      /** True si escape attestation manuelle déjà exigée (decline B3 / source absente). */
      attestationRequired: boolean;
    };

/**
 * Dérive le statut d'intégrité legacy TF. Pure. Réutilise exclusivement
 * `detectTaxeFonciereLegacyRisk` + `isTaxeFonciereIntegrityCheckValid`.
 */
export function resolveTaxeFonciereIntegrityStatus(input: {
  collected: F012CollectedData;
  check: TaxeFonciereIntegrityCheck | undefined;
  attestationRequired?: boolean;
  currentCheckVersion?: typeof TAXE_FONCIERE_INTEGRITY_CHECK_VERSION;
}): TaxeFonciereIntegrityStatus {
  const currentCheckVersion = input.currentCheckVersion ?? TAXE_FONCIERE_INTEGRITY_CHECK_VERSION;
  const risk = detectTaxeFonciereLegacyRisk({ collected: input.collected });
  if (risk.kind !== "certainly_exposed") {
    return { kind: "none" };
  }
  const valid = isTaxeFonciereIntegrityCheckValid({
    check: input.check,
    expense: risk.expense,
    currentCheckVersion,
  });
  if (valid && input.check) {
    return { kind: "resolved", check: input.check, expense: risk.expense };
  }
  return {
    kind: "unresolved",
    expense: risk.expense,
    matchedId: risk.matchedId,
    attestationRequired: input.attestationRequired === true,
  };
}
