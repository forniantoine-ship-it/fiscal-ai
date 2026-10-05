/**
 * INT-2 — oracles de PERSISTANCE des faits et qualifications article 39 C.
 * Run: npx tsx --test src/lib/lmnp/services/article-39c/article-39c-persistence.test.ts
 *
 *   source fact → qualification fact → persistance (draft/workspace) → sérialisation → reload → empreinte → adapters INT-1
 *   → MÊMES `Article39cContribution[]`.
 *
 * Le moteur exact n'est appelé que par les tests ; aucun code productif ne le consomme (voir le test de non-activation).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { computeArticle39c } from "@/runtime/capabilities/f006/article-39c-capacity";
import type { Expense } from "@/runtime/capabilities/f012/expense";
import type { PretFinancementExercice } from "@/runtime/capabilities/f011/types";
import type { LigneCharge } from "@/runtime/capabilities/f012/types";
import { collectedToChargeRegistry } from "@/runtime/assistants/f012-charges/collected-to-registry";
import { chargeRegistryToComputeInput } from "@/runtime/assistants/f012-charges/registry-to-compute-input";
import { computeChargesExercice } from "@/runtime/capabilities/f012/compute-charges-exercice";
import type { F012CollectedData, F012PersistedState } from "@/runtime/assistants/f012-charges/types";
import { buildChargesAssistantOutput } from "@/lib/lmnp/services/f012/charges-assistant-output";
import { createBienDraft, type BienDraft } from "@/lib/lmnp/dossier/bien-draft";
import { loanKey } from "@/lib/lmnp/dossier/property-keys";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import { parseWorkspaceSnapshot, serializeWorkspaceSnapshot } from "@/lib/lmnp/store/workspace-snapshot";
import { applyFactsChange, confirmRentReconciliation, createRentReconciliationState, type RentReconciliationV2State } from "@/lib/lmnp/services/f013/v2/f013-v2-state";
import type { MoneyFact } from "@/lib/lmnp/services/f013/v2/f013-v2-contract";
import { toArticle39cQualifiedAmounts, type Article39cContribution, type Article39cScope } from "./contribution";
import { f012LineFingerprint } from "./from-f012";
import {
  editCfeNotice,
  cfeRecordIdFor,
  emptyQualificationStore,
  parseQualificationStore,
  recordCfeAnswer,
  recordChargeNatureAnswer,
  type Article39cQualificationStore,
} from "./qualification-store";
import type { ChargeNatureFact } from "./qualification-facts";
import {
  buildArticle39cContributionsFromWorkspace,
  resolveF012LinesForBien,
  type Article39cWorkspaceResult,
} from "./workspace-sources";

const YEAR = 2026;
const DOSSIER = "dossier-1";
const eur = (n: number) => Math.round(n * 100);
const validated = (cents: number): MoneyFact => ({ status: "VALIDATED", amountCents: cents });
const prop = (propertyId: string): Article39cScope => ({ level: "PROPERTY", propertyId });
const ACTIVITY: Article39cScope = { level: "ACTIVITY" };

// ---------------------------------------------------------------------------
// Fixtures : un vrai workspace sérialisable (F012 → registre → LigneCharge → sortie confirmée)
// ---------------------------------------------------------------------------

function collected(extra: Partial<F012CollectedData> = {}): F012CollectedData {
  return { coproLignes: [], travaux: [], divers: [], skippedCategories: [], ...extra };
}

function expense(partial: Partial<Expense> & Pick<Expense, "id" | "category" | "montant">): Expense {
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

function rentState(propertyId: string, e: number, cc = 0): RentReconciliationV2State {
  let state = createRentReconciliationState({ propertyId, fiscalYear: YEAR });
  state = applyFactsChange(state, {
    collections: validated(eur(e)),
    collectionsCoverage: { completeness: "COMPLETE", validation: "VALIDATED" },
    openingReceivables: validated(0),
    closingReceivables: validated(eur(cc)),
    openingAdvances: validated(0),
    closingAdvances: validated(0),
    exceptionsReviewed: true,
  });
  const confirmed = confirmRentReconciliation(state, { propertyId, fiscalYear: YEAR }, "2026-12-31T00:00:00.000Z");
  assert.ok(confirmed.ok);
  return confirmed.state;
}

function pret(partial: Partial<PretFinancementExercice> & { pretId: string }): PretFinancementExercice {
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

function financement(prets: PretFinancementExercice[]): NonNullable<BienDraft["financementCharges"]> {
  return {
    exerciceFiscal: YEAR,
    totalInteretsEmprunt: 0,
    totalInteretsPreExploitation: 0,
    totalAssurance: 0,
    totalCapitalRembourse: 0,
    totalChargesFinancementExercice: 0,
    prets,
    fieldSources: {},
    computedAt: "t",
  };
}

type BienOptions = {
  collected?: F012CollectedData;
  rent?: RentReconciliationV2State;
  financement?: PretFinancementExercice[];
  qualifications?: Article39cQualificationStore;
  noF012?: boolean;
};

/** Reproduit ce que l'assistant persiste : état (collected) + sortie confirmée calculée par le moteur F012 existant. */
function bien(propertyId: string, opts: BienOptions = {}): BienDraft {
  const out = createBienDraft(propertyId);
  out.dateMiseEnService = "2025-01-01";
  if (opts.rent) out.rentReconciliationV2 = opts.rent;
  if (opts.financement) out.financementCharges = financement(opts.financement);
  else out.creditDeclaredNoneAt = "t";
  if (opts.qualifications) out.article39cQualifications = opts.qualifications;
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
  const { charges } = computeChargesExercice(
    chargeRegistryToComputeInput(registry, { dateMiseEnService: out.dateMiseEnService, fieldSources: {} }),
  );
  out.chargesAssistantState = { ...state, registry };
  out.chargesAssistant = buildChargesAssistantOutput(charges, {}, "t");
  out.chargesConfirmedAt = "t";
  return out;
}

