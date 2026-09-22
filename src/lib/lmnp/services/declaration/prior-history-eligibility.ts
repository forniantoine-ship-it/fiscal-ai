/**
 * P0 launch safety — antériorité LMNP au réel non reprise.
 *
 * Un exercice qui n'est pas la première année réelle du client a besoin des
 * déficits reportables et des amortissements réputés différés de l'exercice
 * précédent. Sans source d'ouverture valide, F-006 retombe sur `[]` / `0`
 * (`apply-amortissement-stocks.ts`) — un « zéro » silencieux qui peut produire
 * une déclaration fausse. La reprise d'une comptabilité externe est autorisée
 * uniquement lorsqu'une `FiscalYearOpening` external_takeover validée pour le
 * bon exercice est fournie (Lot 4F.2) — jamais sur le statut seul.
 *
 * Pure, sans I/O, jamais de valeur fiscale. Aucune formule F-006 n'est lue ou
 * modifiée.
 *
 * Preuves retenues (uniquement des faits de production) :
 *  - CONTINUITÉ NATIVE — l'exercice a un prédécesseur Fiscal AI
 *    (`previousFiscalYearId`) ET des stocks d'ouverture réellement résolus et
 *    persistés (`stocksOuverture`, avec `sourceClosureId`). Aucune question,
 *    jamais déduite d'une réponse du client.
 *  - PREMIÈRE ANNÉE RÉELLE — jamais déduite de `activityStartDate` ni de
 *    `dateMiseEnService`. Le dépôt documente déjà que ni l'un ni l'autre ne
 *    prouve l'absence d'antériorité (`dispense-2033a.ts`,
 *    `draft-to-liasse-inputs.ts` : `activityStartDate` n'est « pas une
 *    équivalence juridique générale » ; `dateMiseEnService` est celle du BIEN,
 *    un exploitant déjà actif la voit tomber dans l'exercice courant). Même
 *    doctrine que le CA N-1 : « une question explicite est préférable à une
 *    inférence non prouvée ». La réponse du client est donc requise, une
 *    seule fois, puis persistée avec l'exercice.
 *
 * Fail-closed : tout ce qui n'est pas prouvé ou déclaré de façon cohérente
 * bloque.
 */

import type { FiscalYear, PriorHistoryDeclarationStatus } from "../../types/domain";
import type { FiscalYearOpening } from "@/lib/lmnp/services/fiscal-year-opening/types";
import { isUsableExternalTakeoverOpening } from "@/lib/lmnp/services/fiscal-year-opening/is-usable-external-takeover-opening";

export type PriorHistoryFiscalYearFacts = Pick<
  FiscalYear,
  | "previousFiscalYearId"
  | "stocksOuverture"
  | "stocksOuvertureUnavailableReason"
  | "priorHistoryDeclaration"
>;

/**
 * Lot 4F.2 — preuve optionnelle pour débloquer EXTERNAL_HISTORY.
 * Absent = comportement historique (EXTERNAL_HISTORY fermé).
 */
export type PriorHistoryExternalOpeningProof = {
  fiscalYearOpening: FiscalYearOpening;
  /** Exercice de la déclaration demandée — doit égaler opening.targetFiscalYear. */
  requestedFiscalYear: number;
};

/**
 * Lot 5.3 — source unique de l'Opening externe persistée (5.1/5.2).
 * Jamais reconstruite : lit uniquement `fiscalYear.externalTakeoverOpening?.opening`.
 */
export function resolvePersistedExternalTakeoverOpening(fiscalYear: {
  externalTakeoverOpening?: { opening: FiscalYearOpening } | undefined;
}): FiscalYearOpening | undefined {
  return fiscalYear.externalTakeoverOpening?.opening;
}

/**
 * Lot 5.3 — preuve 4F.2 dérivée de la même Opening persistée (même objet).
 */
export function resolveExternalOpeningProofFromFiscalYear(fiscalYear: {
  year: number;
  externalTakeoverOpening?: { opening: FiscalYearOpening } | undefined;
}): PriorHistoryExternalOpeningProof | undefined {
  const fiscalYearOpening = resolvePersistedExternalTakeoverOpening(fiscalYear);
  if (!fiscalYearOpening) return undefined;
  return { fiscalYearOpening, requestedFiscalYear: fiscalYear.year };
}

export type PriorHistoryBlockReason =
  /** Aucune réponse : la situation ne peut pas être prouvée par les données. */
  | "ANSWER_REQUIRED"
  /** Le client déclare une comptabilité réelle antérieure hors Fiscal AI. */
  | "EXTERNAL_HISTORY_DECLARED"
  /** Le client déclare un exercice précédent Fiscal AI, mais aucune continuité réelle n'existe pour cet exercice. */
  | "FISCAL_AI_CLAIM_WITHOUT_CONTINUITY"
  /** Un exercice précédent Fiscal AI existe mais ses stocks d'ouverture sont indisponibles. */
  | "NATIVE_CONTINUITY_MISSING";

