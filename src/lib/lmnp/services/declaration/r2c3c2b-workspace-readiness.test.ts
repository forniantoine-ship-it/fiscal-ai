/**
 * R2C.3c2b — READINESS TECHNIQUE D'UN WORKSPACE + BLOCKING REASONS STRUCTURÉES. Couche PURE et dormante :
 * TECHNICAL READINESS ≠ USER ACTIVATION ≠ PAYMENT READINESS. Aucun appelant de production, aucune persistance,
 * aucune capacité de gate (canGenerate / canCheckout / canRetryAfterPayment) modifiée.
 *
 * Run: npx tsx --test src/lib/lmnp/services/declaration/r2c3c2b-workspace-readiness.test.ts
 */
import "@/lab/v2-dossier/test-public-env";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, mock } from "node:test";

import { MULTI_PROPERTY_USER_ENABLED } from "@/lib/lmnp/dossier/multi-property-activation";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import { runDeclarationGenerationFromWorkspace } from "@/lib/lmnp/services/declaration/generation-workspace";
import {
  BLOCKING_REASON_ROUTES,
  classifyBlockingReason,
  type StructuredBlockingReason,
} from "@/lib/lmnp/services/declaration/workspace-blocking-reasons";
import { resolveWorkspaceReadiness, type WorkspaceReadiness } from "@/lib/lmnp/services/declaration/workspace-readiness";

const ROOT = process.cwd();
const BASELINE = "04e7e987a19131ea67a7d9185d17e3595461ded5";
const Y = 2026;
const T = "2026-01-01T00:00:00.000Z";
const FIXED = Date.parse("2026-06-01T12:00:00.000Z");
const A = "home-1";
const B = "bien-b";
const SIRET = "12345678900012";
const clone = <V>(value: V): V => JSON.parse(JSON.stringify(value));

function withFixedClock<V>(run: () => V): V {
  mock.timers.enable({ apis: ["Date"], now: FIXED });
  try {
    return run();
  } finally {
    mock.timers.reset();
  }
}

// ---------------------------------------------------------------------------
// Fixtures : deux biens natifs générables, données explicitement property-scoped.
// ---------------------------------------------------------------------------

type BienSpec = {
  date?: string;
  recettes: number;
  cats: Record<string, number>;
  credit: "present" | "none" | "unknown";
  pretIds?: string[];
  interets?: number;
  creditDocumentId?: string;
  dotations: number;
  plan: { lignes: Array<Record<string, unknown>>; totalAnnuelExercice: number; totalBrut: number };
  valeurTerrain: number;
  montantMobilier: number;
};

const PLAN_A = {
  lignes: [
    { id: "gros-oeuvre", label: "Gros œuvre", montant: 100000, dureeAnnees: 50, dotationExercice: 1420.01, amortissementsCumules: 1420.01 },
    { id: "facades", label: "Façades", montant: 70000, dureeAnnees: 25, dotationExercice: 1988.2, amortissementsCumules: 1988.2 },
    { id: "mobilier", label: "Mobilier", montant: 8000, dureeAnnees: 5, dotationExercice: 1136.0, amortissementsCumules: 1136.0 },
  ],
  totalAnnuelExercice: 4544.21,
  totalBrut: 178000,
};
const PLAN_B = {
  lignes: [
    { id: "gros-oeuvre", label: "Gros œuvre", montant: 60000, dureeAnnees: 50, dotationExercice: 500, amortissementsCumules: 500 },
    { id: "mobilier", label: "Mobilier", montant: 5000, dureeAnnees: 5, dotationExercice: 400, amortissementsCumules: 400 },
  ],
  totalAnnuelExercice: 900,
  totalBrut: 65000,
};

const SPEC_A: BienSpec = {
  date: "2026-04-15", recettes: 14321.09, cats: { taxe_fonciere: 1200.11, copropriete: 2256.67 }, credit: "present", interets: 2100.13,
  dotations: 4544.21, plan: PLAN_A, valeurTerrain: 30000, montantMobilier: 8000,
};
const SPEC_B: BienSpec = {
  date: "2026-06-10", recettes: 9000.2, cats: { taxe_fonciere: 500.05, assurance_pno: 300.1 }, credit: "present", interets: 310.27,
  dotations: 900, plan: PLAN_B, valeurTerrain: 12000, montantMobilier: 5000,
};

