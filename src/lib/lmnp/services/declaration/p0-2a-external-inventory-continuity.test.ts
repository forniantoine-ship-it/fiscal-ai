/**
 * P0-2A — inventaire EXTERNAL_HISTORY = Opening validé + acquisitions N.
 *
 * Oracle A+B (historique) + C (acquisition F-012) ; F-010 volontairement
 * divergent à 200 000 € pour prouver qu'il n'écrase pas l'Opening.
 *
 * Run: npx tsx --test src/lib/lmnp/services/declaration/p0-2a-external-inventory-continuity.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { runDeclarationGeneration } from "@/lib/lmnp/services/declaration/run-declaration-generation";
import {
  applyResolvedOpeningDepreciation,
  resolveOpeningDepreciation,
  type FiscalYearOpening,
  type OpeningAsset,
} from "@/lib/lmnp/services/fiscal-year-opening";
import { computeOpeningContentHash } from "@/lib/lmnp/services/fiscal-year-opening/content-hash";
import { available, unavailable } from "@/lib/lmnp/services/fiscal-year-opening/opening-fact";
import {
  assertHistoricalInventoryMatchesApplied,
  composeExternalHistoryImmobilisationsRfs,
  EXTERNAL_HISTORY_F012_ACQUISITION_INCOHERENT,
  EXTERNAL_HISTORY_INVENTORY_MISMATCH,
} from "@/lib/lmnp/services/dossier/compose-external-history-immobilisations";
import { snapshotImmobilisationsFromGeneratedRfs } from "@/lib/lmnp/services/dossier/immobilisations-comptables";
import type { DeclarationDraft } from "@/lib/lmnp/types";
import type { ComposantNouveau } from "@/runtime/capabilities/f012/types";
import { computeAmortizationPlan } from "@/runtime/capabilities/f010/compute-amortization-plan";

const FY = 2025;
const NOW = "2026-01-15T00:00:00.000Z";
const PROP = "prop-1";

function linearAsset(params: {
  id: string;
  label: string;
  brut: number;
  cumul: number;
  startDate: string;
  durationYears: number;
}): OpeningAsset {
  return {
    id: params.id,
    propertyId: PROP,
    label: params.label,
    categorie: "composant",
    origin: "historique",
    coutBrut: available(params.brut),
    cumulOuverture: available(params.cumul),
    plan: available({
      kind: "amortizable",
      startDate: params.startDate,
      durationYears: params.durationYears,
      prorataConvention: "annuel_plein",
    }),
  };
}

function validatedOpening(assets: OpeningAsset[]): FiscalYearOpening {
  const opening: FiscalYearOpening = {
    openingId: "opening-p0-2a",
    revision: 1,
    targetFiscalYear: FY,
    dossierId: "dossier-p0-2a",
    source: {
      kind: "external_takeover",
      takeoverId: "takeover-p0-2a",
      sourceFiscalYear: FY - 1,
    },
    stocks: {
      deficits: available([]),
      amortissementsReportes: available(0),
    },
    assets: available(assets),
    loans: unavailable("hors scope P0-2A"),
    patrimoine: {
      ouvertureCompteExploitant: unavailable("hors scope"),
      ran: unavailable("hors scope"),
      tresorerieOuverture: unavailable("hors scope"),
    },
    properties: available([{ propertyId: PROP, label: "Bien P0-2A" }]),
    identity: unavailable("hors scope"),
    provenance: {
      source: { fieldPath: "source", sourceKind: "external", sourceRef: "takeover-p0-2a" },
      "stocks.deficits": { fieldPath: "stocks.deficits", sourceKind: "external" },
      "stocks.amortissementsReportes": {
        fieldPath: "stocks.amortissementsReportes",
        sourceKind: "external",
      },
    },
    validation: { status: "pending" },
  };
  opening.validation = {
    status: "validated",
    openingRevision: opening.revision,
    contentHash: computeOpeningContentHash(opening),
    validatedAt: NOW,
    validator: "p0-2a-test",
  };
  return opening;
}

/** Opening A+B — valeurs oracle exactes. */
function openingAB(): FiscalYearOpening {
  return validatedOpening([
    linearAsset({
      id: "asset-a",
      label: "Actif A",
      brut: 100_000,
      cumul: 20_000,
      startDate: "2010-01-01",
      durationYears: 20,
    }),
    linearAsset({
      id: "asset-b",
      label: "Actif B",
      brut: 10_000,
      cumul: 4_000,
      startDate: "2021-01-01",
      durationYears: 5,
    }),
  ]);
}