export type PriorHistoryEligibility =
  | {
      eligible: true;
      status: "FIRST_REAL_YEAR" | "NATIVE_CONTINUITY" | "EXTERNAL_HISTORY";
      /**
       * NATIVE_CONTINUITY / EXTERNAL_HISTORY (Opening validée) : prouvées.
       * FIRST_REAL_YEAR : toujours déclarée.
       */
      basis: "proven_by_data" | "declared_by_client" | "proven_by_validated_opening";
    }
  | {
      eligible: false;
      status: "EXTERNAL_HISTORY" | "UNKNOWN";
      reason: PriorHistoryBlockReason;
      /** true ⇒ l'écran doit poser (ou permettre de corriger) la question. */
      needsAnswer: boolean;
      /** Raison technique déjà produite par `resolveStocksOuverture()`, si elle a été conservée. */
      detail?: string;
    };

function hasPredecessor(fy: PriorHistoryFiscalYearFacts): boolean {
  return typeof fy.previousFiscalYearId === "string" && fy.previousFiscalYearId.length > 0;
}

function hasValidOpeningStocks(fy: PriorHistoryFiscalYearFacts): boolean {
  const opening = fy.stocksOuverture;
  if (!opening) return false;
  if (typeof opening.sourceClosureId !== "string" || opening.sourceClosureId.length === 0) return false;
  const stocks = opening.stocks;
  if (!stocks || typeof stocks !== "object") return false;
  if (!Array.isArray(stocks.deficits)) return false;
  // Stocks corrompus (élément nul, montant négatif ou non fini) : jamais une
  // continuité valide — F-006 lèverait ou imputerait un montant absurde.
  const validDeficits = stocks.deficits.every(
    (row) =>
      row !== null &&
      typeof row === "object" &&
      Number.isFinite(row.millesime) &&
      Number.isFinite(row.montant) &&
      row.montant >= 0,
  );
  return validDeficits && Number.isFinite(stocks.amortissementsReportes) && stocks.amortissementsReportes >= 0;
}

export function resolvePriorHistoryEligibility(
  fiscalYear: PriorHistoryFiscalYearFacts,
  /**
   * Lot 4F.2 — Opening externe déjà construite (4F.1) pour autoriser
   * EXTERNAL_HISTORY. Jamais reconstruite ici. Absent = EXTERNAL_HISTORY fermé.
   */
  externalOpeningProof?: PriorHistoryExternalOpeningProof,
): PriorHistoryEligibility {
  // 0 — Comptabilité réelle externe déclarée :
  //     - Opening externe validée (bon exercice, source external_takeover) → éligible ;
  //     - sinon → bloqué (comportement historique, fail-closed).
  // Même face à une continuité Fiscal AI : jamais d'arbitrage silencieux.
  if (fiscalYear.priorHistoryDeclaration?.status === "EXTERNAL_HISTORY") {
    if (
      externalOpeningProof &&
      isUsableExternalTakeoverOpening(
        externalOpeningProof.fiscalYearOpening,
        externalOpeningProof.requestedFiscalYear,
      )
    ) {
      return {
        eligible: true,
        status: "EXTERNAL_HISTORY",
        basis: "proven_by_validated_opening",
      };
    }
    return resolveFromDeclaration("EXTERNAL_HISTORY");
  }

  // 1 — Un prédécesseur Fiscal AI existe : ce n'est pas une première année
  // réelle. Seule une continuité réellement persistée autorise ; aucune
  // réponse du client ne peut la remplacer ni la contredire.
  if (hasPredecessor(fiscalYear)) {
    if (hasValidOpeningStocks(fiscalYear)) {
      return { eligible: true, status: "NATIVE_CONTINUITY", basis: "proven_by_data" };
    }
    return {
      eligible: false,
      status: "UNKNOWN",
      reason: "NATIVE_CONTINUITY_MISSING",
      needsAnswer: false,
      detail: fiscalYear.stocksOuvertureUnavailableReason,
    };
  }

  // 2 — Aucun prédécesseur Fiscal AI : seule la réponse explicite tranche.
  const declared = fiscalYear.priorHistoryDeclaration?.status;
  return resolveFromDeclaration(declared);
}

function resolveFromDeclaration(declared: PriorHistoryDeclarationStatus | undefined): PriorHistoryEligibility {
  switch (declared) {
    case "FIRST_REAL_YEAR":
      return { eligible: true, status: "FIRST_REAL_YEAR", basis: "declared_by_client" };
    case "EXTERNAL_HISTORY":
      return {
        eligible: false,
        status: "EXTERNAL_HISTORY",
        reason: "EXTERNAL_HISTORY_DECLARED",
        needsAnswer: true,
      };
    case "FISCAL_AI_PREVIOUS":
      return {
        eligible: false,
        status: "UNKNOWN",
        reason: "FISCAL_AI_CLAIM_WITHOUT_CONTINUITY",
        needsAnswer: true,
      };
    default:
      return { eligible: false, status: "UNKNOWN", reason: "ANSWER_REQUIRED", needsAnswer: true };
  }
}
