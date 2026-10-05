/**
 * Fixtures PARTAGÉES des tests INT-2 / INT-3 (workspace réel sérialisable : F012 → registre → LigneCharge → sortie confirmée,
 * F011, F013 v2, F010, F014). Aucune valeur d'oracle n'est codée dans les adapters.
 */
import assert from "node:assert/strict";

import type { Expense } from "@/runtime/capabilities/f012/expense";
import type { PretFinancementExercice } from "@/runtime/capabilities/f011/types";
import type { LigneCharge } from "@/runtime/capabilities/f012/types";
import { collectedToChargeRegistry } from "@/runtime/assistants/f012-charges/collected-to-registry";
import { chargeRegistryToComputeInput } from "@/runtime/assistants/f012-charges/registry-to-compute-input";
import { assuranceAnnuelleF011, fraisDossierF011 } from "@/runtime/capabilities/f012/detect-financement-overlap";
import { computeChargesExercice } from "@/runtime/capabilities/f012/compute-charges-exercice";
import type { F012CollectedData, F012PersistedState } from "@/runtime/assistants/f012-charges/types";
import { buildChargesAssistantOutput } from "@/lib/lmnp/services/f012/charges-assistant-output";
import { createBienDraft, type BienDraft } from "@/lib/lmnp/dossier/bien-draft";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import { parseWorkspaceSnapshot, serializeWorkspaceSnapshot } from "@/lib/lmnp/store/workspace-snapshot";
import { applyFactsChange, confirmRentReconciliation, createRentReconciliationState, type RentReconciliationV2State } from "@/lib/lmnp/services/f013/v2/f013-v2-state";
import type { MoneyFact } from "@/lib/lmnp/services/f013/v2/f013-v2-contract";
import { type Article39cContribution, type Article39cScope } from "./contribution";
import { f012LineFingerprint } from "./from-f012";
import {
  emptyQualificationStore,
  recordChargeNatureAnswer,
  type Article39cQualificationStore,
} from "./qualification-store";
import type { ChargeNatureFact } from "./qualification-facts";
import {
  buildArticle39cContributionsFromWorkspace,
  resolveF012LinesForBien,
  type Article39cWorkspaceResult,
} from "./workspace-sources";

export const YEAR = 2026;
export const DOSSIER = "dossier-1";
export const eur = (n: number) => Math.round(n * 100);
export const validated = (cents: number): MoneyFact => ({ status: "VALIDATED", amountCents: cents });
export const prop = (propertyId: string): Article39cScope => ({ level: "PROPERTY", propertyId });
export const ACTIVITY: Article39cScope = { level: "ACTIVITY" };

// ---------------------------------------------------------------------------
// Fixtures : un vrai workspace sérialisable (F012 → registre → LigneCharge → sortie confirmée)
// ---------------------------------------------------------------------------

export function collected(extra: Partial<F012CollectedData> = {}): F012CollectedData {
  return { coproLignes: [], travaux: [], divers: [], skippedCategories: [], ...extra };
}

export function expense(partial: Partial<Expense> & Pick<Expense, "id" | "category" | "montant">): Expense {
  return {
    exerciceFiscal: YEAR,
    description: partial.id,
    origin: "document",
    documentId: `doc-${partial.id}`,
    fieldSources: { montant: "extracted" },
    decision: "confirmed",
    ...partial,
  };
}

export function rentState(propertyId: string, e: number, cc = 0, ac = 0): RentReconciliationV2State {
  let state = createRentReconciliationState({ propertyId, fiscalYear: YEAR });
  state = applyFactsChange(state, {
    collections: validated(eur(e)),
    collectionsCoverage: { completeness: "COMPLETE", validation: "VALIDATED" },
    openingReceivables: validated(0),
    closingReceivables: validated(eur(cc)),
    openingAdvances: validated(0),
    closingAdvances: validated(eur(ac)),
    exceptionsReviewed: true,
  });
  const confirmed = confirmRentReconciliation(state, { propertyId, fiscalYear: YEAR }, "2026-12-31T00:00:00.000Z");
  assert.ok(confirmed.ok);
  return confirmed.state;
}

export function pret(partial: Partial<PretFinancementExercice> & { pretId: string }): PretFinancementExercice {
  return {
    typePret: "amortissable",
    interetsEmpruntExercice: 0,
    interetsPreExploitation: 0,
    assuranceEmpruntExercice: 0,
    assurancePreExploitation: 0,
    capitalRembourseExercice: 0,
    capitalRestantDu31_12: 0,
    fraisDossierDeductibles: 0,
    garantieDeductible: 0,
    iraDeductible: 0,
    ...partial,
  };
}

