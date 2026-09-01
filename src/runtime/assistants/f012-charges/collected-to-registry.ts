/**
 * Cycle 5 — adaptateur pur collected → Charge Registry.
 * Aucune donnée inventée : undefined reste undefined.
 */

import type { FieldSource } from "../../contracts/FieldSource";
import type { CoproLigneInput } from "../../capabilities/f012/compute-copro-deductible";
import type { ChargeCategorie, F012CategoryId, ProfilCharges } from "../../capabilities/f012/types";
import {
  CHARGE_FAMILY_IDS,
  coproChargeId,
  createRecordedCharge,
  emptyChargeRegistry,
  familyIdForCategory,
  scalarChargeId,
  type Charge,
  type ChargeFamilyId,
  type ChargeRegistry,
  type FamilyCoverage,
} from "../../capabilities/f012/charge";
import { resolveFamilyCoverage } from "../../capabilities/f012/family-coverage";
import { unknownReasonForFamily } from "./family-coverage-intents";
import { toF012PersistedState, type F012CollectedData, type F012PersistedState, type F012State } from "./types";

export type CollectedToRegistryInput = {
  collected: F012CollectedData;
  profil?: ProfilCharges;
  categoryInventory: F012CategoryId[];
  fieldSources: Partial<Record<string, FieldSource>>;
  exercise: number;
};

const FAMILY_CATEGORIES: Record<ChargeFamilyId, F012CategoryId[]> = {
  impots: ["taxe_fonciere"],
  syndic: ["copropriete"],
  assurances: ["assurance_pno", "assurance_gli"],
  gestion: ["honoraires_gestion", "honoraires_comptable"],
  travaux: ["travaux"],
  autres: ["frais_bancaires", "divers"],
};

function provenance(
  fieldSources: Partial<Record<string, FieldSource>>,
  key: string,
): FieldSource {
  return fieldSources[key] ?? "manual";
}

function scalarCharge(input: {
  slot: string;
  category: ChargeCategorie;
  amount: number;
  exercise: number;
  fieldKey: string;
  fieldSources: Partial<Record<string, FieldSource>>;
  description?: string;
  documentIds?: string[];
}): Charge {
  return createRecordedCharge({
    id: scalarChargeId(input.slot, input.exercise),
    familyId: familyIdForCategory(input.category),
    category: input.category,
    description: input.description,
    amount: input.amount,
    exercise: input.exercise,
    provenance: provenance(input.fieldSources, input.fieldKey),
    source: input.documentIds && input.documentIds.length > 0 ? "document" : undefined,
    documentIds: input.documentIds,
  });
}

function travauxQualification(t: F012CollectedData["travaux"][number]): Charge["qualification"] {
  if (t.choix === "mixte") return "mixte";
  if (t.natureIntervention) return t.natureIntervention;
  return undefined;
}

export function collectedToChargeRegistry(input: CollectedToRegistryInput): ChargeRegistry {
  const { collected, profil, categoryInventory, fieldSources, exercise } = input;
  const charges: Charge[] = [];

  if (collected.taxeFonciere !== undefined) {
    charges.push(
      scalarCharge({
        slot: "taxe-fonciere",
        category: "taxe_fonciere",
        amount: collected.taxeFonciere,
        exercise,
        fieldKey: "taxe_fonciere",
        fieldSources,
        documentIds: collected.documentIdsByFamily?.impots,
      }),
    );
  }
  if (collected.assurancePno !== undefined) {
    charges.push(
      scalarCharge({
        slot: "assurance-pno",
        category: "assurance_pno",
        amount: collected.assurancePno,
        exercise,
        fieldKey: "assurance_pno",
        fieldSources,
        documentIds: collected.documentIdsByFamily?.assurances,
      }),
    );
  }
  if (collected.assuranceGli !== undefined) {
    charges.push(
      scalarCharge({
        slot: "assurance-gli",
        category: "assurance_gli",
        amount: collected.assuranceGli,
        exercise,
        fieldKey: "assurance_gli",
        fieldSources,
        documentIds: collected.documentIdsByFamily?.assurances,
      }),
    );
  }
  if (collected.honorairesGestion !== undefined) {
    charges.push(
      scalarCharge({
        slot: "honoraires-gestion",
        category: "honoraires_gestion",
        amount: collected.honorairesGestion,
        exercise,
        fieldKey: "honoraires_gestion",
        fieldSources,
        documentIds: collected.documentIdsByFamily?.gestion,
      }),
    );
  }
  if (collected.fraisEtatDesLieux !== undefined) {
    charges.push(
      scalarCharge({
        slot: "frais-etat-des-lieux",
        category: "honoraires_gestion",
        amount: collected.fraisEtatDesLieux,
        exercise,
        fieldKey: "honoraires_gestion",
        fieldSources,
        documentIds: collected.documentIdsByFamily?.gestion,
      }),
    );
  }
  if (collected.honorairesComptable !== undefined) {
    charges.push(
      scalarCharge({
        slot: "honoraires-comptable",
        category: "honoraires_comptable",
        amount: collected.honorairesComptable,
        exercise,
        fieldKey: "honoraires_comptable",
        fieldSources,
        documentIds: collected.documentIdsByFamily?.gestion,
      }),
    );
  }
  if (collected.fraisBancaires !== undefined) {
    charges.push(
      scalarCharge({
        slot: "frais-bancaires",
        category: "frais_bancaires",
        amount: collected.fraisBancaires,
        exercise,
        fieldKey: "frais_bancaires",
        fieldSources,
      }),
    );
  }

  collected.coproLignes.forEach((ligne: CoproLigneInput, index: number) => {
    charges.push(
      createRecordedCharge({
        id: coproChargeId(exercise, ligne.type, index),
        familyId: "syndic",
        category: "copropriete",
        description: ligne.description,
        amount: ligne.montant,
        exercise,
        provenance: provenance(fieldSources, "copropriete"),
        source: collected.documentIdsByFamily?.syndic?.length ? "document" : undefined,
        coproType: ligne.type,
        grosTravauxDeductible: ligne.grosTravauxDeductible,
        documentIds: collected.documentIdsByFamily?.syndic,
      }),
    );
  });

  for (const t of collected.travaux) {
    if (!t.natureIntervention && t.choix === undefined) continue;
    charges.push(
      createRecordedCharge({
        id: t.id,
        familyId: "travaux",
        category: "travaux",
        description: t.description,
        amount: t.montant,
        exercise,
        provenance: provenance(fieldSources, `travaux-${t.id}`),
        qualification: travauxQualification(t),
        travaux: {
          ...(t.choix !== undefined ? { choix: t.choix } : {}),
          ...(t.natureIntervention !== undefined ? { natureIntervention: t.natureIntervention } : {}),
          ...(t.montantReparation !== undefined ? { montantReparation: t.montantReparation } : {}),
        },
        reviewNeeded: t.choix === "incertain" ? true : undefined,
      }),
    );
  }

  for (const item of collected.divers) {
    charges.push(
      createRecordedCharge({
        id: item.id,
        familyId: "autres",
        category: "divers",
        description: item.description,
        amount: item.montant,
        exercise,
        provenance: provenance(fieldSources, item.description),
        financingOverlap: item.financementOverlap,
        exclusionReason: item.financementOverlap === "assurance_emprunteur" ? "f011_overlap" : undefined,
      }),
    );
  }

  for (const line of collected.familyLines ?? []) {
    if (charges.some((charge) => charge.id === line.id)) continue;
    charges.push(
      createRecordedCharge({
        id: line.id,
        familyId: line.familyId,
        category: line.category,
        description: line.description,
        amount: line.montant,
        exercise,
        paidAt: line.paidAt,
        provenance: provenance(fieldSources, line.id),
        financingOverlap: line.financementOverlap,
        exclusionReason: line.financementOverlap === "assurance_emprunteur" ? "f011_overlap" : undefined,
      }),
    );
  }

  const ids = charges.map((c) => c.id);
  const unique = new Set(ids);
  if (unique.size !== ids.length) {
    throw new Error("Charge Registry : collision d'identifiants");
  }

  return {
    exercise,
    charges,
    familyCoverage: buildFamilyCoverage({
      exercise,
      charges,
      collected,
      profil,
      categoryInventory,
    }),
  };
}

