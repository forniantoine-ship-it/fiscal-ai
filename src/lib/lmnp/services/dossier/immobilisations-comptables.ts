/**
 * Lot 5 — continuité comptable des immobilisations N → N+1 → N+2.
 *
 * Ne crée pas de second moteur : réutilise `assemblePlan` / `prorataPremiereAnnee`
 * (F-010/F-014) pour doter chaque composant, puis expose une composition
 * annuelle déterministe consommable par RFS / 2033-C / clôture.
 *
 * Doctrine :
 * - stock fiscal d'amortissements non déduits ≠ amortissements comptables cumulés ;
 * - UNKNOWN ≠ ZERO (pas de cumul inventé) ;
 * - pas de cession inventée ;
 * - propertyId porté quand connu, jamais `properties[0]` implicite ici.
 */

import { assemblePlan } from "@/runtime/capabilities/f010/assemble-plan";
import { prorataPremiereAnnee } from "@/runtime/capabilities/f010/prorata-premiere-annee";
import type { PlanLigne } from "@/runtime/capabilities/f010/types";
import { round2 } from "@/runtime/capabilities/f010/types";
import type { ComposantNouveau } from "@/runtime/capabilities/f012/types";
import type { ImmobilisationsRfs } from "@/runtime/capabilities/rfs/types";
import type {
  FiscalYearClosure,
  ImmobilisationsComptablesSnapshot,
  ImmobilisationComptableActif,
} from "../../types/dossier";

export type ProvenanceImmobilisation = "historique" | "acquisition_exercice";

function mapProrataForSnapshot(
  convention: PlanLigne["prorataConvention"],
): ImmobilisationComptableActif["prorataConvention"] | undefined {
  if (convention === "annuel_plein") return "annuel_plein";
  if (convention === "mensuel" || convention === "mois") return "mensuel";
  if (convention === "jours_reels" || convention === "jours") return "jours_reels";
  return undefined;
}

export type ComposantImmobilisationDetail = PlanLigne & {
  id: string;
  provenance: ProvenanceImmobilisation;
  propertyId?: string;
  origin?: ComposantNouveau["origin"];
  dateDebut?: string;
};

export type MouvementsImmobilisations = {
  valeurBruteOuverture: number;
  amortissementsCumulesOuverture: number;
  sourceClosureId?: string;
};

/**
 * Dote un `ComposantNouveau` pour un exercice (même chaîne que F-014
 * `mapComposantNouveau` → `assemblePlan`), sans plan_pluriannuel.
 */
export function planLigneFromComposantNouveau(
  composant: ComposantNouveau,
  exerciceFiscal: number,
): PlanLigne {
  const composantAmorti = {
    label: composant.label,
    montant: composant.montant,
    dureeAnnees: composant.dureeAnnees,
    dotationAnnuelle: composant.dotationAnnuelle,
  };
  const premiereAnnee = new Date(composant.dateDebut).getFullYear();
  const prorata = prorataPremiereAnnee({
    composantsBati: [composantAmorti],
    composantsMobilier: [],
    dateDebutAmortissement: composant.dateDebut,
    methodeProrata: "mois",
    exerciceFiscal,
  });
  const dotationProratisee =
    prorata.dotationsAnnee1[0]?.dotationProratisee ?? composant.dotationAnnuelle;
  const assembled = assemblePlan({
    composantsBati: [composantAmorti],
    composantsMobilier: [],
    dotationsAnnee1: [{ label: composant.label, dotationProratisee }],
    premiereAnnee,
    exerciceFiscal,
  });
  return assembled.plan.lignes[0]!;
}

export function provenanceForDateDebut(
  dateDebut: string | undefined,
  exerciceFiscal: number,
): ProvenanceImmobilisation {
  if (!dateDebut) return "historique";
  const year = new Date(dateDebut).getFullYear();
  return year === exerciceFiscal ? "acquisition_exercice" : "historique";
}

/**
 * P0-2B — ouverture comptable fiable (brut + cumul numériques).
 * Quand présente, elle prouve un historique antérieur : la MES draft
 * ne doit plus basculer en `premier_exercice`.
 */
export function hasReliableOpeningMouvements(
  immo: Pick<ImmobilisationsRfs, "mouvements">,
): boolean {
  const m = immo.mouvements;
  return (
    m !== undefined &&
    typeof m.valeurBruteOuverture === "number" &&
    typeof m.amortissementsCumulesOuverture === "number"
  );
}

/**
 * Provenance des lignes de plan (F-010 / Opening) et du terrain.
 * P0-2B : si des mouvements d'ouverture fiables existent, l'inventaire
 * d'ouverture est historique — jamais reclassé en acquisition N via MES draft.
 */
