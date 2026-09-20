/**
 * F012 V2 document-first — Phase 3 (assurances / gestion / syndic).
 *
 * Réutilise EXACTEMENT les mêmes adaptateurs d'extraction déjà en production
 * (`proposalsFromAssuranceCorpus`, `proposalsFromGestionCorpus`,
 * `proposalsFromCoproCorpus` — inchangés) et le même écran de revue
 * (`DocumentReviewForm` / `ChargeProposal[]` / `receive_document_proposals` /
 * `commit_document_review`) : aucun nouveau parseur, aucune nouvelle UI.
 *
 * Seule la PERSISTANCE change : au lieu d'écrire les champs scalaires legacy
 * (`applyAssurancesReview`/`applyGestionReview`/`applySyndicReview`), ce
 * fichier convertit chaque `ChargeProposal` déjà décidé par l'utilisateur
 * (confirmed/modified/ignored — jamais pending à ce stade, `commit_document_review`
 * bloque déjà sur `hasBlockingPendingDecisions`) en `Expense` canonique,
 * stockée dans `F012CollectedData.documentExpenses[]` — même contrat que la
 * famille "impots" déjà migrée (Phase 2), jamais un second modèle.
 *
 * `itemKey` réutilise le suffixe déjà présent dans `ChargeProposal.id`
 * (`${documentId}:${suffix}`) — même discriminant stable que celui déjà
 * exercé en production par ces trois adaptateurs, jamais recalculé ici.
 * Correctif post-audit P1 — `proposalsFromCoproCorpus` (proposals-from-copro.ts)
 * construit désormais son suffixe à partir de `label`+`amount` (contenu réel
 * extrait, voir `stableCoproItemKey`), plus de l'INDEX de la ligne dans le
 * tableau de transactions : un réordonnancement OCR entre deux passes du
 * même document ne fait donc plus changer l'id de la dépense.
 *
 * Correctif post-audit P1-bis — deux lignes label+amount strictement
 * identiques dans le même document (collision de la clé de base) reçoivent
 * désormais un suffixe d'OCCURRENCE (`--occN`, voir
 * `withOccurrenceDiscriminatedIds` dans proposals-from-copro.ts) dérivé de
 * l'ordre de balayage séquentiel du texte source — plus de collision d'id
 * pour ce cas, sans réintroduire un index de position instable au reorder.
 */

import type { FieldSource } from "../../contracts/FieldSource";
import { deriveExpenseIdFromDocument, isExpenseRecordable, type Expense } from "../../capabilities/f012/expense";
import type { ChargeCategorie } from "../../capabilities/f012/types";
import { uniqueIds, type ApplyReviewOutcome } from "./apply-document-review";
import { allIgnoredWithoutCharge, provenanceAfterReview } from "./document-review-decisions";
import type { ChargeProposal, F012DocumentReview } from "./charge-proposal";
import { proposalAmount } from "./charge-proposal";
import type { F012CollectedData } from "./types";

/**
 * Catégorie fiscale d'une proposition déjà classifiée par son adaptateur
 * d'extraction — aucune nouvelle règle de classification ici, seulement une
 * table de correspondance vers `ChargeCategorie` (déjà utilisée telle quelle
 * par `collected-to-registry.ts` pour les mêmes catégories).
 *
 * Retourne `undefined` pour les propositions encore exclues normativement
 * (loyers encaissés, fonds de travaux ALUR, avance de trésorerie).
 * Assurance emprunteur / frais de financement : deviennent des `Expense`
 * `divers` candidates au recouvrement F-011 (jamais exclus sur le seul libellé).
 */
