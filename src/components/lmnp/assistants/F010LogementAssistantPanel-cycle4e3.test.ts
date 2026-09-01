/**
 * Cycle 4E3 (F010) — "Tout confirmer" sur review_extraction. Tests A→N.
 *
 * `runBulkConfirmReview` (panel, React) n'est pas exporté — il n'est qu'une
 * boucle séquentielle de `confirm_extracted_field` autour de la même
 * fonction pure `computeF010ReviewConfirmableFields` exportée par le panel.
 * Ce fichier reproduit exactement cette boucle avec le runtime réel, ce qui
 * teste le comportement réel du bouton sans RTL (convention du projet).
 *
 * Run: npx tsx --test "src/components/lmnp/assistants/F010LogementAssistantPanel-cycle4e3.test.ts"
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { F010LogementAssistant } from "@/runtime";
import type { F010ActePrefill } from "@/lib/lmnp/services/f010/acte-to-assistant";
import type { F010State } from "@/runtime";
import {
  computeF010ReviewConfirmableFields,
  computeF010ReviewVisibleEntries,
} from "./F010LogementAssistantPanel";

const ctx = { dossierId: "test-dossier", fiscalYear: 2024 };

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

/** Reproduit exactement runBulkConfirmReview : même fonction pure, même boucle séquentielle sur le runtime réel. */
async function bulkConfirmPending(assistant: F010LogementAssistant, state: F010State) {
  const visible = computeF010ReviewVisibleEntries(state.review);
  const confirmableFields = computeF010ReviewConfirmableFields(state, visible);
  let currentState = state;
  const messages: { role: string; content: string }[] = [];
  for (const field of confirmableFields) {
    const turn = await assistant.handle(currentState, { type: "confirm_extracted_field", field });
    currentState = turn.state;
    messages.push(...turn.messages);
  }
  return { state: currentState, messages, confirmedFields: confirmableFields };
}

describe("Cycle 4E3 — A. 6 pending → Tout confirmer → 6 confirmed", () => {
  it("les 6 champs deviennent confirmed en un seul déclenchement", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: fullProposal,
    });
    const result = await bulkConfirmPending(assistant, turn.state);
    assert.equal(result.confirmedFields.length, 6);
    for (const field of ["prixAcquisition", "dateAcquisition", "typeBien", "surface", "adresse", "fraisNotaire"] as const) {
      assert.equal(result.state.review?.fields[field].status, "confirmed");
    }
    assert.equal(result.state.step, "collect_frais"); // choixTraitementFrais jamais extractible
  });
});

describe("Cycle 4E3 — B. aucun pending → bouton absent/disabled", () => {
  it("computeF010ReviewConfirmableFields retourne un tableau vide quand tout est déjà résolu", async () => {
    const assistant = new F010LogementAssistant(ctx);
    let turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: { prixAcquisition: 280000 },
    });
    turn = await assistant.handle(turn.state, { type: "confirm_extracted_field", field: "prixAcquisition" });
    const visible = computeF010ReviewVisibleEntries(turn.state.review);
    const hasPending = visible.some(([, entry]) => entry.status === "pending");
    assert.equal(hasPending, false);
    assert.deepEqual(computeF010ReviewConfirmableFields(turn.state, visible), []);
  });
});

describe("Cycle 4E3 — C. champ corrected → reste corrected", () => {
  it("Tout confirmer ne touche jamais un champ déjà corrigé manuellement", async () => {
    const assistant = new F010LogementAssistant(ctx);
    let turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: { prixAcquisition: 280000, typeBien: "appartement" },
    });
    turn = await assistant.handle(turn.state, {
      type: "correct_extracted_field",
      field: "prixAcquisition",
      value: "250000",
    });
    const visible = computeF010ReviewVisibleEntries(turn.state.review);
    const confirmable = computeF010ReviewConfirmableFields(turn.state, visible);
    assert.ok(!confirmable.includes("prixAcquisition"));

    const result = await bulkConfirmPending(assistant, turn.state);
    assert.equal(result.state.prixAcquisition, 250000, "la correction n'est jamais remplacée");
    assert.equal(result.state.review?.fields.prixAcquisition.status, "corrected");
  });
});

