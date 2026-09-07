import type { PatrimonialState } from "../bilan/types";
import type { FiscalResult } from "../f006/types";
import type { IdentiteDeclarante } from "../f007/types";
import type { PretFinancementExercice } from "../f011/types";
import type { FiscalRepresentation, ImmobilisationsRfs } from "./types";

export type BuildFiscalRepresentationInput = {
  fiscalResult: FiscalResult;
  identite: IdentiteDeclarante;
  /**
   * draft.logementAmortissement.plan (F-010) enrichi de
   * draft.logementAmortissement.valeurTerrain (Cycle 35) — déjà persisté,
   * jamais recalculé ici.
   */
  immobilisations?: ImmobilisationsRfs;
  /** draft.financementCharges.prets (F-011) — déjà persisté, jamais recalculé ici. */
  emprunts?: PretFinancementExercice[];
  /**
   * P1-PDF-02-E — transport pur d'un `PatrimonialState` déjà produit par
   * `assemblePatrimoine()`. Jamais assemblé ici, jamais remplacé par 0.
   * `undefined` = aucune donnée de bilan fournie (comportement historique).
   */
  patrimoine?: PatrimonialState;
};

/**
 * Assemblage pur de la RFS.
 *
 * N'appelle AUCUN moteur de calcul fiscal : pas de produceFiscalResult(), pas
 * de applyAmortissementStocks(), aucun recalcul d'amortissement ni d'intérêts,
 * aucune reconstruction parallèle du FiscalResult. Chaque entrée est déjà
 * calculée par F-006/F-010/F-011 et injectée telle quelle — en particulier
 * `input.fiscalResult` est référencé directement dans la sortie, jamais copié
 * champ par champ ni reconstruit : `RFS.fiscalResult === FiscalResult` est
 * garanti par construction (même référence), pas par convention.
 */
export function buildFiscalRepresentation(
  input: BuildFiscalRepresentationInput,
): FiscalRepresentation {
  return {
    exercice: input.fiscalResult.exercice,
    identite: input.identite,
    fiscalResult: input.fiscalResult,
    immobilisations: input.immobilisations,
    emprunts: input.emprunts,
    patrimoine: input.patrimoine,
    trace: {
      // Pas de code KS propre à la RFS elle-même à ce stade (à formaliser
      // dans le KS avant que la RFS ne devienne un artefact officiel) — on
      // transmet uniquement les artefacts déjà revendiqués par le FiscalResult.
      ksArtifacts: [...input.fiscalResult.trace.ksArtifacts],
      assembledAt: new Date().toISOString(),
      sourceFiscalResultAt: input.fiscalResult.trace.computedAt,
      sources: {
        identite: "IdentiteDeclarante (ENT-013)",
        fiscalResult: "FiscalResult (F-006)",
        immobilisations: input.immobilisations
          ? "draft.logementAmortissement.plan (F-010)"
          : undefined,
        emprunts: input.emprunts ? "draft.financementCharges.prets (F-011)" : undefined,
        patrimoine: input.patrimoine
          ? "assemblePatrimoine() (capabilities/bilan) — transport pur"
          : undefined,
      },
    },
  };
}
