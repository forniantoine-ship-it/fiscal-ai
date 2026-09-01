/**
 * Cycle 4C2 (F010) — écran review_extraction, UI uniquement. Tests A→N.
 *
 * Convention du projet : pas de RTL. La logique de décision de l'écran
 * (quels champs afficher, quand un champ est en conflit, quand "Continuer"
 * est actif) est extraite en fonctions pures exportées par le panel et
 * testée directement ici, combinée au runtime réel (assistant.handle) pour
 * vérifier le contrat bout en bout sans rendu React.
 *
 * Run: npx tsx --test "src/components/lmnp/assistants/F010LogementAssistantPanel-cycle4c2.test.ts"
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { F010LogementAssistant } from "@/runtime";
import type { F010ActePrefill } from "@/lib/lmnp/services/f010/acte-to-assistant";
import type { F010State } from "@/runtime";
import {
  computeF010ReviewComplete,
  computeF010ReviewHasMissingFields,
  computeF010ReviewVisibleEntries,
  f010ReviewProvenanceLabel,
  formatF010ReviewValue,
  isF010ReviewFieldConflict,
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

describe("Cycle 4C2 — A. review complète visible", () => {
  it("les 6 champs proposés sont tous visibles, dans l'ordre attendu", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: fullProposal,
    });
    const visible = computeF010ReviewVisibleEntries(turn.state.review);
    assert.deepEqual(
      visible.map(([field]) => field),
      ["prixAcquisition", "dateAcquisition", "typeBien", "surface", "adresse", "fraisNotaire"],
    );
    assert.ok(visible.every(([, entry]) => entry.status === "pending"));
  });
});

describe("Cycle 4C2 — B. review partielle", () => {
  it("seuls les champs présents dans le document sont visibles, le reste est masqué", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: { prixAcquisition: 280000, typeBien: "appartement" },
    });
    const visible = computeF010ReviewVisibleEntries(turn.state.review);
    assert.deepEqual(
      visible.map(([field]) => field),
      ["prixAcquisition", "typeBien"],
    );
    assert.equal(computeF010ReviewHasMissingFields(turn.state.review), true);
  });
});

describe("Cycle 4C2 — C. confirmer un champ", () => {
  it("dispatcher confirm_extracted_field applique la proposition et sort le champ de 'pending'", async () => {
    const assistant = new F010LogementAssistant(ctx);
    let turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: { prixAcquisition: 280000, typeBien: "appartement" },
    });
    turn = await assistant.handle(turn.state, { type: "confirm_extracted_field", field: "prixAcquisition" });
    const visible = computeF010ReviewVisibleEntries(turn.state.review);
    const prix = visible.find(([field]) => field === "prixAcquisition");
    assert.equal(prix?.[1].status, "confirmed");
    assert.equal(turn.state.prixAcquisition, 280000);
  });
});

describe("Cycle 4C2 — D. corriger un champ", () => {
  it("dispatcher correct_extracted_field remplace la proposition par la valeur saisie", async () => {
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
    const visible = computeF010ReviewVisibleEntries(turn.state.review);
    const prix = visible.find(([field]) => field === "prixAcquisition");
    assert.equal(prix?.[1].status, "corrected");
    assert.equal(turn.state.prixAcquisition, 275000);
  });
});

describe("Cycle 4C2 — E. tous confirmés → Continuer devient actif juste avant l'avancée automatique", () => {
  it("computeF010ReviewComplete devient vrai exactement quand tous les champs visibles sont traités", async () => {
    const assistant = new F010LogementAssistant(ctx);
    let turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: { prixAcquisition: 280000, typeBien: "appartement" },
    });
    let visible = computeF010ReviewVisibleEntries(turn.state.review);
    assert.equal(computeF010ReviewComplete(visible), false);

    turn = await assistant.handle(turn.state, { type: "confirm_extracted_field", field: "prixAcquisition" });
    visible = computeF010ReviewVisibleEntries(turn.state.review);
    assert.equal(computeF010ReviewComplete(visible), false, "typeBien encore pending");

    turn = await assistant.handle(turn.state, { type: "confirm_extracted_field", field: "typeBien" });
    // Le runtime a déjà fait avancer l'étape (leaveReviewIfComplete) — la
    // review elle-même, si on la relit isolément, est bien complète.
    visible = computeF010ReviewVisibleEntries(turn.state.review);
    assert.equal(computeF010ReviewComplete(visible), true);
    assert.notEqual(turn.state.step, "review_extraction");
  });
});

describe("Cycle 4C2 — F. un champ non traité → Continuer impossible", () => {
  it("computeF010ReviewComplete reste faux tant qu'un seul champ visible est encore 'pending'", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: fullProposal,
    });
    const visible = computeF010ReviewVisibleEntries(turn.state.review);
    assert.equal(computeF010ReviewComplete(visible), false);
  });
});

describe("Cycle 4C2 — G. provenance correcte", () => {
  it("extracted → 'Extrait de votre acte', estimated → 'Estimé', manual → aucun badge", () => {
    assert.equal(f010ReviewProvenanceLabel("extracted"), "Extrait de votre acte");
    assert.equal(f010ReviewProvenanceLabel("estimated"), "Estimé");
    assert.equal(f010ReviewProvenanceLabel("manual"), null);
    assert.equal(f010ReviewProvenanceLabel("user_correction" as never), null);
    assert.equal(f010ReviewProvenanceLabel(undefined), null);
  });
});

describe("Cycle 4C2 — H. aucun score de confiance", () => {
  it("formatF010ReviewValue ne produit jamais de pourcentage ni de mention de confiance", () => {
    const value = formatF010ReviewValue("prixAcquisition", "280000");
    assert.doesNotMatch(value, /%|confiance|score/i);
    assert.match(value, /^280.000.€$/); // espace de regroupement fr-FR (insécable) — pas comparé littéralement
  });
});

describe("Cycle 4C2 — I. champ absent non présenté comme trouvé", () => {
  it("un champ 'unavailable' n'apparaît jamais dans les entrées visibles", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: { prixAcquisition: 280000 },
    });
    const visible = computeF010ReviewVisibleEntries(turn.state.review);
    assert.ok(!visible.some(([field]) => field === "adresse"));
    assert.equal(turn.state.review?.fields.adresse.status, "unavailable");
  });
});

describe("Cycle 4C2 — J. conflit affiché", () => {
  it("isF010ReviewFieldConflict détecte un champ confirmé contredit par une nouvelle proposition", async () => {
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
      proposal: { prixAcquisition: 280000, typeBien: "appartement" },
    });
    const entry = turn.state.review!.fields.prixAcquisition;
    assert.equal(isF010ReviewFieldConflict(turn.state, "prixAcquisition", entry), true);

    // "Conserver ma réponse" → correct_extracted_field avec la valeur déjà confirmée.
    const keep = await assistant.handle(turn.state, {
      type: "correct_extracted_field",
      field: "prixAcquisition",
      value: "250000",
    });
    assert.equal(keep.state.prixAcquisition, 250000);

    // "Utiliser la donnée de l'acte" → confirm_extracted_field applique la nouvelle valeur.
    const useDoc = await assistant.handle(turn.state, { type: "confirm_extracted_field", field: "prixAcquisition" });
    assert.equal(useDoc.state.prixAcquisition, 280000);
  });

  it("un champ pending sans confirmation préalable n'est jamais un conflit", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: { prixAcquisition: 280000 },
    });
    const entry = turn.state.review!.fields.prixAcquisition;
    assert.equal(isF010ReviewFieldConflict(turn.state, "prixAcquisition", entry), false);
  });
});

describe("Cycle 4C2 — K. GO_BACK", () => {
  it("'← Modifier le document' dispatche go_back et revient sur collect_bien sans perdre la review", async () => {
    const assistant = new F010LogementAssistant(ctx);
    let turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: { prixAcquisition: 280000 },
    });
    assert.equal(turn.state.step, "review_extraction");
    turn = await assistant.handle(turn.state, { type: "go_back" });
    assert.equal(turn.state.step, "collect_bien");
    assert.equal(turn.state.review?.documentId, "doc-1");
  });
});

describe("Cycle 4C2 — L. refresh/reprise", () => {
  it("resume() restaure la même review, les mêmes entrées visibles et le même état de complétude", async () => {
    const assistant = new F010LogementAssistant(ctx);
    let turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: { prixAcquisition: 280000, typeBien: "appartement" },
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
    const before = computeF010ReviewVisibleEntries(turn.state.review);
    const after = computeF010ReviewVisibleEntries(resumed.state.review);
    assert.deepEqual(after, before);
    assert.equal(computeF010ReviewComplete(after), computeF010ReviewComplete(before));
  });
});

describe("Cycle 4C2 — M. remplacement document", () => {
  it("un second document depuis review_extraction (après go_back) construit une review neuve, sans perdre les champs déjà confirmés", async () => {
    const assistant = new F010LogementAssistant(ctx);
    let turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: { prixAcquisition: 250000, typeBien: "appartement" },
    });
    turn = await assistant.handle(turn.state, { type: "confirm_extracted_field", field: "typeBien" });
    turn = await assistant.handle(turn.state, { type: "go_back" });
    turn = await assistant.handle(turn.state, {
      type: "analysis_success",
      documentId: "doc-2",
      proposal: { dateAcquisition: "2023-05-12" },
    });
    assert.equal(turn.state.review?.documentId, "doc-2");
    const visible = computeF010ReviewVisibleEntries(turn.state.review);
    assert.deepEqual(
      visible.map(([field]) => field),
      ["dateAcquisition"],
    );
    // typeBien, confirmé précédemment, survit même si absent de la nouvelle review.
    assert.equal(turn.state.typeBien, "appartement");
  });
});

describe("Cycle 4C2 — N. formatage des valeurs (aucune infrastructure clavier/mobile dédiée dans ce projet — couvert par les styles Button/input existants)", () => {
  it("formatF010ReviewValue formate surface et typeBien de façon lisible, sans jargon", () => {
    assert.equal(formatF010ReviewValue("surface", "45"), "45 m²");
    assert.equal(formatF010ReviewValue("typeBien", "maison"), "Maison");
    assert.equal(formatF010ReviewValue("adresse", "12 rue des Lilas"), "12 rue des Lilas");
  });
});
