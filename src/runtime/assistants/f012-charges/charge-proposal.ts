/**
 * Cycle 7 — propositions documentaires (avant Charge).
 * Jamais un résultat fiscal. Une proposition ignorée ne crée pas de Charge.
 */

import type { CoproLigneType } from "../../capabilities/f012/types";
import type { ChargeFamilyId } from "../../capabilities/f012/charge";

/** Mêmes choix que F-011 (`resolve_conflict`). */
export type DocumentConflictChoice = "keep_existing" | "use_document";

export type DocumentAmountConflict = {
  existingAmount: number;
  incomingAmount: number;
  label: string;
  choice?: DocumentConflictChoice;
};

export const DOCUMENTARY_FAMILY_IDS = ["impots", "syndic", "assurances", "gestion"] as const;
export type DocumentaryFamilyId = (typeof DOCUMENTARY_FAMILY_IDS)[number];

/** Cycle 9 — nature d'une proposition assurance. Jamais affiché tel quel à l'utilisateur. */
export type AssuranceProposalKind = "logement" | "gli" | "emprunteur";

/** Cycle 10 — nature d'une proposition agence / comptable. Jamais affiché tel quel à l'utilisateur. */
export type GestionProposalKind =
  | "gestion"
  | "etat_des_lieux"
  | "mise_en_location"
  | "comptable"
  | "logiciel"
  | "autre"
  | "loyer"
  | "financement";

export function isDocumentaryFamily(familyId: ChargeFamilyId): familyId is DocumentaryFamilyId {
  return (DOCUMENTARY_FAMILY_IDS as readonly string[]).includes(familyId);
}

export type ChargeProposalDecision = "pending" | "confirmed" | "modified" | "ignored";

export type ChargeProposalMissingField = "amount" | "exercise" | "paymentDate";

export type ChargeProposal = {
  id: string;
  documentId: string;
  familyId: DocumentaryFamilyId;
  description: string;
  amount?: number;
  exercise?: number;
  paymentDate?: string;
  coproType?: CoproLigneType;
  /** Cycle 9 — logement / loyers impayés / prêt. Absent hors famille assurances. */
  insuranceKind?: AssuranceProposalKind;
  /** Cycle 10 — agence / comptable / loyer exclu. Absent hors famille gestion. */
  gestionKind?: GestionProposalKind;
  /**
   * Cycle 9 — vrai seulement si le document prouve un paiement (date, échéancier).
   * Une prime annuelle seule ne suffit pas : false, puis confirmation utilisateur.
   */
  paymentProven?: boolean;
  exclusionReason?: string;
  missingFields: ChargeProposalMissingField[];
  decision: ChargeProposalDecision;
  modifiedAmount?: number;
  /** Plusieurs prélèvements d'une même taxe annuelle, ou mensualités d'une même prime. */
  groupId?: string;
  ignoreReason?: string;
};

export type F012DocumentReview = {
  documentId: string;
  familyId: DocumentaryFamilyId;
  proposals: ChargeProposal[];
  fileName?: string;
  conflicts?: DocumentAmountConflict[];
};

export function paperInviteMessage(familyId: DocumentaryFamilyId): string {
  if (familyId === "impots") {
    return "Déposez l'avis de taxe foncière. Nous n'inscrirons rien sans votre accord.";
  }
  if (familyId === "assurances") {
    return "Déposez le contrat, l'attestation ou le relevé de paiement. Nous n'inscrirons rien sans votre accord.";
  }
  if (familyId === "gestion") {
    return "Déposez le relevé de l'agence, la facture du comptable ou celle du logiciel. Nous n'inscrirons rien sans votre accord.";
  }
  return "Déposez le décompte annuel du syndic. Nous n'inscrirons rien sans votre accord.";
}

export function missingDocumentFieldMessage(): string {
  return "Je n'ai pas pu confirmer cette information dans le document. Vous pouvez la renseigner manuellement.";
}

export function proposalAmount(proposal: ChargeProposal): number | undefined {
  if (proposal.decision === "modified" && proposal.modifiedAmount !== undefined) {
    return proposal.modifiedAmount;
  }
  return proposal.amount;
}

export function isProposalRecordable(proposal: ChargeProposal): boolean {
  if (proposal.decision === "ignored") return false;
  if (proposal.decision !== "confirmed" && proposal.decision !== "modified") return false;
  if (proposal.exclusionReason) return false;
  return proposalAmount(proposal) !== undefined;
}
