/**
 * Cycle 4E6A-A — corrections accessibilité critiques (panel F010 uniquement).
 *
 * Run: npx tsx --test "src/components/lmnp/assistants/F010LogementAssistantPanel-cycle4e6a.test.ts"
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { F010LogementAssistant } from "@/runtime";
import type { F010State } from "@/runtime";
import {
  computeF010ReviewConfirmableFields,
  computeF010ReviewVisibleEntries,
} from "./F010LogementAssistantPanel";
import { LMNP_ROUTES } from "@/lib/lmnp/routes";

const ctx = { dossierId: "test-dossier", fiscalYear: 2024 };

const panelSource = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "F010LogementAssistantPanel.tsx"),
  "utf-8",
);

function collectBienState(overrides: Partial<F010State> = {}): F010State {
  return { step: "collect_bien", acquisitionSource: "acte", fieldSources: {}, ...overrides };
}

describe("Cycle 4E6A-A — 1. review_extraction : aucun bouton Continuer mort", () => {
  it("le JSX review_extraction ne contient plus de bouton Continuer", () => {
    const reviewBlock = panelSource.slice(
      panelSource.indexOf('step === "review_extraction"'),
      panelSource.indexOf('step === "collect_frais"'),
    );
    assert.doesNotMatch(reviewBlock, />Continuer</);
    assert.doesNotMatch(reviewBlock, /reviewComplete/);
  });

  it("review pending : le runtime et les actions de review restent inchangés", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: { prixAcquisition: 280000, typeBien: "appartement" },
    });
    assert.equal(turn.state.step, "review_extraction");
    const visible = computeF010ReviewVisibleEntries(turn.state.review);
    assert.ok(computeF010ReviewConfirmableFields(turn.state, visible).length > 0);
  });

  it("GO_BACK depuis une review complète revisitée : inchangé", async () => {
    const assistant = new F010LogementAssistant(ctx);
    let turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: { prixAcquisition: 280000, typeBien: "appartement" },
    });
    turn = await assistant.handle(turn.state, { type: "confirm_extracted_field", field: "prixAcquisition" });
    turn = await assistant.handle(turn.state, { type: "confirm_extracted_field", field: "typeBien" });
    const back = await assistant.handle(turn.state, { type: "go_back" });
    assert.equal(back.state.step, "review_extraction");
    assert.equal(back.state.prixAcquisition, 280000);
  });
});

describe("Cycle 4E6A-A — 2. état d'analyse accessible", () => {
  it("role=status, aria-live, aria-busy et message présents, conditionnés à showAnalysisStatus", () => {
    assert.match(panelSource, /shouldShowF010AnalysisStatus\(analyzingDocumentId, busy, resumeAnalysisActive\)/);
    assert.match(panelSource, /role="status"/);
    assert.match(panelSource, /aria-live="polite"/);
    assert.match(panelSource, /aria-busy="true"/);
    assert.match(panelSource, /Analyse de votre document en cours/);
    assert.match(panelSource, /Nous récupérons automatiquement les informations utiles/);
  });

  it("le statut disparaît logiquement quand la condition est fausse (pas de branche else persistante)", () => {
    assert.match(
      panelSource,
      /\{showAnalysisStatus \? \(\s*\n\s*<div role="status"/,
    );
    assert.doesNotMatch(panelSource, /role="status"[\s\S]*analyzingDocumentId[\s\S]*: null\s*:\s*<div role="status"/);
  });
});

describe("Cycle 4E6A-A — 3. Link + Button : corrigé", () => {
  it("aucune occurrence de <Link> englobant un <Button> dans le panel F010", () => {
    assert.doesNotMatch(panelSource, /<Link[\s\S]*?<Button/);
    assert.doesNotMatch(panelSource, /import Link from/);
  });

  it("les hrefs de navigation sont conservés via Button href", () => {
    assert.match(panelSource, new RegExp(`<Button href=\\{LMNP_ROUTES\\.dashboard\\}`));
    assert.match(panelSource, new RegExp(`<Button href=\\{LMNP_ROUTES\\.financement\\}`));
    assert.equal(LMNP_ROUTES.dashboard.length > 0, true);
    assert.equal(LMNP_ROUTES.financement.length > 0, true);
  });
});