function bienOf(propertyId: string, spec: BienSpec): Record<string, unknown> {
  const charges = Object.values(spec.cats).reduce((sum, value) => Math.round((sum + value) * 100) / 100, 0);
  return {
    propertyId,
    completedSteps: [],
    ...(spec.date !== undefined ? { dateMiseEnService: spec.date } : {}),
    revenusAssistant: { exerciceFiscal: Y, totalRecettes: spec.recettes, loyersEncaisses: spec.recettes, fieldSources: {}, computedAt: T },
    chargesAssistant: { exerciceFiscal: Y, totalDeductible: charges, totalPreExploitation: 0, totalNonDeductible: 0, totalAmortissable: 0, parCategorie: spec.cats, composantsNouveaux: [], fieldSources: {}, computedAt: T },
    ...(spec.credit === "present"
      ? {
          financementCharges: {
            exerciceFiscal: Y, totalInteretsEmprunt: spec.interets ?? 0, totalInteretsPreExploitation: 0, totalAssurance: 0,
            totalAssurancePreExploitation: 0, totalCapitalRembourse: 0, totalChargesFinancementExercice: spec.interets ?? 0,
            prets: (spec.pretIds ?? ["loan-1"]).map((pretId) => ({
              pretId, typePret: "amortissable", interetsEmpruntExercice: (spec.interets ?? 0) / (spec.pretIds?.length ?? 1), interetsPreExploitation: 0,
              assuranceEmpruntExercice: 0, assurancePreExploitation: 0, capitalRembourseExercice: 0, capitalRestantDu31_12: 1000, fraisDossierDeductibles: 0, garantieDeductible: 0, iraDeductible: 0,
            })),
            fieldSources: {}, computedAt: T,
          },
        }
      : {}),
    ...(spec.credit === "none" ? { creditDeclaredNoneAt: T } : {}),
    ...(spec.creditDocumentId ? { creditDocumentId: spec.creditDocumentId } : {}),
    amortissementAssistant: { exerciceFiscal: Y, totalDotations: spec.dotations, status: "validated" },
    logementAmortissement: {
      exerciceFiscal: Y, prixRevient: 0, fraisEnCharges: 0, valeurTerrain: spec.valeurTerrain, valeurBati: 0, baseAmortissableBati: 0,
      montantMobilier: spec.montantMobilier, dotationAnnuelle: spec.dotations, dureeMoyenneAnnees: 30, prorataRatio: 1,
      plan: spec.plan, fieldSources: {}, computedAt: T,
    },
  };
}

type WorkspaceOptions = {
  specs?: Array<[string, BienSpec]>;
  fiscalYear?: Record<string, unknown>;
  root?: Record<string, unknown>;
  bienOverrides?: Record<string, Record<string, unknown>>;
};

function multiWorkspace(options: WorkspaceOptions = {}): PersistedWorkspace {
  const specs = options.specs ?? [[A, SPEC_A], [B, SPEC_B]];
  const biens = Object.fromEntries(specs.map(([id, spec]) => [id, { ...bienOf(id, spec), ...(options.bienOverrides?.[id] ?? {}) }]));
  return {
    fiscalYear: { id: "fy-2026", year: Y, status: "draft", regime: "reel", propertyIds: specs.map(([id]) => id), createdAt: T, updatedAt: T, ...(options.fiscalYear ?? {}) },
    properties: specs.map(([id]) => ({ id, label: `Bien ${id}`, address: "1 rue X", city: "Lyon", postalCode: "69000" })),
    documents: [], extractions: [], validationItems: [], ledgerEntries: [],
    declarationDraft: {
      completedSteps: [], siret: SIRET, siren: "123456789", exploitantFirstName: "Multi", exploitantLastName: "Bien",
      activityStartDate: "2026-03-01", activityType: "LMNP", dispense2033A: { caReferenceN1Declaree: 0 }, biens,
      ...(options.root ?? {}),
    },
  } as unknown as PersistedWorkspace;
}

function monoWorkspace(): PersistedWorkspace {
  const bien = bienOf(A, SPEC_A);
  const { propertyId: _ignored, completedSteps: _steps, ...flat } = bien;
  void _ignored; void _steps;
  return {
    fiscalYear: { id: "fy-mono", year: Y, status: "draft", regime: "reel", propertyIds: [A], createdAt: T, updatedAt: T },
    properties: [{ id: A, label: "Bien A", address: "1 rue X", city: "Lyon", postalCode: "69000" }],
    documents: [], extractions: [], validationItems: [], ledgerEntries: [],
    declarationDraft: { completedSteps: [], siret: SIRET, siren: "123456789", exploitantFirstName: "Mono", exploitantLastName: "Bien", activityStartDate: "2026-03-01", activityType: "LMNP", dispense2033A: { caReferenceN1Declaree: 0 }, ...flat },
  } as unknown as PersistedWorkspace;
}



// ---------------------------------------------------------------------------
// Helpers : confirmations utilisateur (étapes "complete") + évaluation pure du service workspace
// ---------------------------------------------------------------------------

