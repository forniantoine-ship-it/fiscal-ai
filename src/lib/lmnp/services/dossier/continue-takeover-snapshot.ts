/** Continue l'inventaire d'une reprise depuis le snapshot de clôture précédent.
 * L'annuité par actif est calculée par le moteur ancré existant ; F-010 ne
 * fournit aucun montant ni paramètre de plan historique à cette branche.
 */
import type { FiscalYear } from "@/lib/lmnp/types/domain";
import type { ImmobilisationComptableActif } from "@/lib/lmnp/types/dossier";
import type { ComposantNouveau } from "@/runtime/capabilities/f012/types";
import type { AmortissementPlan, PlanLigne } from "@/runtime/capabilities/f010/types";
import { round2 } from "@/runtime/capabilities/f010/types";
import type { ImmobilisationsRfs } from "@/runtime/capabilities/rfs/types";
import { applyResolvedOpeningDepreciation, type ResolveOpeningDepreciationReady } from "../fiscal-year-opening/resolve-opening-depreciation";
import {
  detailComposantsNouveaux,
  montantMobilierProuve,
  type ComposantImmobilisationDetail,
} from "./immobilisations-comptables";
import { selectCurrentYearAcquisitions } from "./compose-external-history-immobilisations";

export const TAKEOVER_SNAPSHOT_UNAVAILABLE = "TAKEOVER_SNAPSHOT_UNAVAILABLE";
export const TAKEOVER_SNAPSHOT_INCOHERENT = "TAKEOVER_SNAPSHOT_INCOHERENT";

type Continued = {
  status: "ready";
  plan: AmortissementPlan;
  immobilisations: ImmobilisationsRfs;
  totalDotations: number;
};
type Blocked = { status: "blocked"; code: string; reason: string };

function blocked(reason: string, code = TAKEOVER_SNAPSHOT_INCOHERENT): Blocked {
  return { status: "blocked", code, reason };
}

function sum(values: readonly number[]): number {
  return round2(values.reduce((total, value) => total + value, 0));
}

function sameCent(a: number, b: number): boolean {
  return Math.abs(round2(a - b)) <= 0.01;
}

function validHistoricalAsset(asset: ImmobilisationComptableActif, exerciceFiscal: number): string | undefined {
  if (!asset.id || /^f010-\d+$/.test(asset.id) || !asset.propertyId || !asset.label) {
    return `Identité historique incomplète ou instable : ${asset.id || "?"}.`;
  }
  if (
    !Number.isFinite(asset.coutBrut) || asset.coutBrut < 0 ||
    !Number.isFinite(asset.amortissementCumule) || asset.amortissementCumule < 0 ||
    asset.amortissementCumule > asset.coutBrut || !Number.isFinite(asset.vnc) ||
    !sameCent(asset.vnc, asset.coutBrut - asset.amortissementCumule)
  ) {
    return `Brut, cumul ou VNC incohérent pour ${asset.id}.`;
  }
  if (asset.categorie === "terrain") {
    return asset.amortissementCumule === 0 ? undefined : `Terrain amorti : ${asset.id}.`;
  }
  if (asset.categorie !== "composant" && asset.categorie !== "travaux") {
    return `Catégorie historique non prise en charge : ${asset.id}.`;
  }
  const date = asset.dateDebut;
  const parsedDate = date ? new Date(`${date}T00:00:00.000Z`) : undefined;
  const dateYear = parsedDate?.getUTCFullYear() ?? NaN;
  if (
    !date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(dateYear) ||
    parsedDate?.toISOString().slice(0, 10) !== date ||
    dateYear >= exerciceFiscal || !Number.isInteger(asset.dureeAnnees) ||
    (asset.dureeAnnees ?? 0) <= 0
  ) {
    return `Date ou durée de plan historique absente/invalide pour ${asset.id}.`;
  }
  return undefined;
}