export function financement(prets: PretFinancementExercice[]): NonNullable<BienDraft["financementCharges"]> {
  const sum = (pick: (p: PretFinancementExercice) => number) => Math.round(prets.reduce((n, p) => n + pick(p), 0) * 100) / 100;
  return {
    exerciceFiscal: YEAR,
    totalInteretsEmprunt: sum((p) => p.interetsEmpruntExercice),
    totalInteretsPreExploitation: sum((p) => p.interetsPreExploitation),
    totalAssurance: sum((p) => p.assuranceEmpruntExercice),
    totalAssurancePreExploitation: sum((p) => p.assurancePreExploitation),
    totalCapitalRembourse: sum((p) => p.capitalRembourseExercice),
    totalChargesFinancementExercice: sum((p) => p.interetsEmpruntExercice + p.assuranceEmpruntExercice + p.fraisDossierDeductibles + p.garantieDeductible + p.iraDeductible),
    prets,
    fieldSources: {},
    computedAt: "t",
  };
}

export type BienOptions = {
  collected?: F012CollectedData;
  rent?: RentReconciliationV2State;
  financement?: PretFinancementExercice[];
  qualifications?: Article39cQualificationStore;
  noF012?: boolean;
  /** INT-3 — F010 : frais d'acquisition (déduits / choix / montant notaire). `false` = absent. */
  logement?: { fraisEnCharges?: number; choix?: "integration" | "deduction"; fraisNotaire?: number } | false;
  /** INT-3 — F014 : dotation validée de l'exercice (euros). */
  dotation?: number;
  creditDocumentId?: string;
};

/** Reproduit ce que l'assistant persiste : état (collected) + sortie confirmée calculée par le moteur F012 existant. */
export function bien(propertyId: string, opts: BienOptions = {}): BienDraft {
  const out = createBienDraft(propertyId);
  out.dateMiseEnService = "2025-01-01";
  if (opts.rent) out.rentReconciliationV2 = opts.rent;
  if (opts.financement) out.financementCharges = financement(opts.financement);
  else out.creditDeclaredNoneAt = "t";
  if (opts.qualifications) out.article39cQualifications = opts.qualifications;
  if (opts.creditDocumentId !== undefined) out.creditDocumentId = opts.creditDocumentId;
  if (opts.logement !== false && opts.logement !== undefined) {
    out.logementAmortissement = { exerciceFiscal: YEAR, fraisEnCharges: opts.logement.fraisEnCharges ?? 0 } as unknown as BienDraft["logementAmortissement"];
    out.logementAssistantState = {
      ...(opts.logement.choix !== undefined ? { choixTraitementFrais: opts.logement.choix } : {}),
      ...(opts.logement.fraisNotaire !== undefined ? { fraisNotaire: opts.logement.fraisNotaire } : {}),
    } as unknown as BienDraft["logementAssistantState"];
  }
  if (opts.dotation !== undefined) {
    out.amortissementAssistant = { exerciceFiscal: YEAR, totalDotations: opts.dotation, status: "validated" } as unknown as BienDraft["amortissementAssistant"];
  }
  if (opts.noF012) return out;
  const col = opts.collected ?? collected();
  const state: F012PersistedState = {
    step: "complete",
    categoryInventory: [],
    currentCategoryIndex: 0,
    collected: col,
    fieldSources: {},
    updatedAt: "t",
  };
  const registry = collectedToChargeRegistry({ collected: col, categoryInventory: [], fieldSources: {}, exercise: YEAR });
  // Même construction que l'assistant F012 en production (résumé F011 + frais de dossier = somme des prêts).
  const fin = opts.financement ? financement(opts.financement) : undefined;
  const totalFraisDossier = (fin?.prets ?? []).reduce((n, p) => n + (p.fraisDossierDeductibles ?? 0), 0);
  const summary = fin
    ? { totalAssurance: fin.totalAssurance, totalAssurancePreExploitation: fin.totalAssurancePreExploitation, totalFraisDossier, totalCapitalRembourse: fin.totalCapitalRembourse, exerciceFiscal: fin.exerciceFiscal }
    : undefined;
  const { charges } = computeChargesExercice(
    chargeRegistryToComputeInput(registry, {
      dateMiseEnService: out.dateMiseEnService,
      fieldSources: {},
      ...(summary
        ? {
            assuranceEmprunteurF011: { exerciceFiscal: summary.exerciceFiscal, montantAnnuel: assuranceAnnuelleF011(summary) },
            fraisDossierF011: { exerciceFiscal: summary.exerciceFiscal, montantAnnuel: fraisDossierF011(summary) },
          }
        : {}),
    }),
  );
  out.chargesAssistantState = { ...state, registry };
  out.chargesAssistant = buildChargesAssistantOutput(charges, {}, "t");
  out.chargesConfirmedAt = "t";
  return out;
}

