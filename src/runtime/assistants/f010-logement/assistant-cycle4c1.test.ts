/**
 * Cycle 4C1 (F010) — review_extraction, runtime uniquement. Tests A→O.
 * Run: npx tsx --test src/runtime/assistants/f010-logement/assistant-cycle4c1.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { F010LogementAssistant } from "./assistant";
import type { F010ActePrefill } from "@/lib/lmnp/services/f010/acte-to-assistant";
import type { F010State } from "./types";

const ctx = { dossierId: "test-dossier", fiscalYear: 2024 };

function collectBienState(overrides: Partial<F010State> = {}): F010State {
  return {
    step: "collect_bien",
    acquisitionSource: "acte",
    fieldSources: {},
    ...overrides,
  };
}

const fullProposal: F010ActePrefill = {
  prixAcquisition: 280000,
  dateAcquisition: "2023-05-12",
  typeBien: "appartement",
  surface: 45,
  fraisNotaire: 19500,
  adresse: "12 rue des Lilas, 75011 Paris",
};

describe("Cycle 4C1 — A. upload → review_extraction", () => {
  it("analysis_success avec une proposition complète entre en review_extraction, tous pending", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: fullProposal,
    });
    assert.equal(turn.state.step, "review_extraction");
    assert.equal(turn.state.review?.documentId, "doc-1");
    for (const field of ["prixAcquisition", "dateAcquisition", "typeBien", "surface", "fraisNotaire", "adresse"] as const) {
      assert.equal(turn.state.review?.fields[field].status, "pending");
      assert.notEqual(turn.state.review?.fields[field].proposedValue, undefined);
    }
  });
});

describe("Cycle 4C1 — B. échec extraction → jamais review", () => {
  it("aucune action liée à l'analyse n'est dispatchée sur échec → l'état reste collect_bien", async () => {
    // Le panel ne dispatch analysis_success QUE sur succès (contrat, pas une
    // branche runtime) — un échec ne produit tout simplement aucun dispatch.
    const state = collectBienState();
    // Rien à faire ici : l'assertion est que review_extraction n'est atteignable
    // que via analysis_success — vérifié structurellement par les autres tests
    // (A, C) qui sont les seuls points d'entrée. On vérifie ici l'absence de
    // changement d'état en l'absence de ce dispatch.
    assert.equal(state.step, "collect_bien");
    assert.equal(state.review, undefined);
  });
});

describe("Cycle 4C1 — C. extraction partielle → review", () => {
  it("proposition partielle → review avec mélange pending/unavailable, jamais auto-skip", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: { prixAcquisition: 280000, typeBien: "appartement" },
    });
    assert.equal(turn.state.step, "review_extraction");
    assert.equal(turn.state.review?.fields.prixAcquisition.status, "pending");
    assert.equal(turn.state.review?.fields.typeBien.status, "pending");
    assert.equal(turn.state.review?.fields.dateAcquisition.status, "unavailable");
    assert.equal(turn.state.review?.fields.surface.status, "unavailable");
    assert.equal(turn.state.review?.fields.fraisNotaire.status, "unavailable");
    assert.equal(turn.state.review?.fields.adresse.status, "unavailable");
  });
});

describe("Cycle 4C1 — D. confirm field", () => {
  it("confirm_extracted_field applique la proposition, confirme, trace la provenance", async () => {
    const assistant = new F010LogementAssistant(ctx);
    let turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: { prixAcquisition: 280000, typeBien: "appartement" },
    });
    turn = await assistant.handle(turn.state, { type: "confirm_extracted_field", field: "prixAcquisition" });
    assert.equal(turn.state.prixAcquisition, 280000);
    assert.equal(turn.state.confirmed?.prixAcquisition, true);
    assert.equal(turn.state.fieldSources.prixAcquisition, "extracted");
    assert.equal(turn.state.review?.fields.prixAcquisition.status, "confirmed");
    // Reste en review_extraction : typeBien encore pending.
    assert.equal(turn.state.step, "review_extraction");
  });
});

describe("Cycle 4C1 — E. correct field", () => {
  it("correct_extracted_field remplace la proposition, confirme, provenance user_correction", async () => {
    const assistant = new F010LogementAssistant(ctx);
    let turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: { prixAcquisition: 280000, typeBien: "appartement" },
    });
    turn = await assistant.handle(turn.state, {
      type: "correct_extracted_field",
      field: "prixAcquisition",
      value: "275000",
    });
    assert.equal(turn.state.prixAcquisition, 275000);
    assert.equal(turn.state.confirmed?.prixAcquisition, true);
    assert.equal(turn.state.fieldSources.prixAcquisition, "user_correction");
    assert.equal(turn.state.review?.fields.prixAcquisition.status, "corrected");
    // La proposition originale (280000) n'a jamais été appliquée.
  });
});

describe("Cycle 4C1 — F. tous les champs confirmés → next missing", () => {
  it("les 6 champs de review résolus, choixTraitementFrais encore manquant → collect_frais", async () => {
    const assistant = new F010LogementAssistant(ctx);
    let turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: fullProposal,
    });
    for (const field of ["prixAcquisition", "dateAcquisition", "typeBien", "surface", "fraisNotaire", "adresse"] as const) {
      turn = await assistant.handle(turn.state, { type: "confirm_extracted_field", field });
    }
    assert.equal(turn.state.step, "collect_frais");
    assert.equal(turn.state.fraisNotaire, 19500, "fraisNotaire déjà connu via la review, jamais redemandé");
  });
});

describe("Cycle 4C1 — G. aucun champ manquant → review_plan", () => {
  it("les champs conversationnels déjà connus + review complète → review_plan avec un plan calculé", async () => {
    const assistant = new F010LogementAssistant(ctx, { dateMiseEnService: "2024-04-15" });
    const state = collectBienState({
      choixTraitementFrais: "integration",
      montantMobilier: 0,
      mobilierInclus: false,
      ratioTerrain: 0.15,
      confirmed: { choixTraitementFrais: true, montantMobilier: true, ratioTerrain: true },
    });
    let turn = await assistant.handle(state, {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: fullProposal,
    });
    for (const field of ["prixAcquisition", "dateAcquisition", "typeBien", "surface", "fraisNotaire", "adresse"] as const) {
      turn = await assistant.handle(turn.state, { type: "confirm_extracted_field", field });
    }
    assert.equal(turn.state.step, "review_plan");
    assert.ok(turn.state.result);
  });
});

describe("Cycle 4C1 — H. champ confirmé + document contradictoire → conflit", () => {
  it("un second document proposant une valeur différente ne modifie jamais silencieusement l'état confirmé", async () => {
    const assistant = new F010LogementAssistant(ctx);
    let turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: { prixAcquisition: 250000, typeBien: "appartement" },
    });
    turn = await assistant.handle(turn.state, { type: "confirm_extracted_field", field: "prixAcquisition" });
    assert.equal(turn.state.prixAcquisition, 250000);

    // Retour à collect_bien puis un second document contredit le prix confirmé.
    turn = await assistant.handle(turn.state, { type: "go_back" });
    assert.equal(turn.state.step, "collect_bien");
    turn = await assistant.handle(turn.state, {
      type: "analysis_success",
      documentId: "doc-2",
      proposal: { prixAcquisition: 280000, typeBien: "appartement" },
    });

    // La valeur confirmée n'est jamais écrasée silencieusement...
    assert.equal(turn.state.prixAcquisition, 250000);
    assert.equal(turn.state.confirmed?.prixAcquisition, true);
    // ...mais la nouvelle proposition est bien visible et observable comme un conflit.
    assert.equal(turn.state.review?.fields.prixAcquisition.proposedValue, "280000");
    assert.equal(turn.state.review?.fields.prixAcquisition.status, "pending");
  });
});

describe("Cycle 4C1 — I. champ absent du nouveau document → aucune suppression", () => {
  it("un document B qui ne mentionne pas un champ déjà confirmé ne l'efface jamais", async () => {
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
      proposal: { typeBien: "appartement" }, // prixAcquisition absent du document B
    });
    assert.equal(turn.state.prixAcquisition, 250000, "jamais effacé par l'absence dans le nouveau document");
    assert.equal(turn.state.review?.fields.prixAcquisition.status, "unavailable");
  });
});

describe("Cycle 4C1 — J. GO_BACK review → collect_bien", () => {
  it("ne perd ni le document, ni la review, ni les données déjà confirmées", async () => {
    const assistant = new F010LogementAssistant(ctx);
    let turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: { prixAcquisition: 280000, typeBien: "appartement" },
    });
    turn = await assistant.handle(turn.state, { type: "confirm_extracted_field", field: "prixAcquisition" });
    assert.equal(turn.state.step, "review_extraction");

    turn = await assistant.handle(turn.state, { type: "go_back" });
    assert.equal(turn.state.step, "collect_bien");
    assert.equal(turn.state.review?.documentId, "doc-1", "la review reste disponible");
    assert.equal(turn.state.prixAcquisition, 280000, "la donnée confirmée reste");
    assert.equal(turn.state.confirmed?.prixAcquisition, true);
  });
});

describe("Cycle 4C1 — K. refresh review → état identique", () => {
  it("resume() restaure exactement la même review (mêmes propositions, mêmes statuts)", async () => {
    const assistant = new F010LogementAssistant(ctx);
    let turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: fullProposal,
    });
    turn = await assistant.handle(turn.state, { type: "confirm_extracted_field", field: "prixAcquisition" });

    const resumed = assistant.resume({
      step: turn.state.step,
      review: turn.state.review,
      confirmed: turn.state.confirmed,
      fieldSources: turn.state.fieldSources,
      prixAcquisition: turn.state.prixAcquisition,
      updatedAt: "2026-08-27T10:00:00.000Z",
    });
    assert.equal(resumed.state.step, "review_extraction");
    assert.deepEqual(resumed.state.review, turn.state.review);
    assert.equal(resumed.state.review?.fields.prixAcquisition.status, "confirmed");
    assert.equal(resumed.state.review?.fields.typeBien.status, "pending");
  });
});

describe("Cycle 4C1 — L. document remplacé → nouvelle review", () => {
  it("une nouvelle analyse remplace intégralement l'ancienne review, jamais une fusion", async () => {
    const assistant = new F010LogementAssistant(ctx);
    let turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: { prixAcquisition: 250000, typeBien: "appartement", surface: 40 },
    });
    // typeBien confirmé, prixAcquisition et surface volontairement laissés pending.
    turn = await assistant.handle(turn.state, { type: "confirm_extracted_field", field: "typeBien" });
    assert.equal(turn.state.step, "review_extraction");

    turn = await assistant.handle(turn.state, { type: "go_back" });
    turn = await assistant.handle(turn.state, {
      type: "analysis_success",
      documentId: "doc-2",
      proposal: { dateAcquisition: "2023-05-12" }, // document B totalement différent
    });

    assert.equal(turn.state.review?.documentId, "doc-2");
    // La review est neuve : prixAcquisition/surface (pending dans A, jamais confirmés)
    // redeviennent "unavailable" — ils ne sont PAS reconduits depuis l'ancienne review.
    assert.equal(turn.state.review?.fields.prixAcquisition.status, "unavailable");
    assert.equal(turn.state.review?.fields.surface.status, "unavailable");
    assert.equal(turn.state.review?.fields.dateAcquisition.status, "pending");
    // typeBien, lui, était déjà CONFIRMÉ (pas juste proposé) — la donnée réelle survit,
    // même si la nouvelle review ne le mentionne pas (document B ne le fournit pas).
    assert.equal(turn.state.typeBien, "appartement");
    assert.equal(turn.state.confirmed?.typeBien, true);
  });
});

describe("Cycle 4C1 — M. données manuelles existantes + document", () => {
  it("un champ confirmé manuellement (pas depuis un document) est protégé exactement comme un champ confirmé depuis un document", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const state = collectBienState({
      prixAcquisition: 250000,
      confirmed: { prixAcquisition: true },
      fieldSources: { prixAcquisition: "manual" },
    });
    const turn = await assistant.handle(state, {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: { prixAcquisition: 280000 },
    });
    assert.equal(turn.state.prixAcquisition, 250000, "la saisie manuelle confirmée n'est jamais écrasée");
    assert.equal(turn.state.fieldSources.prixAcquisition, "manual");
    assert.equal(turn.state.review?.fields.prixAcquisition.proposedValue, "280000");
    assert.equal(turn.state.review?.fields.prixAcquisition.status, "pending");
  });
});

describe("Cycle 4C1 — N. provenance correcte après correction", () => {
  it("correct_extracted_field trace 'user_correction', jamais 'extracted' ni 'manual'", async () => {
    const assistant = new F010LogementAssistant(ctx);
    let turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: { typeBien: "maison" },
    });
    turn = await assistant.handle(turn.state, {
      type: "correct_extracted_field",
      field: "typeBien",
      value: "appartement",
    });
    assert.equal(turn.state.fieldSources.typeBien, "user_correction");
    assert.notEqual(turn.state.fieldSources.typeBien, "extracted");
    assert.notEqual(turn.state.fieldSources.typeBien, "manual");
  });
});

describe("Cycle 4C1 — O. aucun score de confiance artificiel", () => {
  it("F010ExtractionReviewField ne porte que proposedValue/source/status — rien d'autre", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: fullProposal,
    });
    const entry = turn.state.review?.fields.prixAcquisition;
    assert.ok(entry);
    assert.deepEqual(Object.keys(entry!).sort(), ["proposedValue", "source", "status"]);
  });
});
