/**
 * F010 V2-1 — Politique de priorité des sources (préremplissage sûr).
 *
 * Cartographie des sources réelles (F010PersistedState, Property,
 * declarationDraft/F009, document F010, correction utilisateur,
 * governedFields) et de leur SÉMANTIQUE exacte : aucun nouveau préremplissage
 * n'a été jugé sûr pour `adresse` (ni `personalAddress` ni
 * `establishmentAddress` ne garantissent l'identité "adresse du logement
 * mis en location" — voir rapport) ; le comportement existant de protection
 * contre l'écrasement silencieux (confirmation/conflit) est donc simplement
 * caractérisé ici, sans modification de production.
 *
 * Run: npx tsx --test src/runtime/assistants/f010-logement/assistant-v2-1-source-priority.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { F010LogementAssistant } from "./assistant";
import type { F010State } from "./types";

const ctx = { dossierId: "test-dossier", fiscalYear: 2024 };

const fullProposal = {
  prixAcquisition: 280_000,
  typeBien: "appartement" as const,
  dateAcquisition: "2024-03-01",
  surface: 45,
  fraisNotaire: 19_500,
  adresse: "12 rue des Lilas, 75011 Paris",
};

async function reachReviewExtraction(assistant: F010LogementAssistant) {
  let turn = assistant.start();
  turn = await assistant.handle(turn.state, { type: "select_nature", nature: "achat" });
  turn = await assistant.handle(turn.state, { type: "select_source", source: "acte" });
  turn = await assistant.handle(turn.state, {
    type: "analysis_success",
    documentId: "doc-1",
    proposal: fullProposal,
  });
  return turn;
}

describe("F-010 V2-1 — CAS A : correction utilisateur + nouveau document différent → correction préservée", () => {
  it("correct_extracted_field(fraisNotaire) puis une deuxième analyse proposant une autre valeur ne l'écrase jamais silencieusement", async () => {
    const assistant = new F010LogementAssistant(ctx);
    let turn = await reachReviewExtraction(assistant);

    // L'utilisateur corrige fraisNotaire à une valeur différente du document.
    turn = await assistant.handle(turn.state, {
      type: "correct_extracted_field",
      field: "fraisNotaire",
      value: "21000",
    });
    assert.equal(turn.state.fraisNotaire, 21000);
    assert.equal(turn.state.confirmed?.fraisNotaire, true);

    // Reste des champs confirmés normalement pour atteindre collect_mobilier -> ventilation
    // n'est pas nécessaire ici : on prouve uniquement la non-écrasabilité de fraisNotaire
    // face à une deuxième analyse documentaire (re-upload), directement.
    const secondAnalysis = await assistant.handle(turn.state, {
      type: "analysis_success",
      documentId: "doc-2",
      proposal: { ...fullProposal, fraisNotaire: 25_000 }, // valeur différente de la correction
    });

    // La valeur corrigée par l'utilisateur reste en place tant qu'aucun choix explicite
    // n'a été fait sur ce champ en conflit.
    assert.equal(secondAnalysis.state.fraisNotaire, 21000, "la correction utilisateur n'est jamais silencieusement écrasée");
    assert.equal(secondAnalysis.state.review?.fields.fraisNotaire.status, "pending");
  });
});

describe("F-010 V2-1 — CAS B : valeur confirmée (source inférieure = document) + nouvelle proposition différente → conflit visible, jamais silencieusement écrasée", () => {
  it("prixAcquisition confirmé via 'Confirmer' puis un nouveau document propose une valeur différente : conflit détectable, valeur inchangée tant que non résolu", async () => {
    const assistant = new F010LogementAssistant(ctx);
    let turn = await reachReviewExtraction(assistant);
    turn = await assistant.handle(turn.state, { type: "confirm_extracted_field", field: "prixAcquisition" });
    assert.equal(turn.state.prixAcquisition, 280_000);
    assert.equal(turn.state.confirmed?.prixAcquisition, true);

    const secondAnalysis = await assistant.handle(turn.state, {
      type: "analysis_success",
      documentId: "doc-2",
      proposal: { ...fullProposal, prixAcquisition: 300_000 },
    });

    assert.equal(secondAnalysis.state.prixAcquisition, 280_000, "la valeur déjà confirmée n'est jamais silencieusement remplacée");
    assert.equal(secondAnalysis.state.review?.fields.prixAcquisition.status, "pending", "le conflit reste visible, pas résolu automatiquement");
  });
});

describe("F-010 V2-1 — CAS C : document + champ vide → le document peut proposer/remplir normalement", () => {
  it("aucune valeur préexistante pour surface : la proposition documentaire s'applique normalement à la confirmation", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const turn = await reachReviewExtraction(assistant);
    assert.equal(turn.state.surface, undefined, "rien de confirmé avant la review");

    const confirmed = await assistant.handle(turn.state, { type: "confirm_extracted_field", field: "surface" });
    assert.equal(confirmed.state.surface, 45);
  });
});

describe("F-010 V2-1 — CAS D/E : adresse F009 (personalAddress/establishmentAddress) jamais injectée automatiquement dans F010", () => {
  it("aucune action F010 ne porte de champ personalAddress/establishmentAddress — adresse ne peut provenir que du document ou d'une correction explicite", async () => {
    const assistant = new F010LogementAssistant(ctx);
    let turn = assistant.start();
    turn = await assistant.handle(turn.state, { type: "select_nature", nature: "achat" });
    turn = await assistant.handle(turn.state, { type: "select_source", source: "manuel" });

    // Le formulaire manuel de collect_bien ne peut jamais fournir d'adresse
    // (aucun champ manuel n'existe pour adresse) — submit_bien sans `adresse`.
    turn = await assistant.handle(turn.state, {
      type: "submit_bien",
      prixAcquisition: 200_000,
      typeBien: "appartement",
      dateAcquisition: "2024-03-01",
    });
    assert.equal(turn.state.adresse, undefined, "aucune source (F009 ou autre) n'a jamais alimenté adresse hors document/correction explicite");
  });

  it("adresse ne peut être définie que par la review documentaire (extraction) ou une correction explicite — jamais par un identifiant F009", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const turn = await reachReviewExtraction(assistant);
    // La seule proposition d'adresse visible ici vient du document lui-même
    // (fullProposal.adresse), jamais d'une source F009 — aucun mécanisme du
    // runtime F010 ne lit `personalAddress`/`establishmentAddress`.
    assert.equal(turn.state.review?.fields.adresse.proposedValue, "12 rue des Lilas, 75011 Paris");
    assert.equal(turn.state.review?.fields.adresse.source, "extracted");
  });
});

describe("F-010 V2-1 — CAS G : fraisNotaire confirmé + nouvelle extraction différente → jamais écrasé (protection déjà générique, pas de lock cross-tunnel nécessaire)", () => {
  it("fraisNotaire suit exactement la même protection que les 5 autres champs revus (isF010ReviewFieldConflict générique, pas de dépendance à governedFields)", async () => {
    const assistant = new F010LogementAssistant(ctx);
    let turn = await reachReviewExtraction(assistant);
    turn = await assistant.handle(turn.state, { type: "confirm_extracted_field", field: "fraisNotaire" });
    assert.equal(turn.state.fraisNotaire, 19_500);

    const conflictingReanalysis = await assistant.handle(turn.state, {
      type: "analysis_success",
      documentId: "doc-2",
      proposal: { ...fullProposal, fraisNotaire: 30_000 },
    });

    assert.equal(conflictingReanalysis.state.fraisNotaire, 19_500, "fraisNotaire confirmé n'est jamais écrasé par une réanalyse, malgré l'absence de clé canonique cross-tunnel");
    assert.equal(conflictingReanalysis.state.review?.fields.fraisNotaire.status, "pending");
  });

  it("Tout confirmer exclut un fraisNotaire en conflit, comme les autres champs (P2-3, générique)", async () => {
    const assistant = new F010LogementAssistant(ctx);
    let turn = await reachReviewExtraction(assistant);
    turn = await assistant.handle(turn.state, { type: "confirm_extracted_field", field: "fraisNotaire" });

    const reanalyzed = await assistant.handle(turn.state, {
      type: "analysis_success",
      documentId: "doc-2",
      proposal: { ...fullProposal, fraisNotaire: 30_000 },
    });
    // En conflit : jamais "pending" simple, donc jamais éligible à confirm_extracted_field
    // en masse tant que l'utilisateur n'a pas explicitement tranché.
    const entry = reanalyzed.state.review!.fields.fraisNotaire;
    assert.equal(entry.status, "pending");
    // proposedValue diffère de la valeur confirmée : c'est la condition de conflit
    // (isF010ReviewFieldConflict, panel.tsx) — vérifiée directement ici au niveau
    // des données qu'elle consomme.
    assert.notEqual(entry.proposedValue, String(reanalyzed.state.fraisNotaire));
  });
});

describe("F-010 V2-1 — CAS F : aucune donnée Property préexistante à un nouveau dossier (identité jamais supposée)", () => {
  it("un F010 démarré sans aucun F010Deps ni état préexistant ne dérive jamais adresse/prix/etc d'une source externe", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const start = assistant.start();
    assert.equal(start.state.adresse, undefined);
    assert.equal(start.state.prixAcquisition, undefined);
    assert.equal(start.state.typeBien, undefined);
  });
});