/** Ajoute les confirmations qui rendent les étapes de complétude "complete" (F009 racine, F011/F013 par bien). */
function confirmed(workspace: PersistedWorkspace, options: { global?: boolean } = {}): PersistedWorkspace {
  const ws = clone(workspace) as unknown as { declarationDraft: Record<string, unknown> & { biens?: Record<string, Record<string, unknown>> } };
  const confirmBien = (bien: Record<string, unknown>) => {
    bien.revenusConfirmedAt ??= T;
    if (bien.financementCharges !== undefined) bien.creditConfirmedAt ??= T;
  };
  if (options.global !== false) ws.declarationDraft.inpiConfirmedAt = T;
  if (ws.declarationDraft.biens) Object.values(ws.declarationDraft.biens).forEach(confirmBien);
  else confirmBien(ws.declarationDraft);
  return ws as unknown as PersistedWorkspace;
}
const evaluate = (workspace: PersistedWorkspace, options: Record<string, unknown> = {}) =>
  withFixedClock(() => runDeclarationGenerationFromWorkspace(workspace, options as never));
const readiness = (workspace: PersistedWorkspace, options: Record<string, unknown> = {}): WorkspaceReadiness =>
  resolveWorkspaceReadiness(workspace, evaluate(workspace, options));
const multi = (options: Parameters<typeof multiWorkspace>[0] = {}) => confirmed(multiWorkspace(options));
const bienDraftOf = (workspace: PersistedWorkspace, id: string) => workspace.declarationDraft!.biens![id] as unknown as Record<string, unknown>;
const reasonCodes = (r: WorkspaceReadiness) => r.blockingReasons.map((reason) => reason.code + (reason.propertyId ? `@${reason.propertyId}` : ""));
const find = (r: WorkspaceReadiness, code: string, propertyId?: string) =>
  r.blockingReasons.find((reason) => reason.code === code && (propertyId === undefined || reason.propertyId === propertyId));
const propertyOf = (r: WorkspaceReadiness, id: string) => r.properties.find((property) => property.propertyId === id)!;
const withoutMode = (r: WorkspaceReadiness) => { const { mode, ...rest } = r; void mode; return rest; };
const scopedMono = () => confirmed(multiWorkspace({ specs: [[A, SPEC_A]], root: { exploitantFirstName: "Mono" } }));
const legacyMono = () => confirmed(monoWorkspace());

describe("R2C.3c2b — readiness : mono et scoped mono (parité)", () => {
  it("B1 — legacy mono : un bien, global F009, domaines par bien, prêt", () => {
    const r = readiness(legacyMono());
    assert.equal(r.mode, "legacy_mono");
    assert.equal(r.global.ready, true);
    assert.deepEqual(r.properties.map((property) => property.propertyId), [A]);
    assert.equal(propertyOf(r, A).ready, true);
    assert.deepEqual(r.blockingReasons, []);
    assert.equal(r.technicalReady, true);
  });

  it("B2 — scoped mono : readiness identique au legacy équivalent (hors mode), jamais de blocker multi", () => {
    const legacy = readiness(legacyMono());
    const scoped = readiness(scopedMono());
    assert.equal(scoped.mode, "scoped_mono");
    assert.deepEqual(withoutMode(scoped), withoutMode(legacy));
    assert.equal(scoped.technicalReady, true);
  });

  it("B2 bis — parité aussi quand le dossier est incomplet (revenus non confirmés)", () => {
    const legacy = legacyMono(); delete (legacy.declarationDraft as Record<string, unknown>).revenusConfirmedAt;
    const scoped = scopedMono(); delete bienDraftOf(scoped, A).revenusConfirmedAt;
    assert.deepEqual(withoutMode(readiness(scoped)), withoutMode(readiness(legacy)));
    assert.equal(readiness(scoped).technicalReady, false);
  });
});