function categoryForProposal(proposal: ChargeProposal): ChargeCategorie | undefined {
  if (proposal.exclusionReason) return undefined;
  switch (proposal.familyId) {
    case "assurances":
      if (proposal.insuranceKind === "gli") return "assurance_gli";
      if (proposal.insuranceKind === "logement") return "assurance_pno";
      if (proposal.insuranceKind === "emprunteur") return "divers";
      return undefined;
    case "gestion":
      if (proposal.gestionKind === "financement") return "divers";
      if (proposal.gestionKind === "etat_des_lieux") return "honoraires_gestion";
      if (proposal.gestionKind === "comptable" || proposal.gestionKind === "logiciel") {
        return "honoraires_comptable";
      }
      if (
        proposal.gestionKind === "gestion" ||
        proposal.gestionKind === "mise_en_location" ||
        proposal.gestionKind === "autre"
      ) {
        return "honoraires_gestion";
      }
      return undefined;
    case "syndic":
      return "copropriete";
    case "impots":
      return undefined;
  }
}

function financingOverlapForProposal(
  proposal: ChargeProposal,
): "assurance_emprunteur" | "frais_dossier" | undefined {
  if (proposal.insuranceKind === "emprunteur") return "assurance_emprunteur";
  if (proposal.gestionKind === "financement") return "frais_dossier";
  return undefined;
}

/** Extrait le suffixe stable déjà porté par `ChargeProposal.id` (voir limitation syndic ci-dessus). */
function itemKeyFromProposalId(proposal: ChargeProposal): string {
  const prefix = `${proposal.documentId}:`;
  return proposal.id.startsWith(prefix) ? proposal.id.slice(prefix.length) : proposal.id;
}

/**
 * Une proposition déjà décidée (jamais "pending" à ce stade — `commit_document_review`
 * bloque sur `hasBlockingPendingDecisions` avant d'appeler cette fonction) →
 * `Expense`. `undefined` pour une proposition exclue (jamais fiscale) : elle
 * ne laisse aucune trace `Expense`, exactement comme aujourd'hui elle ne
 * laissait aucune Charge.
 */
export function expenseFromDecidedProposal(proposal: ChargeProposal, fiscalYear: number): Expense | undefined {
  const category = categoryForProposal(proposal);
  if (!category) return undefined;

  const amount = proposalAmount(proposal);
  // `commit_document_review` bloque déjà sur `hasMissingRecordableAmount` pour
  // toute proposition confirmed/modified sans montant — ce cas ne devrait pas
  // atteindre cette fonction pour une décision recordable ; pour "ignored",
  // le montant peut légitimement être absent (jamais projeté en Charge).
  const montant = amount ?? 0;

  return {
    id: deriveExpenseIdFromDocument(proposal.documentId, itemKeyFromProposalId(proposal)),
    exerciceFiscal: proposal.exercise ?? fiscalYear,
    montant,
    montantExtrait: proposal.amount,
    description: proposal.description,
    dateDepense: proposal.paymentDate,
    origin: "document",
    documentId: proposal.documentId,
    fieldSources:
      proposal.decision === "modified"
        ? { montant: "user_correction" }
        : amount !== undefined
          ? { montant: "extracted" }
          : {},
    category,
    decision: proposal.decision === "confirmed" || proposal.decision === "modified" ? proposal.decision : "ignored",
    coproType: category === "copropriete" ? proposal.coproType ?? "provisions" : undefined,
    financingOverlap: financingOverlapForProposal(proposal),
  };
}

/**
 * Convertit toutes les propositions déjà décidées d'une revue en `Expense[]`
 * — jamais appelée sur une revue encore `pending` (même garde que
 * `commit_document_review`). Une proposition exclue ne produit aucune
 * `Expense` (voir `expenseFromDecidedProposal`).
 */
export function expensesFromDecidedReview(review: F012DocumentReview, fiscalYear: number): Expense[] {
  const expenses: Expense[] = [];
  for (const proposal of review.proposals) {
    const expense = expenseFromDecidedProposal(proposal, fiscalYear);
    if (expense) expenses.push(expense);
  }
  return expenses;
}

/**
 * Fusionne les `Expense` d'un document dans `collected.documentExpenses` —
 * remplace toute entrée de MÊME id (même document, même item : un nouveau
 * commit sur le même document ne duplique jamais), ajoute les autres. Met à
 * jour `documentIdsByFamily` (même mécanisme que `withReviewedDocument`,
 * réutilisé tel quel) pour que `familyCoverage`/anti-doublon-document restent
 * cohérents avec le chemin ChargeProposal historique.
 */