export function continueTakeoverSnapshot(input: {
  opening: FiscalYear["immobilisationsOuverture"];
  exerciceFiscal: number;
  composantsF012Merged?: ComposantNouveau[];
  propertyId?: string;
  dateMiseEnService?: string;
}): Continued | Blocked {
  const opening = input.opening;
  if (!opening?.sourceClosureId || !opening.actifsReprise?.length) {
    return blocked("Snapshot comptable de reprise absent de l'ouverture.", TAKEOVER_SNAPSHOT_UNAVAILABLE);
  }
  const assets = opening.actifsReprise;
  const ids = new Set<string>();
  for (const asset of assets) {
    const issue = validHistoricalAsset(asset, input.exerciceFiscal);
    if (issue) return blocked(issue);
    if (ids.has(asset.id)) return blocked(`Actif historique dupliqué : ${asset.id}.`);
    ids.add(asset.id);
  }
  if (
    !Number.isFinite(opening.brut) || !Number.isFinite(opening.amortissementsCumules) ||
    !Number.isFinite(opening.vnc) ||
    !sameCent(sum(assets.map((a) => a.coutBrut)), opening.brut) ||
    !sameCent(sum(assets.map((a) => a.amortissementCumule)), opening.amortissementsCumules) ||
    !sameCent(opening.brut - opening.amortissementsCumules, opening.vnc)
  ) {
    return blocked("Totaux du snapshot de reprise incohérents avec ses lignes.");
  }

  const currentCollision = (input.composantsF012Merged ?? []).find(
    (c) => ids.has(c.id) && new Date(c.dateDebut).getFullYear() === input.exerciceFiscal,
  );
  if (currentCollision) return blocked(`Acquisition de l'exercice portant un ID historique : ${currentCollision.id}.`);
  const partition = selectCurrentYearAcquisitions({
    composants: input.composantsF012Merged,
    exerciceFiscal: input.exerciceFiscal,
    historicalAssetIds: ids,
  });
  if (partition.incoherent.length > 0) {
    return blocked(`F-012 absent du snapshot et hors exercice : ${partition.incoherent.map((c) => c.id).join(", ")}.`);
  }

  const resolved: Pick<ResolveOpeningDepreciationReady, "entries" | "exerciceFiscal" | "terrain"> = {
    exerciceFiscal: input.exerciceFiscal,
    entries: assets.filter((a) => a.categorie !== "terrain").map((a) => ({
      assetId: a.id,
      propertyId: a.propertyId!,
      label: a.label,
      baseAmortissable: a.coutBrut,
      cumulOuverture: a.amortissementCumule,
      startDate: a.dateDebut!,
      durationYears: a.dureeAnnees!,
      ...(a.prorataConvention ? { prorataConvention: a.prorataConvention } : {}),
      ...(a.nature === "mobilier" && a.categorie === "composant" ? { nature: a.nature } : {}),
    })),
    terrain: assets.filter((a) => a.categorie === "terrain").map((a) => ({
      assetId: a.id,
      propertyId: a.propertyId!,
      label: a.label,
      coutBrut: a.coutBrut,
    })),
  };
  const applied = applyResolvedOpeningDepreciation({ resolved });
  if (!applied.ok) return blocked(applied.issues.map((i) => i.message).join(" "));

  const categoryById = new Map(assets.map((a) => [a.id, a] as const));
  const composants: PlanLigne[] = [];
  const travaux: ComposantImmobilisationDetail[] = [];
  for (const line of applied.plan.lignes) {
    const asset = categoryById.get(line.id!);
    if (!asset) return blocked(`Ligne calculée sans actif de clôture : ${line.id}.`);
    if (asset.categorie === "travaux") {
      travaux.push({
        ...line,
        id: asset.id,
        provenance: "historique",
        propertyId: asset.propertyId,
        origin: asset.origin,
        dateDebut: asset.dateDebut,
      });
    } else {
      composants.push(line);
    }
  }

  const acquisitions = detailComposantsNouveaux(
    partition.acquisitions,
    input.exerciceFiscal,
    input.propertyId,
  );
  const plan: AmortissementPlan = {
    lignes: composants,
    totalBrut: sum(composants.map((l) => l.montant)),
    totalAnnuelExercice: sum(composants.map((l) => l.dotationExercice)),
  };
  const immobilisations: ImmobilisationsRfs = {
    ...plan,
    valeurTerrain: sum(resolved.terrain.map((a) => a.coutBrut)),
    ...(montantMobilierProuve(composants) !== undefined ? { montantMobilier: montantMobilierProuve(composants) } : {}),
    dateMiseEnService: input.dateMiseEnService,
    composantsNouveaux: partition.acquisitions,
    composantsDetail: [...travaux, ...acquisitions],
    mouvements: {
      valeurBruteOuverture: opening.brut,
      amortissementsCumulesOuverture: opening.amortissementsCumules,
      sourceClosureId: opening.sourceClosureId,
    },
  };
  return {
    status: "ready",
    plan,
    immobilisations,
    totalDotations: sum([...applied.plan.lignes.map((l) => l.dotationExercice), ...acquisitions.map((d) => d.dotationExercice)]),
  };
}
