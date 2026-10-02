/**
 * R2C.2 — immobilisations, 2033-C, emprunts et détail 2033-B PAR BIEN, puis somme — DORMANT (aucun appelant de production).
 *
 *   Bien A → ImmobilisationsRfs A → réconciliation A → répartition 2033-C A ┐
 *   Bien B → ImmobilisationsRfs B → réconciliation B → répartition 2033-C B ┴→ somme en centimes → colonnes globales
 *
 * Jamais un bloc fusionné : la règle « premier exercice / exercice ultérieur » s'applique à CHAQUE bien (A continuation,
 * B première année). Les règles comptables sont celles d'aujourd'hui, réutilisées telles quelles : `enrichImmobilisationsRfs`,
 * `reconcileImmobilisationsContinuity`, `snapshotImmobilisationsComptables` et `repartir2033CImmobilisations` (la même
 * fonction que le mapper 2033-C mono). Un bien en échec n'est jamais compensé par un autre : la case globale n'est pas
 * publiée, avec la raison du bien.
 *
 * Deux axes distincts, jamais confondus : ORIGINE (native | takeover, reçue explicitement — jamais déduite de l'ordre des
 * biens ni de leur antériorité à ADD_PROPERTY) et MOUVEMENT (first_year | continuation, DÉRIVÉ de la réconciliation du bien).
 *
 * Identités de consolidation : (propertyId, assetId) et (propertyId, pretId). Aucun identifiant persisté n'est réécrit.
 */
import type { DeclarationDraft } from "../types";
import type { ComposantNouveau } from "@/runtime/capabilities/f012/types";
import type { FiscalResult } from "@/runtime/capabilities/f006/types";
import type { PretFinancementExercice } from "@/runtime/capabilities/f011/types";
import type { ImmobilisationsRfs } from "@/runtime/capabilities/rfs/types";
import { round2 } from "@/runtime/capabilities/f007/types";
import { aggregateFiscalInputs } from "@/runtime/capabilities/f006/aggregate-inputs";
import { sumEuros } from "@/runtime/capabilities/f006/cents";
import { repartir2033CImmobilisations } from "@/runtime/capabilities/rfs/projection/map-2033c";
import {
  consoliderCasesParBien,
  RAISON_DOTATION_ABSENTE,
  type CaseConsolidee,
  type CaseNonAlimenteeConsolidee,
} from "@/runtime/capabilities/rfs/projection/consolidate-immobilisations";
import { resolveConservationDetail2033B, type ConservationDetail2033B } from "@/runtime/capabilities/rfs/projection/detail-charges-2033b";
import {
  enrichImmobilisationsRfs,
  reconcileImmobilisationsContinuity,
  snapshotImmobilisationsComptables,
  type ImmobilisationsContinuityReconciliation,
} from "../services/dossier/immobilisations-comptables";
import type { ConsolidatedFiscalInputs, ConsolidatedLoan, PropertyEntryMode, PropertyFiscalContribution } from "./fiscal-consolidation";

// ---------------------------------------------------------------------------
// Bloc d'immobilisations d'un bien
// ---------------------------------------------------------------------------

/** Mouvement du bien pour la 2033-C, dérivé de SA réconciliation (jamais choisi). */
export type PropertyMovement = "first_year" | "continuation" | "unknown";

/** Ouverture comptable PROPRE au bien (clôture N). Absente en première année — jamais un 0 persisté. */
export type PropertyOpening = { brut: number; amortissementsCumules: number; sourceClosureId?: string };

/** Identité de consolidation d'une immobilisation. Les `assetId` persistés (`terrain`, `travaux-1`…) restent inchangés. */
export function assetKey(propertyId: string, assetId: string): string {
  return JSON.stringify([propertyId, assetId]);
}

export type PropertyAsset = {
  readonly key: string;
  readonly propertyId: string;
  readonly assetId: string;
  readonly categorie: "terrain" | "composant" | "travaux";
  readonly coutBrut: number;
  readonly amortissementCumule: number;
};

export type PropertyImmobilisationsReasonCode =
  | "missing_entry_mode"
  | "takeover_without_opening"
  | "dotation_missing"
  | "opening_conflict"
  | "foreign_property_asset"
  | "no_property"
  | "duplicate_property"
  | "duplicate_asset_key"
  | "exercise_mismatch";

