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
import { expenseToCharge, isExpenseRecordable, type Expense } from "../../capabilities/f012/expense";
import { unknownReasonForFamily } from "./family-coverage-intents";
import { toF012PersistedState, type F012CollectedData, type F012PersistedState, type F012State } from "./types";

export type CollectedToRegistryInput = {
  collected: F012CollectedData;
  profil?: ProfilCharges;
  categoryInventory: F012CategoryId[];
  fieldSources: Partial<Record<string, FieldSource>>;
  exercise: number;
};

/**
 * Durcissement défensif — exception NOMMÉE (distinguable par `instanceof`)
 * pour une collision d'identifiants résiduelle dans `collectedToChargeRegistry`.
 * Jamais catchée ici ni transformée en résultat silencieux : c'est
 * `F012ChargesAssistant.handle()` (assistant.ts) qui la catche explicitement
 * pour produire un message utilisateur diagnosticable plutôt qu'un crash
 * brut — toute autre erreur continue de se propager sans être interceptée.
 */
export class ChargeRegistryCollisionError extends Error {
  readonly collidingIds: string[];
  constructor(collidingIds: string[]) {
    super(`Charge Registry : collision d'identifiants (${collidingIds.join(", ") || "inconnu"})`);
    this.name = "ChargeRegistryCollisionError";
    this.collidingIds = collidingIds;
  }
}

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

function recordableDocumentExpensesForExercise(expenses: Expense[] | undefined, exercise: number): Expense[] {
  return (expenses ?? []).filter(
    (expense) => isExpenseRecordable(expense) && expense.exerciceFiscal === exercise,
  );
}

function travauxQualification(t: F012CollectedData["travaux"][number]): Charge["qualification"] {
  if (t.choix === "mixte") return "mixte";
  if (t.natureIntervention) return t.natureIntervention;
  return undefined;
}

export function collectedToChargeRegistry(input: CollectedToRegistryInput): ChargeRegistry {
  const { collected, profil, categoryInventory, fieldSources, exercise } = input;
  const charges: Charge[] = [];

  // F012 V2 Phase 2 — SOURCE canonique pour la taxe foncière quand la
  // dépense provient du nouveau chemin document → Expense (famille "impots"
  // migrée) : `Expense` prime, jamais les deux à la fois (`collected.taxeFonciere`
  // reste la source pour la saisie manuelle / les dossiers non migrés,
  // comportement historique inchangé ci-dessous). Une Expense non encore
  // validée (pending/ignored) ne produit aucune Charge — jamais silencieuse.
  if (collected.taxeFonciereExpense !== undefined) {
    if (isExpenseRecordable(collected.taxeFonciereExpense)) {
      charges.push(expenseToCharge(collected.taxeFonciereExpense).charge);
    }
  } else if (collected.taxeFonciere !== undefined) {
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
  // F012 V2 Phase 3 — dépenses documentaires "assurances"/"gestion"/"syndic"
  // migrées vers `Expense` (collected.documentExpenses), ADDITIVES aux
  // champs scalaires/tableau legacy ci-dessous (jamais un remplacement,
  // jamais les deux au titre de la MÊME dépense — voir le commentaire sur
  // `F012CollectedData.documentExpenses` et `expense-from-document-review.ts` :
  // la saisie manuelle continue d'écrire les champs legacy, le commit de
  // revue documentaire pour ces familles n'écrit plus JAMAIS ces champs).
  // Filtré sur l'exercice courant : une Expense dont l'exercice extrait
  // diffère (paiement à cheval sur l'année suivante) ne doit jamais devenir
  // une Charge de CET exercice (même garde que l'ancien chemin ChargeProposal,
  // qui bloquait déjà l'écriture — "out_of_year" — dans ce cas).
  for (const expense of recordableDocumentExpensesForExercise(collected.documentExpenses, exercise)) {
    charges.push(expenseToCharge(expense).charge);
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
        dateDebut: ligne.dateDebut,
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
          ...(t.dateDebut !== undefined ? { dateDebut: t.dateDebut } : {}),
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
        exclusionReason:
          item.financementOverlap === "assurance_emprunteur" || item.financementOverlap === "frais_dossier"
            ? "f011_overlap"
            : undefined,
      }),
    );
  }

  for (const line of collected.familyLines ?? []) {
    // Fix 7 (Blocker #2 gap résiduel — défense en profondeur, dette
    // historique) — avant ce correctif, un scalaire `collected.taxeFonciere`
    // divergent pouvait produire une `familyLine` parasite
    // (familyId "impots", category "divers", id préfixé "taxe-fonciere:" —
    // seul producteur de ce préfixe, voir `extraLineId("taxe-fonciere", …)`,
    // désormais retiré de `applyOne`). Un état persisté antérieur à ce
    // correctif peut encore porter une telle ligne : elle ne représente
    // jamais une charge distincte, toujours un doublon de la taxe foncière
    // déjà comptée ci-dessus (Expense ou scalaire). Ne JAMAIS la
    // recompter ici — pas de migration générale de `familyLines`, juste ce
    // filtre ciblé au moment de construire le Registry.
    if (line.familyId === "impots" && line.category === "divers" && line.id.startsWith("taxe-fonciere:")) {
      continue;
    }
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
        exclusionReason:
          line.financementOverlap === "assurance_emprunteur" || line.financementOverlap === "frais_dossier"
            ? "f011_overlap"
            : undefined,
      }),
    );
  }

  const ids = charges.map((c) => c.id);
  const unique = new Set(ids);
  if (unique.size !== ids.length) {
    const seen = new Set<string>();
    const collidingIds: string[] = [];
    for (const id of ids) {
      if (seen.has(id)) collidingIds.push(id);
      seen.add(id);
    }
    // Durcissement défensif post-audit — cette collision ne devrait plus
    // jamais se produire pour le cas syndic (voir `withOccurrenceDiscriminatedIds`,
    // proposals-from-copro.ts) : si elle subsiste malgré tout (donnée
    // corrompue, nouvelle source non couverte), un throw brut ici remontait
    // jusqu'à `F012ChargesAssistant.handle()` sans être catché et crashait
    // l'app côté utilisateur. `ChargeRegistryCollisionError` reste une
    // exception explicite (jamais avalée silencieusement, jamais une
    // Charge Registry incohérente renvoyée comme si de rien n'était) — c'est
    // `handle()` qui la catche pour produire un message utilisateur
    // diagnosticable au lieu d'un crash (voir assistant.ts).
    throw new ChargeRegistryCollisionError(collidingIds);
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
