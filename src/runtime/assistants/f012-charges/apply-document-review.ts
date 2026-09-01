/**
 * Cycle 8 — review → collected. Aucune Charge sans décision explicite.
 * Conflit : jamais d'écrasement silencieux (mêmes choix que F-011).
 */

import type { FieldSource } from "../../contracts/FieldSource";
import type { CoproLigneInput } from "../../capabilities/f012/compute-copro-deductible";
import type { F012CollectedData } from "./types";
import {
  isProposalRecordable,
  proposalAmount,
  type ChargeProposal,
  type DocumentAmountConflict,
  type DocumentConflictChoice,
  type F012DocumentReview,
} from "./charge-proposal";
import {
  allIgnoredWithoutCharge,
  amountAfterConflict,
  annualImpotsAmount,
  detectAmountConflict,
  isConflictResolved,
  provenanceAfterReview,
} from "./document-review-decisions";

export function isDocumentAlreadyAnalyzed(analyzedDocumentIds: string[] | undefined, documentId: string): boolean {
  return Boolean(analyzedDocumentIds?.includes(documentId));
}

export function decideProposal(
  proposals: ChargeProposal[],
  proposalId: string,
  decision: ChargeProposal["decision"],
  modifiedAmount?: number,
  ignoreReason?: string,
): ChargeProposal[] {
  return proposals.map((proposal) => {
    if (proposal.id !== proposalId) return proposal;
    return {
      ...proposal,
      decision,
      ...(modifiedAmount !== undefined ? { modifiedAmount } : {}),
      ...(ignoreReason !== undefined ? { ignoreReason } : {}),
      missingFields:
        modifiedAmount !== undefined
          ? proposal.missingFields.filter((field) => field !== "amount")
          : proposal.missingFields,
    };
  });
}

/** Plusieurs prélèvements = une même charge annuelle. */
export function decideProposalGroup(
  proposals: ChargeProposal[],
  proposalId: string,
  decision: ChargeProposal["decision"],
  modifiedAmount?: number,
  ignoreReason?: string,
): ChargeProposal[] {
  const target = proposals.find((proposal) => proposal.id === proposalId);
  if (!target?.groupId) {
    return decideProposal(proposals, proposalId, decision, modifiedAmount, ignoreReason);
  }
  return proposals.map((proposal) => {
    if (proposal.groupId !== target.groupId) return proposal;
    if (decision === "modified") {
      if (proposal.id === proposalId) {
        return {
          ...proposal,
          decision,
          modifiedAmount,
          ignoreReason: undefined,
          missingFields: proposal.missingFields.filter((field) => field !== "amount"),
        };
      }
      return {
        ...proposal,
        decision: "ignored",
        ignoreReason: ignoreReason ?? "inclus dans le montant annuel",
      };
    }
    if (decision === "ignored") {
      return { ...proposal, decision: "ignored", ignoreReason };
    }
    return { ...proposal, decision: "confirmed", ignoreReason: undefined };
  });
}

export function reconcileReviewConflicts(input: {
  collected: F012CollectedData;
  review: F012DocumentReview;
  fiscalYear: number;
}): DocumentAmountConflict[] {
  const next =
    input.review.familyId === "impots"
      ? conflictsForImpotsReview({
          collected: input.collected,
          proposals: input.review.proposals,
          fiscalYear: input.fiscalYear,
        })
      : input.review.familyId === "assurances"
        ? conflictsForAssurancesReview({
            collected: input.collected,
            proposals: input.review.proposals,
            fiscalYear: input.fiscalYear,
          })
        : input.review.familyId === "gestion"
          ? conflictsForGestionReview({
              collected: input.collected,
              proposals: input.review.proposals,
              fiscalYear: input.fiscalYear,
            })
          : conflictsForSyndicReview({ collected: input.collected, proposals: input.review.proposals });
  return next.map((conflict) => {
    const previous = input.review.conflicts?.find(
      (item) =>
        item.label === conflict.label &&
        item.existingAmount === conflict.existingAmount &&
        item.incomingAmount === conflict.incomingAmount,
    );
    return previous?.choice ? { ...conflict, choice: previous.choice } : conflict;
  });
}

