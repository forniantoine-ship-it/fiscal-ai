import { isAnnualOutputForActiveYear } from "@/lib/lmnp/services/dossier/annual-output-year-safety";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import type { ChargesAssistantOutput } from "@/lib/lmnp/types/domain";
import type { FieldSource } from "@/runtime/contracts/FieldSource";
import type { ChargeFamilyId, ChargeRegistry, FamilyUnknownReason } from "@/runtime/capabilities/f012/charge";
import type { Expense } from "@/runtime/capabilities/f012/expense";
import type { F012PersistedState } from "@/runtime/assistants/f012-charges/types";
import type { V3DocumentProcessingStatus, V3DocumentsReadModel } from "./document-read-model";
import { resolveV3PropertyServiceDate, type V3PropertyServiceDate } from "./property-service-date";
import { derivedFromRealDate } from "./revenue-detail-read-model";
import {
  projectV3PropertyEntry, resolveV3PropertyScope, resolveV3PropertySupport,
  type V3PropertyEntry, type V3PropertyScopeReason, type V3PropertySupport,
} from "./v3-property-scope";

/**
 * R15.7 — projection structurée du domaine Charges (F012) POUR UN BIEN, pour la V3.
 * Transport pur des données persistées : la V3 RESTITUE F012, elle ne décide jamais de ce qui est déductible, non
 * déductible, amortissable, déjà compté par F011 ou relevant des travaux. Aucun total n'est recalculé.
 *
 * - Le montant principal est `chargesAssistant.totalDeductible` tel que persisté (jamais une somme de `parCategorie`,
 *   jamais un « total des charges » : le total fiscal du dossier contient aussi des éléments F010 et F011).
 * - Absent ≠ zéro : sortie absente = inconnu ; sortie confirmée à 0 = zéro confirmé ; catégorie absente = rien d'affiché.
 * - Une sortie sans confirmation valide (`chargesConfirmedAt` effacé, ex. après suppression d'un document) reste visible
 *   mais n'est jamais présentée comme confirmée. Elle n'est ni supprimée ni recalculée.
 * - Le registre F012 (`chargesAssistantState.registry`) n'explique la sortie que s'il est FRAIS : la session et la sortie
 *   sont écrites ensemble à la confirmation (`updatedAt === computedAt`) ; toute écriture ultérieure de la session le rend
 *   non démontrable, et tous les détails qui en dépendent sont alors masqués.
 * - Les sorties F012 n'ont pas de `propertyId` : attribuées au bien seulement s'il est le seul de l'exercice.
 */
export type V3ChargesTotal =
  /** Plusieurs biens : la sortie globale n'est attribuable à aucun bien. */
  | { state: "not_attributable" }
  | { state: "unknown" }
  | { state: "confirmed_zero" }
  | { state: "known_amount"; amount: number }
  /** Sortie présente, `chargesConfirmedAt` absent : ancienne sortie, à confirmer. */
  | { state: "unconfirmed"; amount: number }
  /** Confirmée, mais la session F012 a été réécrite après la sortie : à revoir. */
  | { state: "stale"; amount: number };

export type V3ChargesRegistryStatus = "fresh" | "stale" | "absent";

export type V3ChargesCategoryOrigin = FieldSource | "mixed" | "unknown";

export interface V3ChargesCategory {
  id: string;
  label: string;
  /** Toujours > 0 : une catégorie absente ou à zéro n'est jamais exposée. */
  amount: number;
  origin: { kind: V3ChargesCategoryOrigin };
}

export interface V3ChargesAmountLine { id: string; label: string; amount: number }

export type V3ChargesOpenItem =
  | { kind: "family_pending"; familyId: ChargeFamilyId; label: string }
  | { kind: "family_unknown"; familyId: ChargeFamilyId; label: string; reason?: FamilyUnknownReason }
  | { kind: "review_needed"; label: string }
  | { kind: "conflict"; label: string; message: string }
  | { kind: "tax_choice_pending" }
  | { kind: "expense_pending"; label: string };

export interface V3ChargesNotRetained {
  id: string;
  label: string;
  amount: number;
  reason: "financing_overlap" | "ignored_by_user";
}

export interface V3ChargesDocument { id: string; label: string; status: V3DocumentProcessingStatus | "unknown" }

