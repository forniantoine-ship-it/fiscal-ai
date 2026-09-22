/**
 * Payment V1 — éligibilité d'antériorité LMNP (P0 1858955) côté SERVEUR, avant
 * tout Checkout : un dossier non éligible n'est jamais facturé.
 *
 * Le serveur ne possède pas l'état de l'exercice (workspace IndexedDB). Il ne
 * peut donc pas rejouer `resolvePriorHistoryEligibility` sur des faits qu'il
 * n'a pas ; il ne fait PAS non plus confiance à un booléen client. Pont V1 :
 *
 *  - la réponse du client (FIRST_REAL_YEAR / FISCAL_AI_PREVIOUS / EXTERNAL_HISTORY)
 *    est ENREGISTRÉE côté serveur (`prior_history_status`) par un endpoint
 *    dédié : un payload de checkout ne peut ni l'écraser ni la contourner ;
 *  - une continuité native n'est honorée que si le serveur PROUVE un exercice
 *    précédent payé pour ce dossier (finalisé via Fiscal AI, donc passé par
 *    cette même porte). Sans cela, une continuité revendiquée par le client est
 *    ignorée ;
 *  - si un exercice précédent payé existe, SEULE `NATIVE_CONTINUITY` est
 *    admissible : FIRST_REAL_YEAR et EXTERNAL_HISTORY (même Opening usable)
 *    sont des contradictions et sont rejetées ;
 *  - Lot 5.3 — EXTERNAL_HISTORY n'est autorisé (sans année N-1 payée) que si
 *    le client envoie la FiscalYearOpening persistée et qu'elle passe
 *    `isUsableExternalTakeoverOpening` (même garde 4F.2). Jamais un booléen,
 *    jamais de reconstruction serveur.
 *
 * Résiduel assumé : un client peut mentir en déclarant « première année »
 * sans année N-1 payée. L'assertion est horodatée et conservée (preuve),
 * jamais une preuve de vérité.
 */
import type { PriorHistoryDeclarationStatus } from "@/lib/lmnp/types/domain";
import type { FiscalYearOpening } from "@/lib/lmnp/services/fiscal-year-opening/types";
import {
  resolvePriorHistoryEligibility,
  type PriorHistoryEligibility,
  type PriorHistoryExternalOpeningProof,
  type PriorHistoryFiscalYearFacts,
} from "@/lib/lmnp/services/declaration/prior-history-eligibility";

export type ClientContinuityFacts = Pick<
  PriorHistoryFiscalYearFacts,
  "previousFiscalYearId" | "stocksOuverture" | "stocksOuvertureUnavailableReason"
> & {
  /**
   * Lot 5.3 — Opening externe persistée (IndexedDB client). Validée structurellement
   * via `isUsableExternalTakeoverOpening` ; jamais reconstruite côté serveur.
   */
  fiscalYearOpening?: FiscalYearOpening;
};

export function resolveServerPriorHistoryEligibility(input: {
  /** Réponse enregistrée côté serveur (jamais lue dans le payload de checkout). */
  declaration: PriorHistoryDeclarationStatus | null | undefined;
  /** Fait serveur : l'exercice N-1 de ce dossier est payé. */
  previousYearPaid: boolean;
  /** Faits de continuité envoyés par le client — non fiables, jamais suffisants seuls. */
  clientContinuity?: ClientContinuityFacts;
  /** Exercice demandé (nécessaire pour valider Opening.targetFiscalYear). */
  requestedFiscalYear?: number;
}): PriorHistoryEligibility {
  const priorHistoryDeclaration = input.declaration
    ? { status: input.declaration, declaredAt: "" }
    : undefined;

  const externalOpeningProof: PriorHistoryExternalOpeningProof | undefined =
    input.clientContinuity?.fiscalYearOpening &&
    typeof input.requestedFiscalYear === "number" &&
    Number.isFinite(input.requestedFiscalYear)
      ? {
          fiscalYearOpening: input.clientContinuity.fiscalYearOpening,
          requestedFiscalYear: input.requestedFiscalYear,
        }
      : undefined;

  if (!input.previousYearPaid) {
    // Aucune continuité native corroborée : faits de continuité native ignorés.
    // Lot 5.3 — la preuve Opening externe reste applicable (EXTERNAL_HISTORY).
    return resolvePriorHistoryEligibility({ priorHistoryDeclaration }, externalOpeningProof);
  }

  const result = resolvePriorHistoryEligibility(
    {
      previousFiscalYearId: input.clientContinuity?.previousFiscalYearId,
      stocksOuverture: input.clientContinuity?.stocksOuverture,
      stocksOuvertureUnavailableReason: input.clientContinuity?.stocksOuvertureUnavailableReason,
      priorHistoryDeclaration,
    },
    externalOpeningProof,
  );

  // Exercice précédent payé : seule NATIVE_CONTINUITY est admissible.
  // FIRST_REAL_YEAR et EXTERNAL_HISTORY (même Opening usable) = contradiction.
  if (result.eligible && result.status !== "NATIVE_CONTINUITY") {
    return {
      eligible: false,
      status: "UNKNOWN",
      reason: "NATIVE_CONTINUITY_MISSING",
      needsAnswer: false,
    };
  }
  return result;
}
