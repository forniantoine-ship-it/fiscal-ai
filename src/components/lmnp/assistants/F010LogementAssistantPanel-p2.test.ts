/**
 * F010 P2 — 3 correctifs ciblés, chacun testé par la fonction pure réelle
 * qu'ils modifient (convention du projet, pas de RTL) :
 *  - P2-2 : mapF010TypeBienToPropertyType
 *  - P2-3 : computeF010ReviewConfirmableFields (exclusion d'un champ en cours d'édition)
 *  - P2-4 : formatF010RatioPercentForInput (précision du ratio terrain au round-trip)
 *
 * Run: npx tsx --test "src/components/lmnp/assistants/F010LogementAssistantPanel-p2.test.ts"
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { F010LogementAssistant } from "@/runtime";
import type { F010ActePrefill } from "@/lib/lmnp/services/f010/acte-to-assistant";
import type { F010State } from "@/runtime";
import {
  computeF010ReviewConfirmableFields,
  computeF010ReviewVisibleEntries,
  formatF010RatioPercentForInput,
  mapF010TypeBienToPropertyType,
} from "./F010LogementAssistantPanel";

const ctx = { dossierId: "test-dossier", fiscalYear: 2024 };

describe("P2-2 — mapF010TypeBienToPropertyType : 'autre' ne devient jamais 'appartement'", () => {
  it("appartement -> appartement", () => {
    assert.equal(mapF010TypeBienToPropertyType("appartement"), "appartement");
  });

  it("maison -> maison", () => {
    assert.equal(mapF010TypeBienToPropertyType("maison"), "maison");
  });

  it("autre -> non-classe (jamais appartement)", () => {
    assert.equal(mapF010TypeBienToPropertyType("autre"), "non-classe");
    assert.notEqual(mapF010TypeBienToPropertyType("autre"), "appartement");
  });
});

describe("P2-3 — computeF010ReviewConfirmableFields exclut le champ en cours d'édition", () => {
  function collectBienState(overrides: Partial<F010State> = {}): F010State {
    return { step: "collect_bien", acquisitionSource: "acte", fieldSources: {}, ...overrides };
  }

  const fullProposal: F010ActePrefill = {
    prixAcquisition: 280000,
    dateAcquisition: "2023-05-12",
    typeBien: "appartement",
    surface: 45,
    fraisNotaire: 19500,
    adresse: "12 rue des Lilas, 75011 Paris",
  };

  async function reviewStateWithSixPending(): Promise<F010State> {
    const assistant = new F010LogementAssistant(ctx);
    const turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: fullProposal,
    });
    return turn.state;
  }

  it("A. aucune édition ouverte : comportement actuel conservé (6 champs confirmables)", async () => {
    const state = await reviewStateWithSixPending();
    const visible = computeF010ReviewVisibleEntries(state.review);
    const confirmable = computeF010ReviewConfirmableFields(state, visible, null);
    assert.equal(confirmable.length, 6);
    // Appel sans le 3e argument : comportement historique inchangé (paramètre optionnel).
    assert.deepEqual(computeF010ReviewConfirmableFields(state, visible), confirmable);
  });

  it("B. édition ouverte sur 'prixAcquisition' : ce champ est exclu, les 5 autres restent confirmables", async () => {
    const state = await reviewStateWithSixPending();
    const visible = computeF010ReviewVisibleEntries(state.review);
    const confirmable = computeF010ReviewConfirmableFields(state, visible, "prixAcquisition");
    assert.equal(confirmable.length, 5);
    assert.ok(!confirmable.includes("prixAcquisition"));
    for (const field of ["dateAcquisition", "typeBien", "surface", "adresse", "fraisNotaire"] as const) {
      assert.ok(confirmable.includes(field));
    }
  });

  it("C. correction locale non soumise + 'Tout confirmer' : l'ancienne proposedValue n'est jamais confirmée pour ce champ", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const initialState = await reviewStateWithSixPending();
    // L'utilisateur ouvre "Corriger" sur prixAcquisition et tape une autre valeur
    // dans le champ (reviewFieldDraft, état React) — JAMAIS soumise (pas de clic
    // sur "Valider la correction"). editingReviewField = "prixAcquisition" ici.
    const visible = computeF010ReviewVisibleEntries(initialState.review);
    const confirmableFields = computeF010ReviewConfirmableFields(initialState, visible, "prixAcquisition");

    let currentState = initialState;
    for (const field of confirmableFields) {
      const turn = await assistant.handle(currentState, { type: "confirm_extracted_field", field });
      currentState = turn.state;
    }

    // Le champ en édition reste "pending" avec la proposition du document intacte
    // — jamais confirmé avec proposedValue, jamais avec le brouillon non soumis.
    assert.equal(currentState.review?.fields.prixAcquisition.status, "pending");
    assert.equal(currentState.prixAcquisition, undefined);
    // Les 5 autres champs, eux, sont bien passés à "confirmed".
    for (const field of ["dateAcquisition", "typeBien", "surface", "adresse", "fraisNotaire"] as const) {
      assert.equal(currentState.review?.fields[field].status, "confirmed");
    }
  });

  it("D. correction soumise (Valider la correction), puis Tout confirmer : comportement normal, aucune régression", async () => {
    const assistant = new F010LogementAssistant(ctx);
    let state = await reviewStateWithSixPending();
    // L'utilisateur valide sa correction : correct_extracted_field ferme l'édition.
    const corrected = await assistant.handle(state, {
      type: "correct_extracted_field",
      field: "prixAcquisition",
      value: "300000",
    });
    state = corrected.state;
    assert.equal(state.review?.fields.prixAcquisition.status, "corrected");

    // "Tout confirmer" (plus aucune édition ouverte) traite le reste normalement.
    const visible = computeF010ReviewVisibleEntries(state.review);
    const confirmableFields = computeF010ReviewConfirmableFields(state, visible, null);
    assert.ok(!confirmableFields.includes("prixAcquisition"), "déjà 'corrected', jamais re-traité");
    assert.equal(confirmableFields.length, 5);
  });
});

describe("P2-4 — formatF010RatioPercentForInput préserve la précision métier au round-trip", () => {
  const cases = [
    { typed: "20", expectedRatio: 0.2 },
    { typed: "17.5", expectedRatio: 0.175 },
    { typed: "12.34", expectedRatio: 0.1234 },
    { typed: "33.333", expectedRatio: Number("33.333") / 100 },
    { typed: "0.1", expectedRatio: Number("0.1") / 100 },
    // Audit contradictoire P2-4 : ces 6 cas faisaient échouer toFixed(6) —
    // 12,3456789 % tronquait la 8e/9e décimale ; 0,0000001 % et 99,9999999 %
    // collapsaient vers "0"/"100", rejouant exactement le bug d'origine à une
    // échelle plus fine. toFixed(12) doit les préserver tous.
    { typed: "12.345678", expectedRatio: Number("12.345678") / 100 },
    { typed: "12.3456789", expectedRatio: Number("12.3456789") / 100 },
    { typed: "0.000001", expectedRatio: Number("0.000001") / 100 },
    { typed: "0.0000001", expectedRatio: Number("0.0000001") / 100 },
    { typed: "99.999999", expectedRatio: Number("99.999999") / 100 },
    { typed: "99.9999999", expectedRatio: Number("99.9999999") / 100 },
  ];

  for (const { typed, expectedRatio } of cases) {
    it(`ratio saisi ${typed}% : submit -> retour/reload -> resubmit sans modification -> valeur métier identique`, () => {
      // 1. Saisie initiale (submit) : exactement ce que fait le panel (Number(ratio) / 100).
      const submittedRatio = Number(typed) / 100;
      assert.equal(submittedRatio, expectedRatio);

      // 2. Persistance -> retour/reload -> affichage : reformatage pour le champ de saisie.
      const displayed = formatF010RatioPercentForInput(submittedRatio);

      // 3. Resubmit SANS modification (l'utilisateur n'a pas touché le champ) :
      // même calcul que le panel au submit du formulaire de ventilation.
      const resubmittedRatio = Number(displayed) / 100;

      // La valeur métier réellement utilisée par le calcul ne doit pas avoir bougé.
      assert.equal(resubmittedRatio, submittedRatio, `${typed}% ne doit pas muter au round-trip`);
    });
  }

  it("n'arrondit jamais à l'entier — 33.333% reste visible avec ses décimales, pas 33%", () => {
    const ratio = Number("33.333") / 100;
    const displayed = formatF010RatioPercentForInput(ratio);
    assert.equal(displayed, "33.333");
    assert.notEqual(displayed, "33");
  });

  it("cas extrême 0.1% : ne dégénère jamais en 0% (qui casserait P0-3)", () => {
    const ratio = Number("0.1") / 100;
    const displayed = formatF010RatioPercentForInput(ratio);
    assert.notEqual(displayed, "0");
    assert.equal(Number(displayed), 0.1);
  });

  it("0,0000001 % ne devient jamais 0 % (toFixed(6) collapsait ce cas — anomalie fatale P0-3 évitée)", () => {
    const ratio = Number("0.0000001") / 100;
    const displayed = formatF010RatioPercentForInput(ratio);
    const resubmitted = Number(displayed) / 100;
    assert.notEqual(displayed, "0");
    assert.notEqual(resubmitted, 0, "un ratio nul déclencherait 'La valeur du terrain doit être strictement positive'");
    assert.equal(resubmitted, ratio, "valeur métier identique après round-trip, pas une approximation");
  });

  it("99,9999999 % ne devient jamais 100 % (toFixed(6) collapsait ce cas — anomalie fatale P0-3 symétrique évitée)", () => {
    const ratio = Number("99.9999999") / 100;
    const displayed = formatF010RatioPercentForInput(ratio);
    const resubmitted = Number(displayed) / 100;
    assert.notEqual(displayed, "100");
    assert.notEqual(resubmitted, 1, "un ratio de 1 déclencherait 'La valeur du bâti doit être strictement positive'");
    assert.equal(resubmitted, ratio, "valeur métier identique après round-trip, pas une approximation");
  });

  it("12,3456789 % : la 8e/9e décimale ne sont plus tronquées (toFixed(6) donnait 12,345679, une valeur différente)", () => {
    const ratio = Number("12.3456789") / 100;
    const displayed = formatF010RatioPercentForInput(ratio);
    const resubmitted = Number(displayed) / 100;
    assert.notEqual(displayed, "12.345679", "toFixed(6) arrondissait ici — plus le cas avec toFixed(12)");
    assert.equal(resubmitted, ratio);
  });

  it("élimine le bruit de représentation flottante sans toucher aux décimales significatives", () => {
    // 0.1234 * 100 vaut littéralement 12.339999999999999 en IEEE-754.
    assert.equal(0.1234 * 100, 12.339999999999999);
    assert.equal(formatF010RatioPercentForInput(0.1234), "12.34");
  });
});