function monoWorkspace(propertyId: string, b: BienDraft, extraDraft: Record<string, unknown> = {}): PersistedWorkspace {
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

function multiWorkspace(biens: Record<string, BienDraft>, extraDraft: Record<string, unknown> = {}): PersistedWorkspace {
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
function roundtrip(workspace: PersistedWorkspace): { reloaded: PersistedWorkspace; schemaVersion: number } {
  const serialized = serializeWorkspaceSnapshot(workspace);
  assert.ok(serialized.ok, "sérialisation attendue");
  const payload = JSON.parse(JSON.stringify(serialized.envelope));
  const parsed = parseWorkspaceSnapshot(payload);
  assert.ok(parsed.ok, "relecture attendue");
  return { reloaded: parsed.envelope.workspace, schemaVersion: parsed.envelope.schemaVersion };
}

function build(workspace: PersistedWorkspace): Article39cWorkspaceResult {
  return buildArticle39cContributionsFromWorkspace({ workspace, expectedDossierId: DOSSIER });
}

function after(workspace: PersistedWorkspace): Article39cWorkspaceResult {
  return build(roundtrip(workspace).reloaded);
}

function byPart(items: readonly Article39cContribution[], sourceFragment: string, part: string): Article39cContribution | undefined {
  return items.find((c) => c.contributionId.includes(sourceFragment) && c.contributionId.endsWith(`|${part}`));
}

/** Empreinte COURANTE d'une ligne, telle que la collecte (INT-3) la calculera avant d'enregistrer une réponse. */
function currentLineFingerprint(b: BienDraft, propertyId: string, lineId: string): string {
  const lines = resolveF012LinesForBien({ bien: b, fiscalYear: YEAR, scope: prop(propertyId) });
  assert.ok(lines.ok, "lignes F012 attendues");
  const ligne = lines.charges.lignes.find((l: LigneCharge) => l.id === lineId);
  assert.ok(ligne, `ligne ${lineId}`);
  return f012LineFingerprint(ligne, { owner: prop(propertyId), fiscalYear: YEAR, sources: lines.lineSources[lineId] });
}

function natureAnswer(b: BienDraft, propertyId: string, lineId: string, fact: Omit<ChargeNatureFact, "sourceFingerprint" | "lineId" | "provenance"> & { loanId?: string }): ChargeNatureFact {
  return { ...fact, lineId, provenance: "declaration", sourceFingerprint: currentLineFingerprint(b, propertyId, lineId) } as ChargeNatureFact;
}

function store(answers: Array<{ scope: Article39cScope; fact: ChargeNatureFact }>): Article39cQualificationStore {
  return answers.reduce(
    (acc, a) => recordChargeNatureAnswer(acc, { scope: a.scope, fiscalYear: YEAR, fact: a.fact, answeredAt: "2026-12-01T00:00:00.000Z" }),
    emptyQualificationStore(),
  );
}

const first = (r: Article39cWorkspaceResult, fragment: string, part: string) => byPart(r.contributions, fragment, part);

// ---------------------------------------------------------------------------
// Oracles INT2-01 → INT2-18
// ---------------------------------------------------------------------------

describe("INT-2 — oracles de persistance", () => {
  it("INT2-01 — gestion PROPERTY_MANAGEMENT → save → reload → B identique", () => {
    const b = bien("A", {
      rent: rentState("A", 12000),
      collected: collected({ documentExpenses: [expense({ id: "gest-1", category: "honoraires_gestion", montant: 800, gestionKind: "gestion" })] }),
    });
    const ws = monoWorkspace("A", b);
    const before = build(ws);
    const c = first(before, "honoraires-gestion", "in_year")!;
    assert.equal(c.class, "B");
    assert.equal(c.amountCents, eur(800));
    const { reloaded, schemaVersion } = roundtrip(ws);
    assert.deepEqual(build(reloaded).contributions, before.contributions);
    assert.equal(schemaVersion, 3, "F013 v2 présent : snapshot v3 existant");
  });

  it("INT2-02 — gestion UNKNOWN → reload → NEEDS_QUALIFICATION (jamais B)", () => {
    const manual = bien("A", { rent: rentState("A", 12000), collected: collected({ honorairesGestion: 800 }) });
    const c = first(after(monoWorkspace("A", manual)), "honoraires-gestion", "in_year")!;
    assert.equal(c.class, "NEEDS_QUALIFICATION");
    for (const gestionKind of ["mise_en_location", "etat_des_lieux", "autre"] as const) {
      const other = bien("A", {
        rent: rentState("A", 12000),
        collected: collected({ documentExpenses: [expense({ id: "g", category: "honoraires_gestion", montant: 800, gestionKind })] }),
      });
      assert.equal(first(after(monoWorkspace("A", other)), "honoraires-gestion", "in_year")!.class, "NEEDS_QUALIFICATION", gestionKind);
    }
  });

  it("INT2-03 — nature modifiée après qualification → STALE (jamais B)", () => {
    const base = bien("A", { rent: rentState("A", 12000), collected: collected({ honorairesGestion: 800 }) });
    const answered = bien("A", {
      rent: rentState("A", 12000),
      collected: collected({ honorairesGestion: 800 }),
      qualifications: store([
        { scope: prop("A"), fact: natureAnswer(base, "A", "honoraires-gestion", { kind: "MANAGEMENT_NATURE", nature: "PROPERTY_MANAGEMENT" }) },
      ]),
    });
    const ok = after(monoWorkspace("A", answered));
    assert.equal(first(ok, "honoraires-gestion", "in_year")!.class, "B");
    // La source change : un document de mise en location s'ajoute à la ligne (nature et document modifiés).
    const changed = bien("A", {
      rent: rentState("A", 12000),
      collected: collected({
        honorairesGestion: 800,
        documentExpenses: [expense({ id: "loc", category: "honoraires_gestion", montant: 100, gestionKind: "mise_en_location" })],
      }),
      qualifications: answered.article39cQualifications,
    });
    const stale = first(after(monoWorkspace("A", changed)), "honoraires-gestion", "in_year")!;
    assert.equal(stale.class, "NEEDS_QUALIFICATION");
    assert.notEqual(stale.class, "B");
  });

  it("INT2-04 — PNO déclarée (champ PNO explicite) → reload → B", () => {
    const b = bien("A", { rent: rentState("A", 12000), collected: collected({ assurancePno: 400 }) });
    const ws = monoWorkspace("A", b);
    const before = build(ws);
    const c = first(before, "assurance-pno", "in_year")!;
    assert.equal(c.class, "B");
    assert.equal(c.amountCents, eur(400));
    assert.deepEqual(after(ws).contributions, before.contributions);
  });

  it("INT2-05 — assurance « logement » générique (document) → jamais B automatique ; réponse explicite requise", () => {
    const generic = bien("A", {
      rent: rentState("A", 12000),
      collected: collected({ documentExpenses: [expense({ id: "ass-1", category: "assurance_pno", montant: 400, insuranceKind: "logement" })] }),
    });
    const r = after(monoWorkspace("A", generic));
    assert.equal(first(r, "assurance-pno", "in_year")!.class, "NEEDS_QUALIFICATION");
    assert.equal(r.contributions.filter((c) => c.class === "B").length, 0);
    // Réponse du client « c'est une PNO » : seulement alors B.
    const answered = bien("A", {
      rent: rentState("A", 12000),
      collected: generic.chargesAssistantState!.collected,
      qualifications: store([{ scope: prop("A"), fact: natureAnswer(generic, "A", "assurance-pno", { kind: "INSURANCE_NATURE", nature: "PNO" }) }]),
    });
    assert.equal(first(after(monoWorkspace("A", answered)), "assurance-pno", "in_year")!.class, "B");
  });

  it("INT2-06 — CFE MINIMUM → reload → ACTIVITY / STRONG_INFERENCE (niveau activité, sans propertyId)", () => {
    const qualifications = recordCfeAnswer(emptyQualificationStore(), {
      scope: ACTIVITY,
      notice: { sourceId: "cfe-2026", fiscalYear: YEAR, amountCents: eur(500) },
      cfeBaseKind: "MINIMUM",
      provenance: "declaration",
      answeredAt: "2026-12-01T00:00:00.000Z",
    });
    const ws = monoWorkspace("A", bien("A", { rent: rentState("A", 12000) }), { article39cActivityQualifications: qualifications });
    const c = after(ws).contributions.find((x) => x.source === "CFE_NOTICE")!;
    assert.equal(c.class, "ACTIVITY");
    assert.equal(c.proofLevel, "STRONG_INFERENCE");
    assert.equal(c.amountCents, eur(500));
    assert.deepEqual(c.scope, { level: "ACTIVITY" });
  });

  it("INT2-07 — CFE UNKNOWN (« je ne sais pas ») → reload → non résolu ; jamais MINIMUM, jamais zéro", () => {
    const qualifications = recordCfeAnswer(emptyQualificationStore(), {
      scope: ACTIVITY,
      notice: { sourceId: "cfe-2026", fiscalYear: YEAR, amountCents: eur(500) },
      cfeBaseKind: "UNKNOWN",
      provenance: "declaration",
      answeredAt: "2026-12-01T00:00:00.000Z",
    });
    const ws = monoWorkspace("A", bien("A", { rent: rentState("A", 12000) }), { article39cActivityQualifications: qualifications });
    const c = after(ws).contributions.find((x) => x.source === "CFE_NOTICE")!;
    assert.equal(c.class, "NEEDS_QUALIFICATION");
    assert.equal(c.amountCents, eur(500));
    // Absence de réponse = aucune contribution inventée comme MINIMUM.
    const none = after(monoWorkspace("A", bien("A", { rent: rentState("A", 12000) })));
    assert.equal(none.contributions.filter((x) => x.source === "CFE_NOTICE").length, 0);
  });

  it("INT2-08 — CFE : montant, document ou source modifiés → réponse STALE", () => {
    const answered = recordCfeAnswer(emptyQualificationStore(), {
      scope: ACTIVITY,
      notice: { sourceId: "cfe-2026", fiscalYear: YEAR, amountCents: eur(500), evidenceRefs: ["doc-cfe-1"] },
      cfeBaseKind: "MINIMUM",
      provenance: "document",
      answeredAt: "2026-12-01T00:00:00.000Z",
    });
    const recordId = cfeRecordIdFor(ACTIVITY, "cfe-2026", YEAR);
    const run = (s: Article39cQualificationStore) =>
      after(monoWorkspace("A", bien("A", { rent: rentState("A", 12000) }), { article39cActivityQualifications: s })).contributions.find((x) => x.source === "CFE_NOTICE")!;
    assert.equal(run(answered).class, "ACTIVITY");
    for (const patch of [{ amountCents: eur(550) }, { evidenceRefs: ["doc-cfe-2"] }]) {
      const stale = run(editCfeNotice(answered, recordId, patch));
      assert.equal(stale.class, "NEEDS_QUALIFICATION", JSON.stringify(patch));
      assert.equal(stale.qualificationStatus, "STALE");
    }
    // Exercice différent : la réponse n'est pas réutilisée (aucune contribution).
    const otherYear = recordCfeAnswer(emptyQualificationStore(), {
      scope: ACTIVITY,
      notice: { sourceId: "cfe-2025", fiscalYear: YEAR - 1, amountCents: eur(500) },
      cfeBaseKind: "MINIMUM",
      provenance: "declaration",
      answeredAt: "2025-12-01T00:00:00.000Z",
    });
    assert.equal(
      after(monoWorkspace("A", bien("A", { rent: rentState("A", 12000) }), { article39cActivityQualifications: otherYear })).contributions.filter((x) => x.source === "CFE_NOTICE").length,
      0,
    );
  });

  const bankBien = (qualify?: (b: BienDraft) => Article39cQualificationStore, loans: PretFinancementExercice[] = [pret({ pretId: "loan-1", interetsEmpruntExercice: 1000 })]) => {
    const base = bien("A", { rent: rentState("A", 12000), collected: collected({ fraisBancaires: 200 }), financement: loans });
    return qualify ? bien("A", { rent: rentState("A", 12000), collected: collected({ fraisBancaires: 200 }), financement: loans, qualifications: qualify(base) }) : base;
  };

  it("INT2-09 — frais bancaires PROPERTY_FINANCING + loanId → reload → B", () => {
    const b = bankBien((base) =>
      store([{ scope: prop("A"), fact: natureAnswer(base, "A", "frais-bancaires", { kind: "BANK_FEE", nature: "PROPERTY_FINANCING", loanId: "loan-1" }) }]),
    );
    const ws = monoWorkspace("A", b);
    const before = build(ws);
    const c = first(before, "frais-bancaires", "in_year")!;
    assert.equal(c.class, "B");
    assert.equal(c.loanId, "loan-1");
    assert.deepEqual(after(ws).contributions, before.contributions);
  });

  it("INT2-10 — frais bancaires ACTIVITY_ACCOUNT → reload → ACTIVITY", () => {
    const b = bankBien((base) => store([{ scope: prop("A"), fact: natureAnswer(base, "A", "frais-bancaires", { kind: "BANK_FEE", nature: "ACTIVITY_ACCOUNT" }) }]));
    assert.equal(first(after(monoWorkspace("A", b)), "frais-bancaires", "in_year")!.class, "ACTIVITY");
  });

  it("INT2-11 — frais bancaires UNKNOWN (ou sans réponse) → non résolu", () => {
    const answered = bankBien((base) => store([{ scope: prop("A"), fact: natureAnswer(base, "A", "frais-bancaires", { kind: "BANK_FEE", nature: "UNKNOWN" }) }]));
    assert.equal(first(after(monoWorkspace("A", answered)), "frais-bancaires", "in_year")!.class, "NEEDS_QUALIFICATION");
    assert.equal(first(after(monoWorkspace("A", bankBien())), "frais-bancaires", "in_year")!.class, "NEEDS_QUALIFICATION");
  });

  it("INT2-12 — prêt réattribué / supprimé (loanId) → qualification STALE", () => {
    const answered = bankBien((base) =>
      store([{ scope: prop("A"), fact: natureAnswer(base, "A", "frais-bancaires", { kind: "BANK_FEE", nature: "PROPERTY_FINANCING", loanId: "loan-1" }) }]),
    );
    assert.equal(first(after(monoWorkspace("A", answered)), "frais-bancaires", "in_year")!.class, "B");
    const reassigned = bien("A", {
      rent: rentState("A", 12000),
      collected: collected({ fraisBancaires: 200 }),
      financement: [pret({ pretId: "loan-2", interetsEmpruntExercice: 1000 })],
      qualifications: answered.article39cQualifications,
    });
    const stale = first(after(monoWorkspace("A", reassigned)), "frais-bancaires", "in_year")!;
    assert.equal(stale.class, "NEEDS_QUALIFICATION");
    assert.equal(stale.qualificationStatus, "STALE");
  });

  it("INT2-13 — F013 mono : le bien du workspace, jamais le bien actif ni properties[0] ; identité fail-closed", () => {
    const ws = monoWorkspace("P-mono", bien("P-mono", { rent: rentState("P-mono", 11000, 1000) }));
    const r = after(ws);
    const l = r.contributions.find((c) => c.class === "L")!;
    assert.deepEqual(l.scope, { level: "PROPERTY", propertyId: "P-mono" });
    assert.equal(l.amountCents, eur(12000));
    // État F013 d'un autre bien dans ce bien : refusé.
    const wrong = monoWorkspace("P-mono", bien("P-mono", { rent: rentState("OTHER", 12000) }));
    assert.equal(build(wrong).contributions.filter((c) => c.class === "L").length, 0);
    assert.ok(build(wrong).blockers.some((b) => b.code === "F013_V2_SCOPE_MISMATCH"));
    // Identité de dossier absente / divergente.
    const noId = structuredClone(ws);
    delete (noId.fiscalYear as { dossierId?: string }).dossierId;
    assert.equal(build(noId).blockers[0]!.code, "DOSSIER_IDENTITY_MISSING");
    assert.equal(buildArticle39cContributionsFromWorkspace({ workspace: ws, expectedDossierId: "autre" }).blockers[0]!.code, "DOSSIER_MISMATCH");
    // Plusieurs biens + données à plat : ambigu, jamais « le premier ».
    const ambiguous = multiWorkspace({ A: bien("A"), B: bien("B") }, { dateMiseEnService: "2025-01-01" });
    assert.equal(build(ambiguous).blockers[0]!.code, "PROPERTY_SCOPE_UNRESOLVED");
    assert.equal(build(ambiguous).contributions.length, 0);
  });

  it("INT2-14 — F013 multi A/B : aucune contamination entre biens", () => {
    const ws = multiWorkspace({
      A: bien("A", { rent: rentState("A", 12000) }),
      B: bien("B", { rent: rentState("B", 8000) }),
    });
    const r = after(ws);
    const L = r.contributions.filter((c) => c.class === "L");
    assert.deepEqual(L.map((c) => [c.scope.level === "PROPERTY" ? c.scope.propertyId : "", c.amountCents]).sort(), [["A", eur(12000)], ["B", eur(8000)]]);
    // L'état de B placé dans A : refusé (A n'obtient jamais L de B).
    const swapped = multiWorkspace({
      A: bien("A", { rent: rentState("B", 8000) }),
      B: bien("B", { rent: rentState("B", 8000) }),
    });
    const sr = build(swapped);
    assert.deepEqual(sr.contributions.filter((c) => c.class === "L").map((c) => c.scope), [prop("B")]);
    assert.ok(sr.blockers.some((b) => b.code === "F013_V2_SCOPE_MISMATCH" && b.scope?.level === "PROPERTY" && b.scope.propertyId === "A"));
  });

  it("INT2-15 — même pretId sur A et B : loanKey distincts, aucun mélange après reload", () => {
    const ws = multiWorkspace({
      A: bien("A", { rent: rentState("A", 12000), financement: [pret({ pretId: "loan-1", interetsEmpruntExercice: 100 })] }),
      B: bien("B", { rent: rentState("B", 8000), financement: [pret({ pretId: "loan-1", interetsEmpruntExercice: 200 })] }),
    });
    const r = after(ws);
    const interest = r.contributions.filter((c) => c.source === "F011_LOAN" && c.contributionId.endsWith("|interest"));
    assert.equal(interest.length, 2);
    assert.notEqual(loanKey("A", "loan-1"), loanKey("B", "loan-1"));
    const amounts = Object.fromEntries(interest.map((c) => [c.scope.level === "PROPERTY" ? c.scope.propertyId : "", c.amountCents]));
    assert.deepEqual(amounts, { A: eur(100), B: eur(200) });
    assert.deepEqual(r.violations, []);
  });

  it("INT2-16 — lignes F012 recalculées ≠ totaux confirmés → BLOCKED, aucune contribution F012", () => {
    const b = bien("A", { rent: rentState("A", 12000), collected: collected({ assurancePno: 400, honorairesComptable: 300 }) });
    assert.equal(build(monoWorkspace("A", b)).contributions.filter((c) => c.source === "F012_CHARGE").length > 0, true);
    const tampered: BienDraft = { ...b, chargesAssistant: { ...b.chargesAssistant!, totalDeductible: b.chargesAssistant!.totalDeductible + 0.01 } };
    const r = after(monoWorkspace("A", tampered));
    assert.equal(r.status, "BLOCKED");
    assert.ok(r.blockers.some((x) => x.code === "F012_RECONCILIATION_MISMATCH"));
    assert.equal(r.contributions.filter((c) => c.source === "F012_CHARGE").length, 0);
    // Un état F012 modifié après confirmation (registre ≠ sortie) bloque de la même façon.
    const drifted: BienDraft = {
      ...b,
      chargesAssistantState: { ...b.chargesAssistantState!, collected: { ...b.chargesAssistantState!.collected, assurancePno: 450 } },
    };
    assert.ok(after(monoWorkspace("A", drifted)).blockers.some((x) => x.code === "F012_RECONCILIATION_MISMATCH"));
    // Sortie non confirmée / état absent : jamais « zéro charge ».
    const unconfirmed: BienDraft = { ...b, chargesAssistant: undefined, chargesConfirmedAt: undefined };
    assert.ok(after(monoWorkspace("A", unconfirmed)).blockers.some((x) => x.code === "F012_NOT_CONFIRMED"));
    assert.ok(after(monoWorkspace("A", bien("A", { rent: rentState("A", 12000), noF012: true }))).blockers.some((x) => x.code === "F012_SOURCE_MISSING"));
  });

  it("INT2-17 — dossier legacy sans nouveaux faits : jamais silencieusement qualifié", () => {
    // Le champ PNO provient ici d'un document legacy (aucune nature conservée) : pas de PNO automatique.
    const withDoc = bien("A", {
      rent: rentState("A", 12000),
      collected: collected({
        honorairesGestion: 800,
        fraisBancaires: 200,
        assurancePno: 400,
        documentIdsByFamily: { assurances: ["doc-pno"] },
        divers: [{ id: "d1", description: "CFE 2026", montant: 500 }],
      }),
    });
    const r = after(monoWorkspace("A", withDoc));
    const bClasses = r.contributions.filter((c) => c.source === "F012_CHARGE" && c.class === "B");
    assert.deepEqual(bClasses.map((c) => c.contributionId), [], "aucun B sans nature démontrée");
    assert.equal(r.contributions.filter((c) => c.source === "CFE_NOTICE").length, 0, "pas de CFE inventée (divers ≠ CFE)");
    assert.equal(first(r, "divers", "in_year")?.class ?? first(r, "d1", "in_year")?.class, "NEEDS_QUALIFICATION");
    assert.equal(r.status, "NEEDS_QUALIFICATION");
    assert.equal(parseQualificationStore(undefined), undefined, "absence de store = absence de réponse (UNKNOWN)");
    // Aucun store : F013 absent → blocage explicite, jamais L = 0.
    const noRent = after(monoWorkspace("A", bien("A", { collected: collected({ assurancePno: 400 }) })));
    assert.ok(noRent.blockers.some((b) => b.code === "F013_V2_NOT_PRESENT"));
    assert.equal(noRent.contributions.filter((c) => c.class === "L").length, 0);
  });

  it("INT2-18 — fait niveau activité : survit au reload sans propertyId fictif", () => {
    const qualifications = recordCfeAnswer(emptyQualificationStore(), {
      scope: ACTIVITY,
      notice: { sourceId: "cfe-2026", fiscalYear: YEAR, amountCents: eur(500) },
      cfeBaseKind: "MINIMUM",
      provenance: "declaration",
      answeredAt: "2026-12-01T00:00:00.000Z",
    });
    const ws = multiWorkspace({ A: bien("A", { rent: rentState("A", 12000) }), B: bien("B", { rent: rentState("B", 8000) }) }, { article39cActivityQualifications: qualifications });
    const { reloaded } = roundtrip(ws);
    const stored = (reloaded.declarationDraft as { article39cActivityQualifications: Article39cQualificationStore }).article39cActivityQualifications;
    assert.ok(!JSON.stringify(stored).includes("propertyId"), "aucun propertyId dans un enregistrement d'activité");
    const c = build(reloaded).contributions.find((x) => x.source === "CFE_NOTICE")!;
    assert.deepEqual(c.scope, { level: "ACTIVITY" });
    assert.equal(c.class, "ACTIVITY");
    // Injecter un enregistrement rattaché à un bien dans le store d'activité : jamais servi.
    const polluted = recordCfeAnswer(qualifications, {
      scope: prop("A"),
      notice: { sourceId: "cfe-x", fiscalYear: YEAR, amountCents: eur(100) },
      cfeBaseKind: "MINIMUM",
      provenance: "declaration",
      answeredAt: "t",
    });
    const pr = build(roundtrip(multiWorkspace({ A: bien("A", { rent: rentState("A", 12000) }), B: bien("B", { rent: rentState("B", 8000) }) }, { article39cActivityQualifications: polluted })).reloaded);
    assert.ok(pr.blockers.some((b) => b.code === "QUALIFICATION_WRONG_SCOPE"));
    assert.equal(pr.contributions.filter((x) => x.source === "CFE_NOTICE").length, 1);
  });
});

// ---------------------------------------------------------------------------
// Roundtrip complet et anti-contamination
// ---------------------------------------------------------------------------

describe("INT-2 — roundtrip fiscal et anti-contamination entre biens", () => {
  const richBien = (propertyId: string, rentE: number, loanId: string, cfeKind?: "MINIMUM" | "UNKNOWN") => {
    const base = bien(propertyId, {
      rent: rentState(propertyId, rentE),
      collected: collected({
        documentExpenses: [expense({ id: `gest-${propertyId}`, category: "honoraires_gestion", montant: 800, gestionKind: "gestion" })],
        assurancePno: 400,
        fraisBancaires: 200,
        honorairesComptable: 300,
        coproLignes: [{ id: "copro:1", type: "provisions", montant: 1000 }, { type: "fonds_travaux", montant: 500 }],
      }),
      financement: [pret({ pretId: loanId, interetsEmpruntExercice: 3000, assuranceEmpruntExercice: 400, fraisDossierDeductibles: 200 })],
    });
    let qualifications = store([
      { scope: prop(propertyId), fact: natureAnswer(base, propertyId, "frais-bancaires", { kind: "BANK_FEE", nature: "PROPERTY_FINANCING", loanId }) },
    ]);
    if (cfeKind) {
      qualifications = recordCfeAnswer(qualifications, {
        scope: prop(propertyId),
        notice: { sourceId: "cfe-2026", fiscalYear: YEAR, amountCents: eur(500) },
        cfeBaseKind: cfeKind,
        provenance: "declaration",
        answeredAt: "2026-12-01T00:00:00.000Z",
      });
    }
    return bien(propertyId, {
      rent: rentState(propertyId, rentE),
      collected: base.chargesAssistantState!.collected,
      financement: base.financementCharges!.prets,
      qualifications,
    });
  };

  it("source facts → qualification → save → serialize → reload → adapters : contributions fiscalement identiques", () => {
    const ws = multiWorkspace({ A: richBien("A", 12000, "loan-1", "MINIMUM"), B: richBien("B", 8000, "loan-1", "UNKNOWN") });
    const before = build(ws);
    // « navigation / autosave / reload » : deux allers-retours successifs.
    const once = roundtrip(ws).reloaded;
    const twice = roundtrip(once).reloaded;
    assert.deepEqual(build(once), before);
    assert.deepEqual(build(twice), before);
    // Équivalence jusqu'au moteur exact (appelé par le test seulement) : mêmes entrées, même résultat.
    const compute = (r: Article39cWorkspaceResult) =>
      computeArticle39c({ exercice: YEAR, amounts: toArticle39cQualifiedAmounts(r.contributions), currentDepreciation: 0 });
    assert.deepEqual(compute(build(twice)), compute(before));
    assert.ok(before.contributions.some((c) => c.class === "L") && before.contributions.some((c) => c.class === "B"));
    assert.deepEqual(before.violations, []);
  });

  it("A : CFE MINIMUM → ACTIVITY ; B : CFE UNKNOWN → non résolu ; jamais de contamination (aussi frais bancaires, gestion)", () => {
    const ws = multiWorkspace({ A: richBien("A", 12000, "loan-1", "MINIMUM"), B: richBien("B", 8000, "loan-1", "UNKNOWN") });
    const r = roundtrip(roundtrip(ws).reloaded).reloaded;
    const res = build(r);
    const cfe = res.contributions.filter((c) => c.source === "CFE_NOTICE");
    const byProp = Object.fromEntries(cfe.map((c) => [c.scope.level === "PROPERTY" ? c.scope.propertyId : "", c]));
    assert.equal(byProp.A!.class, "ACTIVITY");
    assert.equal(byProp.B!.class, "NEEDS_QUALIFICATION");
    // Les réponses de A ne servent jamais B : on copie le store de A dans B → réponses ignorées + blocage explicite.
    const biensA = (r.declarationDraft as { biens: Record<string, BienDraft> }).biens;
    const contaminated = structuredClone(r);
    (contaminated.declarationDraft as { biens: Record<string, BienDraft> }).biens.B = {
      ...biensA.B!,
      article39cQualifications: biensA.A!.article39cQualifications,
    };
    const cr = build(contaminated);
    assert.ok(cr.blockers.some((b) => b.code === "QUALIFICATION_WRONG_SCOPE" && b.scope?.level === "PROPERTY" && b.scope.propertyId === "B"));
    const bB = cr.contributions.find((c) => c.source === "CFE_NOTICE" && c.scope.level === "PROPERTY" && c.scope.propertyId === "B");
    assert.equal(bB, undefined, "B n'a reçu aucune réponse de A");
    const bankB = cr.contributions.find((c) => c.contributionId.includes("B:frais-bancaires") && c.contributionId.endsWith("|in_year"));
    assert.equal(bankB?.class, "NEEDS_QUALIFICATION", "frais bancaires de B non qualifiés par la réponse de A");
  });
});

// ---------------------------------------------------------------------------
// Fingerprint / invalidation (catalogue complet de l'item 14)
// ---------------------------------------------------------------------------

describe("INT-2 — invalidation des qualifications", () => {
  const answeredBank = () => {
    const base = bien("A", { rent: rentState("A", 12000), collected: collected({ fraisBancaires: 200 }), financement: [pret({ pretId: "loan-1" })] });
    return { base, answer: natureAnswer(base, "A", "frais-bancaires", { kind: "BANK_FEE", nature: "ACTIVITY_ACCOUNT" }) };
  };

  it("montant, catégorie, rattachement, document : toute modification fiscalement pertinente périme la réponse", () => {
    const { answer } = answeredBank();
    const withAnswer = (col: F012CollectedData, propertyId = "A") =>
      bien(propertyId, { rent: rentState(propertyId, 12000), collected: col, financement: [pret({ pretId: "loan-1" })], qualifications: store([{ scope: prop(propertyId), fact: answer }]) });
    const klass = (b: BienDraft, propertyId = "A") => first(build(monoWorkspace(propertyId, b)), "frais-bancaires", "in_year")?.class;

    assert.equal(klass(withAnswer(collected({ fraisBancaires: 200 }))), "ACTIVITY", "référence : réponse fraîche");
    // montant
    assert.equal(klass(withAnswer(collected({ fraisBancaires: 250 }))), "NEEDS_QUALIFICATION");
    // catégorie : la dépense est reclassée en « divers » → la ligne « frais-bancaires » disparaît, aucune réponse héritée
    const reclassified = withAnswer(collected({ divers: [{ id: "frais-bancaires", description: "x", montant: 200 }] }));
    assert.notEqual(klass(reclassified), "ACTIVITY");
    // rattachement : le même dossier transposé sur un autre bien (réponse de A lue pour B) n'est jamais servi
    const asB = bien("B", { rent: rentState("B", 12000), collected: collected({ fraisBancaires: 200 }), financement: [pret({ pretId: "loan-1" })], qualifications: store([{ scope: prop("A"), fact: answer }]) });
    const resB = build(monoWorkspace("B", asB));
    assert.equal(first(resB, "frais-bancaires", "in_year")?.class, "NEEDS_QUALIFICATION");
    assert.ok(resB.blockers.some((b) => b.code === "QUALIFICATION_WRONG_SCOPE"));
    // exercice : la réponse d'un autre exercice n'est pas réutilisable
    const otherYear = recordChargeNatureAnswer(emptyQualificationStore(), { scope: prop("A"), fiscalYear: YEAR - 1, fact: answer, answeredAt: "t" });
    assert.equal(klass(bien("A", { rent: rentState("A", 12000), collected: collected({ fraisBancaires: 200 }), financement: [pret({ pretId: "loan-1" })], qualifications: otherYear })), "NEEDS_QUALIFICATION");
    // document : un document source ajouté à la dépense périme la réponse
    const docs = bien("A", {
      rent: rentState("A", 12000),
      collected: collected({ fraisBancaires: 200, documentIdsByFamily: { autres: ["doc-releve"] } }),
      financement: [pret({ pretId: "loan-1" })],
      qualifications: store([{ scope: prop("A"), fact: answer }]),
    });
    // Le slot frais bancaires ne porte pas de documents : l'ajout n'a pas d'effet fiscal (pas d'invalidation parasite).
    assert.equal(klass(docs), "ACTIVITY");
  });

  it("document source de la gestion remplacé → réponse STALE", () => {
    const col = (docId: string) => collected({ honorairesGestion: 800, documentIdsByFamily: { gestion: [docId] } });
    const base = bien("A", { rent: rentState("A", 12000), collected: col("doc-1") });
    const answer = natureAnswer(base, "A", "honoraires-gestion", { kind: "MANAGEMENT_NATURE", nature: "PROPERTY_MANAGEMENT" });
    const withAnswer = (docId: string) =>
      bien("A", { rent: rentState("A", 12000), collected: col(docId), qualifications: store([{ scope: prop("A"), fact: answer }]) });
    assert.equal(first(build(monoWorkspace("A", withAnswer("doc-1"))), "honoraires-gestion", "in_year")!.class, "B");
    assert.equal(first(build(monoWorkspace("A", withAnswer("doc-2"))), "honoraires-gestion", "in_year")!.class, "NEEDS_QUALIFICATION");
  });

  it("store malformé : enregistrements écartés, jamais promus ; version inconnue → absence", () => {
    const { answer } = answeredBank();
    const good = store([{ scope: prop("A"), fact: answer }]);
    const raw = JSON.parse(JSON.stringify(good));
    raw.records.push({ recordKind: "CFE", recordId: "x", scope: { level: "ACTIVITY", propertyId: "A" }, fiscalYear: YEAR, validation: "VALIDATED", answeredAt: "t" });
    raw.records.push({ ...raw.records[0], recordId: "no-fp", fact: { ...raw.records[0].fact, sourceFingerprint: "" } });
    raw.records.push({ ...raw.records[0], recordId: "proposed", validation: "PROPOSED" });
    const parsed = parseQualificationStore(raw)!;
    assert.deepEqual(parsed.records.map((r) => r.recordId).sort(), [good.records[0]!.recordId, "proposed"].sort());
    assert.equal(parseQualificationStore({ storeVersion: 99, records: [] }), undefined);
    assert.equal(parseQualificationStore("x"), undefined);
    // PROPOSED ≠ VALIDATED : jamais consommé.
    const base = bien("A", { rent: rentState("A", 12000), collected: collected({ fraisBancaires: 200 }), financement: [pret({ pretId: "loan-1" })] });
    const proposedOnly = { storeVersion: 1, records: [{ ...JSON.parse(JSON.stringify(good.records[0])), validation: "PROPOSED" }] } as unknown as Article39cQualificationStore;
    const ws = monoWorkspace("A", { ...base, article39cQualifications: proposedOnly });
    assert.equal(first(build(ws), "frais-bancaires", "in_year")!.class, "NEEDS_QUALIFICATION");
  });
});

// ---------------------------------------------------------------------------
// Snapshot : version et compatibilité
// ---------------------------------------------------------------------------

describe("INT-2 — snapshot", () => {
  it("les qualifications vivent dans le contrat v3 existant (aucune v4) ; sans elles, les versions v1/v2 sont inchangées", () => {
    const withoutRent = bien("A", {});
    delete withoutRent.rentReconciliationV2;
    assert.equal(roundtrip(monoWorkspace("A", withoutRent)).schemaVersion, 1);
    assert.equal(roundtrip(multiWorkspace({ A: withoutRent, B: bien("B") })).schemaVersion, 2);
    const q = recordCfeAnswer(emptyQualificationStore(), {
      scope: ACTIVITY,
      notice: { sourceId: "c", fiscalYear: YEAR, amountCents: 100 },
      cfeBaseKind: "UNKNOWN",
      provenance: "declaration",
      answeredAt: "t",
    });
    assert.equal(roundtrip(monoWorkspace("A", withoutRent, { article39cActivityQualifications: q })).schemaVersion, 3);
    assert.equal(roundtrip(multiWorkspace({ A: { ...withoutRent, article39cQualifications: q }, B: bien("B") })).schemaVersion, 3);
  });
});
