/**
 * Cycle 12A — appliquer des dépenses distinguées sur `collected`.
 * Le moteur fiscal n'est pas modifié : les extras se replient sur les slots existants.
 * Garde-fou F-011 avant toute écriture.
 */

import type { ChargeFamilyId } from "../../capabilities/f012/charge";
import type { CoproLigneInput } from "../../capabilities/f012/compute-copro-deductible";
import {
  detectFinancementOverlap,
  type FinancementChargesSummary,
} from "../../capabilities/f012/detect-financement-overlap";
import type { F012CategoryId } from "../../capabilities/f012/types";
import { CHARGE_FAMILY_IDS } from "../../capabilities/f012/charge";
import { clearFamilyCoverageIntents } from "./family-coverage-intents";
import type { F012CollectedData, F012DiversItem, F012FamilyLine } from "./types";
import {
  parseFamilyExpenseMentions,
  paymentBelongsToExercise,
  slugForExpense,
  type ParsedExpense,
  type ParsedExpenseKind,
} from "./family-expense-parse";

export type ApplyFamilyExpensesInput = {
  collected: F012CollectedData;
  familyId: ChargeFamilyId;
  exercise: number;
  parsed?: ParsedExpense[];
  freeText?: string;
  paidAt?: string;
  financementCharges?: FinancementChargesSummary;
};

export type ApplyFamilyExpensesResult = {
  collected: F012CollectedData;
  wrote: boolean;
  blocked?: { kind: "capital_pret" | "assurance_emprunteur" | "out_of_year"; message: string };
  overlapMessage?: string;
  /** Cycle 12B — travaux à qualifier, jamais écrits comme collectés. */
  pendingQualification?: ParsedExpense[];
};

function extraLineId(slot: string, description: string, exercise: number, existing: F012FamilyLine[]): string {
  const base = `${slot}:${slugForExpense(description)}:${exercise}`;
  if (!existing.some((line) => line.id === base)) return base;
  let index = 2;
  while (existing.some((line) => line.id === `${base}:${index}`)) index += 1;
  return `${base}:${index}`;
}

function nextDiversId(collected: F012CollectedData): string {
  return `divers-${collected.divers.length + 1}`;
}

function alreadyHasDivers(collected: F012CollectedData, description: string, montant: number): boolean {
  return collected.divers.some(
    (item) => item.description === description && item.montant === montant,
  );
}

function alreadyHasLine(collected: F012CollectedData, id: string): boolean {
  return (collected.familyLines ?? []).some((line) => line.id === id);
}

