/**
 * R2C.3b — génération multi-bien DORMANTE : Workspace → contributions par bien → consolidation → adaptateur → UN SEUL
 * produceFiscalResult → RFS multi → même aval historique → UNE liasse. Aucun appelant de production ; mono délégué au
 * chemin historique à l'identique.
 *
 * Run: npx tsx --test src/lib/lmnp/services/declaration/r2c3b-multi-generation.test.ts
 */
import "@/lab/v2-dossier/test-public-env";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it, mock } from "node:test";

import { representativeMonoWorkspaces } from "@/lab/v2-dossier/bien-read-test-support";
import type { PersistedWorkspace } from "@/lib/lmnp/store/persistence";
import { runDeclarationGeneration } from "@/lib/lmnp/services/declaration/run-declaration-generation";
import type { FiscalEngineInputs } from "@/runtime/capabilities/f006/types";
import { produceFiscalResult } from "@/runtime/capabilities/f006/produce-fiscal-result";

const ROOT = process.cwd();
const source = (relative: string) => readFileSync(path.join(ROOT, relative), "utf8");
const Y = 2026;
const T = "2026-01-01T00:00:00.000Z";
const FIXED = Date.parse("2026-06-01T12:00:00.000Z");
const A = "home-1";
const B = "bien-b";
const SIRET = "12345678900012";
const clone = <V>(value: V): V => JSON.parse(JSON.stringify(value));