const ACQUISITION_C: ComposantNouveau = {
  id: "asset-c",
  label: "Acquisition C",
  montant: 12_000,
  dureeAnnees: 12,
  dotationAnnuelle: 1_000,
  nature: "amélioration",
  dateDebut: `${FY}-01-01`,
  origin: "f012_travaux",
};

/**
 * Draft avec F-010 volontairement divergent (brut 200 000) — même dotation
 * historique possible par coïncidence pour exercer la garde anti-S3.
 */
function divergentDraft(overrides: Partial<DeclarationDraft> = {}): DeclarationDraft {
  return {
    completedSteps: [],
    inpiConfirmedAt: NOW,
    logementConfirmedAt: NOW,
    logementAmortissement: {
      computedAt: NOW,
      prixRevient: 200_000,
      valeurTerrain: 0,
      valeurBati: 200_000,
      baseAmortissableBati: 200_000,
      montantMobilier: 0,
      dotationAnnuelle: 7_000,
      dureeMoyenneAnnees: 30,
      // F-010 reconstruit un logement à 200 000 — incompatible avec A+B.
      plan: {
        lignes: [
          {
            label: "Logement F-010 divergent",
            montant: 200_000,
            dureeAnnees: 30,
            // Même DN totale que A+B (7000) — trou S3 historique.
            dotationExercice: 7_000,
            amortissementsCumules: 7_000,
            vnc: 193_000,
            id: "f010-0",
          },
        ],
        totalAnnuelExercice: 7_000,
        totalBrut: 200_000,
      },
    } as DeclarationDraft["logementAmortissement"],
    creditDeclaredNoneAt: NOW,
    revenusConfirmedAt: NOW,
    chargesConfirmedAt: NOW,
    amortissementConfirmedAt: NOW,
    siret: "12345678901234",
    siren: "123456789",
    exploitantFirstName: "Marie",
    exploitantLastName: "Dupont",
    // Exercice ultérieur → mouvements 490/570 depuis Opening.
    dateMiseEnService: "2010-01-01",
    revenusAssistant: { exerciceFiscal: FY, totalRecettes: 18_000 },
    chargesAssistant: {
      exerciceFiscal: FY,
      totalDeductible: 4_000,
      totalPreExploitation: 0,
      composantsNouveaux: [ACQUISITION_C],
    },
    amortissementAssistant: {
      exerciceFiscal: FY,
      totalDotations: 9_999,
      status: "validated",
    },
    ...overrides,
  } as DeclarationDraft;
}

function caseValue(
  form: { cases: { caseId: string; value?: unknown }[] },
  caseId: string,
): number | undefined {
  const v = form.cases.find((c) => c.caseId === caseId)?.value;
  return typeof v === "number" ? v : undefined;
}