describe("Cycle 4E3 — D. champ confirmed → reste confirmed", () => {
  it("Tout confirmer ne touche jamais un champ déjà confirmé individuellement", async () => {
    const assistant = new F010LogementAssistant(ctx);
    let turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: { prixAcquisition: 280000, typeBien: "appartement" },
    });
    turn = await assistant.handle(turn.state, { type: "confirm_extracted_field", field: "prixAcquisition" });
    const visible = computeF010ReviewVisibleEntries(turn.state.review);
    assert.ok(!computeF010ReviewConfirmableFields(turn.state, visible).includes("prixAcquisition"));

    const result = await bulkConfirmPending(assistant, turn.state);
    assert.equal(result.state.prixAcquisition, 280000);
    assert.equal(result.confirmedFields.includes("prixAcquisition"), false);
  });
});

describe("Cycle 4E3 — E. conflit → non confirmé automatiquement", () => {
  it("un champ en conflit reste pending et n'est jamais inclus dans Tout confirmer", async () => {
    const assistant = new F010LogementAssistant(ctx);
    let turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: { prixAcquisition: 250000, typeBien: "appartement" },
    });
    turn = await assistant.handle(turn.state, { type: "confirm_extracted_field", field: "prixAcquisition" });
    turn = await assistant.handle(turn.state, { type: "go_back" });
    turn = await assistant.handle(turn.state, {
      type: "analysis_success",
      documentId: "doc-2",
      proposal: { prixAcquisition: 280000, typeBien: "appartement", dateAcquisition: "2024-03-01" },
    });
    const visible = computeF010ReviewVisibleEntries(turn.state.review);
    const confirmable = computeF010ReviewConfirmableFields(turn.state, visible);
    assert.ok(!confirmable.includes("prixAcquisition"), "le champ en conflit est exclu");
    assert.ok(confirmable.includes("typeBien") && confirmable.includes("dateAcquisition"));

    const result = await bulkConfirmPending(assistant, turn.state);
    assert.equal(result.state.prixAcquisition, 250000, "la valeur confirmée précédemment n'est jamais écrasée");
    assert.equal(result.state.review?.fields.prixAcquisition.status, "pending", "le conflit reste visible");
  });
});

describe("Cycle 4E3 — F. document partiel → uniquement les propositions disponibles", () => {
  it("Tout confirmer ne confirme que les 3 champs présents (surface et frais absents)", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: { prixAcquisition: 280000, dateAcquisition: "2024-03-01", typeBien: "appartement" },
    });
    const result = await bulkConfirmPending(assistant, turn.state);
    assert.deepEqual(result.confirmedFields.sort(), ["dateAcquisition", "prixAcquisition", "typeBien"].sort());
  });
});

describe("Cycle 4E3 — G. absent → jamais transformé en valeur", () => {
  it("surface et fraisNotaire restent undefined après Tout confirmer sur un acte partiel", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: { prixAcquisition: 280000, dateAcquisition: "2024-03-01", typeBien: "appartement" },
    });
    const result = await bulkConfirmPending(assistant, turn.state);
    assert.equal(result.state.surface, undefined);
    assert.equal(result.state.fraisNotaire, undefined);
    assert.equal(result.state.review?.fields.surface.status, "unavailable");
  });
});

describe("Cycle 4E3 — H. provenance preserved", () => {
  it("chaque champ confirmé en masse porte fieldSources === 'extracted', comme une confirmation individuelle", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: { prixAcquisition: 280000, typeBien: "appartement" },
    });
    const result = await bulkConfirmPending(assistant, turn.state);
    assert.equal(result.state.fieldSources.prixAcquisition, "extracted");
    assert.equal(result.state.fieldSources.typeBien, "extracted");
  });
});

describe("Cycle 4E3 — I. gouvernance preserved", () => {
  it("state.confirmed est correctement rempli pour chaque champ confirmé en masse", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: { prixAcquisition: 280000, typeBien: "appartement" },
    });
    const result = await bulkConfirmPending(assistant, turn.state);
    assert.equal(result.state.confirmed?.prixAcquisition, true);
    assert.equal(result.state.confirmed?.typeBien, true);
  });
});