export type PropertyImmobilisationsReason = { code: PropertyImmobilisationsReasonCode; propertyId?: string; field?: string };

export type PropertyImmobilisationsInput = {
  propertyId: string;
  /** Explicite : absent → `missing_entry_mode`, jamais supposé. */
  origin?: PropertyEntryMode;
  exerciceFiscal: number;
  /**
   * `draft` : vue « exercice + bien » (plan F-010 + composants F-012, même composition que le chemin natif mono) ;
   * `immobilisations` : bloc déjà composé pour CE bien (ex. reprise : Opening / snapshot, composeurs existants).
   */
  source:
    | { kind: "draft"; view: DeclarationDraft; composantsMerged?: ComposantNouveau[] }
    | { kind: "immobilisations"; immobilisations: ImmobilisationsRfs };
  opening?: PropertyOpening;
  /** Dotation F-014 du bien ; à défaut, lue dans la vue (`amortissementAssistant.totalDotations`). */
  dotationsExercice?: number;
};

export type PropertyImmobilisationsBlock = {
  readonly propertyId: string;
  readonly origin?: PropertyEntryMode;
  readonly exerciceFiscal: number;
  readonly movement: PropertyMovement;
  readonly dateMiseEnService?: string;
  readonly opening?: PropertyOpening;
  /** Bloc du bien, chaque ligne et chaque composant portant le `propertyId` du bien. */
  readonly immobilisations?: ImmobilisationsRfs;
  readonly dotationsExercice?: number;
  readonly reconciliation?: ImmobilisationsContinuityReconciliation;
  /** Actifs physiques du bien (inventaire de clôture), identité composite — base des futurs snapshots par bien. */
  readonly assets: readonly PropertyAsset[];
  readonly assetsComplete: boolean;
  readonly reasons: readonly PropertyImmobilisationsReason[];
};

function stampProperty(immobilisations: ImmobilisationsRfs, propertyId: string): ImmobilisationsRfs {
  return {
    ...immobilisations,
    lignes: immobilisations.lignes.map((ligne) => (ligne.propertyId === undefined ? { ...ligne, propertyId } : ligne)),
    ...(immobilisations.composantsDetail
      ? { composantsDetail: immobilisations.composantsDetail.map((detail) => (detail.propertyId === undefined ? { ...detail, propertyId } : detail)) }
      : {}),
  };
}

export function buildPropertyImmobilisations(input: PropertyImmobilisationsInput): PropertyImmobilisationsBlock {
  const { propertyId, exerciceFiscal, opening } = input;
  const reasons: PropertyImmobilisationsReason[] = [];
  if (input.origin === undefined) reasons.push({ code: "missing_entry_mode", propertyId });

  const ouverture = opening
    ? { valeurBruteOuverture: opening.brut, amortissementsCumulesOuverture: opening.amortissementsCumules, sourceClosureId: opening.sourceClosureId }
    : undefined;
  let composed: ImmobilisationsRfs | undefined;
  let dotationsExercice = input.dotationsExercice;
  if (input.source.kind === "draft") {
    const view = input.source.view;
    dotationsExercice = dotationsExercice ?? view.amortissementAssistant?.totalDotations;
    // Même composition que le parcours natif de `runDeclarationGeneration` (F-010 + F-012 du bien), ici pour CE bien.
    composed = view.logementAmortissement
      ? enrichImmobilisationsRfs({
          immobilisations: {
            ...view.logementAmortissement.plan,
            valeurTerrain: view.logementAmortissement.valeurTerrain,
            montantMobilier: view.logementAmortissement.montantMobilier,
            dateMiseEnService: view.dateMiseEnService,
            composantsNouveaux: view.chargesAssistant?.composantsNouveaux,
          },
          exerciceFiscal,
          composantsMerged: input.source.composantsMerged ?? view.chargesAssistant?.composantsNouveaux,
          propertyId,
          ouverture,
        })
      : undefined;
  } else {
    const provided = input.source.immobilisations;
    if (ouverture && provided.mouvements) reasons.push({ code: "opening_conflict", propertyId });
    composed = ouverture && !provided.mouvements ? { ...provided, mouvements: ouverture } : provided;
  }

  const foreign = composed
    ? [...composed.lignes, ...(composed.composantsDetail ?? [])].some((item) => item.propertyId !== undefined && item.propertyId !== propertyId)
    : false;
  if (foreign) reasons.push({ code: "foreign_property_asset", propertyId });
  const immobilisations = composed ? stampProperty(composed, propertyId) : undefined;

  if (dotationsExercice === undefined) reasons.push({ code: "dotation_missing", propertyId });
  const reconciliation =
    immobilisations && dotationsExercice !== undefined
      ? reconcileImmobilisationsContinuity({ immobilisations, exercice: exerciceFiscal, amortCalcule: dotationsExercice })
      : undefined;
  const movement: PropertyMovement =
    reconciliation?.status === "ok" ? (reconciliation.mode === "premier_exercice" ? "first_year" : "continuation") : "unknown";
  // Une reprise suppose une acquisition déjà traitée historiquement : un bien qui se réconcilie en première année ne
  // peut pas en être une (aucune règle nouvelle : incohérence d'entrée, bloquante).
  if (input.origin === "takeover" && movement === "first_year") reasons.push({ code: "takeover_without_opening", propertyId });

  const snapshot = immobilisations ? snapshotImmobilisationsComptables({ immobilisations, exerciceFiscal, propertyId }) : undefined;
  const assets = (snapshot?.actifs ?? []).map((actif): PropertyAsset => {
    const owner = actif.propertyId ?? propertyId;
    return { key: assetKey(owner, actif.id), propertyId: owner, assetId: actif.id, categorie: actif.categorie, coutBrut: actif.coutBrut, amortissementCumule: actif.amortissementCumule };
  });

  return {
    propertyId,
    ...(input.origin !== undefined ? { origin: input.origin } : {}),
    exerciceFiscal,
    movement,
    ...(immobilisations?.dateMiseEnService !== undefined ? { dateMiseEnService: immobilisations.dateMiseEnService } : {}),
    ...(opening ? { opening } : {}),
    ...(immobilisations ? { immobilisations } : {}),
    ...(dotationsExercice !== undefined ? { dotationsExercice } : {}),
    ...(reconciliation ? { reconciliation } : {}),
    assets,
    assetsComplete: snapshot !== undefined,
    reasons,
  };
}

