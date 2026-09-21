/**
 * Lot 4 — préremplissage durable N→N+1 (allowlist explicite).
 *
 * Transporte uniquement des faits DURABLES dans le draft N+1. Jamais :
 * confirmations, outputs annuels, one-offs, steps completed, documents.
 * Les assistants rejouent ensuite à partir de cet état (Phase 12).
 */

import type { DeclarationDraft } from "../../types/domain";
import type { F010PersistedState } from "@/runtime/assistants/f010-logement/types";
import type { F011LoanDraft, F011PersistedState } from "@/runtime/assistants/f011-financement/types";

const PREFILL_STAMP = "n-plus-1-durable-prefill";

/**
 * F010 — faits durables du bien (identité / caractéristiques), sans
 * confirmation ni plan annuel. Step volontairement non-`complete` pour
 * forcer la reconfirmation N+1.
 */
export function seedLogementAssistantForNextYear(
  previous: DeclarationDraft | undefined,
): F010PersistedState | undefined {
  const prev = previous?.logementAssistantState;
  if (!prev) return undefined;

  const hasDurable =
    prev.prixAcquisition !== undefined ||
    Boolean(prev.adresse?.trim()) ||
    prev.typeBien !== undefined ||
    prev.surface !== undefined ||
    Boolean(prev.dateAcquisition);

  if (!hasDurable) return undefined;

  return {
    step: "collect_bien",
    nature: prev.nature,
    acquisitionSource: prev.acquisitionSource ?? "manuel",
    prixAcquisition: prev.prixAcquisition,
    natureBien: prev.natureBien,
    typeBien: prev.typeBien,
    surface: prev.surface,
    adresse: prev.adresse,
    dateAcquisition: prev.dateAcquisition,
    localisation: prev.localisation,
    // Lot 5 B3 — frais d'acquisition historiques :
    // - déduction N : choix irréversible conservé, montant courant = 0
    //   (déjà consommés fiscalement) → F010 ne redemande pas collect_frais,
    //   fraisEnCharges N+1 = 0 (pas de double déduction) ;
    // - intégration : montant + choix conservés (base historique stable),
    //   pas une acquisition N+1.
    ...(prev.choixTraitementFrais === "integration"
    ? {
        fraisNotaire: prev.fraisNotaire,
        choixTraitementFrais: "integration" as const,
        fraisAcquisitionHistoriques:
          prev.fraisNotaire !== undefined
            ? {
                montant: prev.fraisNotaire,
                traitement: "integration" as const,
              }
            : prev.fraisAcquisitionHistoriques,
      }
    : prev.choixTraitementFrais === "deduction"
      ? {
          fraisNotaire: 0,
          choixTraitementFrais: "deduction" as const,
          fraisAcquisitionHistoriques: {
            // Préférer le montant historique déjà figé (N+1→N+2) :
            // `fraisNotaire` courant est 0 (consommé), jamais écraser l'historique.
            montant: prev.fraisAcquisitionHistoriques?.montant ?? prev.fraisNotaire ?? 0,
            traitement: "deduction" as const,
          },
        }
      : {
          // Traitement inconnu : ne pas inventer ; laisser F010 collecter si besoin.
          fraisNotaire: undefined,
          choixTraitementFrais: undefined,
          fraisAcquisitionHistoriques: prev.fraisAcquisitionHistoriques,
        }),
    mobilierInclus: prev.mobilierInclus,
    montantMobilier: prev.montantMobilier,
    mobilierMode: prev.mobilierMode,
    ratioTerrain: prev.ratioTerrain,
    fieldSources: prev.fieldSources ?? {},
    // Jamais de confirmed/history/review/extraction N.
    confirmed: undefined,
    history: undefined,
    review: undefined,
    analyzingDocumentId: undefined,
    pendingExtraction: undefined,
    updatedAt: PREFILL_STAMP,
  };
}

/**
 * F011 — caractéristiques contractuelles durables d'un prêt, sans one-offs
 * ni flags annuels (`souscritCetExercice`, IRA, frais dossier, caution payée).
 */
export function durableLoanFromPrevious(loan: F011LoanDraft): F011LoanDraft {
  return {
    pretId: loan.pretId,
    typePret: loan.typePret,
    capitalInitial: loan.capitalInitial,
    tauxNominal: loan.tauxNominal,
    dureeMois: loan.dureeMois,
    datePremiereMensualite: loan.datePremiereMensualite,
    assuranceAnnuelle: loan.assuranceAnnuelle,
    assuranceType: loan.assuranceType,
    typeGarantie: loan.typeGarantie,
    // Explicitement absents (one-offs / annuels N) :
    // commissionCaution, fraisDossier, iraMontant,
    // souscritCetExercice, remboursementAnticipeCetExercice
  };
}

export function seedFinancementAssistantForNextYear(
  previous: DeclarationDraft | undefined,
): F011PersistedState | undefined {
  const loans = previous?.financementAssistantState?.loans;
  if (!loans?.length) return undefined;

  const durableLoans = loans.map(durableLoanFromPrevious);

  return {
    // `aggregate_review` : prêts présents, sortie annuelle absente, confirmation requise.
    step: "aggregate_review",
    presenceEmprunt: true,
    nombrePrets: durableLoans.length,
    currentLoanIndex: 0,
    loans: durableLoans,
    pendingLoan: undefined,
    fieldSources: {},
    history: undefined,
    analyzingDocumentId: undefined,
    pendingExtraction: undefined,
    extractionConflicts: undefined,
    detectedGuaranteeFees: undefined,
    loanFormGeneration: undefined,
    updatedAt: PREFILL_STAMP,
  };
}
