/**
 * Compagnon INPI — Phase 4.5.5.2 : UI de régularisation (sans réseau).
 * Run: npx tsx --test src/components/lmnp/inpi-companion/inpi-companion-regularisation-ui.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  canSubmitRegularizationMessage,
  clipRegularizationMessage,
  INITIAL_REGULARISATION_UI,
  reduceRegularisationUi,
  REGULARISATION_COPY,
  REGULARIZATION_MESSAGE_MAX,
  regularisationCounterLabel,
  regularisationResultSections,
} from "./inpi-companion-regularisation-ui";

const PANEL_SOURCE = readFileSync(
  fileURLToPath(new URL("./InpiCompanionPanel.tsx", import.meta.url)),
  "utf8",
);

const CHAT_SOURCE = readFileSync(
  fileURLToPath(new URL("./InpiCompanionChat.tsx", import.meta.url)),
  "utf8",
);

function regularisationViewSource(): string {
  const viewStart = PANEL_SOURCE.indexOf("function RegularisationView(");
  assert.ok(viewStart >= 0);
  const nextFunctionStart = PANEL_SOURCE.indexOf("\nfunction ", viewStart + 1);
  return PANEL_SOURCE.slice(viewStart, nextFunctionStart > 0 ? nextFunctionStart : undefined);
}

const FIXTURE_FULL = {
  summary: "Le message semble demander une correction.",
  points: ["Vérifier l'information concernée."],
  uncertainty: "Le motif exact doit être confirmé sur le site INPI.",
};

const FIXTURE_AMBIGUOUS = {
  summary: "Le message est ambigu.",
  points: [] as string[],
};

describe("limite et saisie", () => {
  it("compteur initial 0 / 2000", () => {
    assert.equal(REGULARIZATION_MESSAGE_MAX, 2000);
    assert.equal(regularisationCounterLabel(""), "0 / 2000");
  });

  it("texte non vide → analyse possible ; espaces seuls → invalide", () => {
    assert.equal(canSubmitRegularizationMessage(""), false);
    assert.equal(canSubmitRegularizationMessage("   "), false);
    assert.equal(canSubmitRegularizationMessage("correction SIRET"), true);
  });

  it("2000 caractères acceptés ; au-delà clipé", () => {
    const exact = "a".repeat(2000);
    const over = "a".repeat(2001);
    assert.equal(canSubmitRegularizationMessage(exact), true);
    assert.equal(canSubmitRegularizationMessage(over), false);
    assert.equal(clipRegularizationMessage(over).length, 2000);
    assert.equal(regularisationCounterLabel(over), "2000 / 2000");
  });
});

describe("états UI (reducer, aucun réseau)", () => {
  it("texte vide → validation locale, pas d'analyse", () => {
    const next = reduceRegularisationUi(INITIAL_REGULARISATION_UI, { type: "analyze", message: "  " });
    assert.equal(next.phase, "compose");
    assert.equal(next.validationError, REGULARISATION_COPY.empty);
    assert.equal(next.analysis, undefined);
  });

  it("texte valide en 4.5.5.2 → reste en compose (placeholder, pas d'analyzing)", () => {
    const next = reduceRegularisationUi(INITIAL_REGULARISATION_UI, {
      type: "analyze",
      message: "L'INPI demande un complément",
    });
    assert.equal(next.phase, "compose");
    assert.equal(next.validationError, undefined);
  });

  it("annulation → état initial", () => {
    const analyzing = reduceRegularisationUi(INITIAL_REGULARISATION_UI, { type: "analysis_started" });
    const cancelled = reduceRegularisationUi(analyzing, { type: "cancel" });
    assert.deepEqual(cancelled, INITIAL_REGULARISATION_UI);
  });

  it("analyzing placeholder → phase analyzing", () => {
    const next = reduceRegularisationUi(INITIAL_REGULARISATION_UI, { type: "analysis_started" });
    assert.equal(next.phase, "analyzing");
    assert.equal(next.analysis, undefined);
  });

  it("fixture complète → summary, points, uncertainty", () => {
    const next = reduceRegularisationUi(INITIAL_REGULARISATION_UI, {
      type: "analysis_succeeded",
      analysis: FIXTURE_FULL,
    });
    assert.equal(next.phase, "result");
    const sections = regularisationResultSections(next.analysis!);
    assert.equal(sections.summary, FIXTURE_FULL.summary);
    assert.deepEqual(sections.points, FIXTURE_FULL.points);
    assert.equal(sections.uncertainty, FIXTURE_FULL.uncertainty);
  });

  it("points vides → aucune section Points à vérifier", () => {
    const sections = regularisationResultSections(FIXTURE_AMBIGUOUS);
    assert.equal(sections.summary, FIXTURE_AMBIGUOUS.summary);
    assert.equal(sections.points, null);
    assert.equal(sections.uncertainty, null);
  });

  it("erreur générique, sans message technique", () => {
    const next = reduceRegularisationUi(INITIAL_REGULARISATION_UI, { type: "analysis_failed" });
    assert.equal(next.phase, "error");
    assert.doesNotMatch(REGULARISATION_COPY.error, /OpenAI|fetch|API error|stack/i);
  });

  it("modifier / réessayer reviennent à la textarea (compose)", () => {
    const result = reduceRegularisationUi(INITIAL_REGULARISATION_UI, {
      type: "analysis_succeeded",
      analysis: FIXTURE_FULL,
    });
    assert.equal(reduceRegularisationUi(result, { type: "edit" }).phase, "compose");
    const failed = reduceRegularisationUi(INITIAL_REGULARISATION_UI, { type: "analysis_failed" });
    assert.equal(reduceRegularisationUi(failed, { type: "retry" }).phase, "compose");
  });
});

describe("RegularisationView — source Panel", () => {
  const view = regularisationViewSource();

  it("textarea unique, label, compteur, boutons", () => {
    assert.match(view, /REGULARISATION_COPY\.textareaLabel/);
    assert.match(view, /clipRegularizationMessage/);
    assert.match(view, /regularisationCounterLabel/);
    assert.match(view, /REGULARISATION_COPY\.analyze/);
    assert.match(view, /REGULARISATION_COPY\.cancel/);
    assert.match(view, /maxLength=\{REGULARIZATION_MESSAGE_MAX\}/);
  });

  it("états analyzing / result / error représentables", () => {
    assert.match(view, /ui\.phase === "analyzing"/);
    assert.match(view, /ui\.phase === "result"/);
    assert.match(view, /ui\.phase === "error"/);
    assert.match(view, /REGULARISATION_COPY\.analyzing/);
    assert.match(view, /REGULARISATION_COPY\.reminder/);
    assert.match(view, /REGULARISATION_COPY\.error/);
    assert.match(view, /sections\.points/);
    assert.match(view, /sections\.uncertainty/);
  });

  it("bouton → POST regularization_analysis, contexte whitelist, fallback d'échec", () => {
    assert.match(view, /fetch\(INPI_COMPANION_CHAT_LLM_ROUTE/);
    assert.match(view, /kind: "regularization_analysis"/);
    assert.match(view, /supabase\.auth\.getSession\(\)/);
    assert.match(view, /authToken/);
    assert.match(view, /message,/);
    assert.match(view, /context,/);
    assert.match(view, /type: "analysis_succeeded"/);
    assert.match(view, /type: "analysis_failed"/);
    assert.match(view, /REGULARISATION_COPY\.error/);
    assert.doesNotMatch(view, /openai|OpenAI|OPENAI_API_KEY/i);
    assert.doesNotMatch(view, /\bdispatch\(/);
    assert.doesNotMatch(view, /DECLARATION_PATCH_DRAFT/);
    assert.doesNotMatch(view, /updateInpiStatus/);
    assert.doesNotMatch(view, /inpiCompanionState/);
    assert.doesNotMatch(view, /setTimeout/);
    assert.doesNotMatch(view, /console\.(log|debug|info|warn)/);
    assert.doesNotMatch(view, /localStorage/);
    assert.doesNotMatch(PANEL_SOURCE, /beginRegularizationAnalysisPlaceholder/);
    assert.doesNotMatch(PANEL_SOURCE, /from "@\/lib\/lmnp\/services\/inpi\/inpi-companion-llm"/);
  });

  it("RegularisationView reçoit le contexte déjà construit, pas un contexte parallèle", () => {
    assert.match(PANEL_SOURCE, /context=\{chatContext\}/);
    assert.match(view, /context: RegularisationWhitelistedContext/);
    assert.doesNotMatch(view, /buildInpiCompanionChatContext/);
    assert.doesNotMatch(view, /fiscalYear/);
    assert.doesNotMatch(view, /workspace/);
    assert.doesNotMatch(view, /properties/);
  });
});

describe("isolation chat", () => {
  it("InpiCompanionChat n'ajoute pas de textarea de régularisation", () => {
    assert.doesNotMatch(CHAT_SOURCE, /regularizationMessage/);
    assert.doesNotMatch(CHAT_SOURCE, /REGULARISATION_COPY/);
    assert.doesNotMatch(CHAT_SOURCE, /<textarea/);
  });
});