describe("P0-2A — oracle A+B+C EXTERNAL_HISTORY", () => {
  it("Opening A+B + acquisition C ; F-010 200k n'écrase pas ; RFS/Cerfa/snapshot corrects", () => {
    const opening = openingAB();

    const dep = resolveOpeningDepreciation({
      opening,
      expectedExerciceFiscal: FY,
    });
    assert.equal(dep.status, "ready", JSON.stringify(dep));
    if (dep.status !== "ready") return;
    const applied = applyResolvedOpeningDepreciation({ resolved: dep });
    assert.equal(applied.ok, true, JSON.stringify(applied));
    if (!applied.ok) return;
    assert.equal(applied.plan.totalBrut, 110_000);
    assert.equal(applied.plan.totalAnnuelExercice, 7_000);

    const gen = runDeclarationGeneration(
      divergentDraft(),
      FY,
      undefined,
      undefined,
      undefined,
      { propertyId: PROP, composantsF012Merged: [ACQUISITION_C] },
      opening,
    );
    assert.equal(gen.status, "generated", JSON.stringify(gen));
    if (gen.status !== "generated") return;

    // 1 — F006 utilise Opening (+ DN F-012 C)
    assert.equal(gen.rfs.fiscalResult.amortCalcule, 8_000);
    assert.notEqual(gen.rfs.fiscalResult.amortCalcule, 9_999);

    const immo = gen.rfs.immobilisations;
    assert.ok(immo, "RFS immobilisations requise");

    // 2 — F-010 divergent n'écrase pas
    assert.equal(immo!.totalBrut, 110_000);
    assert.notEqual(immo!.totalBrut, 200_000);
    assert.equal(
      immo!.lignes.some((l) => l.label.includes("F-010 divergent")),
      false,
    );

    // 3/4 — RFS = A+B ; ids préservés
    const ligneA = immo!.lignes.find((l) => l.id === "asset-a");
    const ligneB = immo!.lignes.find((l) => l.id === "asset-b");
    assert.ok(ligneA);
    assert.ok(ligneB);
    assert.equal(ligneA!.montant, 100_000);
    assert.equal(ligneA!.amortissementsCumules, 25_000);
    assert.equal(ligneA!.dotationExercice, 5_000);
    assert.equal(ligneB!.montant, 10_000);
    assert.equal(ligneB!.amortissementsCumules, 6_000);
    assert.equal(ligneB!.dotationExercice, 2_000);

    // 5 — C acquisition N
    const detailC = immo!.composantsDetail?.find((d) => d.id === "asset-c");
    assert.ok(detailC);
    assert.equal(detailC!.provenance, "acquisition_exercice");
    assert.equal(detailC!.montant, 12_000);
    assert.equal(detailC!.dotationExercice, 1_000);
    assert.equal(detailC!.amortissementsCumules, 1_000);

    // 6/7/8 — totaux clôture
    const brutCloture = 122_000;
    const cumulCloture = 32_000;
    assert.equal(immo!.totalBrut + (immo!.valeurTerrain ?? 0) + 12_000, brutCloture);
    const cumulLignes = immo!.lignes.reduce((a, l) => a + l.amortissementsCumules, 0);
    assert.equal(cumulLignes + 1_000, cumulCloture);

    // Mouvements opening vs acquisition
    assert.equal(immo!.mouvements?.valeurBruteOuverture, 110_000);
    assert.equal(immo!.mouvements?.amortissementsCumulesOuverture, 24_000);

    // 9 — 2033-A 028/030
    const formA = gen.liasseRfs.form2033A;
    assert.equal(caseValue(formA, "028"), 122_000);
    assert.equal(caseValue(formA, "030"), 32_000);

    // 10/11 — 2033-C
    const formC = gen.liasseRfs.form2033C;
    assert.equal(caseValue(formC, "490"), 110_000);
    assert.equal(caseValue(formC, "492"), 12_000);
    assert.equal(caseValue(formC, "496"), 122_000);
    assert.equal(caseValue(formC, "570"), 24_000);
    assert.equal(caseValue(formC, "576"), 32_000);

    // 12 — snapshot clôture A+B+C
    const snap = snapshotImmobilisationsFromGeneratedRfs({
      immobilisations: immo,
      exerciceFiscal: FY,
      propertyId: PROP,
    });
    assert.ok(snap);
    assert.equal(snap!.brutCloture, 122_000);
    assert.equal(snap!.amortissementsCumulesCloture, 32_000);
    assert.equal(snap!.vncCloture, 90_000);
    const snapA = snap!.actifs.find((a) => a.id === "asset-a");
    const snapB = snap!.actifs.find((a) => a.id === "asset-b");
    const snapC = snap!.actifs.find((a) => a.id === "asset-c");
    assert.ok(snapA);
    assert.ok(snapB);
    assert.ok(snapC);
    assert.equal(snapA!.coutBrut, 100_000);
    assert.equal(snapA!.amortissementCumule, 25_000);
    assert.equal(snapB!.coutBrut, 10_000);
    assert.equal(snapB!.amortissementCumule, 6_000);
    assert.equal(snapC!.coutBrut, 12_000);
    assert.equal(snapC!.amortissementCumule, 1_000);
    assert.equal(snapC!.provenance, "acquisition_exercice");
  });
});