export function provenanceForPlanInventory(
  immo: Pick<ImmobilisationsRfs, "dateMiseEnService" | "mouvements">,
  exerciceFiscal: number,
): ProvenanceImmobilisation {
  if (hasReliableOpeningMouvements(immo)) return "historique";
  return provenanceForDateDebut(immo.dateMiseEnService, exerciceFiscal);
}

/**
 * Détail annuel des composants F-012 (historiques + nouveaux de l'exercice),
 * dédoublonnés par `id` (le plus frais gagne — même règle que mergeComposantsF012).
 */
export function detailComposantsNouveaux(
  composants: ComposantNouveau[] | undefined,
  exerciceFiscal: number,
  propertyId?: string,
): ComposantImmobilisationDetail[] {
  if (!composants?.length) return [];
  const byId = new Map<string, ComposantNouveau>();
  for (const c of composants) byId.set(c.id, c);
  return [...byId.values()].map((c) => {
    const ligne = planLigneFromComposantNouveau(c, exerciceFiscal);
    return {
      ...ligne,
      id: c.id,
      provenance: provenanceForDateDebut(c.dateDebut, exerciceFiscal),
      propertyId,
      origin: c.origin,
      dateDebut: c.dateDebut,
    };
  });
}

export function totalDotationComposantsDetail(
  details: ComposantImmobilisationDetail[],
): number {
  return round2(details.reduce((acc, d) => acc + d.dotationExercice, 0));
}

export function totalBrutComposantsDetail(details: ComposantImmobilisationDetail[]): number {
  return round2(details.reduce((acc, d) => acc + d.montant, 0));
}

export function totalCumulComposantsDetail(details: ComposantImmobilisationDetail[]): number {
  return round2(details.reduce((acc, d) => acc + d.amortissementsCumules, 0));
}

export function totalAcquisitionsExercice(details: ComposantImmobilisationDetail[]): number {
  return round2(
    details
      .filter((d) => d.provenance === "acquisition_exercice")
      .reduce((acc, d) => acc + d.montant, 0),
  );
}

/**
 * Snapshot de clôture comptable — uniquement si brut + cumuls sont fiables
 * (tous les actifs ont un cumul numérique). Jamais de 0 inventé.
 */
export function snapshotImmobilisationsComptables(input: {
  immobilisations: ImmobilisationsRfs;
  exerciceFiscal: number;
  propertyId?: string;
}): ImmobilisationsComptablesSnapshot | undefined {
  const immo = input.immobilisations;
  if (typeof immo.valeurTerrain !== "number") return undefined;

  const details =
    immo.composantsDetail ??
    detailComposantsNouveaux(immo.composantsNouveaux, input.exerciceFiscal, input.propertyId);

  const actifs: ImmobilisationComptableActif[] = [];

  for (const [index, ligne] of immo.lignes.entries()) {
    const anchoredId =
      typeof ligne.id === "string" && ligne.id.length > 0 && !/^f010-\d+$/.test(ligne.id)
        ? ligne.id
        : undefined;
    // Lot 2B : id stable ancré obligatoire quand présent ; sinon fallback
    // historique `f010-${index}` (chemin sans ancre inchangé).
    const id = anchoredId ?? `f010-${index}`;
    const propertyId = ligne.propertyId ?? input.propertyId;
    const prorataConvention = mapProrataForSnapshot(ligne.prorataConvention);

    actifs.push({
      id,
      propertyId,
      label: ligne.label,
      categorie: "composant",
      coutBrut: ligne.montant,
      amortissementCumule: ligne.amortissementsCumules,
      vnc: ligne.vnc,
      provenance: provenanceForPlanInventory(immo, input.exerciceFiscal),
      dateDebut: ligne.dateDebut ?? immo.dateMiseEnService,
      dureeAnnees: ligne.dureeAnnees,
      ...(prorataConvention ? { prorataConvention } : {}),
    });
  }

  actifs.push({
    id: "terrain",
    propertyId: input.propertyId,
    label: "Terrain",
    categorie: "terrain",
    coutBrut: immo.valeurTerrain,
    amortissementCumule: 0,
    vnc: immo.valeurTerrain,
    provenance: provenanceForPlanInventory(immo, input.exerciceFiscal),
  });

  for (const d of details) {
    actifs.push({
      id: d.id,
      propertyId: d.propertyId ?? input.propertyId,
      label: d.label,
      categorie: "travaux",
      coutBrut: d.montant,
      amortissementCumule: d.amortissementsCumules,
      vnc: d.vnc,
      provenance: d.provenance,
      origin: d.origin,
      dateDebut: d.dateDebut,
      dureeAnnees: d.dureeAnnees,
      ...(mapProrataForSnapshot(d.prorataConvention)
        ? { prorataConvention: mapProrataForSnapshot(d.prorataConvention) }
        : {}),
    });
  }

  if (actifs.some((a) => typeof a.amortissementCumule !== "number")) return undefined;

  const brutCloture = round2(
    immo.totalBrut + immo.valeurTerrain + totalBrutComposantsDetail(details),
  );
  const amortissementsCumulesCloture = round2(
    immo.lignes.reduce((acc, l) => acc + l.amortissementsCumules, 0) +
      totalCumulComposantsDetail(details),
  );
  const vncCloture = round2(brutCloture - amortissementsCumulesCloture);

  return {
    brutCloture,
    amortissementsCumulesCloture,
    vncCloture,
    actifs,
  };
}