// ---------------------------------------------------------------------------
// 2033-C consolidée : répartition PAR BIEN (fonction du mapper mono), puis somme
// ---------------------------------------------------------------------------

/** Cases consolidées : types du helper runtime (une seule logique de somme, partagée avec la 2033-C mono/multi). */
export type ConsolidatedCase2033C = CaseConsolidee;
export type ConsolidatedCaseNonAlimentee2033C = CaseNonAlimenteeConsolidee;

export type ConsolidatedImmobilisations = {
  readonly status: "ready" | "blocked";
  readonly blockingReasons: readonly PropertyImmobilisationsReason[];
  readonly blocks: readonly PropertyImmobilisationsBlock[];
  readonly assets: readonly PropertyAsset[];
  readonly form2033C: {
    readonly cases: readonly ConsolidatedCase2033C[];
    readonly casesNonAlimentees: readonly ConsolidatedCaseNonAlimentee2033C[];
  };
};

const CASES_IMMOBILISATIONS = ["426", "476", "490", "492", "496", "570", "576"] as const;
const CASES_MOUVEMENT: ReadonlySet<string> = new Set(["490", "492", "496", "570", "576"]);
const LABEL_572 = "Dotations de l'exercice (amortissements)";

export function consolidatePropertyImmobilisations(
  blocks: readonly PropertyImmobilisationsBlock[],
  options: { amortCalculeGlobal?: number } = {},
): ConsolidatedImmobilisations {
  const blockingReasons: PropertyImmobilisationsReason[] = blocks.flatMap((block) => block.reasons);
  if (blocks.length === 0) blockingReasons.push({ code: "no_property" });
  const ids = blocks.map((block) => block.propertyId);
  for (const propertyId of new Set(ids.filter((id, index) => ids.indexOf(id) !== index))) {
    blockingReasons.push({ code: "duplicate_property", propertyId });
  }
  if (new Set(blocks.map((block) => block.exerciceFiscal)).size > 1) blockingReasons.push({ code: "exercise_mismatch" });

  const assets = blocks.flatMap((block) => block.assets);
  const seen = new Set<string>();
  for (const asset of assets) {
    if (seen.has(asset.key)) blockingReasons.push({ code: "duplicate_asset_key", propertyId: asset.propertyId, field: asset.assetId });
    seen.add(asset.key);
  }

  // R2C.3a — même consolidation que le mapper 2033-C multi (helper runtime), jamais une seconde boucle de somme.
  const consolidation = consoliderCasesParBien({
    blocs: blocks.map((block) => ({
      propertyId: block.propertyId,
      dotationsExercice: block.dotationsExercice,
      repartition:
        block.dotationsExercice === undefined
          ? undefined
          : repartir2033CImmobilisations({ immobilisations: block.immobilisations, exercice: block.exerciceFiscal, amortCalcule: block.dotationsExercice }),
    })),
    caseIds: CASES_IMMOBILISATIONS,
    casesSoumisesAuxDotations: CASES_MOUVEMENT,
    ...(options.amortCalculeGlobal !== undefined ? { amortCalculeGlobal: round2(options.amortCalculeGlobal) } : {}),
  });
  const amortGlobal = options.amortCalculeGlobal !== undefined ? round2(options.amortCalculeGlobal) : consolidation.sommeDotations;
  const cases: ConsolidatedCase2033C[] = [];
  const casesNonAlimentees: ConsolidatedCaseNonAlimentee2033C[] = [];
  if (amortGlobal !== undefined) {
    cases.push({
      caseId: "572",
      label: LABEL_572,
      value: amortGlobal,
      contributions: blocks.map((block) => ({ propertyId: block.propertyId, value: block.dotationsExercice ?? 0 })),
    });
  } else {
    casesNonAlimentees.push({ caseId: "572", label: LABEL_572, categorie: "donnee_absente", raisons: [{ raison: RAISON_DOTATION_ABSENTE }] });
  }
  cases.push(...consolidation.cases);
  casesNonAlimentees.push(...consolidation.casesNonAlimentees);

  return {
    status: blockingReasons.length > 0 ? "blocked" : "ready",
    blockingReasons,
    blocks,
    assets,
    form2033C: { cases, casesNonAlimentees },
  };
}

