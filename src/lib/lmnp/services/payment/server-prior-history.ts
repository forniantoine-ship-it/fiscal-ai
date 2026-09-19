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
 *  - si un exercice précédent payé existe, la réponse « première année » est
 *    contradictoire et ne suffit jamais : la continuité native (structure des
 *    stocks d'ouverture, validée par le résolveur P0) est exigée.
 *
 * Résiduel assumé : un client peut mentir en déclarant « première année ».
 * L'assertion est horodatée et conservée (preuve), jamais une preuve de vérité.
 */
import type { PriorHistoryDeclarationStatus } from "@/lib/lmnp/types/domain";
import {
  resolvePriorHistoryEligibility,
  type PriorHistoryEligibility,
  type PriorHistoryFiscalYearFacts,
} from "@/lib/lmnp/services/declaration/prior-history-eligibility";

export type ClientContinuityFacts = Pick<
  PriorHistoryFiscalYearFacts,
  "previousFiscalYearId" | "stocksOuverture" | "stocksOuvertureUnavailableReason"
>;

export function resolveServerPriorHistoryEligibility(input: {
  /** Réponse enregistrée côté serveur (jamais lue dans le payload de checkout). */
  declaration: PriorHistoryDeclarationStatus | null | undefined;
  /** Fait serveur : l'exercice N-1 de ce dossier est payé. */
  previousYearPaid: boolean;
  /** Faits de continuité envoyés par le client — non fiables, jamais suffisants seuls. */
  clientContinuity?: ClientContinuityFacts;
}): PriorHistoryEligibility {
  const priorHistoryDeclaration = input.declaration
    ? { status: input.declaration, declaredAt: "" }
    : undefined;

  if (!input.previousYearPaid) {
    // Aucune continuité corroborée par le serveur : les faits client sont ignorés.
    return resolvePriorHistoryEligibility({ priorHistoryDeclaration });
  }

  const result = resolvePriorHistoryEligibility({
    previousFiscalYearId: input.clientContinuity?.previousFiscalYearId,
    stocksOuverture: input.clientContinuity?.stocksOuverture,
    stocksOuvertureUnavailableReason: input.clientContinuity?.stocksOuvertureUnavailableReason,
    priorHistoryDeclaration,
  });

  if (result.eligible && result.status !== "NATIVE_CONTINUITY") {
    // Exercice précédent payé + « première année » : contradictoire.
    return {
      eligible: false,
      status: "UNKNOWN",
      reason: "NATIVE_CONTINUITY_MISSING",
      needsAnswer: false,
    };
  }
  return result;
}