describe("R2C.3c2b — readiness technique multi", () => {
  it("B3 — global + A + B complets et aucun blocker ⇒ technical ready", () => {
    const r = readiness(multi());
    assert.equal(r.mode, "scoped_multi");
    assert.equal(r.global.ready, true);
    assert.ok(r.properties.every((property) => property.ready));
    assert.deepEqual(r.blockingReasons, []);
    assert.equal(r.fiscalEvaluation, "evaluated");
    assert.equal(r.technicalReady, true);
  });

  it("B4 — A complet / B incomplet ⇒ not ready, la raison porte B", () => {
    const ws = multi(); delete bienDraftOf(ws, B).revenusAssistant; delete bienDraftOf(ws, B).revenusConfirmedAt;
    const r = readiness(ws);
    assert.equal(r.technicalReady, false);
    assert.equal(propertyOf(r, A).ready, true);
    assert.equal(propertyOf(r, B).ready, false);
    assert.ok(propertyOf(r, B).missing.includes("revenus"));
    const reason = find(r, "property_input_invalid", B);
    assert.ok(reason && reason.propertyId === B && reason.domain === "revenus");
    assert.ok(r.blockingReasons.every((item) => item.propertyId !== A));
  });

  it("B5 — B complet / A incomplet ⇒ not ready, la raison porte A", () => {
    const ws = multi(); delete bienDraftOf(ws, A).revenusAssistant; delete bienDraftOf(ws, A).revenusConfirmedAt;
    const r = readiness(ws);
    assert.equal(r.technicalReady, false);
    assert.equal(propertyOf(r, B).ready, true);
    assert.equal(propertyOf(r, A).ready, false);
    assert.ok(find(r, "property_input_invalid", A));
    assert.ok(r.blockingReasons.every((item) => item.propertyId !== B));
  });

  it("B6 — F009 global incomplet ⇒ not ready même si A et B sont complets et sans blocker", () => {
    const r = readiness(confirmed(multiWorkspace(), { global: false }));
    assert.equal(r.global.ready, false);
    assert.ok(r.properties.every((property) => property.ready));
    assert.deepEqual(r.blockingReasons, []);
    assert.equal(r.technicalReady, false);
  });

  it("B7 — aucune dépendance au bien actif : appels répétés/identiques, aucun paramètre ni clé liée à l'interface", () => {
    const ws = multi();
    const first = readiness(ws);
    assert.deepEqual(readiness(ws), first);
    assert.ok(resolveWorkspaceReadiness.length <= 2);
    assert.doesNotMatch(readFileSync(path.join(ROOT, "src/lib/lmnp/services/declaration/workspace-readiness.ts"), "utf8"), /activeProperty|useV3CorrectionScope|activePropertyId/);
    assert.equal(JSON.stringify(first).includes("active"), false);
  });

  it("B8 — ordre A,B vs B,A : readiness sémantiquement identique (biens triés, raisons triées)", () => {
    const ws = multi({ bienOverrides: { [B]: { chargesNatureReview: { status: "needs_review", reason: "legacy_mono_charges_nature_unknown" } } } });
    const reversed = clone(ws);
    reversed.fiscalYear.propertyIds = [B, A];
    reversed.properties = [reversed.properties[1]!, reversed.properties[0]!];
    reversed.declarationDraft!.biens = { [B]: reversed.declarationDraft!.biens![B]!, [A]: reversed.declarationDraft!.biens![A]! };
    assert.deepEqual(readiness(reversed), readiness(ws));
    assert.deepEqual(readiness(ws).properties.map((property) => property.propertyId), [A, B].sort());
  });

  it("B9/B10/B11 — chaque bien a son propre état de domaines ; aucune donnée d'un bien ne complète l'autre", () => {
    const ws = multi(); delete bienDraftOf(ws, B).chargesAssistant; delete bienDraftOf(ws, B).revenusAssistant; delete bienDraftOf(ws, B).revenusConfirmedAt;
    const r = readiness(ws);
    assert.deepEqual(propertyOf(r, A).missing, []);
    assert.deepEqual([...propertyOf(r, B).missing].sort(), ["charges", "revenus"]);
    const mirror = multi(); delete bienDraftOf(mirror, A).amortissementAssistant;
    const m = readiness(mirror);
    assert.deepEqual(propertyOf(m, B).missing, []);
    assert.deepEqual(propertyOf(m, A).missing, ["amortissement"]);
    for (const property of r.properties) {
      assert.deepEqual([...property.domains.map((item) => item.domain)].sort(), ["amortissement", "charges", "credit", "logement", "revenus"]);
    }
  });

  it("F009 reste GLOBAL : jamais dupliqué dans les domaines d'un bien", () => {
    const r = readiness(multi());
    assert.deepEqual(r.global.domains.map((item) => item.domain), ["activite"]);
    assert.ok(r.properties.every((property) => property.domains.every((item) => item.domain !== "activite")));
  });
});

