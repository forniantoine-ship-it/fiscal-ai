/**
 * Cycle 4E6A-C1 — annonceur accessible unique (panel F010 uniquement).
 *
 * Run: npx tsx --test "src/components/lmnp/assistants/F010LogementAssistantPanel-cycle4e6c1.test.ts"
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { F010LogementAssistant } from "@/runtime";
import type { F010Message, F010State } from "@/runtime";
import {
  F010_ANNOUNCER_ID,
  pickLastF010AssistantMessageFromDelta,
  resolveF010AnnouncementText,
  shouldShowF010AnalysisStatus,
  shouldSkipF010InitialStepFocus,
  shouldSkipF010StepFocusForAnnouncement,
} from "./F010LogementAssistantPanel";

const ctx = { dossierId: "test-dossier", fiscalYear: 2024 };

const panelSource = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "F010LogementAssistantPanel.tsx"),
  "utf-8",
);

function collectBienState(overrides: Partial<F010State> = {}): F010State {
  return { step: "collect_bien", acquisitionSource: "acte", fieldSources: {}, ...overrides };
}

describe("Cycle 4E6A-C1 — A/B. une seule région aria-live générale", () => {
  it("A. l'annonceur unique existe avec aria-live polite et aria-atomic", () => {
    assert.match(panelSource, new RegExp(`id=["']${F010_ANNOUNCER_ID}["']|id=\\{F010_ANNOUNCER_ID\\}`));
    assert.match(panelSource, /aria-live="polite"[\s\S]*aria-atomic="true"[\s\S]*className="sr-only"/);
    const announcerMatches = panelSource.match(/id=\{F010_ANNOUNCER_ID\}/g);
    assert.equal(announcerMatches?.length, 1);
  });

  it("B. MessageBubble n'a pas aria-live", () => {
    const bubbleBlock = panelSource.slice(
      panelSource.indexOf("function MessageBubble"),
      panelSource.indexOf("function PlanSummary"),
    );
    assert.doesNotMatch(bubbleBlock, /aria-live/);
  });
});

describe("Cycle 4E6A-C1 — C/D/E. delta assistant uniquement + déduplication", () => {
  it("C. pickLastF010AssistantMessageFromDelta prend le dernier assistant du delta", () => {
    const delta: F010Message[] = [
      { role: "user", content: "Je confirme : 280000" },
      { role: "assistant", content: "Premier" },
      { role: "assistant", content: "Dernier assistant" },
    ];
    assert.equal(pickLastF010AssistantMessageFromDelta(delta), "Dernier assistant");
  });

  it("D. les messages user ne sont jamais annoncés", () => {
    const delta: F010Message[] = [{ role: "user", content: "Je confirme : 280000" }];
    assert.equal(pickLastF010AssistantMessageFromDelta(delta), null);
  });

  it("E. resolveF010AnnouncementText évite les doublons", () => {
    const delta: F010Message[] = [{ role: "assistant", content: "Reprenons là où vous en étiez." }];
    const first = resolveF010AnnouncementText(delta, null);
    assert.equal(first.text, "Reprenons là où vous en étiez.");
    const second = resolveF010AnnouncementText(delta, first.nextLastAnnounced);
    assert.equal(second.text, null);
  });
});

describe("Cycle 4E6A-C1 — F/G. runAction et bulk confirm branchés", () => {
  it("F. runAction appelle announceFromDelta avec le delta turn.messages", () => {
    assert.match(panelSource, /announceFromDelta\(turn\.messages, \{ previousStep, nextStep: turn\.state\.step \}\)/);
    assert.doesNotMatch(panelSource, /announceFromDelta\(messages/);
  });

  it("G. runBulkConfirmReview produit une annonce de synthèse unique", () => {
    assert.match(panelSource, /buildF010BulkConfirmAnnouncement\(/);
    assert.match(panelSource, /announceText\(bulkAnnouncement/);
    assert.doesNotMatch(panelSource, /announceFromDelta\(accumulatedMessages/);
  });
});

describe("Cycle 4E6A-C1 — H. compteur review sans aria-live", () => {
  it("le compteur X sur Y n'est plus une région live", () => {
    const reviewBlock = panelSource.slice(
      panelSource.indexOf('{step === "review_extraction" && state.review'),
      panelSource.indexOf('{step === "collect_frais"'),
    );
    assert.match(reviewBlock, /reviewResolvedCount/);
    assert.doesNotMatch(reviewBlock, /aria-live="polite"/);
  });
});

describe("Cycle 4E6A-C1 — I/J. coordination focus × annonce", () => {
  it("I. transition + message assistant → skip focus", () => {
    assert.equal(
      shouldSkipF010StepFocusForAnnouncement("collect_bien", "review_extraction", [
        { role: "assistant", content: "J'ai trouvé ces informations dans votre acte. Vérifions-les ensemble." },
      ]),
      true,
    );
    assert.match(panelSource, /skipStepFocusRef\.current = true/);
  });

  it("J. transition sans message assistant → focus titre", () => {
    assert.equal(shouldSkipF010StepFocusForAnnouncement("review_plan", "complete", []), false);
    assert.match(panelSource, /stepFocusRef\.current\?\.focus\(\)/);
  });
});

describe("Cycle 4E6A-C1 — K/L. reprise au montage", () => {
  it("K. shouldSkipF010InitialStepFocus saute le focus si session reprise avec message assistant", () => {
    assert.equal(
      shouldSkipF010InitialStepFocus("resume_analysis", [
        { role: "assistant", content: "Reprenons là où vous en étiez." },
      ]),
      true,
    );
    assert.equal(
      shouldSkipF010InitialStepFocus("start", [{ role: "assistant", content: "Bonjour" }]),
      false,
    );
  });

  it("L. lastAnnouncedRef évite une double annonce au re-render", () => {
    assert.match(panelSource, /lastAnnouncedRef/);
    assert.match(panelSource, /resolveF010AnnouncementText\(delta, lastAnnouncedRef\.current\)/);
    assert.match(panelSource, /useState\(\(\) => initialAssistantAnnouncement \?\? ""/);
    assert.equal(resolveF010AnnouncementText([{ role: "assistant", content: "Bonjour" }], "Bonjour").text, null);
  });
});

describe("Cycle 4E6A-C1 — M/N. analyse et erreur", () => {
  it("M. reprise d'analyse annoncée via shouldShowF010AnalysisStatus", () => {
    assert.equal(shouldShowF010AnalysisStatus("doc-1", false, true), true);
    assert.match(panelSource, /shouldShowF010AnalysisStatus\(analyzingDocumentId, busy, resumeAnalysisActive\)/);
    assert.match(panelSource, /resume_analysis/);
    assert.match(panelSource, /setResumeAnalysisActive\(false\)/);
  });

  it("N. erreur extraction conserve sa région status dédiée", () => {
    assert.match(panelSource, /LogementExtractionFallbackCard/);
    assert.match(panelSource, /extractionOutcome\?\.state === "failed"/);
  });
});

describe("Cycle 4E6A-C1 — O/P. non-régression 4E6A-A/B", () => {
  it("O. analyse status + pas de Continuer mort sur review", () => {
    assert.match(panelSource, /shouldShowF010AnalysisStatus/);
    assert.match(panelSource, /role="status"[\s\S]*Analyse de votre document en cours/);
    const reviewBlock = panelSource.slice(
      panelSource.indexOf('step === "review_extraction"'),
      panelSource.indexOf('step === "collect_frais"'),
    );
    assert.doesNotMatch(reviewBlock, />Continuer</);
  });

  it("P. labels htmlFor, focus boutons et dialog restart inchangés", () => {
    assert.match(panelSource, /htmlFor=\{F010_FORM_FIELD_IDS\.bienPrix\}/);
    assert.match(panelSource, /F010_FOCUS_BUTTON_CLASS/);
    assert.match(panelSource, /returnFocusId=\{F010_RESTART_DIALOG_IDS\.trigger\}/);
  });
});

describe("Cycle 4E6A-C1 — runtime inchangé", () => {
  it("pickLastF010AssistantMessageFromDelta fonctionne sur un vrai turn analysis_success", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: { prixAcquisition: 280000, typeBien: "appartement" },
    });
    const text = pickLastF010AssistantMessageFromDelta(turn.messages);
    assert.match(text ?? "", /J'ai trouvé ces informations/);
    assert.equal(
      turn.messages.some((message) => message.role === "user" && message.content.includes("Je confirme")),
      false,
    );
  });
});