describe("P0-2A — parcours natif sans EXTERNAL_HISTORY", () => {
  it("F-010 reste la source RFS quand aucune Opening n'est fournie", () => {
    const computed = computeAmortizationPlan({
      prixAcquisition: 250_000,
      mobilierInclus: false,
      fraisNotaire: 0,
      choixTraitementFrais: "deduction",
      typeBien: "appartement",
      ratioTerrain: 0.2,
      dateMiseEnService: `${FY}-01-01`,
      exerciceFiscal: FY,
    });

    const draft: DeclarationDraft = {
      completedSteps: [],
      inpiConfirmedAt: NOW,
      logementConfirmedAt: NOW,
      logementAmortissement: {
        computedAt: NOW,
        prixRevient: computed.prixRevient,
        valeurTerrain: computed.valeurTerrain,
        valeurBati: computed.valeurBati,
        baseAmortissableBati: computed.baseAmortissableBati,
        montantMobilier: computed.montantMobilierIsole,
        dotationAnnuelle: computed.plan.totalAnnuelExercice,
        dureeMoyenneAnnees: 30,
        plan: computed.plan,
      } as DeclarationDraft["logementAmortissement"],
      creditDeclaredNoneAt: NOW,
      revenusConfirmedAt: NOW,
      chargesConfirmedAt: NOW,
      amortissementConfirmedAt: NOW,
      siret: "12345678901234",
      siren: "123456789",
      exploitantFirstName: "Jean",
      exploitantLastName: "Native",
      dateMiseEnService: `${FY}-01-01`,
      revenusAssistant: { exerciceFiscal: FY, totalRecettes: 12_000 },
      chargesAssistant: { exerciceFiscal: FY, totalDeductible: 2_000, totalPreExploitation: 0 },
      amortissementAssistant: {
        exerciceFiscal: FY,
        totalDotations: computed.plan.totalAnnuelExercice,
        status: "validated",
      },
    } as DeclarationDraft;

    const gen = runDeclarationGeneration(draft, FY);
    assert.equal(gen.status, "generated", JSON.stringify(gen));
    if (gen.status !== "generated") return;

    assert.ok(gen.rfs.immobilisations);
    assert.equal(gen.rfs.immobilisations!.totalBrut, computed.plan.totalBrut);
    assert.equal(gen.rfs.immobilisations!.valeurTerrain, computed.valeurTerrain);
    assert.equal(
      gen.rfs.immobilisations!.totalAnnuelExercice,
      computed.plan.totalAnnuelExercice,
    );
    // Pas de mouvements Opening forcés sur le parcours natif premier exercice.
    assert.equal(gen.rfs.fiscalResult.amortCalcule, computed.plan.totalAnnuelExercice);
  });
});

describe("P0-2A — fail-closed", () => {
  it("Opening historique présent mais non projectable → blocked, jamais fallback F-010", () => {
    // Cumul > brut → resolve/apply bloque.
    const opening = validatedOpening([
      linearAsset({
        id: "asset-bad",
        label: "Cassé",
        brut: 10_000,
        cumul: 50_000,
        startDate: "2015-01-01",
        durationYears: 20,
      }),
    ]);

    const gen = runDeclarationGeneration(
      divergentDraft({ chargesAssistant: { exerciceFiscal: FY, totalDeductible: 4_000, totalPreExploitation: 0 } }),
      FY,
      undefined,
      undefined,
      undefined,
      undefined,
      opening,
    );
    assert.equal(gen.status, "blocked");
    if (gen.status !== "blocked") return;
    assert.ok(
      gen.anomalies.some((a) =>
        /CUMUL_EXCEEDS_BRUT|CUMUL_EXCEEDS_BASE|CONTINUE_PLAN/.test(a.message),
      ),
    );
    // Aucune RFS publiée avec le F-010 à 200 000.
    assert.equal("rfs" in gen && (gen as { rfs?: unknown }).rfs, false);
  });
});