export type V3ChargesDetail =
  | { state: "scope_unresolved"; reason: V3PropertyScopeReason; year: number }
  | {
      state: "known";
      propertyId: string;
      year: number;
      label: string;
      address: string | null;
      support: V3PropertySupport;
      /** Sortie F012 de l'exercice marquée confirmée (`chargesConfirmedAt`). */
      confirmed: boolean;
      total: V3ChargesTotal;
      registry: V3ChargesRegistryStatus;
      /** Montants déductibles par catégorie (`parCategorie` > 0 uniquement). */
      categories: V3ChargesCategory[];
      /** Les catégories persistées reconstituent le total au centime (contrôle de présentation, jamais un calcul métier). */
      reconciliation?: { reconciled: boolean };
      nonDeductible?: { amount: number; byCategory: V3ChargesAmountLine[] };
      /** Orienté vers l'amortissement (F014) : jamais une charge déductible. */
      amortizable?: { amount: number; components: V3ChargesAmountLine[] };
      /** Uniquement si la date réelle de mise en service est démontrée comme étant celle que F012 a lue. */
      preExploitation?: { amount: number; byCategory: V3ChargesAmountLine[] };
      /** Recouvrement F011 persisté : déjà compté dans Financement, jamais réadditionné aux charges. */
      financingAlreadyCounted?: { amount: number; parts: Array<{ kind: "insurance" | "fees"; amount: number }> };
      /** Registre frais uniquement. */
      notRetained: V3ChargesNotRetained[];
      /** Familles pour lesquelles l'utilisateur a indiqué n'avoir rien payé (registre frais uniquement). */
      nothingPaidFamilies: Array<{ familyId: ChargeFamilyId; label: string }>;
      /** Registre frais uniquement. */
      open: V3ChargesOpenItem[];
      serviceDate: V3PropertyServiceDate;
      entry: V3PropertyEntry;
      /** Documents réels des dépenses du registre frais (jamais ceux du canal documentaire historique). */
      documents: V3ChargesDocument[];
    };

export const V3_CHARGES_CATEGORY_LABELS: Record<string, string> = {
  taxe_fonciere: "Taxe foncière",
  assurance_pno: "Assurance PNO",
  assurance_gli: "Assurance GLI",
  copropriete: "Copropriété",
  honoraires_gestion: "Honoraires de gestion",
  honoraires_comptable: "Honoraires comptables",
  frais_bancaires: "Frais bancaires",
  travaux: "Travaux",
  divers: "Divers",
};

const FALLBACK_CATEGORY_LABEL = "Autre nature";

/** Libellés de famille de l'Assistant Charges (mêmes que ses cartes). */
export const V3_CHARGES_FAMILY_LABELS: Record<ChargeFamilyId, string> = {
  impots: "Impôts du logement",
  syndic: "Syndic / immeuble",
  assurances: "Assurance du logement",
  gestion: "Agence / comptable / logiciel",
  travaux: "Réparations et travaux",
  autres: "Autre chose payé pour ce logement",
};

const positive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
const cents = (value: number) => Math.round(value * 100);
const categoryLabel = (id: string) => V3_CHARGES_CATEGORY_LABELS[id] ?? FALLBACK_CATEGORY_LABEL;

/**
 * Le registre explique la sortie seulement si la session a été écrite en même temps qu'elle (`updatedAt === computedAt`,
 * même horodatage à la confirmation). Une écriture ultérieure de la session (reprise, modification) ou une sortie sans
 * session ne le démontrent pas.
 */
export function isChargesRegistryFresh(
  state: Pick<F012PersistedState, "updatedAt"> | undefined,
  output: Pick<ChargesAssistantOutput, "computedAt"> | undefined,
): boolean {
  return state !== undefined && output !== undefined
    && typeof state.updatedAt === "string" && state.updatedAt !== "" && state.updatedAt === output.computedAt;
}

function amountLines(record: Partial<Record<string, number>> | undefined): V3ChargesAmountLine[] {
  return Object.entries(record ?? {}).flatMap(([id, amount]): V3ChargesAmountLine[] =>
    positive(amount) ? [{ id, label: categoryLabel(id), amount }] : []);
}

function processingStatusFor(id: string, documents: V3DocumentsReadModel | undefined): V3ChargesDocument["status"] {
  if (!documents || documents.state !== "known") return "unknown";
  return documents.documents.find(item => item.id === id)?.processingStatus ?? "unknown";
}

function expensesOf(state: F012PersistedState): Expense[] {
  const collected = state.collected;
  return [...(collected.taxeFonciereExpense ? [collected.taxeFonciereExpense] : []), ...(collected.documentExpenses ?? [])];
}

