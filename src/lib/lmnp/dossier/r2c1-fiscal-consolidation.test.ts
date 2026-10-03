/**
 * R2C.1 — contribution fiscale par bien + consolidation pure, DORMANTES (aucun branchement production).
 *
 * BienDraft[A], BienDraft[B] → adaptateur pur par bien → PropertyFiscalContribution → validations locales → consolidation
 * pure → ConsolidatedFiscalInputs + ledger + raisons de blocage. Aucun F006 multi, aucune persistance, aucune allocation
 * 39 C / TRF-0035. Legacy mono : extraction à parité exacte (entrées deepEqual, résultats identiques à HEAD 912419b).
 *
 * Run: npx tsx --test src/lib/lmnp/dossier/r2c1-fiscal-consolidation.test.ts
 */
import "@/lab/v2-dossier/test-public-env";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, mock } from "node:test";

import { representativeMonoWorkspaces } from "@/lab/v2-dossier/bien-read-test-support";
import { financementChargesForGeneration } from "@/lib/lmnp/services/f011/credit-financing-to-financement-charges";
import { runDeclarationGeneration } from "@/lib/lmnp/services/declaration/run-declaration-generation";
import { buildClientSummaryDocument } from "@/lib/lmnp/services/declaration/build-client-summary-document";
import { computeOpeningContentHash } from "@/lib/lmnp/services/fiscal-year-opening/content-hash";
import { available, unavailable } from "@/lib/lmnp/services/fiscal-year-opening/opening-fact";
import type { FiscalYearOpening } from "@/lib/lmnp/services/fiscal-year-opening/types";
import { lmnpReducer, type LmnpState } from "@/lib/lmnp/store/reducer";
import type { DeclarationDraft, LmnpDocument, Property } from "@/lib/lmnp/types";
import type { FiscalEngineInputs } from "@/runtime/capabilities/f006/types";

const ROOT = process.cwd();
const source = (relative: string) => readFileSync(path.join(ROOT, relative), "utf8");
const Y = 2026;
const START = "2026-02-01";
const SIRET = "12345678900012";
const T = "2026-01-01T00:00:00.000Z";
const A = "home-1";
const B = "bien-b";
const PROPERTY_B: Property = { id: B, label: "Studio Nantes", address: "3 rue Y", city: "Nantes", postalCode: "44000" };

// ---------------------------------------------------------------------------
// Modules R2C.1 (chargés dynamiquement : chaque oracle échoue seul tant qu'ils n'existent pas).
// ---------------------------------------------------------------------------

type Api = typeof import("@/lib/lmnp/services/declaration/generation-inputs") &
  typeof import("@/lib/lmnp/dossier/fiscal-consolidation") &
  typeof import("@/runtime/capabilities/f006/cents");

async function api(): Promise<Api> {
  const [inputs, consolidation, cents] = await Promise.all([
    import("@/lib/lmnp/services/declaration/generation-inputs"),
    import("@/lib/lmnp/dossier/fiscal-consolidation"),
    import("@/runtime/capabilities/f006/cents"),
  ]);
  return { ...inputs, ...consolidation, ...cents } as Api;
}

// ---------------------------------------------------------------------------
// Référence FIGÉE : composition inline de runDeclarationGeneration à HEAD 912419b (avant extraction).
// ---------------------------------------------------------------------------

function referenceAmortissement(draft: DeclarationDraft | undefined) {
  return draft?.amortissementAssistant
    ? {
        exerciceFiscal: draft.amortissementAssistant.exerciceFiscal,
        totalDotations: draft.amortissementAssistant.totalDotations,
        status: draft.amortissementAssistant.status,
      }
    : undefined;
}

function referenceFiscalEngineInputs(
  draft: DeclarationDraft | undefined,
  fiscalYear: number,
  usesTakeoverHistory: boolean,
  stocks?: { deficits?: FiscalEngineInputs["stockDeficitsAnterieurs"]; amortissementsReportes?: number },
): FiscalEngineInputs {
  const financementCharges = financementChargesForGeneration(draft, fiscalYear);
  const logementAmortissementForF006 =
    draft?.logementAmortissement && usesTakeoverHistory
      ? { ...draft.logementAmortissement, fraisEnCharges: 0 }
      : draft?.logementAmortissement;
  return {
    exerciceFiscal: fiscalYear,
    activite: { siret: draft?.siret, dateMiseEnService: draft?.dateMiseEnService, activityType: draft?.activityType },
    logementAmortissement: logementAmortissementForF006,
    financementCharges,
    chargesAssistant: draft?.chargesAssistant,
    revenusAssistant: draft?.revenusAssistant,
    amortissementAssistant: referenceAmortissement(draft),
    stockDeficitsAnterieurs: stocks?.deficits,
    stockAmortissementsReportes: stocks?.amortissementsReportes,
  } as FiscalEngineInputs;
}

// ---------------------------------------------------------------------------
// Fixtures mono déterministes (identiques à la preuve BEFORE capturée à HEAD 912419b).
// ---------------------------------------------------------------------------

