/**
 * Cycle 4E2 (F010) — message explicatif à chaque sortie automatique de
 * review_extraction. Tests A→J.
 * Run: npx tsx --test src/runtime/assistants/f010-logement/assistant-cycle4e2.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { F010LogementAssistant } from "./assistant";
import type { F010ActePrefill } from "@/lib/lmnp/services/f010/acte-to-assistant";
import type { F010State } from "./types";

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

function lastMessage(messages: { role: string; content: string }[]) {
  return messages[messages.length - 1];
}

describe("Cycle 4E2 — A. review → collect_frais", () => {
  it("message explicatif correct quand fraisNotaire est le champ manquant", async () => {
    const assistant = new F010LogementAssistant(ctx);
    let turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: { prixAcquisition: 280000, typeBien: "appartement", dateAcquisition: "2024-03-01" },
    });
    turn = await assistant.handle(turn.state, { type: "confirm_extracted_field", field: "prixAcquisition" });
    turn = await assistant.handle(turn.state, { type: "confirm_extracted_field", field: "typeBien" });
    turn = await assistant.handle(turn.state, { type: "confirm_extracted_field", field: "dateAcquisition" });
    assert.equal(turn.state.step, "collect_frais");
    assert.equal(
      lastMessage(turn.messages).content,
      "J'ai récupéré les informations principales de votre acte. Il me manque maintenant vos frais de notaire pour poursuivre.",
    );
  });
});

describe("Cycle 4E2 — B. review → collect_mobilier", () => {
  it("message explicatif correct quand montantMobilier est le champ manquant", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const state = collectBienState({ choixTraitementFrais: "integration" });
    let turn = await assistant.handle(state, {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: {
        prixAcquisition: 280000,
        typeBien: "appartement",
        dateAcquisition: "2024-03-01",
        fraisNotaire: 19500,
      },
    });
    for (const field of ["prixAcquisition", "typeBien", "dateAcquisition", "fraisNotaire"] as const) {
      turn = await assistant.handle(turn.state, { type: "confirm_extracted_field", field });
    }
    assert.equal(turn.state.step, "collect_mobilier");
    assert.equal(
      lastMessage(turn.messages).content,
      "Votre acte ne me permet pas de déterminer le montant du mobilier. Je vais vous poser une dernière question à ce sujet.",
    );
  });
});

describe("Cycle 4E2 — C. review → ventilation", () => {
  it("message explicatif correct quand ratioTerrain est le champ manquant", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const state = collectBienState({ choixTraitementFrais: "integration", montantMobilier: 0 });
    let turn = await assistant.handle(state, {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: {
        prixAcquisition: 280000,
        typeBien: "appartement",
        dateAcquisition: "2024-03-01",
        fraisNotaire: 19500,
      },
    });
    for (const field of ["prixAcquisition", "typeBien", "dateAcquisition", "fraisNotaire"] as const) {
      turn = await assistant.handle(turn.state, { type: "confirm_extracted_field", field });
    }
    assert.equal(turn.state.step, "ventilation");
    assert.equal(
      lastMessage(turn.messages).content,
      "Il me reste une dernière information pour calculer votre amortissement : la part du prix correspondant au terrain.",
    );
  });
});

describe("Cycle 4E2 — D. review → collect_bien", () => {
  it("message correspondant exactement au champ manquant (prix)", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: { typeBien: "appartement" }, // prixAcquisition absent du document
    });
    const afterConfirm = await assistant.handle(turn.state, { type: "confirm_extracted_field", field: "typeBien" });
    assert.equal(afterConfirm.state.step, "collect_bien");
    assert.equal(
      lastMessage(afterConfirm.messages).content,
      "J'ai trouvé les informations principales dans votre acte. Il me manque seulement le prix d'achat.",
    );
  });

  it("message correspondant exactement au champ manquant (date)", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: { prixAcquisition: 280000, typeBien: "appartement" }, // dateAcquisition absente
    });
    let next = await assistant.handle(turn.state, { type: "confirm_extracted_field", field: "prixAcquisition" });
    next = await assistant.handle(next.state, { type: "confirm_extracted_field", field: "typeBien" });
    assert.equal(next.state.step, "collect_bien");
    assert.equal(
      lastMessage(next.messages).content,
      "J'ai trouvé les informations principales dans votre acte. Il me manque seulement la date d'acquisition.",
    );
  });
});

describe("Cycle 4E2 — E. acte complet → explication des questions non extractibles", () => {
  it("choixTraitementFrais, montantMobilier et ratioTerrain sont tous expliqués, jamais un simple 'Continuons.'", async () => {
    const assistant = new F010LogementAssistant(ctx);
    let turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: fullProposal,
    });
    for (const field of ["prixAcquisition", "dateAcquisition", "typeBien", "surface", "fraisNotaire", "adresse"] as const) {
      turn = await assistant.handle(turn.state, { type: "confirm_extracted_field", field });
    }
    // fraisNotaire connu → le champ manquant suivant est choixTraitementFrais.
    assert.equal(turn.state.step, "collect_frais");
    const choixMessage = lastMessage(turn.messages).content;
    assert.notEqual(choixMessage, "Continuons.");
    assert.match(choixMessage, /traiter ces frais/);

    turn = await assistant.handle(turn.state, {
      type: "submit_frais",
      fraisNotaire: 19500,
      choixTraitementFrais: "integration",
    });
    assert.equal(turn.state.step, "collect_mobilier");
    assert.notEqual(lastMessage(turn.messages).content, "Continuons.");
  });
});

describe("Cycle 4E2 — F. acte partiel → message mentionnant réellement ce qui manque", () => {
  it("prix/date/type trouvés, frais absent → le message mentionne les frais de notaire, pas autre chose", async () => {
    const assistant = new F010LogementAssistant(ctx);
    let turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: { prixAcquisition: 280000, dateAcquisition: "2024-03-01", typeBien: "appartement" },
    });
    for (const field of ["prixAcquisition", "dateAcquisition", "typeBien"] as const) {
      turn = await assistant.handle(turn.state, { type: "confirm_extracted_field", field });
    }
    assert.equal(turn.state.step, "collect_frais");
    assert.match(lastMessage(turn.messages).content, /frais de notaire/);
    assert.doesNotMatch(lastMessage(turn.messages).content, /mobilier|terrain/);
  });
});

describe("Cycle 4E2 — G. ordre stable : chaque transition utilise le champ déjà déterminé (nextMissingF010Field)", () => {
  it("le champ mentionné dans le message correspond exactement au premier champ manquant dans l'ordre imposé", async () => {
    const assistant = new F010LogementAssistant(ctx);
    // prixAcquisition ET typeBien manquants — l'ordre impose prixAcquisition en premier.
    let turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: { dateAcquisition: "2024-03-01" },
    });
    turn = await assistant.handle(turn.state, { type: "confirm_extracted_field", field: "dateAcquisition" });
    assert.equal(turn.state.step, "collect_bien");
    assert.match(lastMessage(turn.messages).content, /prix d'achat/);
    assert.doesNotMatch(lastMessage(turn.messages).content, /type de bien/);
  });
});

describe("Cycle 4E2 — H. GO_BACK → aucun message parasite", () => {
  it("un go_back depuis review_extraction ne pousse aucun message de transition automatique", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: { prixAcquisition: 280000 },
    });
    const back = await assistant.handle(turn.state, { type: "go_back" });
    assert.equal(back.state.step, "collect_bien");
    assert.equal(back.messages.length, 0, "go_back ne pousse jamais de message");
  });
});

describe("Cycle 4E2 — I. refresh → message conservé (logique déterministe, pas de nouvelle persistance)", () => {
  it("resume() puis rejouer la même transition produit exactement le même message — aucun champ de persistance ajouté", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: { prixAcquisition: 280000, typeBien: "appartement" },
    });
    const direct = await assistant.handle(turn.state, { type: "confirm_extracted_field", field: "prixAcquisition" });

    const resumed = assistant.resume({
      step: turn.state.step,
      review: turn.state.review,
      confirmed: turn.state.confirmed,
      fieldSources: turn.state.fieldSources,
      updatedAt: "2026-08-27T10:00:00.000Z",
    });
    const afterResume = await assistant.handle(resumed.state, {
      type: "confirm_extracted_field",
      field: "prixAcquisition",
    });
    assert.equal(lastMessage(afterResume.messages).content, lastMessage(direct.messages).content);
  });
});

describe("Cycle 4E2 — J. parcours manuel existant inchangé", () => {
  it("submit_bien/submit_frais/submit_mobilier/submit_ventilation gardent exactement leurs messages d'origine", async () => {
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
    assert.equal(
      lastMessage(turn.messages).content,
      "Combien avez-vous payé de frais de notaire ? Vous pourrez choisir de les ajouter à la valeur du bien ou de les déduire immédiatement.",
    );
    turn = await assistant.handle(turn.state, {
      type: "submit_frais",
      fraisNotaire: 21000,
      choixTraitementFrais: "integration",
    });
    assert.equal(
      lastMessage(turn.messages).content,
      "Le prix inclut-il du mobilier (cuisine équipée, meubles) ? Si oui, indiquez son montant estimé ; sinon, passez cette étape.",
    );
  });
});