export function resolveImmobilisationsOuvertureFromClosure(
  closure: Pick<FiscalYearClosure, "id" | "immobilisationsComptables"> | undefined,
): MouvementsImmobilisations | undefined {
  const snap = closure?.immobilisationsComptables;
  if (!snap) return undefined;
  if (
    typeof snap.brutCloture !== "number" ||
    typeof snap.amortissementsCumulesCloture !== "number"
  ) {
    return undefined;
  }
  return {
    valeurBruteOuverture: snap.brutCloture,
    amortissementsCumulesOuverture: snap.amortissementsCumulesCloture,
    sourceClosureId: closure?.id,
  };
}

/**
 * Enrichit le bloc RFS immobilisations : détail F-012 + mouvements d'ouverture
 * (exercice ultérieur). Transport / composition — aucun nouveau moteur.
 */
export function enrichImmobilisationsRfs(input: {
  immobilisations: ImmobilisationsRfs;
  exerciceFiscal: number;
  composantsMerged?: ComposantNouveau[];
  propertyId?: string;
  ouverture?: MouvementsImmobilisations;
}): ImmobilisationsRfs {
  const composantsSource = input.composantsMerged ?? input.immobilisations.composantsNouveaux;
  const composantsDetail = detailComposantsNouveaux(
    composantsSource,
    input.exerciceFiscal,
    input.propertyId,
  );
  return {
    ...input.immobilisations,
    composantsNouveaux: composantsSource,
    composantsDetail,
    ...(input.ouverture
      ? {
          mouvements: {
            valeurBruteOuverture: input.ouverture.valeurBruteOuverture,
            amortissementsCumulesOuverture: input.ouverture.amortissementsCumulesOuverture,
            sourceClosureId: input.ouverture.sourceClosureId,
          },
        }
      : {}),
  };
}

/**
 * Totaux de clôture comptables (F-010 + terrain + détail F-012).
 * `undefined` si terrain absent ou détail F-012 requis mais manquant.
 */
export function computeClosingImmobilisationsTotals(
  immo: ImmobilisationsRfs,
): { brut: number; amortissementsCumules: number } | undefined {
  if (typeof immo.valeurTerrain !== "number") return undefined;
  const f012Details = immo.composantsDetail ?? [];
  if ((immo.composantsNouveaux?.length ?? 0) > 0 && f012Details.length === 0) {
    return undefined;
  }
  const brutF012 = totalBrutComposantsDetail(f012Details);
  const cumulF012 = totalCumulComposantsDetail(f012Details);
  return {
    brut: round2(immo.totalBrut + immo.valeurTerrain + brutF012),
    amortissementsCumules: round2(
      immo.lignes.reduce((acc, l) => acc + l.amortissementsCumules, 0) + cumulF012,
    ),
  };
}

/**
 * Acquisitions de l'exercice = événements explicites `acquisition_exercice`
 * (composants F-012). Jamais `closingGross − openingGross`.
 */
export function explicitAcquisitionsExercice(immo: ImmobilisationsRfs): number {
  return totalAcquisitionsExercice(immo.composantsDetail ?? []);
}

export const IMMOBILISATIONS_GROSS_RECONCILIATION_FAILED =
  "IMMOBILISATIONS_GROSS_RECONCILIATION_FAILED";
export const IMMOBILISATIONS_AMORT_RECONCILIATION_FAILED =
  "IMMOBILISATIONS_AMORT_RECONCILIATION_FAILED";
export const IMMOBILISATIONS_OPENING_UNKNOWN = "IMMOBILISATIONS_OPENING_UNKNOWN";

export type ImmobilisationsContinuityReconciliation =
  | {
      status: "ok";
      mode: "premier_exercice" | "exercice_ulterieur";
      acquisitionsExercice: number;
      brutCloture: number;
      amortissementsCumulesCloture: number;
    }
  | { status: "unknown"; reason: string; code: typeof IMMOBILISATIONS_OPENING_UNKNOWN }
  | {
      status: "fail";
      reason: string;
      code:
        | typeof IMMOBILISATIONS_GROSS_RECONCILIATION_FAILED
        | typeof IMMOBILISATIONS_AMORT_RECONCILIATION_FAILED;
    };