function richNative(year: number): DeclarationDraft {
  return {
    completedSteps: [],
    siret: SIRET,
    siren: "123456789",
    exploitantFirstName: "Jean",
    exploitantLastName: "Parite",
    activityStartDate: `${year}-03-01`,
    dateMiseEnService: `${year}-04-15`,
    activityType: "LMNP",
    logementAmortissement: {
      exerciceFiscal: year,
      prixRevient: 215000, fraisEnCharges: 15000.37, valeurTerrain: 30000, valeurBati: 170000,
      baseAmortissableBati: 170000, montantMobilier: 8000, dotationAnnuelle: 5123.45, dureeMoyenneAnnees: 30,
      prorataRatio: 0.71,
      plan: {
        lignes: [
          { id: "gros-oeuvre", label: "Gros œuvre", montant: 100000, dureeAnnees: 50, dotationExercice: 1420.01, amortissementsCumules: 1420.01 },
          { id: "facades", label: "Façades", montant: 70000, dureeAnnees: 25, dotationExercice: 1988.2, amortissementsCumules: 1988.2 },
          { id: "mobilier", label: "Mobilier", montant: 8000, dureeAnnees: 5, dotationExercice: 1136.0, amortissementsCumules: 1136.0 },
        ],
        totalAnnuelExercice: 4544.21,
        totalBrut: 178000,
      },
      fieldSources: {}, computedAt: T,
    },
    financementCharges: {
      exerciceFiscal: year, totalInteretsEmprunt: 2100.13, totalInteretsPreExploitation: 120.5, totalAssurance: 310.2,
      totalAssurancePreExploitation: 40.1, totalCapitalRembourse: 5000, totalChargesFinancementExercice: 2910.33,
      totalFraisDossierDeductibles: 500,
      prets: [{
        pretId: "loan-1", typePret: "amortissable", interetsEmpruntExercice: 2100.13, interetsPreExploitation: 120.5,
        assuranceEmpruntExercice: 310.2, assurancePreExploitation: 40.1, capitalRembourseExercice: 5000,
        capitalRestantDu31_12: 145000, fraisDossierDeductibles: 500, garantieDeductible: 0, iraDeductible: 0,
      }],
      fieldSources: {}, computedAt: T,
    },
    chargesAssistant: {
      exerciceFiscal: year, totalDeductible: 3456.78, totalNonDeductible: 12.5, totalAmortissable: 0, totalPreExploitation: 99.99,
      parCategorie: { taxe_fonciere: 1200.11, assurance_pno: 180.67, copropriete: 1576, honoraires_comptable: 500 },
      parCategoriePreExploitation: { divers: 99.99 }, parCategorieNonDeductible: { copropriete: 12.5 },
      composantsNouveaux: [], fieldSources: {}, computedAt: T,
    },
    revenusAssistant: {
      exerciceFiscal: year, totalRecettes: 14321.09, loyersEncaisses: 14000, indemnitesAssurance: 321.09,
      recettesPlateforme: 0, ajustementsJanDec: 0, moisLocationEffectifs: 8.5, fieldSources: {}, computedAt: T,
    },
    amortissementAssistant: {
      exerciceFiscal: year, totalDotations: 4544.21, status: "validated", planVersion: "v1", profil: "PROF-001", validatedAt: T,
    },
    dispense2033A: { caReferenceN1Declaree: 0 },
  } as unknown as DeclarationDraft;
}

function externalTakeoverOpening(): FiscalYearOpening {
  const opening: FiscalYearOpening = {
    openingId: "opening-r2c1", revision: 1, targetFiscalYear: 2026, dossierId: "dossier-r2c1",
    source: { kind: "external_takeover", takeoverId: "takeover-r2c1", sourceFiscalYear: 2025 },
    stocks: { deficits: available([{ millesime: 2024, montant: 1500 }]), amortissementsReportes: available(2500) },
    assets: unavailable("hors scope"), loans: unavailable("hors scope"),
    patrimoine: { ouvertureCompteExploitant: unavailable("hors scope"), ran: unavailable("hors scope"), tresorerieOuverture: unavailable("hors scope") },
    properties: unavailable("hors scope"), identity: unavailable("hors scope"),
    provenance: {
      source: { fieldPath: "source", sourceKind: "external", sourceRef: "takeover-r2c1" },
      "stocks.deficits": { fieldPath: "stocks.deficits", sourceKind: "external" },
      "stocks.amortissementsReportes": { fieldPath: "stocks.amortissementsReportes", sourceKind: "external" },
    },
    validation: { status: "pending" },
  } as unknown as FiscalYearOpening;
  opening.validation = { status: "validated", openingRevision: 1, contentHash: computeOpeningContentHash(opening), validatedAt: T, validator: "r2c1" } as never;
  return opening;
}

// ---------------------------------------------------------------------------
// Fixtures multi : vues « exercice + bien » construites explicitement (aucune donnée inventée par le code testé).
// ---------------------------------------------------------------------------

type BienSpec = {
  recettes: number;
  loyers?: number;
  charges: number;
  cats?: Record<string, number>;
  credit: "present" | "none" | "unknown";
  interets?: number;
  assurance?: number;
  pretIds?: string[];
  creditDocumentId?: string;
  recouvrementRef?: number;
  dotations: number;
  frais: number;
  date?: string;
  taxeFonciereExposed?: boolean;
  revenusWarning?: string;
};

