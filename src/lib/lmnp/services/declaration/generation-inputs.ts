import type { DeclarationDraft } from "@/lib/lmnp/types/domain";
import type { AmortissementFiscalInput, FiscalEngineInputs } from "@/runtime/capabilities/f006/types";
import { financementChargesForGeneration } from "@/lib/lmnp/services/f011/credit-financing-to-financement-charges";

/**
 * R2C.1 — composition des entrées F-006 propres à UN brouillon (dossier mono, ou vue « exercice + bien »), extraite
 * telle quelle de `runDeclarationGeneration` : mêmes sources, mêmes objets, même ordre — aucune règle métier modifiée.
 * Source unique pour la génération mono ET pour la contribution d'un bien à la consolidation multi-bien (R2C).
 */

/** Projection F-014 du brouillon, avant tout ancrage Opening / reprise continuée (qui la remplacent alors). */
export function draftAmortissementForGeneration(
  draft: DeclarationDraft | undefined,
): AmortissementFiscalInput | undefined {
  return draft?.amortissementAssistant
    ? {
        exerciceFiscal: draft.amortissementAssistant.exerciceFiscal,
        totalDotations: draft.amortissementAssistant.totalDotations,
        status: draft.amortissementAssistant.status,
      }
    : undefined;
}

/**
 * P0-2A.1 — reprise EXTERNAL_HISTORY : fraisEnCharges du draft F-010 ne doit jamais contaminer F-006 (acquisition déjà
 * traitée historiquement — JUG-001 / TRF-0001 hors exercice N). Source = Opening external_takeover, pas le draft.
 */
export function logementAmortissementForGeneration(
  draft: DeclarationDraft | undefined,
  usesTakeoverHistory: boolean,
): FiscalEngineInputs["logementAmortissement"] {
  return draft?.logementAmortissement && usesTakeoverHistory
    ? { ...draft.logementAmortissement, fraisEnCharges: 0 }
    : draft?.logementAmortissement;
}

export type FiscalEngineInputsSource = {
  draft: DeclarationDraft | undefined;
  fiscalYear: number;
  /** F-014 du brouillon, ou valeur ancrée par l'Opening / la reprise continuée (décidée par l'appelant). */
  amortissementAssistant: AmortissementFiscalInput | undefined;
  /** Acquisition déjà traitée historiquement : neutralise `fraisEnCharges` de CE brouillon. */
  usesTakeoverHistory: boolean;
  /** Stocks d'ouverture de l'ACTIVITÉ (déficits, amortissements reportés) — jamais ceux d'un bien. */
  openingFiscalStocks?: {
    deficits?: FiscalEngineInputs["stockDeficitsAnterieurs"];
    amortissementsReportes?: FiscalEngineInputs["stockAmortissementsReportes"];
  };
};

export function buildFiscalEngineInputs(source: FiscalEngineInputsSource): FiscalEngineInputs {
  const { draft, fiscalYear } = source;
  return {
    exerciceFiscal: fiscalYear,
    activite: {
      siret: draft?.siret,
      dateMiseEnService: draft?.dateMiseEnService,
      activityType: draft?.activityType,
    },
    logementAmortissement: logementAmortissementForGeneration(draft, source.usesTakeoverHistory),
    // NEXT-2 / NEXT-3 / R1.x (P0-B) — dérivé en direct depuis la donnée source (voir financementChargesForGeneration).
    financementCharges: financementChargesForGeneration(draft, fiscalYear),
    chargesAssistant: draft?.chargesAssistant,
    revenusAssistant: draft?.revenusAssistant,
    amortissementAssistant: source.amortissementAssistant,
    stockDeficitsAnterieurs: source.openingFiscalStocks?.deficits,
    stockAmortissementsReportes: source.openingFiscalStocks?.amortissementsReportes,
  };
}