describe("P0-2A — garde anti-S3", () => {
  it("F-010 divergent même DN que Opening → jamais publié ; garde détecte un inventaire faux", () => {
    const opening = openingAB();
    const dep = resolveOpeningDepreciation({ opening, expectedExerciceFiscal: FY });
    assert.equal(dep.status, "ready");
    if (dep.status !== "ready") return;
    const applied = applyResolvedOpeningDepreciation({ resolved: dep });
    assert.equal(applied.ok, true);
    if (!applied.ok) return;

    // Pipeline réel : F-010 200k + même DN → Opening gagne.
    const gen = runDeclarationGeneration(
      divergentDraft({
        chargesAssistant: {
          exerciceFiscal: FY,
          totalDeductible: 4_000,
          totalPreExploitation: 0,
          composantsNouveaux: [ACQUISITION_C],
        },
      }),
      FY,
      undefined,
      undefined,
      undefined,
      { propertyId: PROP, composantsF012Merged: [ACQUISITION_C] },
      opening,
    );
    assert.equal(gen.status, "generated");
    if (gen.status !== "generated") return;
    assert.equal(gen.rfs.immobilisations?.totalBrut, 110_000);
    assert.equal(caseValue(gen.liasseRfs.form2033A, "028"), 122_000);

    // Garde unitaire : inventaire F-010 forgé vs Opening → mismatch.
    const forged = composeExternalHistoryImmobilisationsRfs({
      appliedPlan: {
        lignes: [
          {
            label: "Fake",
            montant: 200_000,
            dureeAnnees: 30,
            dotationExercice: 7_000,
            amortissementsCumules: 31_000,
            vnc: 169_000,
            id: "fake-f010",
          },
        ],
        totalAnnuelExercice: 7_000,
        totalBrut: 200_000,
      },
      terrainBrut: 0,
      exerciceFiscal: FY,
      dateMiseEnService: "2010-01-01",
    });
    const guard = assertHistoricalInventoryMatchesApplied({
      immobilisations: forged,
      appliedPlan: applied.plan,
    });
    assert.equal(guard.ok, false);
    if (guard.ok) return;
    assert.equal(guard.code, EXTERNAL_HISTORY_INVENTORY_MISMATCH);
  });
});

describe("P0-2A.1 — résidus contamination / silence", () => {
  it("fraisEnCharges draft F-010 ne contamine pas F-006 sous EXTERNAL_HISTORY", () => {
    const FRAIS_FUITE = 19_500;
    const base = divergentDraft();
    const gen = runDeclarationGeneration(
      {
        ...base,
        logementAmortissement: {
          ...base.logementAmortissement!,
          fraisEnCharges: FRAIS_FUITE,
        },
      },
      FY,
      undefined,
      undefined,
      undefined,
      { propertyId: PROP, composantsF012Merged: [ACQUISITION_C] },
      openingAB(),
    );
    assert.equal(gen.status, "generated", JSON.stringify(gen));
    if (gen.status !== "generated") return;

    // Draft totalDeductible = 4000 ; sans fuite frais → chargesExploitation = 4000.
    assert.equal(gen.rfs.fiscalResult.charges.fraisAcquisitionEnCharges, 0);
    assert.equal(gen.rfs.fiscalResult.charges.chargesExploitation, 4_000);
    assert.notEqual(
      gen.rfs.fiscalResult.charges.chargesExploitation,
      4_000 + FRAIS_FUITE,
      "fraisEnCharges draft ne doit pas gonfler chargesExploitation",
    );
  });

  it("acquisition F-012 incohérente avec l'exercice → blocked, jamais absente de la RFS", () => {
    const INCOHERENT: ComposantNouveau = {
      id: "asset-orphan-2023",
      label: "Travaux année incohérente",
      montant: 5_000,
      dureeAnnees: 10,
      dotationAnnuelle: 500,
      nature: "amélioration",
      // Exercice = 2025 ; dateDebut hors N et hors Opening → incohérent.
      dateDebut: "2023-06-01",
      origin: "f012_travaux",
    };

    const gen = runDeclarationGeneration(
      divergentDraft({
        chargesAssistant: {
          exerciceFiscal: FY,
          totalDeductible: 4_000,
          totalPreExploitation: 0,
          composantsNouveaux: [ACQUISITION_C, INCOHERENT],
        },
      }),
      FY,
      undefined,
      undefined,
      undefined,
      { propertyId: PROP, composantsF012Merged: [ACQUISITION_C, INCOHERENT] },
      openingAB(),
    );

    assert.equal(gen.status, "blocked");
    if (gen.status !== "blocked") return;
    assert.ok(
      gen.anomalies.some((a) => a.message.includes(EXTERNAL_HISTORY_F012_ACQUISITION_INCOHERENT)),
      JSON.stringify(gen.anomalies),
    );
    assert.ok(
      gen.anomalies.some((a) => a.message.includes("asset-orphan-2023")),
      "l'id incohérent doit être tracé — pas un silence",
    );
    // Aucune RFS publiée sans l'actif (pas de disparition silencieuse).
    assert.equal("rfs" in gen && (gen as { rfs?: unknown }).rfs, false);
  });
});
