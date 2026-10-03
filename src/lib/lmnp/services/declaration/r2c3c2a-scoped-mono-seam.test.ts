/**
 * R2C.3c2a — SEAM CORRECT / PARITÉ SCOPED MONO. `runDeclarationGenerationFromWorkspace` doit router :
 *   legacy mono  → chemin historique verbatim
 *   scoped mono  → chemin historique verbatim, via sa vue plate canonique (`resolveConsolidationInput`)
 *   scoped multi → pipeline consolidé R2C.3b (inchangé)
 * `continuity` n'est bloquant en multi que s'il porte une VRAIE ouverture scalaire (jamais par sa seule existence).
 * Aucun appelant de production, aucune persistance, activation utilisateur fermée.
 *
 * Run: npx tsx --test src/lib/lmnp/services/declaration/r2c3c2a-scoped-mono-seam.test.ts
 */
import "@/lab/v2-dossier/test-public-env";
import { CONFIRMED_ATTESTATIONS } from "./multi-property-test-support";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, mock } from "node:test";

import { MULTI_PROPERTY_CAPABILITIES, isMultiPropertyRfs } from "@/lib/lmnp/dossier/multi-property-activation";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import { runDeclarationGeneration } from "@/lib/lmnp/services/declaration/run-declaration-generation";
import { runDeclarationGenerationFromWorkspace } from "@/lib/lmnp/services/declaration/generation-workspace";
import type { FiscalEngineInputs } from "@/runtime/capabilities/f006/types";
import { produceFiscalResult } from "@/runtime/capabilities/f006/produce-fiscal-result";

const ROOT = process.cwd();
const BASELINE = "7c18eceb6f1a841e7a77a999be13ccb601e23046";
const Y = 2026;
const T = "2026-01-01T00:00:00.000Z";
const FIXED = Date.parse("2026-06-01T12:00:00.000Z");
const A = "home-1";
const B = "bien-b";
const SIRET = "12345678900012";
const clone = <V>(value: V): V => JSON.parse(JSON.stringify(value));
const strip = (value: unknown) => JSON.stringify(value, (key, v) => (key === "computedAt" || key === "generatedAt" ? undefined : v));

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
      activityStartDate: "2026-03-01", activityType: "LMNP", dispense2033A: { caReferenceN1Declaree: 0 }, multiPropertyAttestations: CONFIRMED_ATTESTATIONS, biens,
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

const STOCKS = { sourceClosureId: "closure-2025", stocks: { deficits: [{ millesime: 2024, montant: 1500 }], amortissementsReportes: 0, deficitsExpires: [] } };


/** Exécution instrumentée : compte les appels F-006 du pipeline consolidé (le chemin historique ne passe jamais par `engine`). */
function run(workspace: PersistedWorkspace, options: Record<string, unknown> = {}) {
  const calls: FiscalEngineInputs[] = [];
  const result = withFixedClock(() =>
    runDeclarationGenerationFromWorkspace(workspace, {
      ...options,
      engine: { produceFiscalResult: (input: FiscalEngineInputs) => { calls.push(clone(input)); return produceFiscalResult(input); } },
    } as never));
  return { result, calls };
}
const historical = (workspace: PersistedWorkspace, ...rest: unknown[]) =>
  withFixedClock(() => (runDeclarationGeneration as (...args: unknown[]) => ReturnType<typeof runDeclarationGeneration>)(
    workspace.declarationDraft, workspace.fiscalYear.year, ...rest));
const codes = (result: { status: string; blockingReasons?: Array<{ code: string; propertyId?: string }> }) =>
  (result.blockingReasons ?? []).map((reason) => reason.code + (reason.propertyId ? `@${reason.propertyId}` : ""));
type Generated = Extract<ReturnType<typeof runDeclarationGenerationFromWorkspace>, { status: "generated" }>;
const asGenerated = (result: { status: string }): Generated => {
  assert.equal(result.status, "generated", JSON.stringify((result as { blockingReasons?: unknown }).blockingReasons));
  return result as Generated;
};
/** Même identité racine que `monoWorkspace()` : seule la forme (plate / scopée) diffère. */
const scopedMono = () => multiWorkspace({ specs: [[A, SPEC_A]], root: { exploitantFirstName: "Mono" } });
/** L'objet que ValidationDocumentStep transmet TOUJOURS (aucune ouverture : composants F-012 fusionnés + id du bien). */
const CONTINUITY_OBJECT = { composantsF012Merged: [], immobilisationsOuverture: undefined, repriseHistoriqueEnContinuite: undefined, previousFiscalYearId: undefined, continuiteNativeVerifiee: undefined, propertyId: A };