function withDocumentExpenses(
  collected: F012CollectedData,
  familyId: "syndic" | "assurances" | "gestion",
  documentId: string,
  expenses: Expense[],
): F012CollectedData {
  const existing = collected.documentExpenses ?? [];
  const incomingIds = new Set(expenses.map((expense) => expense.id));
  const merged = [...existing.filter((expense) => !incomingIds.has(expense.id)), ...expenses];
  return {
    ...collected,
    documentExpenses: merged,
    documentIdsByFamily: {
      ...collected.documentIdsByFamily,
      [familyId]: uniqueIds([...(collected.documentIdsByFamily?.[familyId] ?? []), documentId]),
    },
  };
}

/**
 * Remplace `applyAssurancesReview`/`applyGestionReview`/`applySyndicReview`
 * comme étape d'ÉCRITURE de `commit_document_review` pour ces trois familles
 * (§8 de la mission — `ChargeProposal` reste le mécanisme de REVUE
 * interactif, inchangé : `DocumentReviewForm`, conflits, groupes ; seule la
 * PERSISTANCE finale change). Un seul point d'écriture pour les trois
 * familles — jamais trois fonctions quasi identiques (§1/§11).
 *
 * Une proposition déjà décidée "ignored" produit tout de même une `Expense`
 * (decision "ignored") pour rester traçable et cohérente avec le contrat
 * §9/§10 (persistance, jamais reconstruite depuis une Charge) — exactement
 * comme `ignore_taxe_fonciere_expense` le fait déjà pour "impots".
 */
export function applyDocumentReviewAsExpenses(input: {
  collected: F012CollectedData;
  review: F012DocumentReview;
  fiscalYear: number;
}): { collected: F012CollectedData; wroteCharge: boolean; outcome: ApplyReviewOutcome; provenance?: FieldSource } {
  const familyId = input.review.familyId;
  if (familyId === "impots") {
    // Famille non concernée par ce chemin — jamais appelée en pratique
    // (commit_document_review continue de router "impots" vers
    // `applyImpotsReview`), garde défensive uniquement.
    return { collected: input.collected, wroteCharge: false, outcome: "missing" };
  }
  const expenses = expensesFromDecidedReview(input.review, input.fiscalYear);
  const recordable = expenses.filter((expense) => isExpenseRecordable(expense));
  // Même contrôle d'exercice que l'ancien chemin ChargeProposal
  // (`confirmedOutOfYear` dans `applyAssurancesReview`/`applyGestionReview`,
  // §5/§6 de la mission) : un paiement confirmé mais rattaché à un autre
  // exercice ne doit jamais silencieusement avancer la famille — l'Expense
  // est tout de même persistée (traçable, jamais perdue) mais
  // `collected-to-registry.ts` ne la projettera JAMAIS en Charge pour un
  // exercice différent du sien (filtre `exerciceFiscal === exercise`).
  const wroteCharge = recordable.some((expense) => expense.exerciceFiscal === input.fiscalYear);
  const outOfYearOnly = recordable.length > 0 && !wroteCharge;
  // Même règle de provenance que le chemin legacy (`provenanceAfterReview`,
  // déjà utilisée par `applyImpotsReview` et les trois fonctions retirées) :
  // "user_correction" si au moins une ligne a été modifiée, sinon "extracted".
  const provenance = provenanceAfterReview({
    decisions: input.review.proposals.map((proposal) => proposal.decision),
  });

  if (allIgnoredWithoutCharge(input.review.proposals)) {
    return {
      collected: withDocumentExpenses(input.collected, familyId, input.review.documentId, expenses),
      wroteCharge: false,
      outcome: "all_ignored",
    };
  }

  if (outOfYearOnly) {
    return { collected: input.collected, wroteCharge: false, outcome: "out_of_year" };
  }

  if (!wroteCharge) {
    return { collected: input.collected, wroteCharge: false, outcome: "missing" };
  }

  return {
    collected: withDocumentExpenses(input.collected, familyId, input.review.documentId, expenses),
    wroteCharge: true,
    outcome: "wrote",
    provenance,
  };
}