export function resolveDocumentConflict(
  conflicts: DocumentAmountConflict[],
  choice: DocumentConflictChoice,
  label?: string,
): DocumentAmountConflict[] {
  const target = label
    ? conflicts.find((item) => item.label === label)
    : conflicts.find((item) => !isConflictResolved(item));
  if (!target) return conflicts;
  return conflicts.map((item) =>
    item.label === target.label &&
    item.existingAmount === target.existingAmount &&
    item.incomingAmount === target.incomingAmount
      ? { ...item, choice }
      : item,
  );
}

export function conflictsForImpotsReview(input: {
  collected: F012CollectedData;
  proposals: ChargeProposal[];
  fiscalYear: number;
}): DocumentAmountConflict[] {
  const incoming = annualImpotsAmount(
    input.proposals.map((proposal) => ({ ...proposal, decision: "confirmed" as const })),
    input.fiscalYear,
  );
  const conflict = detectAmountConflict({
    existingAmount: input.collected.taxeFonciere,
    incomingAmount: incoming,
    label: "Taxe foncière",
  });
  return conflict ? [conflict] : [];
}

export function conflictsForAssurancesReview(input: {
  collected: F012CollectedData;
  proposals: ChargeProposal[];
  fiscalYear: number;
}): DocumentAmountConflict[] {
  const conflicts: DocumentAmountConflict[] = [];
  const pendingAsConfirmed = input.proposals.map((proposal) => ({ ...proposal, decision: "confirmed" as const }));
  const logement = annualAssuranceAmount(pendingAsConfirmed, input.fiscalYear, "logement");
  const gli = annualAssuranceAmount(pendingAsConfirmed, input.fiscalYear, "gli");
  const logementConflict = detectAmountConflict({
    existingAmount: input.collected.assurancePno,
    incomingAmount: logement,
    label: "Assurance du logement",
  });
  const gliConflict = detectAmountConflict({
    existingAmount: input.collected.assuranceGli,
    incomingAmount: gli,
    label: "Assurance loyers impayés",
  });
  if (logementConflict) conflicts.push(logementConflict);
  if (gliConflict) conflicts.push(gliConflict);
  return conflicts;
}

export function conflictsForSyndicReview(input: {
  collected: F012CollectedData;
  proposals: ChargeProposal[];
}): DocumentAmountConflict[] {
  const conflicts: DocumentAmountConflict[] = [];
  for (const proposal of input.proposals) {
    if (proposal.exclusionReason || proposal.amount === undefined) continue;
    const type = proposal.coproType ?? "provisions";
    const existing = input.collected.coproLignes.find(
      (ligne) => ligne.type === type && ligne.description === proposal.description,
    );
    if (!existing) continue;
    const conflict = detectAmountConflict({
      existingAmount: existing.montant,
      incomingAmount: proposal.amount,
      label: proposal.description,
    });
    if (conflict) conflicts.push(conflict);
  }
  return conflicts;
}

export type ApplyReviewOutcome = "wrote" | "all_ignored" | "blocked_conflict" | "missing" | "out_of_year";

export function applyImpotsReview(input: {
  collected: F012CollectedData;
  review: F012DocumentReview;
  fiscalYear: number;
}): { collected: F012CollectedData; wroteCharge: boolean; outcome: ApplyReviewOutcome; provenance?: FieldSource } {
  const unresolved = (input.review.conflicts ?? []).filter((conflict) => !isConflictResolved(conflict));
  if (unresolved.length > 0) {
    return { collected: input.collected, wroteCharge: false, outcome: "blocked_conflict" };
  }
  if (allIgnoredWithoutCharge(input.review.proposals)) {
    return {
      collected: withReviewedDocument(input.collected, "impots", input.review.documentId),
      wroteCharge: false,
      outcome: "all_ignored",
    };
  }
  const incoming = annualImpotsAmount(input.review.proposals, input.fiscalYear);
  const conflict = input.review.conflicts?.[0];
  const taxeFonciere = amountAfterConflict(conflict, incoming);
  if (taxeFonciere === undefined) {
    const confirmedOutOfYear = input.review.proposals.some(
      (proposal) =>
        isProposalRecordable(proposal) &&
        proposalAmount(proposal) !== undefined &&
        (proposal.exercise ?? input.fiscalYear) !== input.fiscalYear,
    );
    return {
      collected: input.collected,
      wroteCharge: false,
      outcome: confirmedOutOfYear ? "out_of_year" : "missing",
    };
  }
  return {
    collected: {
      ...input.collected,
      taxeFonciere,
      documentIdsByFamily: {
        ...input.collected.documentIdsByFamily,
        impots: uniqueIds([...(input.collected.documentIdsByFamily?.impots ?? []), input.review.documentId]),
      },
    },
    wroteCharge: true,
    outcome: "wrote",
    provenance: provenanceAfterReview({
      conflict,
      decisions: input.review.proposals.map((proposal) => proposal.decision),
    }),
  };
}

