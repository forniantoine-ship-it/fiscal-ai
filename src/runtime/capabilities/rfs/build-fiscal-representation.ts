import type { PatrimonialState } from "../bilan/types";
import type { FiscalResult } from "../f006/types";
import type { IdentiteDeclarante } from "../f007/types";
import type { Dispense2033AState } from "./dispense-2033a";
import type { ConservationDetail2033B } from "./projection/detail-charges-2033b";
import type { EmpruntRfs, FiscalRepresentation, ImmobilisationsBienRfs, ImmobilisationsRfs } from "./types";

export type BuildFiscalRepresentationInput = {
  fiscalResult: FiscalResult;
  identite: IdentiteDeclarante;
  /**
   * draft.logementAmortissement.plan (F-010) enrichi de
   * draft.logementAmortissement.valeurTerrain (Cycle 35) — déjà persisté,
   * jamais recalculé ici.
   */
  immobilisations?: ImmobilisationsRfs;
  /** Origine du bloc historique lorsqu'il provient d'une Opening ou d'une clôture. */
  immobilisationsSource?: string;
  /**
   * R2C.3b — activité multi-bien : blocs d'immobilisations PAR BIEN (R2C.2), à la place de `immobilisations` (jamais les deux).
   * Transport pur, aucun bloc fusionné.
   */
  immobilisationsParBien?: ImmobilisationsBienRfs[];
  /** R2C.3b — conservation du détail 2033-B vérifiée par bien (transport pur ; absente en mono). */
  detailCharges2033B?: ConservationDetail2033B;
  /** draft.financementCharges.prets (F-011) — déjà persisté, jamais recalculé ici. Multi-bien : `propertyId` porté par prêt. */
  emprunts?: EmpruntRfs[];
  /**
   * P1-PDF-02-E — transport pur d'un `PatrimonialState` déjà produit par
   * `assemblePatrimoine()`. Jamais assemblé ici, jamais remplacé par 0.
   * `undefined` = aucune donnée de bilan fournie (comportement historique).
   */
  patrimoine?: PatrimonialState;
  /**
   * Éligibilité + décision client déjà résolues par
   * `resolveDispense2033AEligibilite()` — jamais recalculées ici, jamais
   * une valeur de repli inventée. `undefined` = aucune résolution encore
   * disponible pour ce dossier.
   */
  dispense2033A?: Dispense2033AState;
  /** SAV-033 — stock de déficits d'ouverture utilisé par F-006 (transport pur ; voir `FiscalRepresentation.deficitsOuverture`). */
  deficitsOuverture?: FiscalRepresentation["deficitsOuverture"];
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
    ...(input.immobilisationsParBien !== undefined ? { immobilisationsParBien: input.immobilisationsParBien } : {}),
    ...(input.detailCharges2033B !== undefined ? { detailCharges2033B: input.detailCharges2033B } : {}),
    emprunts: input.emprunts,
    patrimoine: input.patrimoine,
    dispense2033A: input.dispense2033A,
    ...(input.deficitsOuverture !== undefined ? { deficitsOuverture: input.deficitsOuverture } : {}),
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
          ? input.immobilisationsSource ?? "draft.logementAmortissement.plan (F-010)"
          : input.immobilisationsParBien
            ? input.immobilisationsSource ?? "biens.logementAmortissement.plan (F-010) — un bloc par bien"
            : undefined,
        emprunts: input.emprunts ? "draft.financementCharges.prets (F-011)" : undefined,
        patrimoine: input.patrimoine
          ? "assemblePatrimoine() (capabilities/bilan) — transport pur"
          : undefined,
      },
    },
  };
}
