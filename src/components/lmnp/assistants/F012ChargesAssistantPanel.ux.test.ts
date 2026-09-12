/**
 * Phase D — F012 panel UX: plus de transcript visuel, actions métier inchangées.
 *
 * Run: npx tsx --test "src/components/lmnp/assistants/F012ChargesAssistantPanel.ux.test.ts"
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "path";

const here = path.dirname(fileURLToPath(import.meta.url));
const panelSource = readFileSync(path.join(here, "F012ChargesAssistantPanel.tsx"), "utf-8");
const captureSource = readFileSync(path.join(here, "F012FamilyCapture.tsx"), "utf-8");

describe("F012 panel — Phase D UX source", () => {
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

  it("conserve FamilyCard, CoverageRecap au completeness, et les actions existantes", () => {
    assert.match(panelSource, /<FamilyCard/);
    assert.match(panelSource, /CoverageRecap/);
    assert.match(panelSource, /step === "completeness"/);
    assert.match(panelSource, /type: "submit_profilage"/);
    assert.match(panelSource, /type: "revisit_incomplete"/);
    assert.match(panelSource, /type: "revisit_family"/);
    assert.match(panelSource, /type: "confirm_all"/);
    assert.match(panelSource, /open_family_paper/);
    assert.match(panelSource, /open_family_manual/);
    assert.match(captureSource, /export function FamilyCard/);
    assert.match(captureSource, /type: "none_family"/);
    assert.match(captureSource, /type: "unknown_family"/);
  });

  it("conserve l'annonceur accessible et la règle de visibilité du Retour", () => {
    assert.match(panelSource, /history\.length > 0/);
    assert.match(panelSource, /step !== "complete"/);
    assert.match(panelSource, /aria-live="polite"/);
    assert.match(panelSource, /className="sr-only"/);
  });

  it("garde une hiérarchie completeness et une FamilyCard décisionnelle", () => {
    assert.match(panelSource, /function headingForStep/);
    assert.match(panelSource, /completenessFiletSuggestions/);
    assert.match(panelSource, /function QuietChip/);
    assert.match(captureSource, /open_family_paper/);
    assert.match(captureSource, /open_family_manual/);
    assert.match(captureSource, /variant="secondary"/);
    assert.doesNotMatch(panelSource, /"Votre document"/);
    assert.doesNotMatch(captureSource, /"Votre document"/);
  });

  it("câble la review documentaire et la FamilyCard vers les actions existantes", () => {
    assert.match(captureSource, /function ReviewActionButton/);
    assert.match(captureSource, /type="button"/);
    assert.match(captureSource, /pointerEvents: "auto"/);
    assert.match(captureSource, /type: "confirm_proposal"/);
    assert.match(captureSource, /type: "modify_proposal"/);
    assert.match(captureSource, /type: "ignore_proposal"/);
    assert.match(captureSource, /type: "confirm_all_proposals"/);
    assert.match(captureSource, /type: "commit_document_review"/);
    assert.match(panelSource, /onAction=\{\(action\) => void runAction\(action\)\}/);
    assert.match(panelSource, /stateRef\.current = turn\.state/);
    assert.match(panelSource, /type:\s*"go_back"/);
    assert.match(captureSource, /type: "open_family_paper"/);
    assert.match(captureSource, /type: "open_family_manual"/);
    assert.match(captureSource, /type: "none_family"/);
    assert.match(captureSource, /type: "unknown_family"/);
    assert.match(captureSource, /ReviewActionButton[\s\S]*type: "confirm_proposal"/);
    assert.match(captureSource, /ReviewActionButton[\s\S]*type: "confirm_all_proposals"/);
    assert.match(captureSource, /ReviewActionButton[\s\S]*type: "commit_document_review"/);
  });

  it("le split travaux a un bouton de validation, pas seulement la touche Entrée", () => {
    assert.match(panelSource, /function TravauxSplitField/);
    assert.match(panelSource, /type: "submit_travaux_split"/);
    const fieldSource = panelSource.slice(
      panelSource.indexOf("function TravauxSplitField"),
      panelSource.indexOf("function TravauxSplitField") + 1000,
    );
    assert.match(fieldSource, /onKeyDown/, "soumission au clavier (Entrée) conservée");
    assert.match(fieldSource, /<Button/, "un bouton visible permet aussi de valider, pas seulement Entrée");
  });
});
