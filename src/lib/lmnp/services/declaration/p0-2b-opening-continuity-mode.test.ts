/**
 * P0-2B — continuité EXTERNAL_HISTORY pilotée par Opening, pas par MES draft.
 *
 * Oracles A/B/C : Opening historique + draft.dateMiseEnService ∈ N.
 * Oracle D : vrai premier exercice sans Opening — comportement inchangé.
 *
 * Run: npx tsx --test src/lib/lmnp/services/declaration/p0-2b-opening-continuity-mode.test.ts
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
  reconcileImmobilisationsContinuity,
  snapshotImmobilisationsFromGeneratedRfs,
} from "@/lib/lmnp/services/dossier/immobilisations-comptables";
import type { DeclarationDraft } from "@/lib/lmnp/types";
import type { ComposantNouveau } from "@/runtime/capabilities/f012/types";
import { computeAmortizationPlan } from "@/runtime/capabilities/f010/compute-amortization-plan";

const FY = 2025;
const NOW = "2026-01-15T00:00:00.000Z";
const PROP = "prop-1";
/** MES draft volontairement dans l'exercice N — contamination P0-2B. */
const MES_IN_N = `${FY}-03-15`;

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
    openingId: "opening-p0-2b",
    revision: 1,
    targetFiscalYear: FY,
    dossierId: "dossier-p0-2b",
    source: {
      kind: "external_takeover",
      takeoverId: "takeover-p0-2b",
      sourceFiscalYear: FY - 1,
    },
    stocks: {
      deficits: available([]),
      amortissementsReportes: available(0),
    },
    assets: available(assets),
    loans: unavailable("hors scope P0-2B"),
    patrimoine: {
      ouvertureCompteExploitant: unavailable("hors scope"),
      ran: unavailable("hors scope"),
      tresorerieOuverture: unavailable("hors scope"),
    },
    properties: available([{ propertyId: PROP, label: "Bien P0-2B" }]),
    identity: unavailable("hors scope"),
    provenance: {
      source: { fieldPath: "source", sourceKind: "external", sourceRef: "takeover-p0-2b" },
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
    validator: "p0-2b-test",
  };
  return opening;
}

/** Opening historique C0 = 0 (cumul ouverture nul). */
function openingC0Zero(): FiscalYearOpening {
  return validatedOpening([
    linearAsset({
      id: "asset-a",
      label: "Actif A",
      brut: 100_000,
      cumul: 0,
      startDate: "2024-01-01",
      durationYears: 20,
    }),
    linearAsset({
      id: "asset-b",
      label: "Actif B",
      brut: 10_000,
      cumul: 0,
      startDate: "2024-01-01",
      durationYears: 5,
    }),
  ]);
}