function bienView(spec: BienSpec): DeclarationDraft {
  const interets = spec.interets ?? 0;
  const assurance = spec.assurance ?? 0;
  return {
    completedSteps: [],
    siret: SIRET,
    activityType: "LMNP",
    activityStartDate: START,
    ...(spec.date !== undefined ? { dateMiseEnService: spec.date } : {}),
    revenusAssistant: {
      exerciceFiscal: Y, totalRecettes: spec.recettes,
      ...(spec.loyers !== undefined ? { loyersEncaisses: spec.loyers } : {}),
      ...(spec.revenusWarning ? { anomalies: [{ severity: "warning", message: spec.revenusWarning }] } : {}),
      fieldSources: {}, computedAt: T,
    },
    chargesAssistant: {
      exerciceFiscal: Y, totalDeductible: spec.charges, totalPreExploitation: 0, totalNonDeductible: 0,
      ...(spec.cats ? { parCategorie: spec.cats } : {}),
      ...(spec.recouvrementRef !== undefined
        ? { recouvrementAssuranceF011: { reference: spec.recouvrementRef, periodeCompatible: true, recouvert: spec.recouvrementRef, reliquat: 0 } }
        : {}),
      composantsNouveaux: [], fieldSources: {}, computedAt: T,
    },
    ...(spec.taxeFonciereExposed
      ? {
          chargesAssistantState: {
            collected: {
              taxeFonciereExpense: { id: "expense-doc-tf-prelevement:1", category: "taxe_fonciere", decision: "confirmed", montant: 150 },
              coproLignes: [],
            },
          },
        }
      : {}),
    ...(spec.credit === "present"
      ? {
          financementCharges: {
            exerciceFiscal: Y, totalInteretsEmprunt: interets, totalInteretsPreExploitation: 0, totalAssurance: assurance,
            totalAssurancePreExploitation: 0, totalCapitalRembourse: 0, totalChargesFinancementExercice: interets + assurance,
            prets: (spec.pretIds ?? ["loan-1"]).map((pretId) => ({
              pretId, typePret: "amortissable", interetsEmpruntExercice: interets, interetsPreExploitation: 0,
              assuranceEmpruntExercice: assurance, assurancePreExploitation: 0, capitalRembourseExercice: 0,
              capitalRestantDu31_12: 1000, fraisDossierDeductibles: 0, garantieDeductible: 0, iraDeductible: 0,
            })),
            fieldSources: {}, computedAt: T,
          },
        }
      : {}),
    ...(spec.credit === "none" ? { creditDeclaredNoneAt: T } : {}),
    ...(spec.creditDocumentId ? { creditDocumentId: spec.creditDocumentId } : {}),
    amortissementAssistant: { exerciceFiscal: Y, totalDotations: spec.dotations, status: "validated" },
    logementAmortissement: { exerciceFiscal: Y, computedAt: T, fraisEnCharges: spec.frais },
  } as unknown as DeclarationDraft;
}

const BASE_A: BienSpec = { recettes: 10000.1, loyers: 10000.1, charges: 1234.07, cats: { taxe_fonciere: 600.05, assurance_pno: 400.05 }, credit: "present", interets: 2100.13, assurance: 300, dotations: 4000.1, frais: 0, date: "2026-03-01" };
const BASE_B: BienSpec = { recettes: 5000.2, loyers: 5000.2, charges: 4321.11, cats: { taxe_fonciere: 1500.15, assurance_pno: 500.05 }, credit: "present", interets: 310.27, assurance: 0, dotations: 2000.2, frais: 0, date: "2026-06-15" };

const ACTIVITY = (overrides: Record<string, unknown> = {}) => ({
  exerciceFiscal: Y,
  activite: { siret: SIRET, activityType: "LMNP" as const },
  dateDebutActivite: START,
  stocksOuverture: { deficits: [{ millesime: 2024, montant: 1234.56 }], amortissementsReportes: 789.01 },
  ...overrides,
});

async function consolidate(specs: Array<[string, BienSpec, ("native" | "takeover")?]>, activityOverrides: Record<string, unknown> = {}, review?: string) {
  const { buildPropertyFiscalContribution, consolidateFiscalContributions } = await api();
  const contributions = specs.map(([propertyId, spec, entryMode]) =>
    buildPropertyFiscalContribution({
      propertyId,
      view: bienView(spec),
      fiscalYear: Y,
      entryMode: entryMode ?? "native",
      ...(review === propertyId ? { chargesNatureReview: { status: "needs_review", reason: "legacy_mono_charges_nature_unknown" } as const } : {}),
    }));
  return { contributions, result: consolidateFiscalContributions(ACTIVITY(activityOverrides) as never, contributions) };
}

const codes = (result: { blockingReasons: Array<{ code: string; propertyId?: string }> }) =>
  result.blockingReasons.map((reason) => `${reason.code}${reason.propertyId ? `@${reason.propertyId}` : ""}`);

// ---------------------------------------------------------------------------
// R — parité mono
// ---------------------------------------------------------------------------

