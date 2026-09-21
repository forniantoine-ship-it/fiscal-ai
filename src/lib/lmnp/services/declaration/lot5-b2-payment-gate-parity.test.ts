/**
 * Lot 5 B2 final — payment gate continuity + first-year regression guards.
 *
 * Run:
 * NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=test \
 *   npx tsx --test src/lib/lmnp/services/declaration/lot5-b2-payment-gate-parity.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { computeAmortizationPlan } from "@/runtime/capabilities/f010/compute-amortization-plan";
import { composePlanAmortissement } from "@/runtime/capabilities/f014/compose-plan-amortissement";
import { map2033CFromRfs } from "@/runtime/capabilities/rfs/projection/map-2033c";
import type { ComposantNouveau } from "@/runtime/capabilities/f012/types";
import type { DeclarationDraft, Property } from "@/lib/lmnp/types/domain";
import { resolveDeclarationGenerationGate } from "./declaration-generation-gate";
import {
  IMMOBILISATIONS_CONTINUITY_RECONCILIATION_FAILED,
  runDeclarationGeneration,
} from "./run-declaration-generation";
import { resolveImmobilisationsContinuityForGeneration } from "@/lib/lmnp/services/dossier/fiscal-year-cycle";
import { aliceDraft } from "./alice-test-draft";

const NOW = "2026-09-01T00:00:00.000Z";
const PROPERTY: Property = {
  id: "prop-1",
  label: "Bien",
  address: "1 rue X",
  city: "Lyon",
  postalCode: "69000",
};

function identity() {
  return {
    siret: "12345678901234",
    siren: "123456789",
    exploitantFirstName: "Marie",
    exploitantLastName: "Dupont",
    exploitantEmail: "marie.dupont@example.com",
    exploitantTelephone: "0601020304",
    personalAddress: "10 rue des Lilas",
    personalCity: "Lyon",
    personalPostalCode: "69001",
  } as const;
}

function caseValue(form: ReturnType<typeof map2033CFromRfs>, caseId: string): number | undefined {
  return form.cases.find((c) => c.caseId === caseId)?.value as number | undefined;
}

function nPlus1Draft(input: {
  brutBati: number;
  cumulBati: number;
  terrain: number;
  acquisition?: ComposantNouveau;
  totalDotations: number;
}): DeclarationDraft {
  return {
    completedSteps: [],
    dateMiseEnService: "2024-01-01",
    ...identity(),
    inpiConfirmedAt: NOW,
    logementConfirmedAt: NOW,
    creditDeclaredNoneAt: NOW,
    revenusConfirmedAt: NOW,
    chargesConfirmedAt: NOW,
    amortissementConfirmedAt: NOW,
    logementAmortissement: {
      computedAt: NOW,
      plan: {
        lignes: [
          {
            label: "Bâti",
            montant: input.brutBati,
            dureeAnnees: 25,
            dotationAnnuelle: 8000,
            dotationExercice: 8000,
            amortissementsCumules: input.cumulBati,
            vnc: input.brutBati - input.cumulBati,
          },
        ],
        totalBrut: input.brutBati,
        totalAnnuelExercice: 8000,
      },
      valeurTerrain: input.terrain,
      fraisEnCharges: 0,
      fieldSources: {},
    },
    revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 10000 },
    chargesAssistant: {
      exerciceFiscal: 2025,
      totalDeductible: 1000,
      totalPreExploitation: 0,
      composantsNouveaux: input.acquisition ? [input.acquisition] : [],
    },
    amortissementAssistant: {
      exerciceFiscal: 2025,
      totalDotations: input.totalDotations,
      status: "validated",
    },
  };
}

const OPENING = {
  sourceClosureId: "c-n",
  brut: 262000,
  amortissementsCumules: 20000,
  vnc: 242000,
};

function continuityFor(draft: DeclarationDraft, opening = OPENING) {
  return resolveImmobilisationsContinuityForGeneration({
    draft,
    properties: [PROPERTY],
    propertyIds: [PROPERTY.id],
    immobilisationsOuverture: opening,
  });
}

function gateAndFinal(draft: DeclarationDraft, opening = OPENING) {
  const continuity = continuityFor(draft, opening);
  const gate = resolveDeclarationGenerationGate({
    draft,
    properties: [PROPERTY],
    fiscalYear: 2025,
    paid: false,
    generated: false,
    continuity,
  });
  const final = runDeclarationGeneration(
    draft,
    2025,
    undefined,
    undefined,
    undefined,
    continuity,
  );
  return { gate, final };
}

describe("Lot 5 B2 — payment gate continuity parity", () => {
  it("A1 — opening=closing=262k, aucune acquisition → gate autorise", () => {
    const draft = nPlus1Draft({
      brutBati: 200000,
      cumulBati: 28000,
      terrain: 62000,
      totalDotations: 8000,
    });
    const { gate, final } = gateAndFinal(draft);
    assert.equal(final.status, "generated", JSON.stringify(final));
    assert.equal(gate.canCheckout || gate.canGenerate, true);
    assert.equal(gate.blockingAnomalies.length, 0);
    if (final.status === "generated") {
      assert.equal(caseValue(map2033CFromRfs(final.rfs), "492"), 0);
    }
  });

  it("A2 — I2 +8k explicite → gate autorise + 492=8000", () => {
    const acquisition: ComposantNouveau = {
      id: "i2",
      label: "Travaux",
      montant: 8000,
      dureeAnnees: 10,
      dotationAnnuelle: 800,
      nature: "amélioration",
      dateDebut: "2025-03-01",
      origin: "f012_travaux",
    };
    const plan = {
      lignes: [
        {
          label: "Bâti",
          montant: 200000,
          dureeAnnees: 25,
          dotationAnnuelle: 8000,
          dotationExercice: 8000,
          amortissementsCumules: 28000,
          vnc: 172000,
        },
      ],
      totalBrut: 200000,
      totalAnnuelExercice: 8000,
    };
    const composed = composePlanAmortissement({
      exerciceFiscal: 2025,
      dateMiseEnService: "2024-01-01",
      planLogement: plan,
      prorataRatio: 1,
      composantsNouveaux: [acquisition],
    });
    const draft = nPlus1Draft({
      brutBati: 200000,
      cumulBati: 28000,
      terrain: 62000,
      acquisition,
      totalDotations: composed.plan.total_dotations_exercice,
    });
    const { gate, final } = gateAndFinal(draft);
    assert.equal(final.status, "generated", JSON.stringify(final));
    assert.ok(gate.canCheckout || gate.canGenerate);
    if (final.status === "generated") {
      assert.equal(caseValue(map2033CFromRfs(final.rfs), "492"), 8000);
    }
  });

  it("A3 — +10k historique sans acquisition → gate BLOQUE checkout", () => {
    const draft = nPlus1Draft({
      brutBati: 210000,
      cumulBati: 28000,
      terrain: 62000,
      totalDotations: 8000,
    });
    const { gate, final } = gateAndFinal(draft);
    assert.equal(final.status, "blocked");
    assert.equal(gate.canCheckout, false);
    assert.equal(gate.canGenerate, false);
    assert.ok(
      gate.blockingAnomalies.some((a) =>
        a.message.includes(IMMOBILISATIONS_CONTINUITY_RECONCILIATION_FAILED),
      ),
    );
  });

  it("A4 — −10k historique sans cession → gate BLOQUE", () => {
    const draft = nPlus1Draft({
      brutBati: 190000,
      cumulBati: 28000,
      terrain: 62000,
      totalDotations: 8000,
    });
    const { gate, final } = gateAndFinal(draft);
    assert.equal(final.status, "blocked");
    assert.equal(gate.canCheckout, false);
  });

  it("A5 — cumul ouverture incohérent → gate BLOQUE", () => {
    const draft = nPlus1Draft({
      brutBati: 200000,
      cumulBati: 50000,
      terrain: 62000,
      totalDotations: 8000,
    });
    const { gate, final } = gateAndFinal(draft);
    assert.equal(final.status, "blocked");
    assert.equal(gate.canCheckout, false);
  });

  it("A6 — PAYMENT GATE VERDICT === FINAL GENERATION VERDICT", () => {
    const cases = [
      nPlus1Draft({ brutBati: 200000, cumulBati: 28000, terrain: 62000, totalDotations: 8000 }),
      nPlus1Draft({ brutBati: 210000, cumulBati: 28000, terrain: 62000, totalDotations: 8000 }),
      nPlus1Draft({ brutBati: 190000, cumulBati: 28000, terrain: 62000, totalDotations: 8000 }),
      nPlus1Draft({ brutBati: 200000, cumulBati: 50000, terrain: 62000, totalDotations: 8000 }),
    ];
    for (const draft of cases) {
      const { gate, final } = gateAndFinal(draft);
      const gateBlocked = gate.canGenerate === false && gate.blockingAnomalies.length > 0;
      const finalBlocked = final.status === "blocked";
      assert.equal(
        gateBlocked,
        finalBlocked,
        `parity mismatch: gateBlocked=${gateBlocked} final=${final.status}`,
      );
    }
  });
});

describe("Lot 5 B2 — first-year real product path", () => {
  it("B2 — premier exercice F010/F014 cohérent → génération PASS", () => {
    const f010 = computeAmortizationPlan({
      prixAcquisition: 200000,
      mobilierInclus: true,
      montantMobilier: 5000,
      fraisNotaire: 0,
      choixTraitementFrais: "deduction",
      typeBien: "appartement",
      ratioTerrain: 0.2,
      dateMiseEnService: "2025-07-01",
      exerciceFiscal: 2025,
    });
    const draft: DeclarationDraft = {
      completedSteps: [],
      dateMiseEnService: "2025-07-01",
      ...identity(),
      logementAmortissement: {
        computedAt: NOW,
        prixRevient: f010.prixRevient,
        valeurTerrain: f010.valeurTerrain,
        valeurBati: f010.valeurBati,
        baseAmortissableBati: f010.baseAmortissableBati,
        montantMobilier: f010.montantMobilierIsole,
        plan: f010.plan,
        fraisEnCharges: 0,
        fieldSources: {},
      },
      revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 9000 },
      chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 1000, totalPreExploitation: 0 },
      amortissementAssistant: {
        exerciceFiscal: 2025,
        totalDotations: f010.plan.totalAnnuelExercice,
        status: "validated",
      },
    };
    const gen = runDeclarationGeneration(draft, 2025);
    assert.equal(gen.status, "generated", JSON.stringify(gen));
  });

  it("B3 — premier exercice détail complet mais contradictoire → fail-closed", () => {
    const draft: DeclarationDraft = {
      completedSteps: [],
      dateMiseEnService: "2025-07-01",
      ...identity(),
      logementAmortissement: {
        computedAt: NOW,
        valeurTerrain: 40000,
        plan: {
          lignes: [
            {
              label: "Bâti",
              montant: 160000,
              dureeAnnees: 25,
              dotationAnnuelle: 6400,
              dotationExercice: 3200,
              amortissementsCumules: 0, // contradictoire vs amortCalcule
              vnc: 160000,
            },
          ],
          totalBrut: 160000,
          totalAnnuelExercice: 3200,
        },
        fraisEnCharges: 0,
        fieldSources: {},
      },
      revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 9000 },
      chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 1000, totalPreExploitation: 0 },
      amortissementAssistant: {
        exerciceFiscal: 2025,
        totalDotations: 3200,
        status: "validated",
      },
    };
    const gen = runDeclarationGeneration(draft, 2025);
    assert.equal(gen.status, "blocked");
  });

  it("B4 — N+1 ouverture incohérente toujours blocked (garde non affaiblie)", () => {
    const draft = nPlus1Draft({
      brutBati: 210000,
      cumulBati: 28000,
      terrain: 62000,
      totalDotations: 8000,
    });
    assert.equal(gateAndFinal(draft).final.status, "blocked");
  });

  it("aliceDraft premier exercice (parcours F010 réel) → génération PASS", () => {
    const draft = aliceDraft(undefined, { siret: "12345678901234" }, "2025-07-01");
    const gen = runDeclarationGeneration(draft, 2025);
    assert.equal(gen.status, "generated", JSON.stringify(gen));
    assert.ok((draft.logementAmortissement?.plan.lignes.length ?? 0) > 0);
    assert.equal(
      draft.amortissementAssistant?.totalDotations,
      draft.logementAmortissement?.plan.totalAnnuelExercice,
    );
  });
});
