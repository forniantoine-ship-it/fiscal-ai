/**
 * Phase A — F011 panel UX: plus de transcript visuel, actions métier inchangées.
 *
 * Run: npx tsx --test "src/components/lmnp/assistants/F011FinancementAssistantPanel.ux.test.ts"
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "path";

const panelSource = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "F011FinancementAssistantPanel.tsx"),
  "utf-8",
);

describe("F011 panel — Phase A UX source", () => {
  it("ne rend plus le transcript visuel", () => {
    assert.doesNotMatch(panelSource, /messages\.map\(/);
    assert.doesNotMatch(panelSource, /function MessageBubble/);
    assert.doesNotMatch(panelSource, /function SuggestionButton/);
  });

  it("conserve le Retour métier go_back", () => {
    assert.match(panelSource, /type:\s*"go_back"/);
    assert.match(panelSource, /← Retour/);
    assert.doesNotMatch(panelSource, /router\.back\(/);
    assert.doesNotMatch(panelSource, /← Précédent/);
  });

  it("conserve le câblage des actions existantes", () => {
    assert.match(panelSource, /const handleSuggestion/);
    assert.match(panelSource, /suggestionId === "yes"/);
    assert.match(panelSource, /suggestionId === "no"/);
    assert.match(panelSource, /type: "set_presence_emprunt"/);
    assert.match(panelSource, /type: "submit_loan_terms"/);
    assert.match(panelSource, /type: "confirm_loan"/);
    assert.match(panelSource, /type: "confirm_all"/);
    assert.match(panelSource, /type: "confirm_extraction"/);
    assert.match(panelSource, /keep_existing:/);
    assert.match(panelSource, /use_document:/);
    assert.match(panelSource, /edit_loan:/);
  });

  it("conserve la règle de visibilité du Retour et l'annonceur accessible", () => {
    assert.match(panelSource, /history\.length > 0/);
    assert.match(panelSource, /step !== "complete"/);
    assert.match(panelSource, /step !== "skipped"/);
    assert.match(panelSource, /aria-live="polite"/);
    assert.match(panelSource, /className="sr-only"/);
  });
});