function familyApplicable(familyId: ChargeFamilyId, profil: ProfilCharges | undefined): boolean {
  if (!profil) return true;
  switch (familyId) {
    case "syndic":
      return profil.copropriete;
    case "gestion":
      return profil.agence || profil.comptable;
    case "travaux":
      return profil.travaux;
    default:
      return true;
  }
}

function buildFamilyCoverage(input: {
  exercise: number;
  charges: Charge[];
  collected: F012CollectedData;
  profil?: ProfilCharges;
  categoryInventory: F012CategoryId[];
}): FamilyCoverage[] {
  const skipped = new Set(input.collected.skippedCategories);
  const inventory = new Set(input.categoryInventory);
  const noneFamilies = new Set(input.collected.noneFamilies ?? []);
  const reviewedEmptyFamilies = new Set(input.collected.reviewedEmptyFamilies ?? []);

  return CHARGE_FAMILY_IDS.map((familyId) => {
    const chargeIds = input.charges.filter((c) => c.familyId === familyId).map((c) => c.id);
    const cats = FAMILY_CATEGORIES[familyId];
    const inInventory = cats.some((c) => inventory.has(c));
    const presentCats = cats.filter((c) => inventory.has(c));
    const skippedAllPresent = presentCats.length > 0 && presentCats.every((c) => skipped.has(c));
    const resolved = resolveFamilyCoverage({
      chargeCount: chargeIds.length,
      applicable: familyApplicable(familyId, input.profil),
      inInventory,
      explicitUnknown: unknownReasonForFamily(input.collected, familyId),
      explicitNone: noneFamilies.has(familyId),
      reviewedEmpty: reviewedEmptyFamilies.has(familyId),
      skipped: skippedAllPresent,
    });

    return {
      familyId,
      exercise: input.exercise,
      status: resolved.status,
      chargeIds,
      documentIds: input.collected.documentIdsByFamily?.[familyId] ?? [],
      ...(resolved.unknownReason !== undefined ? { unknownReason: resolved.unknownReason } : {}),
    };
  });
}

export function createEmptyRegistryForExercise(exercise: number): ChargeRegistry {
  return emptyChargeRegistry(exercise);
}

/**
 * Cycle 5 — persistance additive du registry (projection de `collected`).
 * Jamais `result`, jamais `LigneCharge[]`. Les snapshots GO_BACK restent
 * sur `toF012PersistedState` (collected seul) pour ne pas gonfler l'historique.
 */
export function toF012PersistedStateWithRegistry(
  state: F012State,
  updatedAt: string,
  exercise: number,
): F012PersistedState {
  const persisted = toF012PersistedState(state, updatedAt);
  persisted.registry = collectedToChargeRegistry({
    collected: state.collected,
    profil: state.profil,
    categoryInventory: state.categoryInventory,
    fieldSources: state.fieldSources,
    exercise,
  });
  return persisted;
}