/**
 * Réconciliation ouverture / clôture (Lot 5 B2 / P0-2B).
 *
 * - Une variation n'est pas une acquisition.
 * - expectedClosingGross = opening + acquisitions explicites (pas de cession V1).
 * - expectedClosingAmort = openingAmort + dotation exercice (pas de sortie V1).
 * - Ouverture absente sur exercice ultérieur → UNKNOWN (jamais 0 inventé).
 * - P0-2B : mouvements d'ouverture fiables → jamais `premier_exercice`
 *   (même si `dateMiseEnService` tombe dans l'exercice — MES draft ne
 *   contredit pas un Opening historique).
 */
export function reconcileImmobilisationsContinuity(input: {
  immobilisations: ImmobilisationsRfs;
  exercice: number;
  /** Dotation comptable de l'exercice (= fiscalResult.amortCalcule / case 572). */
  amortCalcule: number;
}): ImmobilisationsContinuityReconciliation {
  const immo = input.immobilisations;
  const totals = computeClosingImmobilisationsTotals(immo);
  if (!totals) {
    return {
      status: "fail",
      code: IMMOBILISATIONS_GROSS_RECONCILIATION_FAILED,
      reason:
        "Totaux d'immobilisations non fiables (terrain absent ou composants F-012 sans détail enrichi).",
    };
  }

  const isPremierExercice =
    !hasReliableOpeningMouvements(immo) &&
    immo.dateMiseEnService !== undefined &&
    new Date(immo.dateMiseEnService).getFullYear() === input.exercice;

  if (isPremierExercice) {
    // 570 = 0 ⇒ 572 doit égaler 576.
    if (Math.abs(round2(input.amortCalcule - totals.amortissementsCumules)) > 0.01) {
      return {
        status: "fail",
        code: IMMOBILISATIONS_AMORT_RECONCILIATION_FAILED,
        reason: `570(0) + 572(${input.amortCalcule}) ≠ 576(${totals.amortissementsCumules}).`,
      };
    }
    return {
      status: "ok",
      mode: "premier_exercice",
      acquisitionsExercice: totals.brut,
      brutCloture: totals.brut,
      amortissementsCumulesCloture: totals.amortissementsCumules,
    };
  }

  const mouvements = immo.mouvements;
  if (!hasReliableOpeningMouvements(immo) || !mouvements) {
    return {
      status: "unknown",
      code: IMMOBILISATIONS_OPENING_UNKNOWN,
      reason:
        "Ouverture comptable absente pour un exercice ultérieur — UNKNOWN ≠ ZERO (490/570 non inventés).",
    };
  }

  const acquisitions = explicitAcquisitionsExercice(immo);
  const expectedGross = round2(mouvements.valeurBruteOuverture + acquisitions);
  if (Math.abs(totals.brut - expectedGross) > 0.01) {
    return {
      status: "fail",
      code: IMMOBILISATIONS_GROSS_RECONCILIATION_FAILED,
      reason:
        `Brut clôture (${totals.brut}) ≠ ouverture (${mouvements.valeurBruteOuverture}) ` +
        `+ acquisitions explicites (${acquisitions}). Variation ≠ acquisition.`,
    };
  }

  const expectedAmort = round2(
    mouvements.amortissementsCumulesOuverture + input.amortCalcule,
  );
  if (Math.abs(totals.amortissementsCumules - expectedAmort) > 0.01) {
    return {
      status: "fail",
      code: IMMOBILISATIONS_AMORT_RECONCILIATION_FAILED,
      reason:
        `570(${mouvements.amortissementsCumulesOuverture}) + 572(${input.amortCalcule}) ` +
        `≠ 576(${totals.amortissementsCumules}).`,
    };
  }

  return {
    status: "ok",
    mode: "exercice_ulterieur",
    acquisitionsExercice: acquisitions,
    brutCloture: totals.brut,
    amortissementsCumulesCloture: totals.amortissementsCumules,
  };
}

/** Snapshot de clôture depuis la RFS déjà validée/générée de N (pas une reconstrution arbitraire). */
export function snapshotImmobilisationsFromGeneratedRfs(input: {
  immobilisations: ImmobilisationsRfs | undefined;
  exerciceFiscal: number;
  propertyId?: string;
}): ImmobilisationsComptablesSnapshot | undefined {
  if (!input.immobilisations) return undefined;
  return snapshotImmobilisationsComptables({
    immobilisations: input.immobilisations,
    exerciceFiscal: input.exerciceFiscal,
    propertyId: input.propertyId,
  });
}