export function dedupeParsedExpenses(items: ParsedExpense[]): ParsedExpense[] {
  // Cycle 13B — vrai doublon = même soumission (structured + freeText).
  // Deux mentions distinctes dans des soumissions différentes ne passent
  // pas par ici. kind+amount (hors divers/travaux) fusionne le chevauchement
  // champ + texte, pas deux dépenses légitimes de même montant.
  const seen = new Set<string>();
  const result: ParsedExpense[] = [];
  for (const item of items) {
    const key =
      item.kind === "divers" || item.kind === "travaux" || item.kind === "autre_taxe"
        ? `${item.kind}:${item.amount}:${item.description}`
        : `${item.kind}:${item.amount}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function pushLine(
  collected: F012CollectedData,
  line: F012FamilyLine,
): F012CollectedData {
  if (line.montant <= 0) return collected;
  if (alreadyHasLine(collected, line.id)) return collected;
  return { ...collected, familyLines: [...(collected.familyLines ?? []), line] };
}

/** Slot scalaire déjà pris : la nouvelle déclaration devient une ligne distincte. */
function extraWhenSlotTaken(
  collected: F012CollectedData,
  slot: string,
  familyId: ChargeFamilyId,
  category: F012FamilyLine["category"],
  expense: ParsedExpense,
  exercise: number,
): ApplyFamilyExpensesResult {
  const id = extraLineId(slot, expense.description, exercise, collected.familyLines ?? []);
  return {
    collected: pushLine(collected, {
      id,
      familyId,
      category,
      description: expense.description,
      montant: expense.amount,
    }),
    wrote: true,
  };
}

function positive(amount: number | undefined): number | undefined {
  if (amount === undefined || !Number.isFinite(amount) || amount <= 0) return undefined;
  return amount;
}

function overlapFor(
  description: string,
  montant: number,
  financementCharges?: FinancementChargesSummary,
) {
  return detectFinancementOverlap({ description, montant, financementCharges });
}

function applyOne(
  collected: F012CollectedData,
  familyId: ChargeFamilyId,
  expense: ParsedExpense,
  exercise: number,
  financementCharges?: FinancementChargesSummary,
): ApplyFamilyExpensesResult {
  if (expense.amount <= 0) {
    return { collected, wrote: false };
  }
  const overlap = overlapFor(expense.description, expense.amount, financementCharges);
  if (overlap.kind === "capital_pret") {
    return { collected, wrote: false, blocked: { kind: "capital_pret", message: overlap.message } };
  }
  if (overlap.kind === "assurance_emprunteur" && familyId === "assurances") {
    return {
      collected,
      wrote: false,
      blocked: { kind: "assurance_emprunteur", message: overlap.message },
    };
  }

  switch (expense.kind) {
    case "taxe_fonciere": {
      if (collected.taxeFonciere === expense.amount) return { collected, wrote: false };
      if (collected.taxeFonciere !== undefined && collected.taxeFonciere !== expense.amount) {
        const id = extraLineId("taxe-fonciere", expense.description, exercise, collected.familyLines ?? []);
        return {
          collected: pushLine(collected, {
            id,
            familyId: "impots",
            category: "divers",
            description: expense.description,
            montant: expense.amount,
          }),
          wrote: true,
        };
      }
      return { collected: { ...collected, taxeFonciere: expense.amount }, wrote: true };
    }
    case "autre_taxe":
    case "divers": {
      if (alreadyHasDivers(collected, expense.description, expense.amount)) {
        return { collected, wrote: false };
      }
      const item: F012DiversItem = {
        id: nextDiversId(collected),
        description: expense.description,
        montant: expense.amount,
        financementOverlap: overlap.kind === "assurance_emprunteur" ? "assurance_emprunteur" : undefined,
      };
      return {
        collected: { ...collected, divers: [...collected.divers, item] },
        wrote: true,
        overlapMessage: overlap.kind === "assurance_emprunteur" ? overlap.message : undefined,
      };
    }
    case "copro_provisions":
    case "copro_regularisation":
    case "copro_fonds_travaux": {
      const ligne: CoproLigneInput = {
        type: expense.coproType ?? "provisions",
        montant: expense.amount,
        description: expense.description,
      };
      return { collected: { ...collected, coproLignes: [...collected.coproLignes, ligne] }, wrote: true };
    }
    case "assurance_pno": {
      if (collected.assurancePno === undefined) {
        return { collected: { ...collected, assurancePno: expense.amount }, wrote: true };
      }
      return extraWhenSlotTaken(collected, "assurance-pno", "assurances", "assurance_pno", expense, exercise);
    }
    case "assurance_gli": {
      if (collected.assuranceGli === undefined) {
        return { collected: { ...collected, assuranceGli: expense.amount }, wrote: true };
      }
      return extraWhenSlotTaken(collected, "assurance-gli", "assurances", "assurance_gli", expense, exercise);
    }
    case "assurance_emprunteur": {
      if (alreadyHasDivers(collected, expense.description, expense.amount)) {
        return { collected, wrote: false, overlapMessage: overlap.kind === "assurance_emprunteur" ? overlap.message : undefined };
      }
      return {
        collected: {
          ...collected,
          divers: [
            ...collected.divers,
            {
              id: nextDiversId(collected),
              description: expense.description,
              montant: expense.amount,
              financementOverlap: "assurance_emprunteur",
            },
          ],
        },
        wrote: true,
        overlapMessage: overlap.kind === "assurance_emprunteur" ? overlap.message : undefined,
      };
    }
    case "honoraires_gestion": {
      if (collected.honorairesGestion === undefined) {
        return { collected: { ...collected, honorairesGestion: expense.amount }, wrote: true };
      }
      return extraWhenSlotTaken(
        collected,
        "honoraires-gestion",
        "gestion",
        "honoraires_gestion",
        expense,
        exercise,
      );
    }
    case "frais_etat_des_lieux": {
      if (collected.fraisEtatDesLieux === undefined) {
        return { collected: { ...collected, fraisEtatDesLieux: expense.amount }, wrote: true };
      }
      return extraWhenSlotTaken(
        collected,
        "frais-etat-des-lieux",
        "gestion",
        "honoraires_gestion",
        expense,
        exercise,
      );
    }
    case "mise_en_location": {
      if (collected.honorairesGestion === undefined) {
        return { collected: { ...collected, honorairesGestion: expense.amount }, wrote: true };
      }
      return extraWhenSlotTaken(
        collected,
        "honoraires-gestion",
        "gestion",
        "honoraires_gestion",
        expense,
        exercise,
      );
    }
    case "honoraires_comptable": {
      if (collected.honorairesComptable === undefined) {
        return { collected: { ...collected, honorairesComptable: expense.amount }, wrote: true };
      }
      return extraWhenSlotTaken(
        collected,
        "honoraires-comptable",
        "gestion",
        "honoraires_comptable",
        expense,
        exercise,
      );
    }
    case "travaux": {
      return { collected, wrote: false };
    }
    case "frais_bancaires": {
      if (collected.fraisBancaires === undefined) {
        return { collected: { ...collected, fraisBancaires: expense.amount }, wrote: true };
      }
      return extraWhenSlotTaken(collected, "frais-bancaires", "autres", "frais_bancaires", expense, exercise);
    }
  }
}

export function applyFamilyExpenses(input: ApplyFamilyExpensesInput): ApplyFamilyExpensesResult {
  if (input.paidAt && !paymentBelongsToExercise(input.paidAt, input.exercise)) {
    return {
      collected: input.collected,
      wrote: false,
      blocked: {
        kind: "out_of_year",
        message: "Ce paiement n'appartient pas à cet exercice. Je n'inscris pas de montant.",
      },
    };
  }
  const parsed = dedupeParsedExpenses(
    input.parsed ??
      (input.freeText ? parseFamilyExpenseMentions(input.freeText, input.familyId) : []),
  );
  let collected = input.collected;
  let wrote = false;
  let overlapMessage: string | undefined;
  let blocked: ApplyFamilyExpensesResult["blocked"];
  const pendingQualification: ParsedExpense[] = [];
  for (const expense of parsed) {
    if (expense.kind === "travaux") {
      pendingQualification.push(expense);
      continue;
    }
    const next = applyOne(collected, input.familyId, expense, input.exercise, input.financementCharges);
    if (next.blocked) {
      blocked = next.blocked;
      continue;
    }
    collected = next.collected;
    wrote = wrote || next.wrote;
    overlapMessage = overlapMessage ?? next.overlapMessage;
  }
  if (wrote) {
    collected = clearFamilyCoverageIntents(collected, [input.familyId]);
  }
  return {
    collected,
    wrote,
    blocked,
    overlapMessage,
    ...(pendingQualification.length > 0 ? { pendingQualification } : {}),
  };
}

export function structuredAssuranceExpenses(input: {
  montant?: number;
  gliMontant?: number;
  description?: string;
}): ParsedExpense[] {
  const description = input.description?.trim() ?? "";
  const items: ParsedExpense[] = [];
  const gliFromDescription = /loyers?\s+impay|garantie\s+locative|\bgli\b/i.test(description);
  const pnoAmount = positive(input.montant);
  const gliAmount = positive(input.gliMontant);
  if (pnoAmount !== undefined && gliAmount === undefined && gliFromDescription) {
    items.push({ amount: pnoAmount, description: description || "Loyers impayés", kind: "assurance_gli" });
    return items;
  }
  if (pnoAmount !== undefined) {
    items.push({
      amount: pnoAmount,
      description: description && !gliFromDescription ? description : "Assurance du logement",
      kind: "assurance_pno",
    });
  }
  if (gliAmount !== undefined) {
    items.push({ amount: gliAmount, description: "Loyers impayés", kind: "assurance_gli" });
  }
  return items;
}

export function structuredGestionExpenses(input: {
  honorairesGestion?: number;
  fraisEtatDesLieux?: number;
  honorairesComptable?: number;
  fraisMiseEnLocation?: number;
}): ParsedExpense[] {
  const items: ParsedExpense[] = [];
  const gestion = positive(input.honorairesGestion);
  const etat = positive(input.fraisEtatDesLieux);
  const comptable = positive(input.honorairesComptable);
  const mise = positive(input.fraisMiseEnLocation);
  if (gestion !== undefined) {
    items.push({ amount: gestion, description: "Frais de gestion", kind: "honoraires_gestion" });
  }
  if (etat !== undefined) {
    items.push({ amount: etat, description: "État des lieux", kind: "frais_etat_des_lieux" });
  }
  if (mise !== undefined) {
    items.push({ amount: mise, description: "Mise en location", kind: "mise_en_location" });
  }
  if (comptable !== undefined) {
    items.push({ amount: comptable, description: "Comptable ou logiciel", kind: "honoraires_comptable" });
  }
  return items;
}

export function structuredSyndicExpenses(input: {
  montantPaye?: number;
  epargneTravaux: "oui" | "non" | "unknown";
  epargneMontant?: number;
  lignes?: CoproLigneInput[];
}): ParsedExpense[] {
  if (input.lignes && input.lignes.length > 0) {
    return input.lignes
      .filter((ligne) => ligne.montant > 0)
      .map((ligne) => ({
        amount: ligne.montant,
        description: ligne.description ?? (ligne.type === "regularisation" ? "Régularisation" : "Charges d'immeuble"),
        kind:
          ligne.type === "regularisation"
            ? "copro_regularisation"
            : ligne.type === "fonds_travaux"
              ? "copro_fonds_travaux"
              : "copro_provisions",
        coproType: ligne.type,
      }));
  }
  const items: ParsedExpense[] = [];
  const paye = positive(input.montantPaye);
  if (paye !== undefined) {
    items.push({
      amount: paye,
      description: "Charges d'immeuble",
      kind: "copro_provisions",
      coproType: "provisions",
    });
  }
  const epargne = positive(input.epargneMontant);
  if (input.epargneTravaux === "oui" && epargne !== undefined) {
    items.push({
      amount: epargne,
      description: "Épargne pour de futurs travaux",
      kind: "copro_fonds_travaux",
      coproType: "fonds_travaux",
    });
  }
  return items;
}

export function structuredImpotsExpenses(input: {
  taxeFonciere?: number;
  autreDescription?: string;
  autreMontant?: number;
}): ParsedExpense[] {
  const items: ParsedExpense[] = [];
  const taxe = positive(input.taxeFonciere);
  if (taxe !== undefined) {
    items.push({ amount: taxe, description: "Taxe foncière", kind: "taxe_fonciere" });
  }
  const autre = positive(input.autreMontant);
  if (autre !== undefined && input.autreDescription?.trim()) {
    items.push({
      amount: autre,
      description: input.autreDescription.trim(),
      kind: "autre_taxe",
    });
  }
  return items;
}

export function structuredAutresExpenses(input: {
  fraisBancaires?: number;
  diversDescription?: string;
  diversMontant?: number;
  items?: Array<{ description: string; montant: number }>;
}): ParsedExpense[] {
  const items: ParsedExpense[] = [];
  const bank = positive(input.fraisBancaires);
  if (bank !== undefined) {
    items.push({ amount: bank, description: "Frais du compte", kind: "frais_bancaires" });
  }
  if (input.items) {
    for (const row of input.items) {
      const montant = positive(row.montant);
      if (montant === undefined || !row.description.trim()) continue;
      items.push({ amount: montant, description: row.description.trim(), kind: "divers" });
    }
  }
  const divers = positive(input.diversMontant);
  if (divers !== undefined && input.diversDescription?.trim()) {
    items.push({
      amount: divers,
      description: input.diversDescription.trim(),
      kind: "divers",
    });
  }
  return items;
}

const FAMILY_COLLECT_CATEGORIES: Record<ChargeFamilyId, F012CategoryId[]> = {
  impots: ["taxe_fonciere"],
  syndic: ["copropriete"],
  assurances: ["assurance_pno"],
  gestion: ["honoraires_gestion", "honoraires_comptable"],
  travaux: ["travaux"],
  autres: ["frais_bancaires", "divers"],
};

export function ensureFamilyInInventories(
  familyInventory: ChargeFamilyId[],
  categoryInventory: F012CategoryId[],
  familyId: ChargeFamilyId,
): { familyInventory: ChargeFamilyId[]; categoryInventory: F012CategoryId[] } {
  const families = CHARGE_FAMILY_IDS.filter(
    (id) => id === familyId || familyInventory.includes(id),
  );
  let categories = [...categoryInventory];
  for (const categoryId of FAMILY_COLLECT_CATEGORIES[familyId]) {
    if (categories.includes(categoryId)) continue;
    const diversIndex = categories.indexOf("divers");
    const insertAt = diversIndex >= 0 ? diversIndex : categories.length;
    categories = [...categories.slice(0, insertAt), categoryId, ...categories.slice(insertAt)];
  }
  return { familyInventory: families, categoryInventory: categories };
}

export function kindToFamily(kind: ParsedExpenseKind): ChargeFamilyId {
  switch (kind) {
    case "taxe_fonciere":
    case "autre_taxe":
      return "impots";
    case "copro_provisions":
    case "copro_regularisation":
    case "copro_fonds_travaux":
      return "syndic";
    case "assurance_pno":
    case "assurance_gli":
    case "assurance_emprunteur":
      return "assurances";
    case "honoraires_gestion":
    case "frais_etat_des_lieux":
    case "mise_en_location":
    case "honoraires_comptable":
      return "gestion";
    case "travaux":
      return "travaux";
    case "frais_bancaires":
    case "divers":
      return "autres";
  }
}