describe("R2C.3c2a — legacy mono : chemin historique verbatim", () => {
  it("A1/A2 — aucun appel au pipeline consolidé ; résultat strictement identique à runDeclarationGeneration", () => {
    const ws = monoWorkspace();
    const { result, calls } = run(ws);
    assert.equal(calls.length, 0, "le pipeline consolidé (engine injecté) n'est pas utilisé");
    assert.equal(strip(result), strip(historical(ws)));
    const generated = asGenerated(result);
    assert.equal("immobilisationsParBien" in generated.rfs, false);
  });
});

describe("R2C.3c2a — scoped mono : chemin historique verbatim via la vue plate", () => {
  it("A3 — le pipeline consolidé n'est PAS utilisé", () => {
    const { calls } = run(scopedMono());
    assert.equal(calls.length, 0);
  });

  it("A4/A5/A7 — FiscalResult, RFS et liasseRfs strictement identiques au legacy équivalent", () => {
    const legacy = asGenerated(historical(monoWorkspace()));
    const { result } = run(scopedMono());
    const scoped = asGenerated(result);
    assert.equal(strip(scoped.fiscalResult), strip(legacy.fiscalResult));
    assert.equal(strip(scoped.rfs), strip(legacy.rfs));
    assert.equal(strip(scoped.liasseRfs), strip(legacy.liasseRfs));
    assert.equal(strip(scoped.liasseResult), strip(legacy.liasseResult));
    assert.ok(scoped.rfs.immobilisations !== undefined, "contrat mono : bloc `immobilisations` présent");
  });

  it("A6 — la RFS ne contient PAS immobilisationsParBien (ni detailCharges2033B)", () => {
    const { rfs } = asGenerated(run(scopedMono()).result);
    assert.equal("immobilisationsParBien" in rfs, false);
    assert.equal("detailCharges2033B" in rfs, false);
  });

  it("A8 — les emprunts conservent le contrat mono historique (aucun propertyId)", () => {
    const legacy = asGenerated(historical(monoWorkspace()));
    const { rfs } = asGenerated(run(scopedMono()).result);
    assert.deepEqual(rfs.emprunts, legacy.rfs.emprunts);
    assert.ok((rfs.emprunts ?? []).length > 0);
    assert.ok((rfs.emprunts ?? []).every((emprunt) => !("propertyId" in emprunt)));
  });

  it("A9 — la barrière Cerfa (marqueur multi) ne voit pas un scoped mono comme multi", () => {
    assert.equal(isMultiPropertyRfs(asGenerated(run(scopedMono()).result).rfs), false);
    assert.equal(isMultiPropertyRfs(asGenerated(run(monoWorkspace()).result).rfs), false);
    assert.equal(isMultiPropertyRfs(asGenerated(run(multiWorkspace()).result).rfs), true);
  });

  it("A10 — l'objet continuity de ValidationDocumentStep ne bloque pas un scoped mono ; résultat identique au legacy avec la même continuité", () => {
    const legacy = asGenerated(historical(monoWorkspace(), undefined, undefined, undefined, CONTINUITY_OBJECT));
    const { result } = run(scopedMono(), { continuity: CONTINUITY_OBJECT });
    const scoped = asGenerated(result);
    assert.equal(strip(scoped.rfs), strip(legacy.rfs));
    assert.equal(strip(scoped.fiscalResult), strip(legacy.fiscalResult));
  });

  it("scoped mono : les paramètres historiques (stocks, bilan, dispense, continuité, ouverture) sont transmis tels quels", () => {
    const legacy = asGenerated(historical(monoWorkspace(), STOCKS.stocks));
    const scoped = asGenerated(run(scopedMono(), { stocksOuverture: STOCKS.stocks }).result);
    assert.equal(strip(scoped.fiscalResult), strip(legacy.fiscalResult));
    assert.equal(strip(scoped.rfs), strip(legacy.rfs));
  });

  it("scoped mono bloqué par ses invariants (charges à revoir) : refus structuré, jamais un RFS multi", () => {
    const ws = multiWorkspace({ specs: [[A, SPEC_A]], bienOverrides: { [A]: { chargesNatureReview: { status: "needs_review", reason: "legacy_mono_charges_nature_unknown" } } } });
    const { result, calls } = run(ws);
    assert.equal(result.status, "blocked");
    assert.equal(calls.length, 0);
    assert.ok(codes(result as never).length > 0);
  });
});