export function applySyndicReview(input: {
  collected: F012CollectedData;
  review: F012DocumentReview;
}): { collected: F012CollectedData; wroteCharge: boolean; outcome: ApplyReviewOutcome; provenance?: FieldSource } {
  const unresolved = (input.review.conflicts ?? []).filter((conflict) => !isConflictResolved(conflict));
  if (unresolved.length > 0) {
    return { collected: input.collected, wroteCharge: false, outcome: "blocked_conflict" };
  }
  if (allIgnoredWithoutCharge(input.review.proposals)) {
    return {
      collected: withReviewedDocument(input.collected, "syndic", input.review.documentId),
      wroteCharge: false,
      outcome: "all_ignored",
    };
  }
  const lignes: CoproLigneInput[] = [];
  for (const proposal of input.review.proposals) {
    if (!isProposalRecordable(proposal)) continue;
    const amount = proposalAmount(proposal);
    if (amount === undefined) continue;
    const type = proposal.coproType ?? "provisions";
    lignes.push({ type, montant: amount, description: proposal.description });
  }
  if (lignes.length === 0) {
    return { collected: input.collected, wroteCharge: false, outcome: "missing" };
  }
  return {
    collected: {
      ...input.collected,
      coproLignes: mergeCoproLignesComplementary(
        input.collected.coproLignes,
        lignes,
        input.review.conflicts ?? [],
      ),
      documentIdsByFamily: {
        ...input.collected.documentIdsByFamily,
        syndic: uniqueIds([...(input.collected.documentIdsByFamily?.syndic ?? []), input.review.documentId]),
      },
    },
    wroteCharge: true,
    outcome: "wrote",
    provenance: provenanceAfterReview({
      decisions: input.review.proposals.map((proposal) => proposal.decision),
    }),
  };
}

export function conflictsForGestionReview(input: {
  collected: F012CollectedData;
  proposals: ChargeProposal[];
  fiscalYear: number;
}): DocumentAmountConflict[] {
  const conflicts: DocumentAmountConflict[] = [];
  const pendingAsConfirmed = input.proposals.map((proposal) => ({ ...proposal, decision: "confirmed" as const }));
  const slots: Array<{ key: GestionSlot; existing?: number; label: string }> = [
    { key: "honorairesGestion", existing: input.collected.honorairesGestion, label: "Frais de l'agence" },
    { key: "fraisEtatDesLieux", existing: input.collected.fraisEtatDesLieux, label: "État des lieux" },
    { key: "honorairesComptable", existing: input.collected.honorairesComptable, label: "Comptable ou logiciel" },
  ];
  for (const slot of slots) {
    const incoming = annualGestionAmount(pendingAsConfirmed, input.fiscalYear, slot.key);
    const conflict = detectAmountConflict({
      existingAmount: slot.existing,
      incomingAmount: incoming,
      label: slot.label,
    });
    if (conflict) conflicts.push(conflict);
  }
  return conflicts;
}