// ---------------------------------------------------------------------------
// Emprunts multi : (propertyId, pretId)
// ---------------------------------------------------------------------------

/** Emprunt transportable vers une future RFS multi : le `PretFinancementExercice` mono, intact, + son bien. */
export type RfsEmpruntMulti = PretFinancementExercice & { readonly propertyId: string };

/**
 * Collection RFS des emprunts de l'activité : chaque prêt une fois, avec son bien. `[]` uniquement si TOUS les biens ont
 * établi « aucun crédit » (un état inconnu/ambigu bloque en amont, R2C.1). Les `pretId` persistés sont inchangés.
 */
export function rfsEmpruntsMulti(inputs: Pick<ConsolidatedFiscalInputs, "emprunts">): RfsEmpruntMulti[] {
  return inputs.emprunts.map((loan) => ({ ...loan.pret, propertyId: loan.propertyId }));
}

/**
 * Index (propertyId, pretId) des prêts consolidés. DETTE R2C.3 : l'annexe liasse (`build-liasse-dossier-document`,
 * `descriptiveByPretId`) indexe aujourd'hui par `pretId` seul — en multi, elle devra utiliser cet index (`loanKey`).
 */
export function indexLoansByKey(loans: readonly ConsolidatedLoan[]): Map<string, ConsolidatedLoan> {
  return new Map(loans.map((loan) => [loan.key, loan]));
}

// ---------------------------------------------------------------------------
// Détail 2033-B : conservation PAR BIEN, puis somme des détails conservés
// ---------------------------------------------------------------------------

/**
 * `fr.charges` d'UN bien, composé exactement comme `produceFiscalResult` le compose (agrégation F-006 existante + transport
 * des ventilations F-012) — sans aucun calcul fiscal (ni 39 C, ni stocks).
 */
export function propertyChargesForDetail2033B(contribution: PropertyFiscalContribution): FiscalResult["charges"] | undefined {
  const aggregated = aggregateFiscalInputs({ ...contribution.engine, exerciceFiscal: contribution.exerciceFiscal });
  const charges = contribution.engine.chargesAssistant;
  if (!aggregated.data || !charges) return undefined;
  return {
    totalDeductible: aggregated.data.totalChargesDeductibles,
    chargesExploitation: aggregated.data.chargesExploitation,
    chargesFinancement: aggregated.data.chargesFinancement,
    chargesPreExploitation: aggregated.data.chargesPreExploitation,
    chargesExploitationPreExploitation: charges.totalPreExploitation ?? 0,
    totalNonDeductible: aggregated.data.totalNonDeductible,
    detailParCategorie: charges.parCategorie,
    detailPreExploitationParCategorie: charges.parCategoriePreExploitation,
    detailNonDeductibleParCategorie: charges.parCategorieNonDeductible,
    fraisAcquisitionEnCharges: contribution.engine.logementAmortissement?.fraisEnCharges ?? 0,
  };
}