describe("R2C.3c2b — blockers fiscaux conservés, structurés, routés (via le service workspace évalué)", () => {
  it("B12 — plan F010 absent : jamais zéro implicite, raison traçable avec propertyId, routée F010 (logement)", () => {
    const ws = multi(); delete bienDraftOf(ws, B).logementAmortissement;
    const r = readiness(ws);
    assert.equal(r.technicalReady, false);
    const reason = r.blockingReasons.find((item) => item.propertyId === B && item.domain === "logement");
    assert.ok(reason, reasonCodes(r).join());
    assert.ok(reason.code === "property_immobilisations_not_established" || (reason.code === "property_input_invalid" && reason.field?.startsWith("logementAmortissement")));
    assert.ok(propertyOf(r, B).missing.includes("logement"));
  });

  it("B13 — charges_nature_needs_review : conservé, F012 du bon bien, non recoverable", () => {
    const r = readiness(multi({ bienOverrides: { [B]: { chargesNatureReview: { status: "needs_review", reason: "legacy_mono_charges_nature_unknown" } } } }));
    const reason = find(r, "charges_nature_needs_review", B)!;
    assert.ok(reason);
    assert.deepEqual({ domain: reason.domain, scope: reason.scope, recoverable: reason.recoverable }, { domain: "charges", scope: "property", recoverable: false });
    assert.equal(r.technicalReady, false);
    assert.equal(propertyOf(r, B).ready, false);
    assert.equal(propertyOf(r, A).ready, true);
  });

  it("B14 — entry_mode_unknown : conservé avec propertyId, non recoverable avant la persistance d'origine", () => {
    const r = readiness(multi({ fiscalYear: { priorHistoryDeclaration: { status: "EXTERNAL_HISTORY", declaredAt: T } } }));
    for (const id of [A, B]) {
      const reason = find(r, "entry_mode_unknown", id)!;
      assert.ok(reason && reason.propertyId === id && reason.recoverable === false);
    }
  });

  it("B15 — service_date_missing : F010 + propertyId, recoverable", () => {
    const ws = multi(); delete bienDraftOf(ws, B).dateMiseEnService;
    const reason = find(readiness(ws), "service_date_missing", B)!;
    assert.deepEqual({ domain: reason.domain, propertyId: reason.propertyId, recoverable: reason.recoverable }, { domain: "logement", propertyId: B, recoverable: true });
  });

  it("B16 — service_date_before_activity_start : F010 + propertyId conservé, F009 en domaine lié", () => {
    const r = readiness(multi({ root: { activityStartDate: "2026-05-01" } }));
    const reason = find(r, "service_date_before_activity_start", A)!;
    assert.ok(reason, reasonCodes(r).join());
    assert.equal(reason.propertyId, A);
    assert.equal(reason.domain, "logement");
    assert.deepEqual(reason.relatedDomains, ["activite"]);
    assert.equal(reason.recoverable, true);
    assert.equal(find(r, "service_date_before_activity_start", B), undefined);
  });

  it("B17 — credit_state_unknown : F011 + propertyId, recoverable", () => {
    const ws = multi(); delete bienDraftOf(ws, B).financementCharges; delete bienDraftOf(ws, B).creditConfirmedAt;
    const reason = find(readiness(ws), "credit_state_unknown", B)!;
    assert.deepEqual({ domain: reason.domain, propertyId: reason.propertyId, recoverable: reason.recoverable }, { domain: "credit", propertyId: B, recoverable: true });
  });

  it("B19 — property_input_invalid(revenusAssistant) : F013 + propertyId, recoverable", () => {
    const ws = multi(); delete bienDraftOf(ws, A).revenusAssistant;
    const reason = find(readiness(ws), "property_input_invalid", A)!;
    assert.deepEqual({ domain: reason.domain, field: reason.field, propertyId: reason.propertyId, recoverable: reason.recoverable }, { domain: "revenus", field: "revenusAssistant", propertyId: A, recoverable: true });
  });

  it("B21 — unsupported_shared_loan : global, domaine F011, non recoverable, AUCUN propertyId inventé", () => {
    const r = readiness(multi({ bienOverrides: { [A]: { creditDocumentId: "doc-pret" }, [B]: { creditDocumentId: "doc-pret" } } }));
    const reason = find(r, "unsupported_shared_loan")!;
    assert.deepEqual({ scope: reason.scope, domain: reason.domain, recoverable: reason.recoverable, propertyId: reason.propertyId }, { scope: "global", domain: "credit", recoverable: false, propertyId: undefined });
    assert.equal("propertyId" in reason, false);
  });

  it("B22 — common_charges_not_supported : global, F012, non recoverable", () => {
    const r = readiness(multi(), { commonCharges: [{ label: "x" }] });
    const reason = find(r, "common_charges_not_supported")!;
    assert.deepEqual({ scope: reason.scope, domain: reason.domain, recoverable: reason.recoverable }, { scope: "global", domain: "charges", recoverable: false });
  });

  it("B23 — 39C : global Amortissements, non recoverable", () => {
    const low = { ...SPEC_A, recettes: 1000, cats: { taxe_fonciere: 200 } };
    const r = readiness(confirmed(multiWorkspace({ specs: [[A, low], [B, { ...SPEC_B, recettes: 500, cats: { taxe_fonciere: 100 } }]] })));
    const reason = find(r, "multi_property_39c_allocation_not_supported")!;
    assert.deepEqual({ scope: reason.scope, domain: reason.domain, recoverable: reason.recoverable }, { scope: "global", domain: "amortissement", recoverable: false });
    assert.equal(r.technicalReady, false);
  });

  it("B24 — ARD historique : global Amortissements, non recoverable", () => {
    const r = readiness(multi(), { stocksOuverture: { deficits: [], amortissementsReportes: 500, deficitsExpires: [] } });
    const reason = find(r, "multi_property_historical_ard_not_supported")!;
    assert.deepEqual({ scope: reason.scope, domain: reason.domain, recoverable: reason.recoverable }, { scope: "global", domain: "amortissement", recoverable: false });
  });

  it("B25 — exercise_opening_not_attributable : global, workspace, non recoverable (R2C.5)", () => {
    const r = readiness(multi(), { continuity: { immobilisationsOuverture: { brut: 1, amortissementsCumules: 0, sourceClosureId: "c" } } });
    const reason = find(r, "exercise_opening_not_attributable")!;
    assert.deepEqual({ scope: reason.scope, domain: reason.domain, recoverable: reason.recoverable }, { scope: "global", domain: "workspace", recoverable: false });
  });

  it("B26 — unattributed_documents : structuré, non silencieux", () => {
    const ws = multi();
    ws.documents = [{ id: "doc-x", fiscalYearId: "fy-2026", fileName: "x.pdf", mimeType: "application/pdf", sizeBytes: 1, category: "charges", documentType: "unknown", status: "analyzed", uploadedAt: T } as never];
    const r = readiness(ws);
    const reason = find(r, "unattributed_documents")!;
    assert.ok(reason && reason.scope === "global" && reason.recoverable === false);
    assert.equal(r.technicalReady, false);
  });

  it("B27 — erreurs d'invariant : fail-closed et structurées", () => {
    const noBien = multi(); delete noBien.declarationDraft!.biens![B];
    const r1 = readiness(noBien);
    assert.equal(r1.technicalReady, false);
    assert.ok(r1.blockingReasons.length > 0 && r1.blockingReasons.every((reason) => typeof reason.code === "string" && reason.domain && reason.scope));
    const conflict = multi(); (conflict.declarationDraft as Record<string, unknown>).revenusAssistant = { exerciceFiscal: Y };
    const r2 = readiness(conflict);
    assert.equal(r2.technicalReady, false);
    assert.ok(find(r2, "legacy_and_scoped_conflict"));
    const empty = { ...multi(), properties: [], fiscalYear: { ...multi().fiscalYear, propertyIds: [] }, declarationDraft: { completedSteps: [] } } as PersistedWorkspace;
    const r3 = readiness(empty);
    assert.equal(r3.technicalReady, false);
    assert.ok(find(r3, "no_property"));
  });

  it("scoped mono refusé par ses invariants : raison structurée (legacy_charges_nature_unreviewed), jamais un blocker multi", () => {
    const ws = confirmed(multiWorkspace({ specs: [[A, SPEC_A]], bienOverrides: { [A]: { chargesNatureReview: { status: "needs_review", reason: "legacy_mono_charges_nature_unknown" } } } }));
    const r = readiness(ws);
    const reason = find(r, "legacy_charges_nature_unreviewed")!;
    assert.deepEqual({ domain: reason.domain, recoverable: reason.recoverable, scope: reason.scope }, { domain: "charges", recoverable: false, scope: "global" });
    assert.equal(r.technicalReady, false);
    assert.equal(r.blockingReasons.some((item) => item.code.startsWith("multi_property")), false);
  });

  it("blocage mono historique (anomalies sans blockingReasons) : converti en raisons structurées routées par champ", () => {
    const ws = legacyMono(); delete (ws.declarationDraft as Record<string, unknown>).revenusAssistant;
    const r = readiness(ws);
    const reason = r.blockingReasons.find((item) => item.field === "revenusAssistant")!;
    assert.ok(reason && reason.domain === "revenus" && reason.recoverable === true);
    assert.equal(r.technicalReady, false);
  });
});