describe("R2C.1 — R : extraction du chemin mono à parité exacte", () => {
  it("R1 — l'adaptateur produit EXACTEMENT les entrées F006 historiques (deepEqual) sur les dossiers mono représentatifs", async () => {
    const { buildFiscalEngineInputs, draftAmortissementForGeneration } = await api();
    const ws = await representativeMonoWorkspaces();
    const drafts: Array<[string, DeclarationDraft | undefined, number]> = [
      ...Object.entries(ws).map(([name, workspace]) => [name, workspace.declarationDraft, workspace.fiscalYear.year] as [string, DeclarationDraft | undefined, number]),
      ["rich-native", richNative(Y), Y],
      ["empty", undefined, Y],
    ];
    const stocks = { deficits: [{ millesime: 2023, montant: 2000 }], amortissementsReportes: 4000 };
    for (const [name, draft, year] of drafts) {
      for (const usesTakeoverHistory of [false, true]) {
        for (const openingFiscalStocks of [undefined, stocks]) {
          const amortissementAssistant = draftAmortissementForGeneration(draft);
          assert.deepEqual(amortissementAssistant, referenceAmortissement(draft), `${name} : projection F-014`);
          const actual = buildFiscalEngineInputs({ draft, fiscalYear: year, amortissementAssistant, usesTakeoverHistory, openingFiscalStocks });
          assert.deepEqual(actual, referenceFiscalEngineInputs(draft, year, usesTakeoverHistory, openingFiscalStocks), `${name} takeover=${usesTakeoverHistory}`);
        }
      }
    }
  });

  it("R1 — runDeclarationGeneration consomme l'adaptateur (une seule composition, aucune copie divergente)", () => {
    const code = source("src/lib/lmnp/services/declaration/run-declaration-generation.ts");
    assert.match(code, /buildFiscalEngineInputs\(/);
    assert.match(code, /draftAmortissementForGeneration\(/);
    assert.doesNotMatch(code, /fraisEnCharges: 0/, "la neutralisation reprise n'est plus recopiée en ligne");
  });

  // R2 → R4 : empreintes SHA-256 du résultat COMPLET (FiscalResult, RFS, liasseRfs, liasse F-007), capturées sur les mêmes
  // fixtures, horloge figée (harnais scratchpad R2C.1). Toute dérive mono les casse.
  // RECAPTURES DOCUMENTÉES (jamais en masse — chaque différence a été comparée champ par champ avant recapture) :
  //  1. 94bb29f (SAV-030, 39 C avant déficits) : ajout de `resultatFiscalAvantDeficits` ; 352/354 produites ; sur
  //     `rich-external-takeover-stocks-only` seulement, l'ordre de calcul modifie amortReportesUtilises (1 649,18 → 2 500),
  //     deficitsImputes (1 500 → 649,18) et les stocks finaux — CHANGEMENT ATTENDU (SAV-027 → SAV-030).
  //  2. MB-2033B-NONPRO-NEUTRALIZATION-IMPL-1 (SAV-032) : fiscalResult / rfs / 2033-A / 2033-C INCHANGÉS ; seuls changent le bloc
  //     de neutralisation 2033-B (330 : 7 306,98 → 7 319,48 = déficit + 12,50 non déductibles ; 350, 352, 354, 370 ; nouveau
  //     champ `balancing`) et 2031 (C_L1_COL1 = 0, I_7A = résultat avant déficits) — rattachés aux bugs prouvés : 330 omet les
  //     non-déductibles, 354 double la perte déjà réintégrée en 330, 350 omet les ARD, 7a pris après imputation.
  //  3. BKS-004-2042-C-PRO-IMPL-1 (SAV-033) : fiscalResult, 2033-A/B/C, 2031 INCHANGÉS ; seul ajout, comparé champ par champ à HEAD
  //     bff9d83 : `rfs.deficitsOuverture` (transport pur du stock de déficits d'OUVERTURE utilisé par F-006 : takeover = 2024/1 500 ;
  //     rich-native-stocks = 2023/2 000 ; autres = source `none`, liste vide).
  const FIXED = Date.parse("2026-06-01T12:00:00.000Z");
  const GOLDEN: Array<[string, () => unknown[], string]> = [
    ["rich-native", () => [richNative(Y), Y], "1789949a2bb66c792d4801988d177d29ecb9ecf5bd3e02aa8432d3bd2a6c9e2d"],
    ["rich-native-stocks", () => [richNative(Y), Y, { deficits: [{ millesime: 2023, montant: 2000 }], amortissementsReportes: 4000, deficitsExpires: [] }], "d764a60bad2f809e4ff901bc7be19d7292634f5d0e035c1c719b1251b0a54453"],
    ["rich-native-continuation-verified", () => [richNative(Y), Y, undefined, undefined, { caReferenceN1Declaree: 0 }, {
      immobilisationsOuverture: { sourceClosureId: "closure-n", brut: 208000, amortissementsCumules: 0, vnc: 208000 },
      previousFiscalYearId: "fy-2025", continuiteNativeVerifiee: true, propertyId: "prop-1",
    }], "161665842ee6cd826b7655be68af64f42d85c82ca5467803f9a49aaf69e4d5ab"],
    ["rich-external-takeover-stocks-only", () => [richNative(Y), Y, undefined, undefined, { caReferenceN1Declaree: 0 }, undefined, externalTakeoverOpening()], "ebf0f5cf8817f9ef4d9243b8382fe37b3b52194c19da4525107747f36db77e9a"],
  ];
  for (const [name, args, expected] of GOLDEN) {
    it(`R2/R3/R4 — ${name} : FiscalResult, RFS, liasse et liasseRfs identiques à HEAD (empreinte)`, () => {
      mock.timers.enable({ apis: ["Date"], now: FIXED });
      try {
        const result = (runDeclarationGeneration as (...a: unknown[]) => { status: string })(...args());
        assert.equal(result.status, "generated");
        assert.equal(createHash("sha256").update(JSON.stringify(result)).digest("hex"), expected);
      } finally {
        mock.timers.reset();
      }
    });
  }

  // SAV-032 — ORACLES de la neutralisation 2033-B / 2031, sur le chemin de production réel (runDeclarationGeneration → F-006
  // → RFS → liasseRfs). Valeurs attendues posées à la main AVANT code (mission PO), indépendantes des empreintes ci-dessus.
  type Line = { caseId: string; value: unknown };
  type Liasse = {
    form2033B: { cases: Line[]; balancing: { status: string; resultatCalcule: number; resultatImprime: number } };
    form2031: { cases: Line[] };
  };
  const generated = (index: number): Liasse => {
    mock.timers.enable({ apis: ["Date"], now: FIXED });
    try {
      const result = (runDeclarationGeneration as (...a: unknown[]) => { status: string; liasseRfs?: Liasse })(...GOLDEN[index]![1]());
      assert.equal(result.status, "generated");
      return result.liasseRfs!;
    } finally {
      mock.timers.reset();
    }
  };
  const val = (cases: Line[], id: string) => cases.find((c) => c.caseId === id)?.value;

  it("ORACLE RICH-NATIVE (déficit, ND 12,50) — 314 = 11 863,69 ; 318 = 4 544,21 ; 330 = 7 319,48 ; 350/354/372 vides ; 352 = 370 = 0 ; 7b = 7 306,98 ; bouclage", () => {
    const { form2033B, form2031 } = generated(0);
    assert.equal(val(form2033B.cases, "314"), 11863.69);
    assert.equal(val(form2033B.cases, "318"), 4544.21);
    assert.equal(val(form2033B.cases, "330"), 7319.48, "7 306,98 de déficit + 12,50 non déductibles");
    for (const vide of ["350", "354", "372"]) assert.equal(val(form2033B.cases, vide), undefined, `${vide} vide`);
    assert.equal(val(form2033B.cases, "352"), 0);
    assert.equal(val(form2033B.cases, "370"), 0);
    assert.equal(val(form2031.cases, "I_7B"), 7306.98);
    assert.equal(val(form2031.cases, "I_7A"), undefined);
    assert.equal(val(form2031.cases, "C_L1_COL1"), 0);
    // −11 863,69 + 4 544,21 + 7 319,48 = 0
    assert.ok(Math.abs(-11863.69 + 4544.21 + 7319.48) < 0.005);
    assert.equal(form2033B.balancing.status, "BALANCED");
    assert.equal(form2033B.balancing.resultatCalcule, 0);
  });

  it("ORACLE RICH-TAKEOVER (bénéfice, ARD 2 500, déficits antérieurs, ND 12,50) — 312 = 3 136,68 ; 318 = 0 ; 330 = 12,50 ; 350 = 3 149,18 ; 352 = 370 = 0 ; 7a = 649,18 ; bouclage", () => {
    const { form2033B, form2031 } = generated(3);
    assert.equal(val(form2033B.cases, "312"), 3136.68);
    assert.equal(val(form2033B.cases, "318"), 0);
    assert.equal(val(form2033B.cases, "330"), 12.5);
    assert.equal(val(form2033B.cases, "350"), 3149.18, "649,18 avant déficits + 2 500 d'ARD consommés ; jamais ARD + déficits antérieurs");
    assert.equal(val(form2033B.cases, "352"), 0);
    assert.equal(val(form2033B.cases, "354"), undefined);
    assert.equal(val(form2033B.cases, "370"), 0);
    assert.equal(val(form2033B.cases, "372"), undefined);
    assert.equal(val(form2031.cases, "I_7A"), 649.18, "résultat AVANT imputation des déficits antérieurs (et non resultatFiscal = 0)");
    assert.equal(val(form2031.cases, "I_7B"), undefined);
    assert.equal(val(form2031.cases, "C_L1_COL1"), 0);
    // 3 136,68 + 12,50 − 3 149,18 = 0
    assert.ok(Math.abs(3136.68 + 12.5 - 3149.18) < 0.005);
    assert.equal(form2033B.balancing.status, "BALANCED");
  });

  // SAV-033 (BKS-004-2042-C-PRO-IMPL-1) — aide 2042-C-PRO sur le chemin de production réel (F-006 → RFS → document client).
  // Valeurs posées à la main : takeover = bénéfice avant imputation 649,18 ; déficit d'ouverture 2024 de 1 500 ; imputé 649,18 ;
  // imposable attendu 0 ; reste 1 500 − 649,18 = 850,82. Exercice 2026 : 2024 = N − 2 → 5GI (2016 = 5GA … 2025 = 5GJ).
  const aide = (index: number) => {
    mock.timers.enable({ apis: ["Date"], now: FIXED });
    try {
      const result = (runDeclarationGeneration as (...a: unknown[]) => { status: string; rfs?: unknown })(...GOLDEN[index]![1]());
      assert.equal(result.status, "generated");
      return buildClientSummaryDocument(result.rfs as never);
    } finally {
      mock.timers.reset();
    }
  };

  it("ORACLE AIDE 2042 RICH-TAKEOVER — 5NA = 649,18 (avant imputation) ; 5GI = 1 500 (ouverture 2024), jamais 850,82 ; estimation : imputé 649,18, imposable attendu 0, reste 850,82", () => {
    const doc = aide(3);
    const cases = doc.aide2042.cases;
    assert.equal(cases.find((c) => c.case === "5NA")?.montant, 649.18);
    assert.equal(cases.find((c) => c.case === "5GI")?.montant, 1500);
    assert.equal(cases.some((c) => c.montant === 850.82), false, "le stock de clôture n'est jamais une case déclarative (double imputation)");
    assert.equal(cases.some((c) => c.case === "5NY"), false);
    assert.equal(doc.syntheseFiscale.resultatAvantImputationDeficits, 649.18);
    assert.equal(doc.syntheseFiscale.resultatFiscal, 0, "résultat imposable attendu : information, pas une case");
    assert.equal(doc.aide2042.estimation.totalStockRestantApresImputation, 850.82);
  });

  it("ORACLE AIDE 2042 RICH-NATIVE (déficit) — 5NY = 7 306,98 ; aucune case 5NA ; aucune case 5GA–5GJ pour le même exercice", () => {
    const cases = aide(0).aide2042.cases;
    assert.equal(cases.find((c) => c.case === "5NY")?.montant, 7306.98);
    assert.equal(cases.some((c) => c.case === "5NA"), false);
    assert.equal(cases.some((c) => /^5G[A-J]$/.test(c.case)), false);
  });
});

// ---------------------------------------------------------------------------
// Consolidation multi
// ---------------------------------------------------------------------------

describe("R2C.1 — A, B, D, E : sommes une seule fois, en centimes", () => {
  it("A — revenus A + B comptés une fois (centimes exacts), chacun tracé à son bien", async () => {
    const { result } = await consolidate([[A, BASE_A], [B, BASE_B]]);
    assert.equal(result.status, "ready", JSON.stringify(result.blockingReasons));
    assert.equal(result.inputs!.revenus.totalRecettes, 15000.3);
    assert.equal(result.inputs!.revenus.loyersEncaisses, 15000.3);
    assert.deepEqual(result.ledger.entries.map((entry) => [entry.propertyId, entry.recettes]), [[A, 10000.1], [B, 5000.2]]);
  });

  it("B — charges propres A + B une fois, par catégorie, sans dérive flottante", async () => {
    const { result } = await consolidate([[A, BASE_A], [B, BASE_B]]);
    assert.equal(1234.07 + 4321.11 === 5555.18, false, "précondition : la somme flottante naïve dérive");
    assert.equal(result.inputs!.charges.totalDeductible, 5555.18);
    assert.deepEqual(result.inputs!.charges.parCategorie, { taxe_fonciere: 2100.2, assurance_pno: 900.1 });
  });

  it("D — intérêts A + B une fois", async () => {
    const { result } = await consolidate([[A, BASE_A], [B, BASE_B]]);
    assert.equal(result.inputs!.financement!.totalChargesFinancementExercice, 2710.4);
    assert.equal(result.inputs!.emprunts.length, 2);
  });

  it("E — dotations conservées par bien et sommées une fois ; aucune allocation de l'amortissement exclu", async () => {
    const { result } = await consolidate([[A, BASE_A], [B, BASE_B]]);
    assert.deepEqual(result.ledger.entries.map((entry) => [entry.propertyId, entry.dotationsExercice]), [[A, 4000.1], [B, 2000.2]]);
    assert.equal(result.inputs!.amortissement.totalDotations, 6000.3);
    assert.doesNotMatch(JSON.stringify(result), /amortNonDeduit|base39|allocation/i);
  });

  it("R5 — une seule contribution : identité stricte, aucun aller-retour en centimes", async () => {
    const { result } = await consolidate([[A, { ...BASE_A, recettes: 0.1 + 0.2 }]]);
    assert.equal(result.status, "ready");
    assert.equal(result.inputs!.revenus.totalRecettes, 0.1 + 0.2);
  });
});

describe("R2C.1 — C1, C2 : charges communes et nature non revue", () => {
  it("C1 — une charge commune explicite n'est pas encore supportée : blocage explicite, jamais ventilée", async () => {
    const { result } = await consolidate([[A, BASE_A], [B, BASE_B]], { commonCharges: [{ categorie: "honoraires_comptable", montant: 500 }] });
    assert.equal(result.status, "blocked");
    assert.deepEqual(codes(result), ["common_charges_not_supported"]);
    assert.equal(result.inputs, undefined);
  });

  it("C2 — charges legacy needs_review : bloquant, restent celles de A, jamais transformées en communes", async () => {
    const { result } = await consolidate([[A, BASE_A], [B, BASE_B]], {}, A);
    assert.deepEqual(codes(result), [`charges_nature_needs_review@${A}`]);
    const entryA = result.ledger.entries.find((entry) => entry.propertyId === A)!;
    assert.equal(entryA.chargesDeductibles, 1234.07);
    assert.doesNotMatch(JSON.stringify(result.ledger), /commun/i);
  });
});

describe("R2C.1 — I, AF : déficits globaux", () => {
  it("I — stocks d'ouverture reçus une seule fois, jamais multipliés par le nombre de biens", async () => {
    const { result } = await consolidate([[A, BASE_A], [B, BASE_B]]);
    assert.deepEqual(result.inputs!.stockDeficitsAnterieurs, [{ millesime: 2024, montant: 1234.56 }]);
    assert.equal(result.inputs!.stockAmortissementsReportes, 789.01);
  });

  it("AF — aucune donnée de déficit ni de stock dans une contribution de bien", async () => {
    const { contributions } = await consolidate([[A, BASE_A], [B, BASE_B]]);
    for (const contribution of contributions) assert.doesNotMatch(JSON.stringify(contribution), /deficit|stock/i);
  });
});

describe("R2C.1 — U, Z : financement, clé composite", () => {
  it("U — A.loan-1 et B.loan-1 sont deux prêts distincts : X + Y une fois, clés ledger distinctes, aucun doublon", async () => {
    const { result } = await consolidate([[A, { ...BASE_A, pretIds: ["loan-1"] }], [B, { ...BASE_B, pretIds: ["loan-1"] }]]);
    assert.equal(result.status, "ready", JSON.stringify(result.blockingReasons));
    const keys = result.inputs!.emprunts.map((loan) => loan.key);
    assert.equal(new Set(keys).size, 2);
    assert.deepEqual(result.inputs!.emprunts.map((loan) => [loan.propertyId, loan.pret.pretId]), [[A, "loan-1"], [B, "loan-1"]]);
    const interets = result.inputs!.emprunts.map((loan) => loan.pret.interetsEmpruntExercice);
    assert.deepEqual(interets, [2100.13, 310.27]);
    assert.doesNotMatch(JSON.stringify(result.blockingReasons), /DUPLICATE|duplicate_loan/);
  });

  it("Z — B déclaré sans crédit ne supprime jamais les prêts de A", async () => {
    const { result } = await consolidate([[A, BASE_A], [B, { ...BASE_B, credit: "none" }]]);
    assert.equal(result.status, "ready", JSON.stringify(result.blockingReasons));
    assert.deepEqual(result.inputs!.emprunts.map((loan) => loan.propertyId), [A]);
    assert.equal(result.inputs!.financement!.totalChargesFinancementExercice, 2400.13);
  });

  it("crédit inconnu sur B : bloquant (jamais lu comme « aucun crédit »)", async () => {
    const { result } = await consolidate([[A, BASE_A], [B, { ...BASE_B, credit: "unknown" }]]);
    assert.deepEqual(codes(result), [`credit_state_unknown@${B}`]);
  });

  it("prêt explicitement partagé (même document de prêt sur deux biens) : unsupported_shared_loan, aucune allocation", async () => {
    const { result } = await consolidate([[A, { ...BASE_A, creditDocumentId: "doc-pret" }], [B, { ...BASE_B, creditDocumentId: "doc-pret" }]]);
    assert.deepEqual(codes(result), ["unsupported_shared_loan"]);
  });
});

describe("R2C.1 — X, Y, AB, AA : validations locales AVANT la somme", () => {
  it("X — recouvrement F011/F012 périmé sur A non masqué par l'assurance de B", async () => {
    const { result } = await consolidate([[A, { ...BASE_A, assurance: 300, recouvrementRef: 500 }], [B, { ...BASE_B, assurance: 200 }]]);
    assert.equal(result.status, "blocked");
    assert.ok(result.blockingReasons.some((reason) => reason.propertyId === A && reason.field === "chargesAssistant.recouvrementAssuranceF011"), JSON.stringify(result.blockingReasons));
    assert.equal(result.blockingReasons.some((reason) => reason.propertyId === B), false);
  });

  it("Y — taxe foncière legacy non vérifiée sur A : bloquante, jamais masquée par B", async () => {
    const { result } = await consolidate([[A, { ...BASE_A, taxeFonciereExposed: true }], [B, BASE_B]]);
    assert.deepEqual(codes(result), [`taxe_fonciere_integrity_unresolved@${A}`]);
  });

  it("AB — date de mise en service d'un bien antérieure au début d'activité : bloquant", async () => {
    const { result } = await consolidate([[A, BASE_A], [B, { ...BASE_B, date: "2025-12-01" }]]);
    assert.deepEqual(codes(result), [`service_date_before_activity_start@${B}`]);
  });

  it("date de mise en service absente sur B : bloquant", async () => {
    const { result } = await consolidate([[A, BASE_A], [B, { ...BASE_B, date: undefined }]]);
    assert.deepEqual(codes(result), [`service_date_missing@${B}`]);
  });

  it("AA — aucune date unique inventée : chaque bien garde la sienne, aucune date à l'activité consolidée", async () => {
    const { result } = await consolidate([[A, BASE_A], [B, BASE_B]]);
    assert.equal("dateMiseEnService" in result.inputs!.activity, false);
    assert.deepEqual(result.inputs!.datesMiseEnService, [{ propertyId: A, dateMiseEnService: "2026-03-01" }, { propertyId: B, dateMiseEnService: "2026-06-15" }]);
  });

  it("anomalie revenus bloquante de A conservée avec son bien ; avertissements tracés par bien", async () => {
    const { result } = await consolidate([[A, { ...BASE_A, revenusWarning: "loyer partiel" }], [B, BASE_B]]);
    assert.equal(result.status, "ready");
    assert.deepEqual(result.ledger.entries.find((entry) => entry.propertyId === A)!.revenusAnomalies.map((a) => a.message), ["loyer partiel"]);
    assert.deepEqual(result.ledger.entries.find((entry) => entry.propertyId === B)!.revenusAnomalies, []);
  });
});

describe("R2C.1 — V, 2033-C : reprise + exercice natif", () => {
  it("V — A en reprise, B natif : seuls les frais de A sont neutralisés, ceux de B conservés", async () => {
    const { result } = await consolidate([[A, { ...BASE_A, frais: 15000.37 }, "takeover"], [B, { ...BASE_B, frais: 9000.5 }, "native"]]);
    assert.equal(result.status, "ready", JSON.stringify(result.blockingReasons));
    assert.deepEqual(result.ledger.entries.map((entry) => [entry.propertyId, entry.fraisAcquisitionEnCharges]), [[A, 0], [B, 9000.5]]);
    assert.equal(result.inputs!.fraisAcquisitionEnCharges, 9000.5);
  });

  it("2033-C — A continuation, B première année : distingués par bien (métadonnée), jamais un booléen global", async () => {
    const { result } = await consolidate([[A, { ...BASE_A, date: "2026-03-01" }, "takeover"], [B, BASE_B]]);
    assert.deepEqual(result.ledger.entries.map((entry) => [entry.propertyId, entry.immobilisationMovement]), [[A, "continuation"], [B, "first_service_year"]]);
    assert.equal(result.ledger.immobilisationMovements, "mixed");
  });
});

describe("R2C.1 — S, AG, M, P, AH : pureté, absence de fake data, un seul F006 futur", () => {
  it("S — aucune donnée fabriquée : détail absent d'un bien → détail consolidé inconnu (jamais partiel), ni horodatage ni provenance", async () => {
    const { result } = await consolidate([[A, BASE_A], [B, { ...BASE_B, loyers: undefined, cats: undefined }]]);
    assert.equal(result.inputs!.revenus.loyersEncaisses, undefined);
    assert.equal(result.inputs!.charges.parCategorie, undefined);
    assert.doesNotMatch(JSON.stringify(result.inputs), /computedAt|fieldSources|ConfirmedAt|validatedAt/);
  });

  it("AG — consolidation pure : entrées gelées, inchangées, sortie déterministe", async () => {
    const { buildPropertyFiscalContribution, consolidateFiscalContributions } = await api();
    const views = [bienView(BASE_A), bienView(BASE_B)];
    const deepFreeze = <V>(value: V): V => {
      if (value && typeof value === "object") {
        for (const item of Object.values(value)) deepFreeze(item);
        Object.freeze(value);
      }
      return value;
    };
    views.forEach(deepFreeze);
    const before = JSON.stringify(views);
    const contributions = deepFreeze([A, B].map((propertyId, index) =>
      buildPropertyFiscalContribution({ propertyId, view: views[index]!, fiscalYear: Y, entryMode: "native" })));
    const activity = deepFreeze(ACTIVITY());
    const first = consolidateFiscalContributions(activity as never, contributions);
    const second = consolidateFiscalContributions(activity as never, contributions);
    assert.equal(JSON.stringify(views), before);
    assert.deepEqual(first, second);
  });

  it("M — les entrées consolidées ne sont PAS des FiscalEngineInputs : aucun F006 possible avant le seam R2C.3", async () => {
    const { result } = await consolidate([[A, BASE_A], [B, BASE_B]]);
    const inputs = result.inputs!;
    // @ts-expect-error — un ConsolidatedFiscalInputs n'est pas assignable aux entrées F006 (pas de date unique).
    const asEngine: FiscalEngineInputs = inputs;
    assert.equal("activite" in asEngine, false);
    for (const file of ["src/lib/lmnp/dossier/fiscal-consolidation.ts", "src/lib/lmnp/services/declaration/generation-inputs.ts"]) {
      assert.doesNotMatch(source(file), /produceFiscalResult|buildFiscalRepresentation|assembleLiasseFromRfs/, file);
    }
  });

  it("P — aucun properties[0] / propertyIds[0] ni repli mono dans le nouveau chemin", () => {
    for (const file of ["src/lib/lmnp/dossier/fiscal-consolidation.ts", "src/lib/lmnp/services/declaration/generation-inputs.ts", "src/runtime/capabilities/f006/cents.ts"]) {
      assert.doesNotMatch(source(file), /properties\[0\]|propertyIds\[0\]|resolveMonoPropertyId|resolveMonoProperty\(/, file);
    }
  });

  it("AH — montant non fini sur un bien : bloquant (jamais NaN dans les entrées consolidées)", async () => {
    const { result } = await consolidate([[A, { ...BASE_A, recettes: Number.NaN }], [B, BASE_B]]);
    assert.ok(codes(result).includes(`non_finite_amount@${A}`), JSON.stringify(result.blockingReasons));
    assert.equal(result.inputs, undefined);
  });
});

describe("R2C.1 — cents : helper pur", () => {
  it("somme en centimes entiers, identité pour un seul terme", async () => {
    const { sumEuros, toCents, fromCents } = await api();
    assert.equal(sumEuros([0.1, 0.2]), 0.3);
    assert.equal(sumEuros([1234.07, 4321.11]), 5555.18);
    assert.equal(sumEuros([0.1 + 0.2]), 0.1 + 0.2);
    assert.equal(fromCents(toCents(1234.56)), 1234.56);
  });
});

// ---------------------------------------------------------------------------
// T — collecte depuis un workspace : portée de bien fail-closed
// ---------------------------------------------------------------------------

async function scopedWorkspace(): Promise<LmnpState> {
  const ws = await representativeMonoWorkspaces();
  const legacy: LmnpState = { ...ws.f014, fileRegistry: new Map() };
  const scoped = lmnpReducer(legacy, { type: "ADD_PROPERTY", property: PROPERTY_B });
  assert.ok(scoped.declarationDraft?.biens, "précondition : dossier scopé");
  return scoped;
}

describe("R2C.1 — T : collecte par bien, ambiguïté fail-closed", () => {
  it("T — biens de l'exercice incohérents : bloqué, aucune contribution", async () => {
    const { collectPropertyFiscalContributions } = await api();
    const scoped = await scopedWorkspace();
    const broken = { ...scoped, fiscalYear: { ...scoped.fiscalYear, propertyIds: [A] } };
    const collected = collectPropertyFiscalContributions(broken, { entryModes: { [A]: "native", [B]: "native" } });
    assert.equal(collected.status, "blocked");
  });

  it("T — document non attribué : bloqué", async () => {
    const { collectPropertyFiscalContributions } = await api();
    const scoped = await scopedWorkspace();
    const orphan = { id: "doc-x", fiscalYearId: scoped.fiscalYear.id, fileName: "x.pdf", mimeType: "application/pdf", sizeBytes: 1, category: "charges", documentType: "unknown", status: "analyzed", uploadedAt: T, propertyId: "fantome" } as unknown as LmnpDocument;
    const collected = collectPropertyFiscalContributions({ ...scoped, documents: [...scoped.documents, orphan] }, { entryModes: { [A]: "native", [B]: "native" } });
    assert.equal(collected.status, "blocked");
    assert.ok(collected.status === "blocked" && collected.reasons.some((reason) => reason.code === "unattributed_documents"));
  });

  it("T — mode d'entrée d'un bien non fourni : bloqué (jamais supposé natif)", async () => {
    const { collectPropertyFiscalContributions } = await api();
    const collected = collectPropertyFiscalContributions(await scopedWorkspace(), { entryModes: { [A]: "native" } });
    assert.equal(collected.status, "blocked");
    assert.ok(collected.status === "blocked" && collected.reasons.some((reason) => reason.code === "entry_mode_unknown" && reason.propertyId === B));
  });

  it("T — scopé cohérent : une contribution par bien, dans l'ordre de l'exercice, chacune issue de SA vue", async () => {
    const { collectPropertyFiscalContributions, buildFiscalEngineInputs, draftAmortissementForGeneration } = await api();
    const scoped = await scopedWorkspace();
    const collected = collectPropertyFiscalContributions(scoped, { entryModes: { [A]: "native", [B]: "native" } });
    assert.equal(collected.status, "collected");
    if (collected.status !== "collected") return;
    assert.deepEqual(collected.contributions.map((contribution) => contribution.propertyId), scoped.fiscalYear.propertyIds);
    const contributionB = collected.contributions.find((contribution) => contribution.propertyId === B)!;
    assert.equal(contributionB.engine.revenusAssistant, undefined, "B ne reçoit rien de A");
    const legacy = (await representativeMonoWorkspaces()).f014;
    const mono = collectPropertyFiscalContributions(legacy, { entryModes: { [A]: "native" } });
    assert.equal(mono.status, "collected");
    if (mono.status !== "collected") return;
    const draft = legacy.declarationDraft;
    const { stockDeficitsAnterieurs, stockAmortissementsReportes, ...expected } = buildFiscalEngineInputs({
      draft, fiscalYear: legacy.fiscalYear.year, amortissementAssistant: draftAmortissementForGeneration(draft), usesTakeoverHistory: false,
    });
    assert.equal(stockDeficitsAnterieurs ?? stockAmortissementsReportes, undefined);
    assert.deepEqual(mono.contributions[0]!.engine, expected, "legacy mono : contribution = entrées F006 historiques (hors stocks globaux)");
  });
});