export type MultiPropertyCharges2033BDetail = {
  readonly status: "CONSERVE" | "ECART";
  /** Publiables seulement si TOUS les biens sont conservés. */
  readonly ligne242?: number;
  readonly ligne244?: number;
  readonly parCategorie?: Partial<Record<string, number>>;
  readonly parCategoriePreExploitation?: Partial<Record<string, number>>;
  readonly parCategorieNonDeductible?: Partial<Record<string, number>>;
  readonly raisons: ReadonlyArray<{ propertyId: string; raison: string }>;
  readonly parBien: ReadonlyArray<{ propertyId: string; detail: ConservationDetail2033B }>;
};

const RAISON_ENTREES_INCOMPLETES = "entrées F-006 du bien incomplètes : conservation du détail 2033-B non vérifiable";

/** Somme des tables de détail des biens CONSERVÉS : une table absente sur un bien conservé = aucune catégorie (prouvé par la conservation). */
function sumConservedMaps(maps: ReadonlyArray<Partial<Record<string, number>> | undefined>): Partial<Record<string, number>> | undefined {
  const present = maps.filter((map): map is Partial<Record<string, number>> => map !== undefined);
  if (present.length === 0) return undefined;
  const keys = [...new Set(present.flatMap((map) => Object.keys(map)))];
  return Object.fromEntries(keys.map((key) => [key, sumEuros(present.map((map) => map[key]).filter((value): value is number => value !== undefined))]));
}

const sumDefined = (values: ReadonlyArray<number | undefined>) => {
  const defined = values.filter((value): value is number => value !== undefined);
  return defined.length > 0 ? sumEuros(defined) : undefined;
};

/**
 * ARB-3 — conservation du détail 2033-B vérifiée PAR BIEN (`resolveConservationDetail2033B`, contrat existant), PUIS somme
 * des détails conservés. Un écart de A n'est jamais compensé par B. Un écart ne bloque pas la génération : 242/244 globales
 * ne sont simplement pas publiées, avec la raison de chaque bien. Aucun détail manquant n'est fabriqué.
 */
export function resolveMultiPropertyCharges2033BDetail(
  contributions: readonly PropertyFiscalContribution[],
): MultiPropertyCharges2033BDetail {
  const raisons: Array<{ propertyId: string; raison: string }> = [];
  const parBien: Array<{ propertyId: string; detail: ConservationDetail2033B }> = [];
  const conserved: Array<{ charges: FiscalResult["charges"]; detail: ConservationDetail2033B }> = [];
  for (const contribution of contributions) {
    const charges = propertyChargesForDetail2033B(contribution);
    if (!charges) {
      raisons.push({ propertyId: contribution.propertyId, raison: RAISON_ENTREES_INCOMPLETES });
      continue;
    }
    // `resolveConservationDetail2033B` ne lit que `fr.charges` (contrat documenté du module).
    const detail = resolveConservationDetail2033B({ charges } as FiscalResult);
    parBien.push({ propertyId: contribution.propertyId, detail });
    if (detail.status === "CONSERVE") conserved.push({ charges, detail });
    else for (const raison of detail.raisons) raisons.push({ propertyId: contribution.propertyId, raison });
  }
  if (raisons.length > 0 || contributions.length === 0) return { status: "ECART", raisons, parBien };
  return {
    status: "CONSERVE",
    ligne242: sumDefined(conserved.map((item) => item.detail.ligne242)),
    ligne244: sumDefined(conserved.map((item) => item.detail.ligne244)),
    parCategorie: sumConservedMaps(conserved.map((item) => item.charges.detailParCategorie)),
    parCategoriePreExploitation: sumConservedMaps(conserved.map((item) => item.charges.detailPreExploitationParCategorie)),
    parCategorieNonDeductible: sumConservedMaps(conserved.map((item) => item.charges.detailNonDeductibleParCategorie)),
    raisons,
    parBien,
  };
}
