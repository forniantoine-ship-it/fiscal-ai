/**
 * Cycle 8 — décisions de review documentaire (pures).
 * Conflit : mêmes choix que F-011 (`keep_existing` / `use_document`).
 * Aucune Charge ici.
 */

import type { FieldSource } from "../../contracts/FieldSource";
import type {
  ChargeProposal,
  ChargeProposalDecision,
  DocumentAmountConflict,
  DocumentConflictChoice,
} from "./charge-proposal";
import { isProposalRecordable, proposalAmount } from "./charge-proposal";

export type { DocumentAmountConflict, DocumentConflictChoice };

export function detectAmountConflict(input: {
  existingAmount?: number;
  incomingAmount?: number;
  label: string;
}): DocumentAmountConflict | undefined {
  if (input.existingAmount === undefined || input.incomingAmount === undefined) return undefined;
  if (input.existingAmount === input.incomingAmount) return undefined;
  return {
    existingAmount: input.existingAmount,
    incomingAmount: input.incomingAmount,
    label: input.label,
  };
}

export function isConflictResolved(conflict: DocumentAmountConflict | undefined): boolean {
  if (!conflict) return true;
  return conflict.choice === "keep_existing" || conflict.choice === "use_document";
}

export function amountAfterConflict(
  conflict: DocumentAmountConflict | undefined,
  incomingAmount: number | undefined,
): number | undefined {
  if (!conflict) return incomingAmount;
  if (conflict.choice === "keep_existing") return conflict.existingAmount;
  if (conflict.choice === "use_document") return conflict.incomingAmount;
  return undefined;
}

export function provenanceAfterReview(input: {
  conflict?: DocumentAmountConflict;
  decisions: ChargeProposalDecision[];
}): FieldSource {
  if (input.conflict?.choice === "keep_existing") return "manual";
  if (input.decisions.some((decision) => decision === "modified")) return "user_correction";
  return "extracted";
}

export function isProposalDetermined(proposal: ChargeProposal): boolean {
  if (proposal.exclusionReason) return true;
  if (proposal.decision === "ignored") return true;
  if (proposal.missingFields.includes("amount") && proposalAmount(proposal) === undefined) return false;
  if (proposal.amount === undefined && proposal.modifiedAmount === undefined) return false;
  return true;
}

export function canConfirmAll(proposals: ChargeProposal[], conflicts: DocumentAmountConflict[] = []): boolean {
  if (conflicts.some((conflict) => !isConflictResolved(conflict))) return false;
  if (proposals.some((proposal) => proposal.paymentProven === false && !proposal.exclusionReason)) {
    return false;
  }
  return proposals.every((proposal) => isProposalDetermined(proposal) && !proposal.missingFields.includes("amount"));
}

export function confirmAllProposals(proposals: ChargeProposal[]): ChargeProposal[] {
  return proposals.map((proposal) => {
    if (proposal.exclusionReason) return { ...proposal, decision: "ignored" as const, ignoreReason: proposal.exclusionReason };
    if (!isProposalDetermined(proposal)) return proposal;
    if (proposal.decision === "modified" || proposal.decision === "ignored") return proposal;
    return { ...proposal, decision: "confirmed" as const };
  });
}

export function annualImpotsAmount(proposals: ChargeProposal[], fiscalYear: number): number | undefined {
  const slices = proposals.filter(
    (proposal) =>
      isProposalRecordable(proposal) && (proposal.exercise ?? fiscalYear) === fiscalYear,
  );
  if (slices.length === 0) return undefined;
  return slices.reduce((sum, proposal) => sum + (proposalAmount(proposal) ?? 0), 0);
}

export type ReviewRecap = {
  found: number;
  confirmed: number;
  ignored: number;
  missing: number;
  documentIds: string[];
};

export function reviewRecap(proposals: ChargeProposal[]): ReviewRecap {
  const documentIds = [...new Set(proposals.map((proposal) => proposal.documentId))];
  return {
    found: proposals.length,
    confirmed: proposals.filter((proposal) => proposal.decision === "confirmed" || proposal.decision === "modified").length,
    ignored: proposals.filter((proposal) => proposal.decision === "ignored").length,
    missing: proposals.filter((proposal) => !isProposalDetermined(proposal)).length,
    documentIds,
  };
}

