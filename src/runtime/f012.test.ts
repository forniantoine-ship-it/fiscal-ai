import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { computeCoproDeductible } from "./capabilities/f012/compute-copro-deductible";
import { computeChargesExercice } from "./capabilities/f012/compute-charges-exercice";
import { computeTaxeFonciereDeductible } from "./capabilities/f012/compute-taxe-fonciere-deductible";
import { isolatePreExploitationCharge } from "./capabilities/f012/isolate-pre-exploitation-charge";
import { qualifyTravail, splitMixteTravaux } from "./capabilities/f012/qualify-travail";
import { explainCharges } from "./presentation/explain-charges";
import { F012ChargesAssistant } from "./assistants/f012-charges/assistant";

describe("F-012 — TRF-0026 qualification travaux", () => {
  it("qualifie une réparation identique en charge (AX-013)", () => {
    const result = qualifyTravail({
      description: "Remplacement chauffe-eau équivalent",
      montant: 1800,
      natureIntervention: "entretien",
    });
    assert.equal(result.qualification, "charge");
    assert.equal(result.destinationFlux, "charges");
  });

  it("qualifie une amélioration en immobilisation (AX-014)", () => {
    const result = qualifyTravail({
      description: "Douche italienne",
      montant: 8000,
      natureIntervention: "amélioration",
    });
    assert.equal(result.qualification, "immobilisation");
    assert.equal(result.destinationFlux, "amortissements");
  });
});

describe("F-012 — cas nominal copropriété + gestion", () => {
  it("totalise €4 640 (cas nominal F-012)", () => {
    const copro = computeCoproDeductible({
      lignes: [
        { type: "provisions", montant: 1800 },
        { type: "regularisation", montant: -120 },
        { type: "fonds_travaux", montant: 120 },
        { type: "appel_gros_travaux", montant: 800, grosTravauxDeductible: true },
      ],
    });
    assert.equal(copro.coproprieteDeductible, 2480);
    assert.equal(copro.fondsTravauxNonDeductible, 120);

    const result = computeChargesExercice({
      exerciceFiscal: 2024,
      dateMiseEnService: "2023-01-01",
      taxeFonciere: 1200,
      coproLignes: [
        { type: "provisions", montant: 1800 },
        { type: "regularisation", montant: -120 },
        { type: "fonds_travaux", montant: 120 },
        { type: "appel_gros_travaux", montant: 800, grosTravauxDeductible: true },
      ],
      honorairesGestion: 780,
      fraisEtatDesLieux: 180,
      assurancePno: 0,
    });

    assert.equal(result.charges.totalDeductible, 4640);
    assert.equal(result.charges.totalNonDeductible, 120);
  });
});

describe("F-012 — cas travaux complexe", () => {
  it("scinde une facture mixte €12 000", () => {
    const split = splitMixteTravaux(12000, 4000);
    assert.equal(split.charge, 4000);
    assert.equal(split.immobilisation, 8000);

    const result = computeChargesExercice({
      exerciceFiscal: 2024,
      dateMiseEnService: "2023-01-01",
      travaux: [
        {
          id: "sdb",
          description: "Rénovation salle de bain",
          montant: 12000,
          natureIntervention: "entretien",
          montantReparation: 4000,
        },
      ],
    });

    assert.equal(result.charges.parCategorie.travaux, 4000);
    assert.equal(result.charges.totalAmortissable, 8000);
    assert.equal(result.charges.composantsNouveaux.length, 1);
    assert.equal(result.charges.composantsNouveaux[0]?.montant, 8000);
  });
});

describe("F-012 — pré-exploitation taxe foncière", () => {
  it("isole la part avant mise en service dans l'exercice", () => {
    const isolated = isolatePreExploitationCharge({
      montant: 1200,
      exerciceFiscal: 2024,
      dateMiseEnService: "2024-08-01",
    });
    assert.equal(isolated.montantDeductible, 500);
    assert.equal(isolated.montantPreExploitation, 700);

    const tf = computeTaxeFonciereDeductible({
      montant: 1200,
      exerciceFiscal: 2024,
      dateMiseEnService: "2024-08-01",
    });
    assert.equal(tf.taxeFonciereDeductible, 500);
    assert.equal(tf.montantPreExploitation, 700);
  });
});

describe("F-012 — explanation", () => {
  it("produit une synthèse lisible", () => {
    const result = computeChargesExercice({
      exerciceFiscal: 2024,
      dateMiseEnService: "2023-01-01",
      taxeFonciere: 1200,
      assurancePno: 300,
    });
    const explain = explainCharges({ charges: result.charges });
    assert.match(explain.explanation, /charges déductibles/);
  });
});

describe("F-012 — Assistant", () => {
  it("termine le parcours profilage → validation", async () => {
    const assistant = new F012ChargesAssistant(
      { dossierId: "test", fiscalYear: 2024, route: "/assistants/charges" },
      { dateMiseEnService: "2023-01-01" },
    );

    let state = assistant.start().state;
    let turn = await assistant.handle(state, {
      type: "submit_profilage",
      copropriete: true,
      agence: true,
      travaux: false,
      vacance: false,
      comptable: false,
    });
    state = turn.state;

    turn = await assistant.handle(state, {
      type: "submit_taxe_fonciere",
      montant: 1200,
    });
    state = turn.state;

    turn = await assistant.handle(state, {
      type: "submit_assurance_pno",
      montant: 250,
    });
    state = turn.state;

    while (state.step === "category_collect" && state.categoryInventory[state.currentCategoryIndex] !== "copropriete") {
      turn = await assistant.handle(state, { type: "skip_category" });
      state = turn.state;
    }

    turn = await assistant.handle(state, {
      type: "submit_copro",
      lignes: [
        { type: "provisions", montant: 1800 },
        { type: "regularisation", montant: -120 },
        { type: "fonds_travaux", montant: 120 },
      ],
    });
    state = turn.state;

    while (state.step === "category_collect") {
      turn = await assistant.handle(state, { type: "skip_category" });
      state = turn.state;
    }

    if (state.step === "completeness") {
      turn = await assistant.handle(state, { type: "confirm_completeness", hasOther: false });
      state = turn.state;
    }

    turn = await assistant.handle(state, { type: "confirm_all" });
    assert.equal(turn.completed, true);
    assert.equal(turn.event, "CHARGES_TERMINE");
    assert.ok(turn.state.result?.charges.totalDeductible);
  });
});