export function applyGestionReview(input: {
  collected: F012CollectedData;
  review: F012DocumentReview;
  fiscalYear: number;
}): { collected: F012CollectedData; wroteCharge: boolean; outcome: ApplyReviewOutcome; provenance?: FieldSource } {
  const unresolved = (input.review.conflicts ?? []).filter((conflict) => !isConflictResolved(conflict));
  if (unresolved.length > 0) {
    return { collected: input.collected, wroteCharge: false, outcome: "blocked_conflict" };
  }
  if (allIgnoredWithoutCharge(input.review.proposals)) {
    return {
      collected: withReviewedDocument(input.collected, "gestion", input.review.documentId),
      wroteCharge: false,
      outcome: "all_ignored",
    };
  }
  const conflictOf = (label: string) => input.review.conflicts?.find((item) => item.label === label);
  const incomingGestion = annualGestionAmount(input.review.proposals, input.fiscalYear, "honorairesGestion");
  const incomingEdl = annualGestionAmount(input.review.proposals, input.fiscalYear, "fraisEtatDesLieux");
  const incomingComptable = annualGestionAmount(input.review.proposals, input.fiscalYear, "honorairesComptable");
  const honorairesGestion = amountAfterConflict(conflictOf("Frais de l'agence"), incomingGestion) ?? input.collected.honorairesGestion;
  const fraisEtatDesLieux = amountAfterConflict(conflictOf("État des lieux"), incomingEdl) ?? input.collected.fraisEtatDesLieux;
  const honorairesComptable =
    amountAfterConflict(conflictOf("Comptable ou logiciel"), incomingComptable) ?? input.collected.honorairesComptable;
  const confirmedOutOfYear = input.review.proposals.some(
    (proposal) =>
      isProposalRecordable(proposal) &&
      proposal.gestionKind !== "loyer" &&
      proposal.gestionKind !== "financement" &&
      proposalAmount(proposal) !== undefined &&
      (proposal.exercise ?? input.fiscalYear) !== input.fiscalYear,
  );
  if (honorairesGestion === undefined && fraisEtatDesLieux === undefined && honorairesComptable === undefined) {
    return {
      collected: input.collected,
      wroteCharge: false,
      outcome: confirmedOutOfYear ? "out_of_year" : "missing",
    };
  }
  return {
    collected: {
      ...input.collected,
      ...(honorairesGestion !== undefined ? { honorairesGestion } : {}),
      ...(fraisEtatDesLieux !== undefined ? { fraisEtatDesLieux } : {}),
      ...(honorairesComptable !== undefined ? { honorairesComptable } : {}),
      documentIdsByFamily: {
        ...input.collected.documentIdsByFamily,
        gestion: uniqueIds([...(input.collected.documentIdsByFamily?.gestion ?? []), input.review.documentId]),
      },
    },
    wroteCharge: true,
    outcome: "wrote",
    provenance: provenanceAfterReview({
      conflict: conflictOf("Frais de l'agence") ?? conflictOf("État des lieux") ?? conflictOf("Comptable ou logiciel"),
      decisions: input.review.proposals.map((proposal) => proposal.decision),
    }),
  };
}

type GestionSlot = "honorairesGestion" | "fraisEtatDesLieux" | "honorairesComptable";

function slotForGestionKind(kind: ChargeProposal["gestionKind"]): GestionSlot | undefined {
  if (kind === "etat_des_lieux") return "fraisEtatDesLieux";
  if (kind === "comptable" || kind === "logiciel") return "honorairesComptable";
  if (kind === "gestion" || kind === "mise_en_location" || kind === "autre") return "honorairesGestion";
  return undefined;
}

function annualGestionAmount(
  proposals: ChargeProposal[],
  fiscalYear: number,
  slot: GestionSlot,
): number | undefined {
  const slices = proposals.filter(
    (proposal) =>
      isProposalRecordable(proposal) &&
      slotForGestionKind(proposal.gestionKind) === slot &&
      !proposal.exclusionReason &&
      (proposal.exercise ?? fiscalYear) === fiscalYear,
  );
  if (slices.length === 0) return undefined;
  return slices.reduce((sum, proposal) => sum + (proposalAmount(proposal) ?? 0), 0);
}