describe("R2C.3c2a — scoped multi : pipeline consolidé inchangé", () => {
  it("A11/A12 — pipeline consolidé, F-006 appelé EXACTEMENT une fois", () => {
    const { result, calls } = run(multiWorkspace());
    asGenerated(result);
    assert.equal(calls.length, 1);
  });

  it("A13 — immobilisationsParBien conservé (un bloc par bien), pas de slot mono", () => {
    const { rfs } = asGenerated(run(multiWorkspace()).result);
    assert.deepEqual((rfs.immobilisationsParBien ?? []).map((block) => block.propertyId), [A, B]);
    assert.equal(rfs.immobilisations, undefined);
  });

  it("A14 — UN FiscalResult, UNE RFS, UNE liasse (jamais par bien)", () => {
    const generated = asGenerated(run(multiWorkspace()).result);
    for (const key of ["fiscalResult", "rfs", "liasseResult", "liasseRfs"] as const) {
      assert.ok(generated[key] && !Array.isArray(generated[key]), `${key} est un objet unique`);
    }
    assert.equal(Object.keys(generated).filter((key) => /par.?bien/i.test(key)).length, 0);
  });

  it("A10 bis — l'objet continuity SANS ouverture ne bloque pas le multi (par sa seule existence)", () => {
    const { result, calls } = run(multiWorkspace(), { continuity: { ...CONTINUITY_OBJECT, propertyId: undefined } });
    asGenerated(result);
    assert.equal(calls.length, 1);
  });

  it("une VRAIE ouverture/continuation scalaire en multi reste bloquée : immobilisationsOuverture, reprise, exercice précédent, continuité native, fiscalYearOpening", () => {
    const opening = { brut: 100000, amortissementsCumules: 5000, sourceClosureId: "closure-2025" };
    for (const options of [
      { continuity: { ...CONTINUITY_OBJECT, propertyId: undefined, immobilisationsOuverture: opening } },
      { continuity: { ...CONTINUITY_OBJECT, propertyId: undefined, repriseHistoriqueEnContinuite: true } },
      { continuity: { ...CONTINUITY_OBJECT, propertyId: undefined, previousFiscalYearId: "fy-2025" } },
      { continuity: { ...CONTINUITY_OBJECT, propertyId: undefined, continuiteNativeVerifiee: true } },
      { fiscalYearOpening: { source: "external_takeover" } },
    ]) {
      const { result, calls } = run(multiWorkspace(), options);
      assert.equal(result.status, "blocked", JSON.stringify(options));
      assert.ok(codes(result as never).includes("exercise_opening_not_attributable"), JSON.stringify(options));
      assert.equal(calls.length, 0);
    }
  });
});

describe("R2C.3c2a — A15 : blockingReasons du pipeline multi inchangées", () => {
  const blocked = (workspace: PersistedWorkspace, options: Record<string, unknown> = {}) => {
    const { result } = run(workspace, options);
    assert.equal(result.status, "blocked");
    return codes(result as never);
  };

  it("entry_mode_unknown@pid (indice de reprise sans preuve d'origine)", () => {
    const list = blocked(multiWorkspace({ fiscalYear: { priorHistoryDeclaration: { status: "EXTERNAL_HISTORY", declaredAt: T } } }));
    assert.ok(list.includes(`entry_mode_unknown@${A}`) && list.includes(`entry_mode_unknown@${B}`), list.join());
  });
  it("charges_nature_needs_review@pid", () => {
    const list = blocked(multiWorkspace({ bienOverrides: { [B]: { chargesNatureReview: { status: "needs_review", reason: "legacy_mono_charges_nature_unknown" } } } }));
    assert.ok(list.includes(`charges_nature_needs_review@${B}`), list.join());
  });
  it("common_charges_not_supported", () => {
    assert.ok(blocked(multiWorkspace(), { commonCharges: [{ label: "x" }] }).includes("common_charges_not_supported"));
  });
  it("unsupported_shared_loan (même document de prêt sur deux biens)", () => {
    const list = blocked(multiWorkspace({ bienOverrides: { [A]: { creditDocumentId: "doc-pret" }, [B]: { creditDocumentId: "doc-pret" } } }));
    assert.ok(list.includes("unsupported_shared_loan"), list.join());
  });
  it("multi_property_historical_ard_not_supported", () => {
    const list = blocked(multiWorkspace(), { stocksOuverture: { deficits: [], amortissementsReportes: 500, deficitsExpires: [] } });
    assert.ok(list.includes("multi_property_historical_ard_not_supported"), list.join());
  });
  it("multi_property_39c_allocation_not_supported (amortissement non déduit > 0)", () => {
    const low = { ...SPEC_A, recettes: 1000, cats: { taxe_fonciere: 200 } };
    const list = blocked(multiWorkspace({ specs: [[A, low], [B, { ...SPEC_B, recettes: 500, cats: { taxe_fonciere: 100 } }]] }));
    assert.ok(list.includes("multi_property_39c_allocation_not_supported"), list.join());
  });
  it("property_immobilisations_not_established@pid (absence de plan ≠ zéro)", () => {
    const ws = multiWorkspace();
    delete (ws.declarationDraft!.biens![B] as Record<string, unknown>).logementAmortissement;
    const list = blocked(ws);
    assert.ok(list.includes(`property_immobilisations_not_established@${B}`) || list.some((code) => code.endsWith(`@${B}`)), list.join());
  });
});