function originOf(registry: ChargeRegistry | undefined, categoryId: string): V3ChargesCategoryOrigin {
  const kinds = new Set((registry?.charges ?? [])
    .filter(charge => charge.category === categoryId && charge.exclusionReason === undefined)
    .map(charge => charge.provenance));
  if (kinds.size === 0) return "unknown";
  return kinds.size === 1 ? [...kinds][0]! : "mixed";
}

function openItemsOf(state: F012PersistedState, registry: ChargeRegistry | undefined): V3ChargesOpenItem[] {
  const open: V3ChargesOpenItem[] = [];
  for (const coverage of registry?.familyCoverage ?? []) {
    const label = V3_CHARGES_FAMILY_LABELS[coverage.familyId] ?? coverage.familyId;
    if (coverage.status === "pending") open.push({ kind: "family_pending", familyId: coverage.familyId, label });
    else if (coverage.status === "unknown") {
      open.push({ kind: "family_unknown", familyId: coverage.familyId, label, ...(coverage.unknownReason ? { reason: coverage.unknownReason } : {}) });
    }
  }
  for (const charge of registry?.charges ?? []) {
    const label = charge.description?.trim() || categoryLabel(charge.category);
    if (charge.conflict) open.push({ kind: "conflict", label, message: charge.conflict });
    else if (charge.reviewNeeded) open.push({ kind: "review_needed", label });
  }
  const taxExpense = state.collected.taxeFonciereExpense;
  if (state.pendingTaxeFonciereReplace || state.pendingTaxeFonciereExpense || taxExpense?.decision === "pending") {
    open.push({ kind: "tax_choice_pending" });
  }
  for (const expense of state.collected.documentExpenses ?? []) {
    if (expense.decision === "pending") open.push({ kind: "expense_pending", label: expense.description?.trim() || categoryLabel(expense.category) });
  }
  return open;
}

function notRetainedOf(state: F012PersistedState, registry: ChargeRegistry | undefined): V3ChargesNotRetained[] {
  const overlap = (registry?.charges ?? [])
    .filter(charge => charge.exclusionReason === "f011_overlap" && positive(charge.amount))
    .map((charge): V3ChargesNotRetained => ({
      id: charge.id, label: charge.description?.trim() || categoryLabel(charge.category), amount: charge.amount, reason: "financing_overlap",
    }));
  const ignored = expensesOf(state)
    .filter(expense => expense.decision === "ignored" && positive(expense.montant))
    .map((expense): V3ChargesNotRetained => ({
      id: expense.id, label: expense.description?.trim() || categoryLabel(expense.category), amount: expense.montant, reason: "ignored_by_user",
    }));
  return [...overlap, ...ignored];
}

function documentIdsOf(state: F012PersistedState, registry: ChargeRegistry | undefined): string[] {
  const fromCharges = (registry?.charges ?? []).filter(charge => charge.exclusionReason === undefined).flatMap(charge => charge.documentIds ?? []);
  const fromExpenses = expensesOf(state)
    .filter(expense => expense.decision === "confirmed" || expense.decision === "modified")
    .flatMap(expense => (expense.documentId ? [expense.documentId] : []));
  return [...new Set([...fromCharges, ...fromExpenses])];
}