describe("R2C.3c2b — modèle de raison et table de routage", () => {
  const cases: Array<[string, string | undefined, string | undefined, string, "global" | "property", boolean]> = [
    // code, propertyId, field, domain, scope, recoverable
    ["no_property", undefined, undefined, "workspace", "global", false],
    ["unknown_bien", undefined, undefined, "workspace", "global", false],
    ["legacy_and_scoped_conflict", undefined, undefined, "workspace", "global", false],
    ["inconsistent_scope", undefined, undefined, "workspace", "global", false],
    ["missing_bien", B, undefined, "workspace", "property", false],
    ["unattributed_documents", undefined, undefined, "workspace", "global", false],
    ["entry_mode_unknown", A, undefined, "logement", "property", false],
    ["exercise_opening_not_attributable", undefined, undefined, "workspace", "global", false],
    ["exercise_mismatch", A, undefined, "workspace", "property", false],
    ["service_date_missing", A, undefined, "logement", "property", true],
    ["service_date_before_activity_start", A, undefined, "logement", "property", true],
    ["credit_state_unknown", A, undefined, "credit", "property", true],
    ["credit_state_ambiguous", A, undefined, "credit", "property", true],
    ["taxe_fonciere_integrity_unresolved", A, undefined, "charges", "property", true],
    ["charges_nature_needs_review", A, undefined, "charges", "property", false],
    ["property_input_invalid", A, "revenusAssistant.anomalies", "revenus", "property", true],
    ["property_input_invalid", A, "chargesAssistant.recouvrementAssuranceF011", "charges", "property", true],
    ["property_input_invalid", A, "amortissementAssistant.status", "amortissement", "property", true],
    ["property_input_invalid", A, "financementCharges.excludedLoanIds", "credit", "property", true],
    ["property_input_invalid", A, "logementAmortissement.exerciceFiscal", "logement", "property", true],
    ["property_input_invalid", A, "champ_inconnu", "workspace", "property", false],
    ["non_finite_amount", A, undefined, "workspace", "property", false],
    ["duplicate_property", A, undefined, "workspace", "property", false],
    ["duplicate_loan_key", A, "loan-1", "credit", "property", false],
    ["duplicate_asset_key", A, "asset-1", "logement", "property", false],
    ["common_charges_not_supported", undefined, undefined, "charges", "global", false],
    ["unsupported_shared_loan", undefined, "doc-pret", "credit", "global", false],
    ["multi_property_historical_ard_not_supported", undefined, undefined, "amortissement", "global", false],
    ["multi_property_39c_allocation_not_supported", undefined, undefined, "amortissement", "global", false],
    ["property_immobilisations_not_established", A, undefined, "logement", "property", true],
    ["IMMOBILISATIONS_CONTINUITY_RECONCILIATION_FAILED", A, undefined, "amortissement", "property", false],
    ["missing_entry_mode", A, undefined, "logement", "property", false],
    ["takeover_without_opening", A, undefined, "logement", "property", false],
    ["opening_conflict", A, undefined, "amortissement", "property", false],
    ["foreign_property_asset", A, undefined, "workspace", "property", false],
    ["dotation_missing", A, undefined, "amortissement", "property", true],
    ["legacy_charges_nature_unreviewed", undefined, undefined, "charges", "global", false],
    ["multi_property_consolidation_not_supported", undefined, undefined, "workspace", "global", false],
  ];

  for (const [code, propertyId, field, domain, scope, recoverable] of cases) {
    it(`B28 — ${code}${field ? `[${field}]` : ""} → ${domain}/${scope}/recoverable=${recoverable}`, () => {
      const reason: StructuredBlockingReason = classifyBlockingReason({ code, ...(propertyId ? { propertyId } : {}), ...(field ? { field } : {}) });
      assert.deepEqual({ domain: reason.domain, scope: reason.scope, recoverable: reason.recoverable, known: reason.known }, { domain, scope, recoverable, known: true });
      assert.equal(reason.propertyId, propertyId, "propertyId conservé tel quel, jamais inventé");
      assert.equal(reason.code, code);
    });
  }

  it("code inconnu : fail-closed (workspace, non recoverable, known=false), propertyId et champ conservés", () => {
    const reason = classifyBlockingReason({ code: "futur_code_inconnu", propertyId: B, field: "x" });
    assert.deepEqual({ domain: reason.domain, recoverable: reason.recoverable, known: reason.known, propertyId: reason.propertyId, field: reason.field }, { domain: "workspace", recoverable: false, known: false, propertyId: B, field: "x" });
  });

  it("un message existant est préservé ; aucune raison n'est réduite à un texte", () => {
    const reason = classifyBlockingReason({ code: "dotation_missing", propertyId: A, message: "texte existant" });
    assert.equal(reason.message, "texte existant");
    assert.equal(typeof reason, "object");
  });

  it("table exhaustive : TOUT code réellement produit par les producteurs est classé", () => {
    const sources = [
      "src/lib/lmnp/dossier/fiscal-consolidation.ts", "src/lib/lmnp/dossier/property-immobilisations.ts",
      "src/lib/lmnp/services/declaration/generation-workspace.ts", "src/lib/lmnp/dossier/bien-draft.ts", "src/lib/lmnp/dossier/property-scope.ts",
    ];
    const produced = new Set<string>();
    for (const file of sources) {
      const text = readFileSync(path.join(ROOT, file), "utf8");
      for (const match of text.matchAll(/code: "([A-Za-z0-9_]+)"/g)) produced.add(match[1]!);
    }
    const typeUnions = [
      ["src/lib/lmnp/dossier/fiscal-consolidation.ts", /export type FiscalConsolidationBlockCode =([\s\S]*?);/],
      ["src/lib/lmnp/dossier/property-immobilisations.ts", /export type PropertyImmobilisationsReasonCode =([\s\S]*?);/],
      ["src/lib/lmnp/dossier/bien-draft.ts", /export type ConsolidationBlock =([\s\S]*?);/],
      ["src/lib/lmnp/dossier/property-scope.ts", /export type PropertyScopeFailure =([\s\S]*?);/],
      ["src/lib/lmnp/dossier/bien-draft.ts", /export type BienDraftFailure =([^;]*);/],
    ] as const;
    for (const [file, pattern] of typeUnions) {
      const block = pattern.exec(readFileSync(path.join(ROOT, file), "utf8"))?.[1] ?? "";
      for (const match of block.matchAll(/"([a-z0-9_]+)"/g)) produced.add(match[1]!);
    }
    for (const constant of ["multi_property_historical_ard_not_supported", "multi_property_39c_allocation_not_supported", "IMMOBILISATIONS_CONTINUITY_RECONCILIATION_FAILED"]) produced.add(constant);
    assert.ok(produced.size > 30, `codes produits détectés : ${produced.size}`);
    const missing = [...produced].filter((code) => !(code in BLOCKING_REASON_ROUTES));
    assert.deepEqual(missing, []);
  });
});