export function applyAssurancesReview(input: {
  collected: F012CollectedData;
  review: F012DocumentReview;
  fiscalYear: number;
}): { collected: F012CollectedData; wroteCharge: boolean; outcome: ApplyReviewOutcome; provenance?: FieldSource } {
  const unresolved = (input.review.conflicts ?? []).filter((conflict) => !isConflictResolved(conflict));
  if (unresolved.length > 0) {
    return { collected: input.collected, wroteCharge: false, outcome: "blocked_conflict" };
  }
  if (allIgnoredWithoutCharge(input.review.proposals)) {
    return {
      collected: withReviewedDocument(input.collected, "assurances", input.review.documentId),
      wroteCharge: false,
      outcome: "all_ignored",
    };
  }
  const logementConflict = input.review.conflicts?.find((item) => item.label === "Assurance du logement");
  const gliConflict = input.review.conflicts?.find((item) => item.label === "Assurance loyers impayés");
  const incomingLogement = annualAssuranceAmount(input.review.proposals, input.fiscalYear, "logement");
  const incomingGli = annualAssuranceAmount(input.review.proposals, input.fiscalYear, "gli");
  const assurancePno = amountAfterConflict(logementConflict, incomingLogement) ?? input.collected.assurancePno;
  const assuranceGli = amountAfterConflict(gliConflict, incomingGli) ?? input.collected.assuranceGli;
  const confirmedOutOfYear = input.review.proposals.some(
    (proposal) =>
      isProposalRecordable(proposal) &&
      proposal.insuranceKind !== "emprunteur" &&
      proposalAmount(proposal) !== undefined &&
      (proposal.exercise ?? input.fiscalYear) !== input.fiscalYear,
  );
  if (assurancePno === undefined && assuranceGli === undefined) {
    return {
      collected: input.collected,
      wroteCharge: false,
      outcome: confirmedOutOfYear ? "out_of_year" : "missing",
    };
  }
  return {
    collected: {
      ...input.collected,
      ...(assurancePno !== undefined ? { assurancePno } : {}),
      ...(assuranceGli !== undefined ? { assuranceGli } : {}),
      documentIdsByFamily: {
        ...input.collected.documentIdsByFamily,
        assurances: uniqueIds([
          ...(input.collected.documentIdsByFamily?.assurances ?? []),
          input.review.documentId,
        ]),
      },
    },
    wroteCharge: true,
    outcome: "wrote",
    provenance: provenanceAfterReview({
      conflict: logementConflict ?? gliConflict,
      decisions: input.review.proposals.map((proposal) => proposal.decision),
    }),
  };
}

function annualAssuranceAmount(
  proposals: ChargeProposal[],
  fiscalYear: number,
  kind: "logement" | "gli",
): number | undefined {
  const slices = proposals.filter(
    (proposal) =>
      isProposalRecordable(proposal) &&
      proposal.insuranceKind === kind &&
      !proposal.exclusionReason &&
      (proposal.exercise ?? fiscalYear) === fiscalYear,
  );
  if (slices.length === 0) return undefined;
  return slices.reduce((sum, proposal) => sum + (proposalAmount(proposal) ?? 0), 0);
}

/**
 * Deux documents différents : on ajoute les lignes complémentaires.
 * On ne fusionne pas sur le mot « syndic ». Même type + même description + même montant = déjà là.
 */
function mergeCoproLignesComplementary(
  existing: CoproLigneInput[],
  incoming: CoproLigneInput[],
  conflicts: DocumentAmountConflict[],
): CoproLigneInput[] {
  const merged = [...existing];
  for (const ligne of incoming) {
    const conflict = conflicts.find((item) => item.label === ligne.description);
    if (conflict) {
      if (!isConflictResolved(conflict)) continue;
      const index = merged.findIndex(
        (item) => item.type === ligne.type && item.description === ligne.description,
      );
      if (conflict.choice === "keep_existing") continue;
      if (conflict.choice === "use_document" && index >= 0) {
        merged[index] = ligne;
        continue;
      }
    }
    const same = merged.find(
      (item) => item.type === ligne.type && item.montant === ligne.montant && item.description === ligne.description,
    );
    if (!same) merged.push(ligne);
  }
  return merged;
}

function withReviewedDocument(
  collected: F012CollectedData,
  familyId: "impots" | "syndic" | "assurances" | "gestion",
  documentId: string,
): F012CollectedData {
  return {
    ...collected,
    documentIdsByFamily: {
      ...collected.documentIdsByFamily,
      [familyId]: uniqueIds([...(collected.documentIdsByFamily?.[familyId] ?? []), documentId]),
    },
  };
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids)];
}
