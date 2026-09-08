/**
 * Compagnon INPI — Phase 4.5.2 : suggestions contextuelles du chat.
 * Run: npx tsx --test src/components/lmnp/inpi-companion/inpi-companion-chat-suggestions.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { InpiCompanionChatContext } from "./inpi-companion-chat-context";
import { buildInpiCompanionChatSuggestions } from "./inpi-companion-chat-suggestions";

function baseContext(overrides: Partial<InpiCompanionChatContext> = {}): InpiCompanionChatContext {
  return {
    mode: "creation",
    step: "identite",
    progressStatus: "active",
    currentQuestion: null,
    nextAction: "explain",
    knownValues: {},
    proposedValues: {},
    missingFields: [],
    conflicts: [],
    isMultiProperty: false,
    dossierInpiStatus: "not_started",
    ...overrides,
  };
}

describe("Suggestions contextuelles (§11)", () => {
  it("aucune situation particulière → repli 'Je suis perdu'", () => {
    assert.deepEqual(buildInpiCompanionChatSuggestions(baseContext()), ["Je suis perdu"]);
  });

  it("conflit actif → 'Je ne comprends pas cette différence'", () => {
    const context = baseContext({
      conflicts: [{ field: "siren_siret", previousValue: "A", newValue: "B" }],
    });
    assert.ok(buildInpiCompanionChatSuggestions(context).includes("Je ne comprends pas cette différence"));
  });

  it("mode régularisation → 'Je ne comprends pas le message de l'INPI'", () => {
    const context = baseContext({ mode: "regularisation" });
    assert.ok(buildInpiCompanionChatSuggestions(context).includes("Je ne comprends pas le message de l'INPI"));
  });

  it("étape SIREN/SIRET → 'À quoi sert le SIREN ?'", () => {
    const context = baseContext({ step: "siren_siret" });
    assert.ok(buildInpiCompanionChatSuggestions(context).includes("À quoi sert le SIREN ?"));
  });

  it("plusieurs biens → 'J'ai plusieurs logements'", () => {
    const context = baseContext({ isMultiProperty: true });
    assert.ok(buildInpiCompanionChatSuggestions(context).includes("J'ai plusieurs logements"));
  });

  it("mode diagnostic → 'Je ne sais pas si mon activité est déjà déclarée'", () => {
    const context = baseContext({ mode: "diagnostic", dossierInpiStatus: undefined });
    assert.ok(
      buildInpiCompanionChatSuggestions(context).includes("Je ne sais pas si mon activité est déjà déclarée"),
    );
  });

  it("étape synthèse → 'Je veux vérifier avant d'aller sur l'INPI'", () => {
    const context = baseContext({ step: "synthese" });
    assert.ok(buildInpiCompanionChatSuggestions(context).includes("Je veux vérifier avant d'aller sur l'INPI"));
  });

  it("jamais plus de 3 suggestions, même avec plusieurs signaux simultanés", () => {
    const context = baseContext({
      conflicts: [{ field: "siren_siret", previousValue: "A", newValue: "B" }],
      mode: "creation",
      step: "siren_siret",
      isMultiProperty: true,
    });
    const suggestions = buildInpiCompanionChatSuggestions(context);
    assert.ok(suggestions.length <= 3);
  });

  it("priorité : conflit reste en tête même combiné à d'autres signaux", () => {
    const context = baseContext({
      conflicts: [{ field: "siren_siret", previousValue: "A", newValue: "B" }],
      step: "siren_siret",
      isMultiProperty: true,
    });
    assert.equal(buildInpiCompanionChatSuggestions(context)[0], "Je ne comprends pas cette différence");
  });
});