type Api = typeof import("@/lib/lmnp/services/declaration/generation-workspace");
const api = (): Promise<Api> => import("@/lib/lmnp/services/declaration/generation-workspace");

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
const PLAN_A_CONTINUATION = {
  lignes: [
    { id: "gros-oeuvre", label: "Gros œuvre", montant: 100000, dureeAnnees: 50, dotationExercice: 1420.01, amortissementsCumules: 6420.01 },
    { id: "facades", label: "Façades", montant: 70000, dureeAnnees: 25, dotationExercice: 1988.2, amortissementsCumules: 6988.2 },
    { id: "mobilier", label: "Mobilier", montant: 8000, dureeAnnees: 5, dotationExercice: 1136.0, amortissementsCumules: 6136.0 },
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

function monoWorkspace(spec: BienSpec = SPEC_A): PersistedWorkspace {
  const bien = bienOf(A, spec);
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

/** Cas fiscaux explicites ; le plan F-010 reste cohérent avec la dotation F-014 pour passer par la RFS réelle. */
function oracleBien(recettes: number, charges: number, dotations: number): BienSpec {
  return {
    date: "2026-04-15",
    recettes,
    cats: charges > 0 ? { assurance_pno: charges } : {},
    credit: "none",
    dotations,
    plan: {
      lignes: dotations > 0
        ? [{ id: "gros-oeuvre", label: "Gros œuvre", montant: 200000, dureeAnnees: 50, dotationExercice: dotations, amortissementsCumules: dotations }]
        : [],
      totalAnnuelExercice: dotations,
      totalBrut: dotations > 0 ? 200000 : 0,
    },
    valeurTerrain: 10000,
    montantMobilier: 0,
  };
}

/**
 * Exécution instrumentée : compte les appels F-006 et capture leurs entrées.
 *
 * MB-MULTI-DOMAIN-GUARD-1 : ce fichier prouve le MOTEUR technique R2C.3b, y compris au-delà du domaine produit ADR-011 (déficits
 * antérieurs, ouvertures par bien, stocks). Il passe donc par l'entrée TECHNIQUE (sans garde de domaine) ; toutes ses assertions
 * sont inchangées. L'entrée de PRODUCTION (avec garde de domaine) est prouvée par `r2c-multi-domain-guard.test.ts`.
 */
async function run(workspace: PersistedWorkspace, options: Record<string, unknown> = {}) {
  const { runDeclarationGenerationFromWorkspaceTechnical: runDeclarationGenerationFromWorkspace } = await api();
  const calls: FiscalEngineInputs[] = [];
  const result = withFixedClock(() =>
    runDeclarationGenerationFromWorkspace(workspace, {
      ...options,
      engine: { produceFiscalResult: (input: FiscalEngineInputs) => { calls.push(clone(input)); return produceFiscalResult(input); } },
    } as never));
  return { result, calls };
}

const blockedCodes = (result: { status: string; anomalies?: Array<{ message: string }> }) => (result.anomalies ?? []).map((anomaly) => anomaly.message);
const hasCode = (result: { status: string; anomalies?: Array<{ message: string }> }, code: string) =>
  blockedCodes(result).some((message) => message.startsWith(code) || message.includes(code));
const caseValue = (form: { cases: Array<{ caseId: string; value: unknown }> }, id: string) => form.cases.find((item) => item.caseId === id)?.value;

type Generated = Extract<Awaited<ReturnType<typeof run>>["result"], { status: "generated" }>;
async function generated(workspace = multiWorkspace(), options: Record<string, unknown> = {}) {
  const { result, calls } = await run(workspace, options);
  assert.equal(result.status, "generated", JSON.stringify((result as { anomalies?: unknown }).anomalies));
  return { result: result as Generated, calls };
}

// ---------------------------------------------------------------------------
// G1–G14, G31–G32 : génération multi nominale
// ---------------------------------------------------------------------------

describe("R2C.3b — génération multi nominale", () => {
  it("G1 — produceFiscalResult appelé EXACTEMENT une fois", async () => {
    const { calls } = await generated();
    assert.equal(calls.length, 1);
  });

  it("G2/G25 — A+B → un seul FiscalResult global (somme des biens), jamais un par bien", async () => {
    const { result } = await generated();
    assert.equal(result.rfs.fiscalResult.recettes.total, 23321.29);
    assert.equal(result.rfs.fiscalResult.amortCalcule, 5444.21);
    assert.equal(result.fiscalResult.totalRecettes, 23321.29);
    for (const key of ["fiscalResultParBien", "fiscalResults", "liasseParBien", "declarationParBien"]) {
      assert.equal(key in result, false, key);
      assert.equal(key in (result.rfs as object), false, key);
    }
  });

  it("G3 — une seule RFS globale portant les métadonnées de chaque bien", async () => {
    const { result } = await generated();
    assert.equal(result.rfs.exercice, Y);
    assert.deepEqual((result.rfs.immobilisationsParBien ?? []).map((bloc) => bloc.propertyId), [A, B]);
    assert.equal(result.rfs.immobilisations, undefined);
  });

  it("G4/G14 — une seule liasse (liasseResult F-007 + liasseRfs), exercice unique", async () => {
    const { result } = await generated();
    assert.equal(result.liasseResult.exercice, Y);
    assert.equal(result.liasseRfs.exercice, Y);
    assert.ok(Array.isArray(result.liasseRfs.formulairesGeneres));
    assert.equal(result.liasseResult.caseCount > 0, true);
  });

  it("G5/G6/G24 — F-006 reçoit les DEUX dates de mise en service, aucune date globale", async () => {
    const { calls } = await generated();
    const activite = calls[0]!.activite;
    assert.equal(activite.dateMiseEnService, undefined);
    assert.deepEqual(activite.datesMiseEnService, [{ propertyId: A, date: "2026-04-15" }, { propertyId: B, date: "2026-06-10" }]);
  });

  it("G7/G26 — déficits antérieurs injectés UNE seule fois, jamais multipliés ni par bien", async () => {
    const workspace = multiWorkspace({ fiscalYear: { stocksOuverture: STOCKS } });
    const { calls, result } = await generated(workspace);
    assert.deepEqual(calls[0]!.stockDeficitsAnterieurs, [{ millesime: 2024, montant: 1500 }]);
    assert.equal(calls[0]!.stockAmortissementsReportes, 0);
    assert.equal(result.rfs.fiscalResult.deficitsImputes <= 1500, true);
  });

  it("G8 — A.loan-1 + B.loan-1 restent DEUX prêts dans la RFS (identité propertyId, pretId)", async () => {
    const { result } = await generated();
    const emprunts = result.rfs.emprunts ?? [];
    assert.equal(emprunts.length, 2);
    assert.deepEqual(emprunts.map((pret) => [pret.propertyId, pret.pretId]), [[A, "loan-1"], [B, "loan-1"]]);
  });

  it("G9 — A avec deux prêts + B sans crédit → deux prêts", async () => {
    const workspace = multiWorkspace({ specs: [[A, { ...SPEC_A, pretIds: ["loan-1", "loan-2"] }], [B, { ...SPEC_B, credit: "none" }]] });
    const { result } = await generated(workspace);
    assert.deepEqual((result.rfs.emprunts ?? []).map((pret) => [pret.propertyId, pret.pretId]), [[A, "loan-1"], [A, "loan-2"]]);
  });

  it("G10 — A continuation (ouverture property-scoped) + B première année → blocs par bien corrects", async () => {
    const workspace = multiWorkspace({ specs: [[A, { ...SPEC_A, date: "2024-05-01", plan: PLAN_A_CONTINUATION }], [B, SPEC_B]], root: { activityStartDate: "2023-01-01" } });
    const { result } = await generated(workspace, {
      properties: { [A]: { opening: { brut: 208000, amortissementsCumules: 15000, sourceClosureId: "closure-a-2025" } } },
    });
    const blocs = result.rfs.immobilisationsParBien ?? [];
    assert.equal(blocs.length, 2);
    assert.equal(blocs[0]!.immobilisations.mouvements?.valeurBruteOuverture, 208000);
    assert.equal(blocs[1]!.immobilisations.mouvements, undefined, "B première année : aucune ouverture inventée");
    assert.equal(blocs[0]!.dotationsExercice, 4544.21);
    assert.equal(blocs[1]!.dotationsExercice, 900);
    const form = result.liasseRfs.form2033C;
    assert.equal(caseValue(form, "490"), 208000 + 0 + 0, "490 = ouverture de A seul (B est en première année)");
    assert.equal(caseValue(form, "570"), 15000);
    assert.equal(caseValue(form, "572"), 5444.21);
  });

  it("G11 — 2033-C : 572 = Σ dotations, 576 = Σ cumuls de clôture des deux biens", async () => {
    const { result } = await generated();
    const form = result.liasseRfs.form2033C;
    assert.equal(caseValue(form, "572"), 5444.21);
    assert.equal(caseValue(form, "576"), 5444.21);
  });

  it("G12 — 2033-A produite depuis la RFS multi (immobilisations sommées par bien)", async () => {
    const { result } = await generated();
    assert.ok(result.liasseRfs.form2033A.cases.length > 0);
    assert.equal(result.liasseRfs.form2033A.millésime, Y);
  });

  it("G13 — 2033-B : 294 = Σ charges de financement des biens, 242/244 = Σ détails conservés par bien", async () => {
    const { result } = await generated();
    const form = result.liasseRfs.form2033B;
    assert.equal(caseValue(form, "294"), 2410.4);
    assert.equal(caseValue(form, "244"), 1700.16);
    assert.equal(caseValue(form, "242"), 2556.77);
    assert.equal(form.conservationDetail.status, "CONSERVE");
  });

  it("G13bis — un bien dont le détail 2033-B n'est pas conservé : 242/244 non publiées, génération NON bloquée", async () => {
    const workspace = multiWorkspace({ bienOverrides: { [B]: { chargesAssistant: { exerciceFiscal: Y, totalDeductible: 800.15, totalPreExploitation: 0, totalNonDeductible: 0, totalAmortissable: 0, composantsNouveaux: [], fieldSources: {}, computedAt: T } } } });
    const { result } = await generated(workspace);
    const form = result.liasseRfs.form2033B;
    assert.equal(caseValue(form, "242"), undefined);
    assert.equal(caseValue(form, "244"), undefined);
    assert.equal(form.conservationDetail.status, "ECART");
    assert.equal(form.casesNonAlimentees.some((item) => item.caseId === "242"), true);
  });

  it("G31 — ordre A/B inversé → mêmes totaux fiscaux", async () => {
    const direct = await generated();
    const reversed = await generated(multiWorkspace({ specs: [[B, SPEC_B], [A, SPEC_A]] }));
    for (const key of ["resultatFiscal", "totalRecettes", "totalCharges", "amortDeduct", "amortReporte", "amortNonDeduitExercice", "deficitNouveau"] as const) {
      assert.equal(reversed.result.fiscalResult[key], direct.result.fiscalResult[key], key);
    }
    assert.equal(caseValue(reversed.result.liasseRfs.form2033C, "572"), caseValue(direct.result.liasseRfs.form2033C, "572"));
  });

  it("G32/G22bis — deux exécutions sur le même workspace → résultat identique (horloge figée)", async () => {
    const workspace = multiWorkspace({ fiscalYear: { stocksOuverture: STOCKS } });
    const first = (await generated(workspace)).result;
    const second = (await generated(clone(workspace))).result;
    assert.deepEqual(second, first);
  });

  it("G32bis — activePropertyId / état UI n'influencent pas le résultat", async () => {
    const base = (await generated()).result;
    const noisy = multiWorkspace({ root: { activePropertyId: B } });
    const other = (await generated(noisy, { activePropertyId: B })).result;
    assert.deepEqual(other, base);
  });

  it("21 — le résultat multi est persistable à la racine comme le mono (JSON aller-retour sans perte)", async () => {
    const { result } = await generated();
    assert.deepEqual(JSON.parse(JSON.stringify(result)), clone(result));
  });
});

describe("MB-ORACLE-1 — fiscalité consolidée sur le chemin Workspace → F-006 → RFS → 2033-B", () => {
  it("A — 39 C sur +8 000 avant amortissement, puis imputation unique du déficit antérieur", async () => {
    const workspace = multiWorkspace({
      specs: [[A, oracleBien(6000, 1000, 1000)], [B, oracleBien(5000, 2000, 2000)]],
      fiscalYear: { stocksOuverture: { ...STOCKS, stocks: { ...STOCKS.stocks, deficits: [{ millesime: 2024, montant: 6000 }] } } },
    });
    const { result, calls } = await generated(workspace);
    const fiscal = result.rfs.fiscalResult;
    const form = result.liasseRfs.form2033B;

    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.revenusAssistant?.totalRecettes, 11000);
    assert.equal(calls[0]!.chargesAssistant?.totalDeductible, 3000);
    assert.equal(calls[0]!.amortissementAssistant?.totalDotations, 3000);
    assert.deepEqual(calls[0]!.stockDeficitsAnterieurs, [{ millesime: 2024, montant: 6000 }]);
    assert.equal(fiscal.resultatAvantAmort, 8000);
    assert.equal(fiscal.amortDeduct, 3000);
    assert.equal(fiscal.amortNonDeduitExercice, 0);
    assert.equal(fiscal.resultatFiscalAvantDeficits, 5000);
    assert.equal(fiscal.deficitsImputes, 5000);
    assert.deepEqual(fiscal.stocks.deficits, [{ millesime: 2024, montant: 1000 }]);
    assert.equal(fiscal.resultatFiscal, 0);
    assert.equal(caseValue(form, "318"), 0);
    // SAV-032 (neutralisation, remplace l'ancienne observation « 352 = résultat avant déficits ») : E = 5 000 + 0 d'ARD → 350 = 5 000
    // (les 5 000 de déficits antérieurs imputés ne figurent pas dans la 2033-B) ; 352 = 370 = 0 ; le bloc boucle.
    assert.equal(caseValue(form, "350"), 5000);
    assert.equal(caseValue(form, "352"), 0);
    assert.equal(caseValue(form, "370"), 0);
    assert.equal(form.balancing.status, "BALANCED");
  });

  it("B — déficit courant global sans dotation : aucun ARD ni imputation de déficit antérieur", async () => {
    const workspace = multiWorkspace({
      specs: [[A, oracleBien(2000, 1000, 0)], [B, oracleBien(1000, 5000, 0)]],
      fiscalYear: { stocksOuverture: { ...STOCKS, stocks: { ...STOCKS.stocks, deficits: [{ millesime: 2024, montant: 800 }] } } },
    });
    const { result, calls } = await generated(workspace);
    const fiscal = result.rfs.fiscalResult;
    const form = result.liasseRfs.form2033B;

    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.revenusAssistant?.totalRecettes, 3000);
    assert.equal(calls[0]!.chargesAssistant?.totalDeductible, 6000);
    assert.equal(calls[0]!.amortissementAssistant?.totalDotations, 0);
    assert.deepEqual(calls[0]!.stockDeficitsAnterieurs, [{ millesime: 2024, montant: 800 }]);
    assert.equal(fiscal.resultatAvantAmort, -3000);
    assert.equal(fiscal.amortNonDeduitExercice, 0);
    assert.equal(fiscal.amortReporte, 0);
    assert.equal(fiscal.stocks.amortissementsReportes, 0);
    assert.equal(fiscal.deficitsImputes, 0);
    assert.equal(fiscal.deficitNouveau, 3000);
    assert.deepEqual(fiscal.stocks.deficits, [{ millesime: 2024, montant: 800 }, { millesime: 2026, montant: 3000 }]);
    assert.equal(fiscal.resultatFiscalAvantDeficits, -3000);
    assert.equal(fiscal.resultatFiscal, 0);
    assert.equal(caseValue(form, "318"), 0);
    // SAV-032 : le déficit courant (3 000) est neutralisé en 330 (aucun non-déductible) ; 354 et 372 vides ; 352 = 370 = 0.
    // (Ancienne attente : 354 = 3 000, qui doublait la perte réintégrée en 330 — bug prouvé.)
    assert.equal(caseValue(form, "330"), 3000);
    assert.equal(caseValue(form, "354"), undefined);
    assert.equal(caseValue(form, "372"), undefined);
    assert.equal(caseValue(form, "352"), 0);
    assert.equal(form.balancing.status, "BALANCED");
  });

  it("C1/C2 — même +7 000 et 4 000 de dotations : ventilation entre biens sans effet sur le plafond", async () => {
    const c1 = await generated(multiWorkspace({ specs: [[A, oracleBien(10000, 0, 0)], [B, oracleBien(1000, 4000, 4000)]] }));
    const c2 = await generated(multiWorkspace({ specs: [[A, oracleBien(3000, 0, 4000)], [B, oracleBien(4000, 0, 0)]] }));

    for (const [label, oracle] of [["C1", c1], ["C2", c2]] as const) {
      assert.equal(oracle.calls.length, 1, label);
      const fiscal = oracle.result.rfs.fiscalResult;
      assert.equal(fiscal.resultatAvantAmort, 7000, label);
      assert.equal(fiscal.amortCalcule, 4000, label);
      assert.equal(fiscal.amortDeduct, 4000, label);
      assert.equal(fiscal.amortNonDeduitExercice, 0, label);
      assert.equal(fiscal.resultatFiscalAvantDeficits, 3000, label);
      assert.equal(fiscal.resultatFiscal, 3000, label);
      assert.equal(caseValue(oracle.result.liasseRfs.form2033B, "318"), 0, label);
      // SAV-032 : E = 3 000 → 350 = 3 000 ; 352 = 370 = 0 (la ventilation entre biens n'y change rien).
      assert.equal(caseValue(oracle.result.liasseRfs.form2033B, "350"), 3000, label);
      assert.equal(caseValue(oracle.result.liasseRfs.form2033B, "352"), 0, label);
      assert.equal(caseValue(oracle.result.liasseRfs.form2033B, "370"), 0, label);
    }
    assert.equal(c2.result.rfs.fiscalResult.amortDeduct, c1.result.rfs.fiscalResult.amortDeduct);
    assert.equal(c2.result.rfs.fiscalResult.resultatFiscal, c1.result.rfs.fiscalResult.resultatFiscal);
  });

  it("D — mêmes totaux : parité mono et multi sur les sorties fiscales globales", async () => {
    const stocks = { deficits: [{ millesime: 2024, montant: 1000 }], amortissementsReportes: 0, deficitsExpires: [] };
    const multi = await generated(multiWorkspace({
      specs: [[A, oracleBien(3000, 0, 4000)], [B, oracleBien(4000, 0, 0)]],
      fiscalYear: { stocksOuverture: { ...STOCKS, stocks } },
    }));
    const mono = withFixedClock(() => runDeclarationGeneration(monoWorkspace(oracleBien(7000, 0, 4000)).declarationDraft, Y, stocks));
    assert.equal(mono.status, "generated");
    if (mono.status !== "generated") return;

    assert.equal(multi.calls.length, 1);
    assert.deepEqual(multi.calls[0]!.stockDeficitsAnterieurs, stocks.deficits);
    const monoFiscal = mono.rfs.fiscalResult;
    const multiFiscal = multi.result.rfs.fiscalResult;
    assert.equal(multiFiscal.deficitsImputes, 1000);
    assert.equal(multiFiscal.resultatFiscal, 2000);
    for (const key of ["resultatAvantAmort", "amortCalcule", "amortDeduct", "amortNonDeduitExercice", "resultatFiscalAvantDeficits", "deficitsImputes", "resultatFiscal"] as const) {
      assert.equal(multiFiscal[key], monoFiscal[key], key);
    }
    for (const caseId of ["318", "330", "350", "352", "354", "370", "372"] as const) {
      assert.equal(caseValue(multi.result.liasseRfs.form2033B, caseId), caseValue(mono.liasseRfs.form2033B, caseId), caseId);
    }
  });
});

// ---------------------------------------------------------------------------
// G15–G22 : blocages fail-closed (F-006 jamais appelé)
// ---------------------------------------------------------------------------

describe("R2C.3b — blocages fail-closed", () => {
  const blocked = async (workspace: PersistedWorkspace, options: Record<string, unknown> = {}) => {
    const { result, calls } = await run(workspace, options);
    assert.equal(result.status, "blocked", "attendu : bloqué");
    return { result: result as Extract<typeof result, { status: "blocked" }>, calls };
  };

  it("G15 — charges communes explicites → bloqué, F-006 non appelé", async () => {
    const { result, calls } = await blocked(multiWorkspace(), { commonCharges: [{ label: "syndic" }] });
    assert.ok(hasCode(result, "common_charges_not_supported"));
    assert.equal(calls.length, 0);
  });

  it("G16 — chargesNatureReview → bloqué", async () => {
    const workspace = multiWorkspace({ bienOverrides: { [A]: { chargesNatureReview: { status: "needs_review", reason: "legacy_mono_charges_nature_unknown" } } } });
    const { result, calls } = await blocked(workspace);
    assert.ok(hasCode(result, "charges_nature_needs_review"));
    assert.equal(calls.length, 0);
  });

  it("G17 — prêt explicitement partagé (même document de crédit sur deux biens) → bloqué", async () => {
    const workspace = multiWorkspace({ specs: [[A, { ...SPEC_A, creditDocumentId: "doc-pret" }], [B, { ...SPEC_B, creditDocumentId: "doc-pret" }]] });
    const { result, calls } = await blocked(workspace);
    assert.ok(hasCode(result, "unsupported_shared_loan"));
    assert.equal(calls.length, 0);
  });

  it("G18 — date de mise en service manquante sur un bien → bloqué, aucune date de l'autre bien empruntée", async () => {
    const { result, calls } = await blocked(multiWorkspace({ specs: [[A, SPEC_A], [B, { ...SPEC_B, date: undefined }]] }));
    assert.ok(hasCode(result, "service_date_missing"));
    assert.equal(calls.length, 0);
  });

  it("G19 — date de mise en service antérieure au début d'activité → bloqué", async () => {
    const { result, calls } = await blocked(multiWorkspace({ specs: [[A, SPEC_A], [B, { ...SPEC_B, date: "2026-02-01" }]] }));
    assert.ok(hasCode(result, "service_date_before_activity_start"));
    assert.equal(calls.length, 0);
  });

  it("G20 — indice de reprise sans preuve d'origine par bien → bloqué (jamais A=reprise ni B=native par défaut)", async () => {
    const workspace = multiWorkspace({ fiscalYear: { priorHistoryDeclaration: { status: "EXTERNAL_HISTORY", declaredAt: T } } });
    const { result, calls } = await blocked(workspace);
    assert.ok(hasCode(result, "entry_mode_unknown"));
    assert.equal(calls.length, 0);
  });

  it("G20bis — ouverture d'exercice scalaire non attribuable (A continuation + B première année) reste bloquée", async () => {
    const workspace = multiWorkspace({
      fiscalYear: { immobilisationsOuverture: { sourceClosureId: "c", brut: 208000, amortissementsCumules: 15000, vnc: 193000 }, previousFiscalYearId: "fy-2025", continuiteNativeVerifiee: true },
    });
    const { result, calls } = await blocked(workspace, { properties: { [A]: { entryMode: "native" }, [B]: { entryMode: "native" } } });
    assert.ok(hasCode(result, "exercise_opening_not_attributable"));
    assert.equal(calls.length, 0);
  });

  it("G20ter — sans aucun indice de reprise, l'origine native n'exige aucune preuve et n'est pas persistée", async () => {
    const workspace = multiWorkspace();
    const before = JSON.stringify(workspace);
    await generated(workspace);
    assert.equal(JSON.stringify(workspace), before, "le workspace n'est jamais muté (origin non persistée)");
  });

  it("G21 — amortNonDeduitExercice > 0 → bloqué APRÈS F-006 (résultat F-006 non modifié, aucune allocation 39 C)", async () => {
    const workspace = multiWorkspace({ specs: [[A, SPEC_A], [B, { ...SPEC_B, dotations: 50000 }]] });
    const { result, calls } = await blocked(workspace);
    assert.ok(hasCode(result, "multi_property_39c_allocation_not_supported"));
    assert.equal(calls.length, 1, "le résultat global est calculé une fois, puis le cycle par bien est refusé");
    assert.ok(produceFiscalResult(calls[0]!).result!.amortNonDeduitExercice > 0, "le cas crée effectivement du non-déduit 39 C");
  });

  it("G22 — stock d'amortissements réportés > 0 → bloqué AVANT F-006 (jamais consommé)", async () => {
    const workspace = multiWorkspace({ fiscalYear: { stocksOuverture: { ...STOCKS, stocks: { ...STOCKS.stocks, amortissementsReportes: 4000 } } } });
    const { result, calls } = await blocked(workspace);
    assert.ok(hasCode(result, "multi_property_historical_ard_not_supported"));
    assert.equal(calls.length, 0);
  });

  it("collecte — bien absent de draft.biens → bloqué", async () => {
    const workspace = multiWorkspace();
    delete (workspace.declarationDraft!.biens as Record<string, unknown>)[B];
    const { result, calls } = await blocked(workspace);
    assert.ok(hasCode(result, "missing_bien"));
    assert.equal(calls.length, 0);
  });

  it("collecte — état crédit inconnu sur un bien → bloqué", async () => {
    const { result, calls } = await blocked(multiWorkspace({ specs: [[A, SPEC_A], [B, { ...SPEC_B, credit: "unknown" }]] }));
    assert.ok(hasCode(result, "credit_state_unknown"));
    assert.equal(calls.length, 0);
  });

  it("ouverture globale fournie par l'appelant (continuity / fiscalYearOpening) en multi → bloquée, jamais attribuée à un bien", async () => {
    const { result, calls } = await blocked(multiWorkspace(), { continuity: { previousFiscalYearId: "fy-2025" } });
    assert.ok(hasCode(result, "exercise_opening_not_attributable"));
    assert.equal(calls.length, 0);
  });

  it("réconciliation d'un bien en échec → bloquée (jamais compensée par l'autre bien)", async () => {
    const broken = { ...PLAN_B, lignes: PLAN_B.lignes.map((ligne) => ({ ...ligne, amortissementsCumules: 1 })) };
    const { result } = await blocked(multiWorkspace({ specs: [[A, SPEC_A], [B, { ...SPEC_B, plan: broken }]] }));
    assert.ok(hasCode(result, "IMMOBILISATIONS_CONTINUITY_RECONCILIATION_FAILED"));
  });
});

// ---------------------------------------------------------------------------
// G27–G30 : mono — délégation au chemin historique
// ---------------------------------------------------------------------------

describe("R2C.3b — mono : délégation à l'identique", () => {
  it("G27/G29/G30 — workspace mono legacy → exactement runDeclarationGeneration(draft) (deepEqual, RFS, liasse, 2033-A/B/C)", async () => {
    const { runDeclarationGenerationFromWorkspace } = await api();
    const candidates: Array<[string, PersistedWorkspace]> = [
      ["mono-fixture", monoWorkspace()],
      ...Object.entries(await representativeMonoWorkspaces()).map(([name, workspace]) => [name, workspace] as [string, PersistedWorkspace]),
    ];
    for (const [name, workspace] of candidates) {
      const expected = withFixedClock(() => runDeclarationGeneration(workspace.declarationDraft, workspace.fiscalYear.year));
      const actual = withFixedClock(() => runDeclarationGenerationFromWorkspace(workspace));
      assert.deepEqual(actual, expected, name);
      if (expected.status === "generated" && actual.status === "generated") {
        assert.deepEqual(actual.rfs, expected.rfs, `${name} RFS`);
        assert.deepEqual(actual.liasseRfs, expected.liasseRfs, `${name} liasseRfs`);
        assert.deepEqual(actual.liasseResult, expected.liasseResult, `${name} liasse`);
      }
    }
    const mono = withFixedClock(() => runDeclarationGenerationFromWorkspace(monoWorkspace()));
    assert.equal(mono.status, "generated", JSON.stringify((mono as { anomalies?: unknown }).anomalies));
  });

  it("G27bis — les paramètres historiques (stocks, bilan, dispense, continuité, Opening) sont transmis tels quels au chemin mono", async () => {
    const { runDeclarationGenerationFromWorkspace } = await api();
    const workspace = monoWorkspace();
    const stocks = { deficits: [{ millesime: 2024, montant: 800 }], amortissementsReportes: 300, deficitsExpires: [] };
    const intake = { caReferenceN1Declaree: 1000 };
    const expected = withFixedClock(() => runDeclarationGeneration(workspace.declarationDraft, Y, stocks, undefined, intake));
    const actual = withFixedClock(() => runDeclarationGenerationFromWorkspace(workspace, { stocksOuverture: stocks, dispense2033AIntake: intake }));
    assert.deepEqual(actual, expected);
  });

  it("G28 — mono : le chemin multi (moteur injecté) n'est jamais emprunté ; F-006 historique appelé par runDeclarationGeneration", async () => {
    const { result, calls } = await run(monoWorkspace());
    assert.equal(calls.length, 0, "le moteur injecté n'est utilisé que par le pipeline consolidé");
    assert.equal(result.status, "generated");
    assert.equal(result.status === "generated" ? result.rfs.immobilisationsParBien : "x", undefined);
  });

  it("G28bis — mono : le service n'appelle ni collectPropertyFiscalContributions ni consolidateFiscalContributions", () => {
    const code = source("src/lib/lmnp/services/declaration/generation-workspace.ts");
    const mono = code.slice(code.indexOf("legacy_mono"));
    assert.match(code, /runDeclarationGeneration\(/);
    assert.ok(mono.length > 0);
  });
});

// ---------------------------------------------------------------------------
// G34–G37 : « zéro établi » ≠ « non établi »
// ---------------------------------------------------------------------------

describe("R2C.3b — inventaire d'un bien : zéro établi vs non établi", () => {
  const ZERO_PLAN = { lignes: [] as Array<Record<string, unknown>>, totalAnnuelExercice: 0, totalBrut: 0 };

  it("G34 — bien dont le plan F-010/F-014 est établi à zéro (aucun actif amortissable) : pas bloqué parce que le total est zéro", async () => {
    const zero: BienSpec = { ...SPEC_B, dotations: 0, plan: ZERO_PLAN, valeurTerrain: 0, montantMobilier: 0 };
    const { result } = await generated(multiWorkspace({ specs: [[A, SPEC_A], [B, zero]] }));
    const blocs = result.rfs.immobilisationsParBien ?? [];
    assert.deepEqual(blocs.map((bloc) => [bloc.propertyId, bloc.dotationsExercice]), [[A, 4544.21], [B, 0]]);
    assert.equal(caseValue(result.liasseRfs.form2033C, "572"), 4544.21);
  });

  it("G35 — bien onboardé dont les immobilisations ne sont pas établies (pas de plan F-010) : bloqué AVANT la génération finale", async () => {
    const workspace = multiWorkspace();
    delete (workspace.declarationDraft!.biens as Record<string, Record<string, unknown>>)[B]!.logementAmortissement;
    const { result } = await run(workspace);
    assert.equal(result.status, "blocked");
    assert.ok(hasCode(result, "property_immobilisations_not_established"));
    assert.ok(blockedCodes(result).some((message) => message.includes(`@${B}`)));
  });

  it("G36 — l'absence de bloc immobilisationsParBien ne signifie jamais « zéro » : une génération multi réussie porte un bloc pour CHAQUE bien", async () => {
    const { result } = await generated();
    assert.deepEqual((result.rfs.immobilisationsParBien ?? []).map((bloc) => bloc.propertyId), [A, B]);
    const code = source("src/lib/lmnp/services/declaration/generation-workspace.ts");
    assert.doesNotMatch(code, /immobilisationsParBien\s*\?\s*\{\s*immobilisationsParBien/, "plus de publication conditionnelle silencieuse");
  });

  it("G37 — mono inchangé : un mono sans plan F-010 reste généré comme avant (RFS sans immobilisations)", async () => {
    const { runDeclarationGenerationFromWorkspace } = await api();
    const workspace = monoWorkspace();
    delete (workspace.declarationDraft as Record<string, unknown>).logementAmortissement;
    const expected = withFixedClock(() => runDeclarationGeneration(workspace.declarationDraft, Y));
    const actual = withFixedClock(() => runDeclarationGenerationFromWorkspace(workspace));
    assert.deepEqual(actual, expected);
    assert.equal(expected.status, "generated");
    assert.equal(expected.status === "generated" ? expected.rfs.immobilisations : "x", undefined);
  });
});

// ---------------------------------------------------------------------------
// Garde-fous source : architecture, interdits, aucun appelant de production
// ---------------------------------------------------------------------------

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (entry === "node_modules" || entry === ".next") continue;
    if (statSync(full).isDirectory()) walk(full, files);
    else if (/\.(ts|tsx)$/.test(entry)) files.push(full);
  }
  return files;
}

describe("R2C.3b — garde-fous source", () => {
  const WORKSPACE_SERVICE = "src/lib/lmnp/services/declaration/generation-workspace.ts";

  it("G23/G24 — aucun properties[0] / propertyIds[0] / résolution mono / date globale choisie dans un bien", () => {
    const code = source(WORKSPACE_SERVICE);
    assert.doesNotMatch(code, /properties\[0\]|propertyIds\[0\]|resolveMonoPropertyId|resolveMonoProperty\(|Object\.values\([^)]*\)\[0\]|Object\.keys\([^)]*\)\[0\]/);
    assert.doesNotMatch(code, /dateMiseEnService:\s*(?!undefined)[^,\n]*datesMiseEnService\[0\]/);
  });

  it("G25/G26 — aucun FiscalResult / déficit / stock ARD par bien, aucune allocation 39 C ni TRF-0035", () => {
    const code = source(WORKSPACE_SERVICE);
    assert.doesNotMatch(code, /fiscalResultParBien|deficitsParBien|stockParBien|allocate39C|allocation39C/i);
    assert.doesNotMatch(code, /TRF-0035\s*\(|applyTrf0035|computeTrf0035/);
  });

  it("2 — le chemin multi appelle produceFiscalResult exactement UNE fois (une seule occurrence d'appel dans le service)", () => {
    const code = source(WORKSPACE_SERVICE);
    const calls = code.match(/produceFiscalResult\(/g) ?? [];
    assert.equal(calls.length <= 1, true, `${calls.length} appel(s)`);
    assert.doesNotMatch(code, /for\s*\([^)]*contribution[^)]*\)[^}]*produceFiscalResult/s);
    assert.doesNotMatch(code, /\.map\([^)]*produceFiscalResult/);
  });

  it("9 — aucun synthetic flat draft : l'adaptateur ne passe ni par buildFiscalEngineInputs(draft) ni par resolveEmpruntsForRfs", () => {
    const code = source(WORKSPACE_SERVICE);
    assert.doesNotMatch(code, /resolveEmpruntsForRfs\(/);
    assert.doesNotMatch(code, /buildFiscalEngineInputs\(\{\s*draft:\s*\{/);
  });

  it("19 — shared core : la chaîne aval est définie UNE fois (run-declaration-generation), le service multi ne la duplique pas", () => {
    const service = source(WORKSPACE_SERVICE);
    for (const symbol of ["produceLiasse(", "assembleLiasseFromRfs(", "buildFiscalRepresentation("]) {
      assert.equal(service.includes(symbol), false, `${symbol} appartient au shared core`);
    }
    const core = source("src/lib/lmnp/services/declaration/run-declaration-generation.ts");
    assert.equal((core.match(/= assembleLiasseFromRfs\(/g) ?? []).length, 1);
    assert.equal((core.match(/= produceLiasse\(\{/g) ?? []).length, 1);
  });

  it("G33 — generation-workspace n'a que TROIS appelants de production documentés : le PREVIEW pur de la gate (R2C.3c2c), le seam de génération mono/scoped mono de l'écran de validation, gardé contre le multi (R2C.3c2d), et l'AUTORITÉ SERVEUR de livraison qui recalcule depuis le snapshot persisté (MB-MULTI-SERVER-TRUST-2)", () => {
    const offenders = walk(path.join(ROOT, "src")).filter((file) => {
      const relative = path.relative(ROOT, file);
      if (/\.test\.(ts|tsx)$/.test(relative) || relative === WORKSPACE_SERVICE) return false;
      const code = readFileSync(file, "utf8");
      return /generation-workspace|runDeclarationGenerationFromWorkspace/.test(code);
    });
    // R2C.3c2c : la gate (preview pur). R2C.3c2d : l'écran de validation (génération mono / scoped mono ; garde multi en tête du handler).
    // MB-MULTI-SERVER-TRUST-2 : `authoritative-delivery.ts` — UN appel par requête de livraison, sur le workspace persisté (jamais une RFS client).
    assert.deepEqual(offenders.map((file) => path.relative(ROOT, file)), [
      "src/components/lmnp/documents/ValidationDocumentStep.tsx",
      "src/lib/lmnp/services/declaration/authoritative-delivery.ts",
      "src/lib/lmnp/services/declaration/declaration-generation-gate.ts",
    ]);
  });

  it("hors scope — paiement, validation, cycle fiscal et panneaux ne référencent pas le nouveau service", () => {
    for (const file of [
      "src/lib/lmnp/services/declaration/payment-readiness.ts",
    ]) {
      assert.doesNotMatch(source(file), /generation-workspace|runDeclarationGenerationFromWorkspace/, file);
    }
  });
});