export function monoWorkspace(propertyId: string, b: BienDraft, extraDraft: Record<string, unknown> = {}): PersistedWorkspace {
  const { propertyId: _id, completedSteps, ...fields } = b;
  void _id;
  return {
    fiscalYear: { id: "fy-1", year: YEAR, status: "draft", regime: "reel_simplifie", propertyIds: [propertyId], createdAt: "t", updatedAt: "t", dossierId: DOSSIER },
    properties: [{ id: propertyId, label: propertyId, address: "a", city: "c", postalCode: "75000" }],
    documents: [],
    extractions: [],
    validationItems: [],
    ledgerEntries: [],
    declarationDraft: { completedSteps, ...fields, ...extraDraft },
  } as unknown as PersistedWorkspace;
}

export function multiWorkspace(biens: Record<string, BienDraft>, extraDraft: Record<string, unknown> = {}): PersistedWorkspace {
  const ids = Object.keys(biens);
  return {
    fiscalYear: { id: "fy-1", year: YEAR, status: "draft", regime: "reel_simplifie", propertyIds: ids, createdAt: "t", updatedAt: "t", dossierId: DOSSIER },
    properties: ids.map((id) => ({ id, label: id, address: "a", city: "c", postalCode: "75000" })),
    documents: [],
    extractions: [],
    validationItems: [],
    ledgerEntries: [],
    declarationDraft: { completedSteps: [], biens, ...extraDraft },
  } as unknown as PersistedWorkspace;
}

/** save → serialize → JSON → reload : le chemin RÉEL de persistance du snapshot. */
export function roundtrip(workspace: PersistedWorkspace): { reloaded: PersistedWorkspace; schemaVersion: number } {
  const serialized = serializeWorkspaceSnapshot(workspace);
  assert.ok(serialized.ok, "sérialisation attendue");
  const payload = JSON.parse(JSON.stringify(serialized.envelope));
  const parsed = parseWorkspaceSnapshot(payload);
  assert.ok(parsed.ok, "relecture attendue");
  return { reloaded: parsed.envelope.workspace, schemaVersion: parsed.envelope.schemaVersion };
}

export function build(workspace: PersistedWorkspace): Article39cWorkspaceResult {
  return buildArticle39cContributionsFromWorkspace({ workspace, expectedDossierId: DOSSIER });
}

export function after(workspace: PersistedWorkspace): Article39cWorkspaceResult {
  return build(roundtrip(workspace).reloaded);
}

export function byPart(items: readonly Article39cContribution[], sourceFragment: string, part: string): Article39cContribution | undefined {
  return items.find((c) => c.contributionId.includes(sourceFragment) && c.contributionId.endsWith(`|${part}`));
}

/** Empreinte COURANTE d'une ligne, telle que la collecte (INT-3) la calculera avant d'enregistrer une réponse. */
export function currentLineFingerprint(b: BienDraft, propertyId: string, lineId: string): string {
  const lines = resolveF012LinesForBien({ bien: b, fiscalYear: YEAR, scope: prop(propertyId) });
  assert.ok(lines.ok, "lignes F012 attendues");
  const ligne = lines.charges.lignes.find((l: LigneCharge) => l.id === lineId);
  assert.ok(ligne, `ligne ${lineId}`);
  return f012LineFingerprint(ligne, { owner: prop(propertyId), fiscalYear: YEAR, sources: lines.lineSources[lineId] });
}

export function natureAnswer(b: BienDraft, propertyId: string, lineId: string, fact: Omit<ChargeNatureFact, "sourceFingerprint" | "lineId" | "provenance"> & { loanId?: string }): ChargeNatureFact {
  return { ...fact, lineId, provenance: "declaration", sourceFingerprint: currentLineFingerprint(b, propertyId, lineId) } as ChargeNatureFact;
}

export function store(answers: Array<{ scope: Article39cScope; fact: ChargeNatureFact }>): Article39cQualificationStore {
  return answers.reduce(
    (acc, a) => recordChargeNatureAnswer(acc, { scope: a.scope, fiscalYear: YEAR, fact: a.fact, answeredAt: "2026-12-01T00:00:00.000Z" }),
    emptyQualificationStore(),
  );
}

export const first = (r: Article39cWorkspaceResult, fragment: string, part: string) => byPart(r.contributions, fragment, part);