/** Opening historique C0 > 0. */
function openingC0Positive(): FiscalYearOpening {
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

function draftWithMesInN(overrides: Partial<DeclarationDraft> = {}): DeclarationDraft {
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
      plan: {
        lignes: [
          {
            label: "Logement F-010 divergent",
            montant: 200_000,
            dureeAnnees: 30,
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
    dateMiseEnService: MES_IN_N,
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

describe("P0-2B — Opening continuity mode (MES draft ∈ N)", () => {
  it("ORACLE A — C0=0 + MES∈N → exercice_ulterieur ; 490/570 = ouverture ; historiques ≠ acquisitions N", () => {
    const opening = openingC0Zero();
    const dep = resolveOpeningDepreciation({ opening, expectedExerciceFiscal: FY });
    assert.equal(dep.status, "ready", JSON.stringify(dep));
    if (dep.status !== "ready") return;
    const applied = applyResolvedOpeningDepreciation({ resolved: dep });
    assert.equal(applied.ok, true);
    if (!applied.ok) return;

    const gen = runDeclarationGeneration(
      draftWithMesInN(),
      FY,
      undefined,
      undefined,
      undefined,
      { propertyId: PROP, composantsF012Merged: [ACQUISITION_C] },
      opening,
    );
    assert.equal(gen.status, "generated", JSON.stringify(gen));
    if (gen.status !== "generated") return;

    const immo = gen.rfs.immobilisations!;
    assert.ok(immo.mouvements);
    assert.equal(immo.mouvements!.valeurBruteOuverture, 110_000);
    assert.equal(immo.mouvements!.amortissementsCumulesOuverture, 0);

    const rec = reconcileImmobilisationsContinuity({
      immobilisations: immo,
      exercice: FY,
      amortCalcule: gen.rfs.fiscalResult.amortCalcule,
    });
    assert.equal(rec.status, "ok");
    if (rec.status !== "ok") return;
    assert.equal(rec.mode, "exercice_ulterieur");
    // Acquisitions N = F-012 C uniquement — pas le brut historique.
    assert.equal(rec.acquisitionsExercice, 12_000);

    const formC = gen.liasseRfs.form2033C;
    assert.equal(caseValue(formC, "490"), 110_000, "490 = brut ouverture Opening");
    assert.equal(caseValue(formC, "570"), 0, "570 = C0 ouverture");
    assert.equal(caseValue(formC, "492"), 12_000, "492 = acquisitions N seules");
    assert.notEqual(caseValue(formC, "492"), 122_000, "historiques ne sont pas des acquisitions N");
  });

  it("ORACLE B — C0>0 + MES∈N → generated ; exercice_ulterieur ; 2033-C conforme Opening", () => {
    const opening = openingC0Positive();
    const gen = runDeclarationGeneration(
      draftWithMesInN(),
      FY,
      undefined,
      undefined,
      undefined,
      { propertyId: PROP, composantsF012Merged: [ACQUISITION_C] },
      opening,
    );
    assert.equal(gen.status, "generated", JSON.stringify(gen));
    if (gen.status !== "generated") return;

    const immo = gen.rfs.immobilisations!;
    const rec = reconcileImmobilisationsContinuity({
      immobilisations: immo,
      exercice: FY,
      amortCalcule: gen.rfs.fiscalResult.amortCalcule,
    });
    assert.equal(rec.status, "ok");
    if (rec.status !== "ok") return;
    assert.equal(rec.mode, "exercice_ulterieur");

    assert.equal(immo.mouvements?.valeurBruteOuverture, 110_000);
    assert.equal(immo.mouvements?.amortissementsCumulesOuverture, 24_000);

    const formC = gen.liasseRfs.form2033C;
    assert.equal(caseValue(formC, "490"), 110_000);
    assert.equal(caseValue(formC, "570"), 24_000);
    assert.equal(caseValue(formC, "492"), 12_000);
    assert.equal(caseValue(formC, "496"), 122_000);
    assert.equal(caseValue(formC, "576"), 32_000);
  });

  it("ORACLE C — snapshot : actifs historiques restent provenance historique malgré MES∈N", () => {
    const opening = openingC0Positive();
    const gen = runDeclarationGeneration(
      draftWithMesInN(),
      FY,
      undefined,
      undefined,
      undefined,
      { propertyId: PROP, composantsF012Merged: [ACQUISITION_C] },
      opening,
    );
    assert.equal(gen.status, "generated", JSON.stringify(gen));
    if (gen.status !== "generated") return;

    const snap = snapshotImmobilisationsFromGeneratedRfs({
      immobilisations: gen.rfs.immobilisations,
      exerciceFiscal: FY,
      propertyId: PROP,
    });
    assert.ok(snap);
    const snapA = snap!.actifs.find((a) => a.id === "asset-a");
    const snapB = snap!.actifs.find((a) => a.id === "asset-b");
    const snapC = snap!.actifs.find((a) => a.id === "asset-c");
    assert.ok(snapA);
    assert.ok(snapB);
    assert.ok(snapC);
    assert.equal(snapA!.provenance, "historique");
    assert.equal(snapB!.provenance, "historique");
    assert.equal(snapC!.provenance, "acquisition_exercice");
  });

  it("ORACLE D — premier exercice réel sans Opening : comportement inchangé", () => {
    const computed = computeAmortizationPlan({
      prixAcquisition: 250_000,
      mobilierInclus: false,
      fraisNotaire: 0,
      choixTraitementFrais: "deduction",
      typeBien: "appartement",
      ratioTerrain: 0.2,
      dateMiseEnService: MES_IN_N,
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
      dateMiseEnService: MES_IN_N,
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

    const immo = gen.rfs.immobilisations!;
    assert.equal(immo.mouvements, undefined, "pas de mouvements Opening en premier exercice");

    const rec = reconcileImmobilisationsContinuity({
      immobilisations: immo,
      exercice: FY,
      amortCalcule: gen.rfs.fiscalResult.amortCalcule,
    });
    assert.equal(rec.status, "ok");
    if (rec.status !== "ok") return;
    assert.equal(rec.mode, "premier_exercice");

    const formC = gen.liasseRfs.form2033C;
    assert.equal(caseValue(formC, "490"), 0);
    assert.equal(caseValue(formC, "570"), 0);
    const brut = caseValue(formC, "496");
    assert.equal(caseValue(formC, "492"), brut, "premier exercice ⇒ 492 = brut fin");
  });
});