export function reviewRecapMessage(recap: ReviewRecap): string {
  const parts = [`Nous avons trouvé ${recap.found} dépense${recap.found > 1 ? "s" : ""}.`];
  if (recap.confirmed > 0) {
    parts.push(`${recap.confirmed} ${recap.confirmed > 1 ? "sont confirmées" : "est confirmée"}.`);
  }
  if (recap.ignored > 0) {
    parts.push(`${recap.ignored} ${recap.ignored > 1 ? "ne sont pas comptées" : "n'est pas comptée"}.`);
  }
  if (recap.missing > 0) {
    parts.push(`${recap.missing} information${recap.missing > 1 ? "s restent" : " reste"} à compléter.`);
  }
  return parts.join(" ");
}

export function everydayProposalTitle(proposal: ChargeProposal): string {
  if (proposal.insuranceKind === "emprunteur") return "Assurance de votre prêt";
  if (proposal.insuranceKind === "gli") return "Assurance loyers impayés";
  if (proposal.familyId === "assurances") return "Assurance du logement";
  if (proposal.gestionKind === "etat_des_lieux") return "État des lieux";
  if (proposal.gestionKind === "mise_en_location") return "Mise en location";
  if (proposal.gestionKind === "comptable") return "Comptable";
  if (proposal.gestionKind === "logiciel") return "Logiciel";
  if (proposal.gestionKind === "autre") return "Autre frais professionnel";
  if (proposal.gestionKind === "loyer") return "Loyers encaissés";
  if (proposal.gestionKind === "financement") return "Frais liés à votre prêt";
  if (proposal.familyId === "gestion") return "Frais de l'agence";
  if (proposal.groupId) return "Taxe foncière";
  if (proposal.coproType === "provisions") return "Charges de l'immeuble";
  if (proposal.coproType === "regularisation") return "Régularisation du syndic";
  if (proposal.coproType === "fonds_travaux") return "Épargne pour de futurs travaux";
  if (proposal.exclusionReason?.includes("avance")) return "Avance versée au syndic";
  if (proposal.familyId === "impots") return "Taxe foncière";
  return proposal.description.replace(/\bALUR\b/gi, "").replace(/\s+/g, " ").trim();
}

export function documentSourceLabel(): string {
  return "Trouvé dans votre document";
}

export function groupProposals(proposals: ChargeProposal[]): ChargeProposal[][] {
  const seen = new Set<string>();
  const groups: ChargeProposal[][] = [];
  for (const proposal of proposals) {
    if (proposal.groupId) {
      if (seen.has(proposal.groupId)) continue;
      seen.add(proposal.groupId);
      groups.push(proposals.filter((item) => item.groupId === proposal.groupId));
      continue;
    }
    groups.push([proposal]);
  }
  return groups;
}

export function groupDisplayAmount(group: ChargeProposal[]): number | undefined {
  const modified = group.find((proposal) => proposal.decision === "modified" && proposal.modifiedAmount !== undefined);
  if (modified?.modifiedAmount !== undefined) return modified.modifiedAmount;
  const amounts = group
    .map((proposal) => proposalAmount(proposal))
    .filter((amount): amount is number => amount !== undefined);
  if (amounts.length === 0) return undefined;
  return amounts.reduce((sum, amount) => sum + amount, 0);
}

export function hasBlockingPendingDecisions(proposals: ChargeProposal[]): boolean {
  return proposals.some(
    (proposal) =>
      proposal.decision === "pending" &&
      !proposal.exclusionReason &&
      proposalAmount(proposal) !== undefined,
  );
}

export function hasMissingRecordableAmount(proposals: ChargeProposal[]): boolean {
  return proposals.some(
    (proposal) =>
      proposal.decision !== "ignored" &&
      !proposal.exclusionReason &&
      proposalAmount(proposal) === undefined,
  );
}

export function reviewAnnouncement(input: {
  proposals: ChargeProposal[];
  conflicts?: DocumentAmountConflict[];
}): string {
  const unresolved = (input.conflicts ?? []).filter((conflict) => !isConflictResolved(conflict));
  if (unresolved[0]) return conflictMessage(unresolved[0]);
  return reviewRecapMessage(reviewRecap(input.proposals));
}

