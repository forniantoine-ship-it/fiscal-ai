/**
 * Types de domaine — Représentation Fiscale Structurée (RFS).
 *
 * Pivot entre F-006 (calcul fiscal) et les trois consommateurs prévus :
 * document client, adaptateur EDI (futur), liasse fiscale finale (future).
 *
 * Principe directeur : la RFS n'introduit AUCUNE nouvelle donnée calculée.
 * Chaque champ référence un type déjà produit par un moteur existant
 * (F-006/F-007/F-010/F-011) — jamais une copie ni un modèle concurrent.
 * `FiscalResult` en particulier est injecté tel quel : `RFS.fiscalResult`
 * doit rester structurellement identique au `FiscalResult` produit par F-006
 * pour le même dossier (garanti par construction, pas par convention).
 */

import type { FiscalResult } from "../f006/types";
import type { IdentiteDeclarante } from "../f007/types";
import type { AmortissementPlan } from "../f010/types";
import type { PretFinancementExercice } from "../f011/types";
import type { ComposantNouveau } from "../f012/types";

/**
 * Plan d'amortissement (F-010) enrichi de la valeur du terrain — Cycle 35 —
 * et du mobilier isolé — Cycle 58. `ventilationTerrainBati()`/
 * `computePrixRevient()` (F-010) calculent déjà `valeurTerrain`/
 * `montantMobilierIsole`, mais ces champs vivent à côté de
 * `plan: AmortissementPlan` dans la sortie durable de F-010
 * (`draft.logementAmortissement.valeurTerrain`/`.montantMobilier`, cf.
 * `domain.ts`), jamais dans `AmortissementPlan` lui-même. Champs purement
 * additifs : ne redéfinissent et ne recalculent aucun champ de
 * `AmortissementPlan`. `undefined` si la donnée n'a pas été transmise
 * (dossiers/fixtures antérieurs à ces extensions) — jamais une valeur de
 * repli inventée.
 */
export type ImmobilisationsRfs = AmortissementPlan & {
  valeurTerrain?: number;
  /**
   * `draft.logementAmortissement.montantMobilier` (F-010,
   * `computePrixRevient().montantMobilierIsole`) — valeur du mobilier
   * explicitement isolée par F-010, jamais déduite d'un libellé de
   * `PlanLigne`. N'intervient jamais dans F-014
   * (`compose-plan-amortissement.ts` ne la reçoit pas en paramètre) : ne
   * peut donc jamais diverger entre F-010 et F-014, à la différence de
   * `totalBrut`/`totalAnnuelExercice`.
   */
  montantMobilier?: number;
  /**
   * P3-LIASSE-1B.2 — `draft.dateMiseEnService` (F-009) — transport pur,
   * jamais recalculé. Champ frère de `.plan`, au même titre que
   * `valeurTerrain`/`montantMobilier` ci-dessus : gouverne les colonnes de
   * mouvement du 2033-C (début d'exercice / augmentations), aujourd'hui
   * jamais alimentées faute de cette donnée dans la RFS (map-2033c.ts,
   * `RAISON_MOUVEMENT`). `undefined` si le dossier n'a pas encore de date de
   * mise en service persistée — jamais une valeur de repli inventée.
   */
  dateMiseEnService?: string;
  /**
   * P3-LIASSE-1B.2 — `draft.chargesAssistant.composantsNouveaux` (F-012,
   * TRF-0028) — transport pur PAR RÉFÉRENCE, jamais recopié ni recalculé.
   * Ces travaux sont déjà inclus dans `fiscalResult.amortCalcule` (via
   * F-014, `compose-plan-amortissement.ts`) mais n'entrent jamais dans
   * `AmortissementPlan` lui-même (F-010 ne les reçoit jamais en paramètre) —
   * c'est exactement l'écart déjà détecté par la garde de divergence
   * F-010/F-014 des mappers 2033-A/2033-C (`amortissementDivergent`).
   * `undefined` si le dossier n'a pas encore de `chargesAssistant` (F-012
   * non exécuté) — distinct d'un tableau vide, qui signifie « F-012 exécuté,
   * aucun travaux à amortir » (CL-002, F-014 KS).
   */
  composantsNouveaux?: ComposantNouveau[];
};

/**
 * D'où vient un bloc de la RFS. Un bloc, pas une case individuelle — pour la
 * traçabilité case par case d'un formulaire Cerfa, voir `CaseTrace` (F-007),
 * qui reste le bon niveau de granularité une fois la projection Cerfa faite.
 */
export type RfsBlockSource = string;

/**
 * Représentation Fiscale Structurée — source commune aux futurs consommateurs.
 *
 * `charges détaillées` n'a volontairement PAS de champ dédié ici : elles
 * existent déjà dans `fiscalResult.charges.detailParCategorie` (F-006/F-012).
 * Dupliquer ce champ créerait un second modèle concurrent pour la même donnée.
 */
export type FiscalRepresentation = {
  exercice: number;

  /** ENT-013 — identité déclarante (F-007). Référencé, pas copié. */
  identite: IdentiteDeclarante;

  /**
   * FiscalResult (F-006), injecté tel quel par l'assembleur — jamais recalculé,
   * jamais reconstruit à partir du draft. Contient déjà recettes, charges
   * (dont le détail par catégorie), résultat avant amortissement, amortissement
   * déduit/reporté (art. 39C), résultat fiscal ou déficit, stocks de déficits
   * antérieurs.
   */
  fiscalResult: FiscalResult;

  /**
   * Immobilisations détaillées — lecture seule de `draft.logementAmortissement.plan`
   * (F-010, déjà persisté sur le dossier). `undefined` si le dossier n'a pas
   * encore de plan d'amortissement calculé — jamais une valeur de repli inventée.
   * Pas de catégorie Cerfa ni de date d'entrée individuelle à ce stade
   * (périmètre volontairement limité — cf. Étape 4).
   */
  immobilisations?: ImmobilisationsRfs;

  /**
   * Emprunts — lecture seule de `draft.financementCharges.prets` (F-011, déjà
   * persisté), notamment `capitalRestantDu31_12`. `undefined` si le dossier n'a
   * pas (ou pas encore) de financement déclaré.
   */
  emprunts?: PretFinancementExercice[];

  trace: {
    ksArtifacts: string[];
    /** Horodatage de l'assemblage RFS lui-même — distinct du calcul F-006. */
    assembledAt: string;
    /** Horodatage du FiscalResult injecté — permet de détecter un RFS bâti sur un calcul obsolète. */
    sourceFiscalResultAt: string;
    sources: {
      identite: RfsBlockSource;
      fiscalResult: RfsBlockSource;
      immobilisations?: RfsBlockSource;
      emprunts?: RfsBlockSource;
    };
  };
};