describe("Cycle 4E3 — J. après confirmation → resolveNextMissingF010Field", () => {
  it("la transition suit exactement la même logique que la confirmation individuelle, aucune transition parallèle", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: fullProposal,
    });
    const bulkResult = await bulkConfirmPending(assistant, turn.state);

    // Comparaison avec le chemin individuel (Cycle 4C1/4E1) : même destination.
    let individual = turn.state;
    for (const field of ["prixAcquisition", "dateAcquisition", "typeBien", "surface", "adresse", "fraisNotaire"] as const) {
      individual = (await assistant.handle(individual, { type: "confirm_extracted_field", field })).state;
    }
    assert.equal(bulkResult.state.step, individual.step);
    assert.equal(bulkResult.state.step, "collect_frais");
  });
});

describe("Cycle 4E3 — K. refresh → états confirmés conservés", () => {
  it("resume() restaure exactement les statuts confirmed obtenus via Tout confirmer", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: { prixAcquisition: 280000, typeBien: "appartement" },
    });
    const result = await bulkConfirmPending(assistant, turn.state);

    const resumed = assistant.resume({
      step: result.state.step,
      prixAcquisition: result.state.prixAcquisition,
      typeBien: result.state.typeBien,
      review: result.state.review,
      confirmed: result.state.confirmed,
      fieldSources: result.state.fieldSources,
      updatedAt: "2026-08-27T10:00:00.000Z",
    });
    assert.equal(resumed.state.confirmed?.prixAcquisition, true);
    assert.equal(resumed.state.confirmed?.typeBien, true);
  });
});

describe("Cycle 4E3 — L. double clic → pas de double transition", () => {
  it("relancer Tout confirmer sur le résultat déjà confirmé est un no-op idempotent", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: { prixAcquisition: 280000, typeBien: "appartement" },
    });
    const first = await bulkConfirmPending(assistant, turn.state);
    const second = await bulkConfirmPending(assistant, first.state);
    assert.deepEqual(second.confirmedFields, []);
    assert.equal(second.messages.length, 0);
    assert.deepEqual(second.state, first.state);
  });
});

describe("Cycle 4E3 — M. erreur dans une proposition → Corriger reste possible", () => {
  it("un champ confirmé en masse peut toujours être corrigé ensuite", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: { prixAcquisition: 280000, typeBien: "appartement" },
    });
    const bulkResult = await bulkConfirmPending(assistant, turn.state);
    // prixAcquisition/typeBien confirmés, dateAcquisition manquante → collect_bien.
    assert.equal(bulkResult.state.step, "collect_bien");

    // On simule une seconde analyse qui remet le prix en review (conflit), puis
    // l'utilisateur corrige la valeur erronée confirmée en masse précédemment.
    const secondReview = await assistant.handle(bulkResult.state, {
      type: "analysis_success",
      documentId: "doc-2",
      proposal: { prixAcquisition: 280000 },
    });
    const corrected = await assistant.handle(secondReview.state, {
      type: "correct_extracted_field",
      field: "prixAcquisition",
      value: "275000",
    });
    assert.equal(corrected.state.prixAcquisition, 275000);
    assert.equal(corrected.state.fieldSources.prixAcquisition, "user_correction");
  });
});

describe("Cycle 4E3 — N. parcours manuel → inchangé", () => {
  it("submit_bien/submit_frais/submit_mobilier/submit_ventilation restent inaffectés par Tout confirmer", async () => {
    const assistant = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-04-15" });
    const start = assistant.start();
    let turn = await assistant.handle(start.state, { type: "select_nature", nature: "achat" });
    turn = await assistant.handle(turn.state, { type: "select_source", source: "manuel" });
    turn = await assistant.handle(turn.state, {
      type: "submit_bien",
      prixAcquisition: 280000,
      typeBien: "appartement",
      dateAcquisition: "2024-03-01",
    });
    turn = await assistant.handle(turn.state, {
      type: "submit_frais",
      fraisNotaire: 21000,
      choixTraitementFrais: "integration",
    });
    turn = await assistant.handle(turn.state, { type: "skip_mobilier" });
    turn = await assistant.handle(turn.state, { type: "submit_ventilation", ratioTerrain: 0.15 });
    assert.equal(turn.state.step, "review_plan");
    assert.equal(turn.state.review, undefined, "aucun état de review n'apparaît jamais dans le parcours manuel");
  });
});