export function buildV3ChargesDetail(
  workspace: PersistedWorkspace,
  propertyId: string | null | undefined,
  documents?: V3DocumentsReadModel,
): V3ChargesDetail {
  const year = workspace.fiscalYear.year;
  const scope = resolveV3PropertyScope(workspace, propertyId);
  if (!scope.ok) return { state: "scope_unresolved", reason: scope.reason, year };
  const { property } = scope;
  const support = resolveV3PropertySupport(workspace, property.id);
  const serviceDate = resolveV3PropertyServiceDate(workspace, property.id);
  const entry = projectV3PropertyEntry(workspace, property.id, support);
  const address = [property.address?.trim(), [property.postalCode, property.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null;
  const base = { state: "known" as const, propertyId: property.id, year, label: property.label, address, support, serviceDate, entry };
  const none = { categories: [], notRetained: [], nothingPaidFamilies: [], open: [], documents: [] };

  if (support === "facts_only") {
    // The global F012 output is not demonstrably this property's: nothing of it is exposed.
    return { ...base, ...none, confirmed: false, total: { state: "not_attributable" }, registry: "absent" };
  }

  const draft = workspace.declarationDraft;
  const output: ChargesAssistantOutput | undefined =
    draft?.chargesAssistant && isAnnualOutputForActiveYear(draft.chargesAssistant, year) && Number.isFinite(draft.chargesAssistant.totalDeductible)
      ? draft.chargesAssistant : undefined;
  const state = draft?.chargesAssistantState;
  const confirmed = output !== undefined && Boolean(draft?.chargesConfirmedAt);

  const fresh = isChargesRegistryFresh(state, output);
  const registryStatus: V3ChargesRegistryStatus = !output || !state ? "absent" : fresh ? "fresh" : "stale";

  let total: V3ChargesTotal;
  if (!output) total = { state: "unknown" };
  else if (!confirmed) total = { state: "unconfirmed", amount: output.totalDeductible };
  else if (registryStatus === "stale") total = { state: "stale", amount: output.totalDeductible };
  else total = output.totalDeductible === 0 ? { state: "confirmed_zero" } : { state: "known_amount", amount: output.totalDeductible };

  if (!output) return { ...base, ...none, confirmed, total, registry: registryStatus };

  const registry = fresh ? state?.registry : undefined;

  const categories: V3ChargesCategory[] = Object.entries(output.parCategorie ?? {}).flatMap(([id, amount]): V3ChargesCategory[] =>
    positive(amount) ? [{ id, label: categoryLabel(id), amount, origin: { kind: fresh ? originOf(registry, id) : "unknown" } }] : []);
  const parts = Object.values(output.parCategorie ?? {}).filter((amount): amount is number => typeof amount === "number" && Number.isFinite(amount));
  const reconciliation = { reconciled: parts.reduce((sum, amount) => sum + cents(amount), 0) === cents(output.totalDeductible) };

  const nonDeductible = positive(output.totalNonDeductible)
    ? { amount: output.totalNonDeductible, byCategory: amountLines(output.parCategorieNonDeductible) } : undefined;
  const amortizable = positive(output.totalAmortissable)
    ? {
        amount: output.totalAmortissable,
        components: (output.composantsNouveaux ?? []).flatMap((component): V3ChargesAmountLine[] =>
          positive(component.montant) ? [{ id: component.id, label: component.label, amount: component.montant }] : []),
      } : undefined;
  // F012 computed the pre-exploitation split from `draft.dateMiseEnService` (or a historical June-01 default when absent).
  const preExploitation = positive(output.totalPreExploitation) && derivedFromRealDate(serviceDate, draft?.inpiConfirmedAt, output.computedAt)
    ? { amount: output.totalPreExploitation, byCategory: amountLines(output.parCategoriePreExploitation) } : undefined;

  const financingParts: Array<{ kind: "insurance" | "fees"; amount: number }> = [];
  if (positive(output.recouvrementAssuranceF011?.recouvert)) financingParts.push({ kind: "insurance", amount: output.recouvrementAssuranceF011.recouvert });
  if (positive(output.recouvrementFraisDossierF011?.recouvert)) financingParts.push({ kind: "fees", amount: output.recouvrementFraisDossierF011.recouvert });
  const financingAlreadyCounted = financingParts.length > 0
    ? { amount: financingParts.reduce((sum, part) => sum + cents(part.amount), 0) / 100, parts: financingParts } : undefined;

  const usedDocuments = fresh && state
    ? documentIdsOf(state, registry).flatMap((id): V3ChargesDocument[] => {
        const doc = workspace.documents.find(item => item.id === id);
        return doc ? [{ id: doc.id, label: doc.fileName, status: processingStatusFor(doc.id, documents) }] : [];
      })
    : [];

  return {
    ...base,
    confirmed,
    total,
    registry: registryStatus,
    categories,
    reconciliation,
    ...(nonDeductible ? { nonDeductible } : {}),
    ...(amortizable ? { amortizable } : {}),
    ...(preExploitation ? { preExploitation } : {}),
    ...(financingAlreadyCounted ? { financingAlreadyCounted } : {}),
    notRetained: fresh && state ? notRetainedOf(state, registry) : [],
    nothingPaidFamilies: (registry?.familyCoverage ?? [])
      .filter(coverage => coverage.status === "none")
      .map(coverage => ({ familyId: coverage.familyId, label: V3_CHARGES_FAMILY_LABELS[coverage.familyId] ?? coverage.familyId })),
    open: fresh && state ? openItemsOf(state, registry) : [],
    documents: usedDocuments,
  };
}