export function everydayProposalNote(proposal: ChargeProposal): string | undefined {
  if (proposal.gestionKind === "loyer") {
    return (
      proposal.exclusionReason ??
      "Ces montants sont des loyers encaissés. Ce n'est pas une dépense."
    );
  }
  if (proposal.gestionKind === "financement" || (proposal.familyId === "gestion" && proposal.exclusionReason?.includes("prêt"))) {
    return (
      proposal.exclusionReason ??
      "Cette dépense concerne votre prêt. Elle est déjà prise en compte dans Financement."
    );
  }
  if (proposal.familyId === "gestion" && proposal.amount !== undefined && proposal.paymentProven === false) {
    const noun =
      proposal.gestionKind === "comptable"
        ? "honoraires de comptable"
        : proposal.gestionKind === "logiciel"
          ? "frais de logiciel"
          : proposal.gestionKind === "etat_des_lieux"
            ? "frais d'état des lieux"
            : "honoraires";
    return (
      `J'ai trouvé des ${noun} de ${proposal.amount.toLocaleString("fr-FR")} €, ` +
      `mais je ne peux pas confirmer la date du paiement.`
    );
  }
  if (proposal.familyId === "gestion" && proposal.amount !== undefined && proposal.paymentProven) {
    const year = proposal.exercise;
    const noun =
      proposal.gestionKind === "etat_des_lieux"
        ? "un état des lieux"
        : proposal.gestionKind === "mise_en_location"
          ? "des frais de mise en location"
          : proposal.gestionKind === "comptable"
            ? "des honoraires de comptable"
            : proposal.gestionKind === "logiciel"
              ? "des frais de logiciel"
              : "des frais de l'agence";
    return year
      ? `J'ai trouvé ${noun} de ${proposal.amount.toLocaleString("fr-FR")} €, payés en ${year}.`
      : undefined;
  }
  if (proposal.insuranceKind === "emprunteur" || proposal.exclusionReason?.includes("prêt")) {
    return (
      proposal.exclusionReason ??
      "Cette assurance concerne votre prêt. Elle est déjà prise en compte dans Financement."
    );
  }
  if (proposal.familyId === "assurances" && proposal.amount !== undefined && proposal.paymentProven === false) {
    const year = proposal.exercise;
    return (
      `J'ai trouvé une prime de ${proposal.amount.toLocaleString("fr-FR")} € par an, ` +
      `mais je ne peux pas confirmer combien vous avez réellement payé` +
      (year ? ` en ${year}` : "") +
      "."
    );
  }
  if (proposal.familyId === "assurances" && proposal.amount !== undefined && proposal.paymentProven) {
    const year = proposal.exercise;
    if (proposal.insuranceKind === "gli") {
      return year
        ? `J'ai trouvé une assurance contre les loyers impayés de ${proposal.amount.toLocaleString("fr-FR")} €, payée en ${year}.`
        : undefined;
    }
    return year
      ? `J'ai trouvé une assurance pour ce logement de ${proposal.amount.toLocaleString("fr-FR")} €, payée en ${year}.`
      : undefined;
  }
  if (proposal.exclusionReason?.includes("épargne")) {
    return "Ce montant n'est pas compté comme une charge déductible.";
  }
  if (proposal.exclusionReason?.includes("avance")) {
    return "Ce montant n'est pas compté comme une charge déductible.";
  }
  if (proposal.missingFields.includes("amount") && proposal.amount === undefined) {
    return "Je n'ai pas pu confirmer cette information dans le document. Vous pouvez la renseigner manuellement.";
  }
  if (proposal.missingFields.includes("paymentDate") && !proposal.paymentDate) {
    return "La date de paiement n'apparaît pas dans le document.";
  }
  if (proposal.exercise !== undefined) {
    return undefined;
  }
  return undefined;
}

export function everydayDecisionLabel(decision: ChargeProposalDecision): string {
  switch (decision) {
    case "confirmed":
      return "Confirmé";
    case "modified":
      return "Corrigé";
    case "ignored":
      return "Non compté";
    case "pending":
      return "À vérifier";
  }
}

export function conflictMessage(conflict: DocumentAmountConflict): string {
  return (
    `Vous aviez indiqué : ${conflict.existingAmount.toLocaleString("fr-FR")} €.\n` +
    `Le document indique : ${conflict.incomingAmount.toLocaleString("fr-FR")} €.`
  );
}

export function allIgnoredWithoutCharge(proposals: ChargeProposal[]): boolean {
  return proposals.length > 0 && proposals.every((proposal) => proposal.decision === "ignored" || Boolean(proposal.exclusionReason));
}