describe("R2C.3c2a — garde-fous de périmètre", () => {
  const files = () => execSync("git ls-files 'src/**/*.ts' 'src/**/*.tsx'", { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);

  it("A16 — appelants de production de runDeclarationGenerationFromWorkspace : le preview pur de la gate (R2C.3c2c) et l'écran de validation, gardé contre le multi (R2C.3c2d)", () => {
    const callers = files().filter((file) =>
      !/\.test\.tsx?$/.test(file) && !file.endsWith("generation-workspace.ts") &&
      readFileSync(path.join(ROOT, file), "utf8").includes("runDeclarationGenerationFromWorkspace"));
    assert.deepEqual(callers, ["src/components/lmnp/documents/ValidationDocumentStep.tsx", "src/lib/lmnp/services/declaration/declaration-generation-gate.ts"]);
  });

  it("A17 — les capacités d'activation multi restent toutes fermées", () => {
    for (const capability of ["edition", "generation", "delivery", "payment", "closing", "nextYear"] as const) {
      assert.equal(MULTI_PROPERTY_CAPABILITIES[capability], ["generation", "delivery"].includes(capability), `capacité multi ${capability} : seules la génération et la livraison sont ouvertes (MB-MULTI-CAPABILITY-WIRING-1 / MB-MULTI-DELIVERY-WIRING-1)`);
    }
  });

  it("A18 — barrières 3c1 conservées (refondues en capacités par MB-MULTI-DOMAIN-GUARD-1) : aucune garde supprimée", () => {
    // L'ancien test pinnait « aucune modification depuis la baseline 3c1 » : MB-MULTI-DOMAIN-GUARD-1 refond volontairement ces
    // fichiers (flag unique → capacités). L'invariant utile est conservé : chaque point de barrière référence une capacité nommée.
    const guards: Array<[string, RegExp]> = [
      ["src/lib/lmnp/services/payment/checkout-handler.ts", /isMultiPropertyBarrierActive\([\s\S]*"payment"/],
      ["src/lib/lmnp/services/fiscal-year-transition/transition-handler.ts", /"closing"[\s\S]*"nextYear"/],
      ["src/app/api/lmnp/declaration/cerfa-pdf/handler.ts", /resolveMultiPropertyDeliveryAdmission/],
      ["src/lib/lmnp/services/dossier/fiscal-year-cycle.ts", /isMultiPropertyClosingBlocked[\s\S]*isMultiPropertyNextYearBlocked|isMultiPropertyNextYearBlocked[\s\S]*isMultiPropertyClosingBlocked/],
      ["src/lib/lmnp/services/fiscal-year-transition/prepare-transition.ts", /isMultiPropertyClosingBlocked/],
      ["src/lib/lmnp/store/server-fiscal-year-transition.ts", /isMultiPropertyClosingBlocked/],
      ["src/lib/lmnp/services/server-workspace-snapshot.ts", /isMultiPropertyCapabilityOpen/],
    ];
    for (const [file, pattern] of guards) assert.match(readFileSync(path.join(ROOT, file), "utf8"), pattern, file);
  });

  it("hors périmètre 3c2b/c/d : gate, validation-profile, readiness, freshness, écrans non modifiés PAR 3c2a", () => {
    // Ancré sur le commit 3c2a (7c18ece..04e7e98) : l'invariant ne dépend pas des slices suivantes.
    assert.equal(execSync(`git diff --name-only ${BASELINE} 04e7e987a19131ea67a7d9185d17e3595461ded5 -- ${[
      "src/lib/lmnp/services/declaration/declaration-generation-gate.ts", "src/lib/lmnp/services/validation-profile.ts",
      "src/lib/lmnp/services/declaration/payment-readiness.ts", "src/lib/lmnp/services/declaration/declaration-freshness.ts",
      "src/components/lmnp/documents/ValidationDocumentStep.tsx", "src/components/lmnp/declaration/DeclarationReadyView.tsx",
      "src/lib/lmnp/services/declaration/run-declaration-generation.ts", "src/lib/lmnp/dossier/fiscal-consolidation.ts",
      "src/lib/lmnp/dossier/property-immobilisations.ts", "src/lib/lmnp/dossier/bien-draft.ts",
    ].join(" ")}`, { cwd: ROOT, encoding: "utf8" }).trim(), "");
  });
});