describe("R2C.3c2b — séparation technique / activation / paiement ; périmètre", () => {
  it("B29 — technical ready n'expose ni ne modifie canGenerate / canCheckout / canRetryAfterPayment", () => {
    const r = readiness(multi());
    assert.equal(r.technicalReady, true);
    for (const key of ["canGenerate", "canCheckout", "canRetryAfterPayment", "paymentReady"]) assert.equal(key in r, false, key);
    assert.equal(r.userActivationEnabled, false, "activation utilisateur multi fermée malgré technicalReady");
    const mono = readiness(legacyMono());
    assert.equal(mono.userActivationEnabled, true, "mono : activation inchangée");
  });

  it("readiness sans évaluation fiscale : jamais technicalReady (fail-closed)", () => {
    const r = resolveWorkspaceReadiness(multi());
    assert.equal(r.fiscalEvaluation, "not_evaluated");
    assert.equal(r.technicalReady, false);
    assert.deepEqual(r.blockingReasons, [], "sans évaluation, aucune raison fiscale n'est inventée");
  });

  it("le module de readiness n'importe pas le service workspace (évaluation injectée) et reste pur", () => {
    for (const file of ["workspace-readiness.ts", "workspace-blocking-reasons.ts"]) {
      const text = readFileSync(path.join(ROOT, "src/lib/lmnp/services/declaration", file), "utf8");
      assert.doesNotMatch(text, /runDeclarationGenerationFromWorkspace|dispatch\(|localStorage|fetch\(|process\.env/);
    }
  });

  const files = () => execSync("git ls-files 'src/**/*.ts' 'src/**/*.tsx'", { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
  // Ancré sur le commit 3c2b lui-même (04e7e98..283ce27) : l'invariant « 3c2b ne touche pas ces fichiers » ne dépend pas des slices suivantes.
  const diffAgainstBaseline = (paths: string[]) => execSync(`git diff --name-only ${BASELINE} 283ce277429a10510d7cb6ecc6861552bf5de92c -- ${paths.join(" ")}`, { cwd: ROOT, encoding: "utf8" }).trim();

  it("B31 — appelants de production de runDeclarationGenerationFromWorkspace : le preview pur de la gate (R2C.3c2c) et l'écran de validation, gardé contre le multi (R2C.3c2d)", () => {
    const callers = files().filter((file) =>
      !/\.test\.tsx?$/.test(file) && !file.endsWith("generation-workspace.ts") &&
      readFileSync(path.join(ROOT, file), "utf8").includes("runDeclarationGenerationFromWorkspace"));
    assert.deepEqual(callers, ["src/components/lmnp/documents/ValidationDocumentStep.tsx", "src/lib/lmnp/services/declaration/declaration-generation-gate.ts"]);
  });

  it("consommateurs de production des nouveaux modules : la gate (R2C.3c2c) et le composant de présentation des raisons (types, R2C.3c2d) ; aucun parcours de génération", () => {
    const consumers = files().filter((file) =>
      !/\.test\.tsx?$/.test(file) && !/workspace-(readiness|blocking-reasons)\.ts$/.test(file) &&
      /workspace-(readiness|blocking-reasons)/.test(readFileSync(path.join(ROOT, file), "utf8")));
    assert.deepEqual(consumers, ["src/components/lmnp/validation-workflow/ValidationMultiPropertyBlock.tsx", "src/lib/lmnp/services/declaration/declaration-generation-gate.ts"]);
  });

  it("B30 — MULTI_PROPERTY_USER_ENABLED reste false", () => {
    assert.equal(MULTI_PROPERTY_USER_ENABLED, false);
  });

  it("B32 + barrières 3c1 : gate, readiness de paiement, freshness, écrans, barrières et moteur non modifiés", () => {
    assert.equal(diffAgainstBaseline([
      "src/lib/lmnp/services/declaration/declaration-generation-gate.ts", "src/lib/lmnp/services/validation-profile.ts",
      "src/lib/lmnp/services/declaration/payment-readiness.ts", "src/lib/lmnp/services/declaration/declaration-freshness.ts",
      "src/components/lmnp/documents/ValidationDocumentStep.tsx", "src/components/lmnp/declaration/DeclarationReadyView.tsx",
      "src/lib/lmnp/services/declaration/generation-workspace.ts", "src/lib/lmnp/services/declaration/run-declaration-generation.ts",
      "src/lib/lmnp/dossier/multi-property-activation.ts", "src/lib/lmnp/services/payment/checkout-handler.ts",
      "src/lib/lmnp/services/fiscal-year-transition/transition-handler.ts", "src/app/api/lmnp/declaration/cerfa-pdf/handler.ts",
      "src/lib/lmnp/services/dossier/fiscal-year-cycle.ts", "src/lib/lmnp/services/fiscal-year-transition/prepare-transition.ts",
    ]), "");
  });
});
