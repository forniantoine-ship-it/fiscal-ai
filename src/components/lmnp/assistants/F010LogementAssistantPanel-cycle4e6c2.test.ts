/**
 * Cycle 4E6A-C2 — conflits review + « Tout confirmer » (panel F010 uniquement).
 *
 * Run: npx tsx --test "src/components/lmnp/assistants/F010LogementAssistantPanel-cycle4e6c2.test.ts"
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { F010LogementAssistant } from "@/runtime";
import type { F010ReviewFieldKey, F010State } from "@/runtime";
import {
  buildF010BulkConfirmAnnouncement,
  buildF010ConflictAnnouncement,
  collectF010ReviewConflictFields,
  detectF010NewConflictFields,
  isF010ReviewFieldConflict,
  pickLastF010AssistantMessageFromDelta,
  resolveF010AnnouncementDedup,
  resolveF010ConflictAnnouncement,
} from "./F010LogementAssistantPanel";

const ctx = { dossierId: "test-dossier", fiscalYear: 2024 };

const panelSource = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "F010LogementAssistantPanel.tsx"),
  "utf-8",
);

function collectBienState(overrides: Partial<F010State> = {}): F010State {
  return { step: "collect_bien", acquisitionSource: "acte", fieldSources: {}, ...overrides };
}

async function stateWithPrixConflict(): Promise<F010State> {
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
  return turn.state;
}

describe("Cycle 4E6A-C2 — A/B. conflit false→true annoncé une fois", () => {
  it("A. buildF010ConflictAnnouncement — format libellé unique", () => {
    const text = buildF010ConflictAnnouncement(["prixAcquisition"]);
    assert.match(text ?? "", /^Prix d'achat : cette information diffère/);
    assert.match(text ?? "", /Choisissez quelle valeur conserver\.$/);
  });

  it("B. resolveF010ConflictAnnouncement ne réannonce pas au render suivant", () => {
    const announced = new Set<F010ReviewFieldKey>(["prixAcquisition"]);
    const again = resolveF010ConflictAnnouncement(announced, {
      step: "review_extraction",
      acquisitionSource: "acte",
      fieldSources: {},
      prixAcquisition: 250000,
      confirmed: { prixAcquisition: true },
      review: {
        documentId: "doc-2",
        fields: {
          prixAcquisition: { status: "pending", proposedValue: "280000", source: "extracted" },
          dateAcquisition: { status: "unavailable" },
          typeBien: { status: "confirmed", proposedValue: "appartement", source: "extracted" },
          surface: { status: "unavailable" },
          adresse: { status: "unavailable" },
          fraisNotaire: { status: "unavailable" },
        },
      },
    } as F010State);
    assert.equal(again.text, null);
    assert.equal(again.newConflictFields.length, 0);
  });
});

describe("Cycle 4E6A-C2 — C/D. conflits multiples et cartes visuelles", () => {
  it("C. deux conflits simultanés → une annonce synthétique", () => {
    const text = buildF010ConflictAnnouncement(["prixAcquisition", "typeBien"]);
    assert.equal(
      text,
      "Plusieurs informations diffèrent de vos réponses précédentes. Vérifiez les valeurs proposées.",
    );
  });

  it("D. la carte review conserve le détail visuel sans aria-live", async () => {
    const state = await stateWithPrixConflict();
    assert.equal(isF010ReviewFieldConflict(state, "prixAcquisition", state.review!.fields.prixAcquisition), true);
    const reviewBlock = panelSource.slice(
      panelSource.indexOf('{step === "review_extraction" && state.review'),
      panelSource.indexOf('{step === "collect_frais"'),
    );
    assert.match(reviewBlock, /Cette information diffère de votre réponse précédente/);
    assert.doesNotMatch(reviewBlock, /aria-live/);
  });
});

describe("Cycle 4E6A-C2 — E/F. Tout confirmer", () => {
  it("E. buildF010BulkConfirmAnnouncement — une annonce de synthèse", () => {
    const text = buildF010BulkConfirmAnnouncement({
      confirmedCount: 3,
      hasRemainingConflicts: false,
      transitionAssistantMessage: null,
    });
    assert.equal(text, "3 informations confirmées.");
  });

  it("F. les messages user ne sont jamais annoncés via pickLastF010AssistantMessageFromDelta", () => {
    const delta = [
      { role: "user" as const, content: "Je confirme : 280000" },
      { role: "user" as const, content: "Je confirme : appartement" },
    ];
    assert.equal(pickLastF010AssistantMessageFromDelta(delta), null);
    assert.match(panelSource, /buildF010BulkConfirmAnnouncement/);
    assert.doesNotMatch(panelSource, /announceFromDelta\(accumulatedMessages/);
  });
});

describe("Cycle 4E6A-C2 — G/H. confirmation partielle et conflits restants", () => {
  it("G. confirmation partielle avec conflits restants", () => {
    const text = buildF010BulkConfirmAnnouncement({
      confirmedCount: 2,
      hasRemainingConflicts: true,
      transitionAssistantMessage: null,
    });
    assert.equal(
      text,
      "2 informations confirmées. Certaines informations nécessitent encore votre vérification.",
    );
  });

  it("H. ne présente jamais un conflit restant comme résolu", () => {
    const text = buildF010BulkConfirmAnnouncement({
      confirmedCount: 1,
      hasRemainingConflicts: true,
      transitionAssistantMessage: "Combien avez-vous payé de frais de notaire ?",
    });
    assert.match(text ?? "", /nécessitent encore votre vérification/);
    assert.doesNotMatch(text ?? "", /Combien avez-vous payé/);
  });
});

describe("Cycle 4E6A-C2 — I. bulk + transition → une seule annonce", () => {
  it("fusionne compteur et message de transition 4E2", () => {
    const transition =
      "Combien avez-vous payé de frais de notaire ? Vous pourrez choisir de les ajouter à la valeur du bien ou de les déduire immédiatement.";
    const text = buildF010BulkConfirmAnnouncement({
      confirmedCount: 2,
      hasRemainingConflicts: false,
      transitionAssistantMessage: transition,
    });
    assert.equal(text, `2 informations confirmées. ${transition}`);
    assert.equal((text?.match(/informations confirmées/g) ?? []).length, 1);
  });
});

describe("Cycle 4E6A-C2 — J. compteur sans aria-live", () => {
  it("le compteur review reste visuel uniquement", () => {
    const reviewBlock = panelSource.slice(
      panelSource.indexOf('{step === "review_extraction" && state.review'),
      panelSource.indexOf('{step === "collect_frais"'),
    );
    assert.match(reviewBlock, /reviewResolvedCount/);
    assert.doesNotMatch(reviewBlock, /aria-live/);
  });
});

describe("Cycle 4E6A-C2 — K. refresh ne répète pas l'annonce de conflit", () => {
  it("announcedConflictsRef est initialisé avec les conflits déjà présents", async () => {
    const state = await stateWithPrixConflict();
    const conflicts = collectF010ReviewConflictFields(state);
    assert.ok(conflicts.includes("prixAcquisition"));
    assert.match(panelSource, /announcedConflictsRef = useRef\(\s*new Set\(collectF010ReviewConflictFields\(initialResume\.turn\.state\)\)/);
    const replay = resolveF010ConflictAnnouncement(new Set(conflicts), state);
    assert.equal(replay.text, null);
  });
});

describe("Cycle 4E6A-C2 — L. conflit + focus → pas de double annonce", () => {
  it("announceConflictsForState saute le focus lors d'une transition d'étape", () => {
    assert.match(panelSource, /announceConflictsForState\(turn\.state/);
    assert.match(panelSource, /if \(!announcedConflict\) \{\s*announceFromDelta/);
    assert.match(panelSource, /skipStepFocus:\s*\n?\s*options\?\.previousStep !== undefined/);
  });
});

describe("Cycle 4E6A-C2 — M. review sans conflit inchangée", () => {
  it("sans nouveau conflit, announceFromDelta reste utilisé", async () => {
    const assistant = new F010LogementAssistant(ctx);
    const turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: { prixAcquisition: 280000 },
    });
    assert.equal(collectF010ReviewConflictFields(turn.state).length, 0);
    assert.match(panelSource, /if \(!announcedConflict\) \{\s*announceFromDelta\(turn\.messages/);
  });
});

describe("Cycle 4E6A-C2 — N. erreurs extraction inchangées", () => {
  it("LogementExtractionFallbackCard conserve sa région status dédiée", () => {
    assert.match(panelSource, /LogementExtractionFallbackCard/);
    assert.match(panelSource, /extractionOutcome\?\.state === "failed"/);
    const announcerMatches = panelSource.match(/id=\{F010_ANNOUNCER_ID\}/g);
    assert.equal(announcerMatches?.length, 1);
  });
});

describe("Cycle 4E6A-C2 — O. non-régression C1", () => {
  it("annonceur unique et déduplication conservés", () => {
    assert.match(panelSource, new RegExp(`id=\\{F010_ANNOUNCER_ID\\}`));
    assert.match(panelSource, /resolveF010AnnouncementDedup/);
    assert.match(panelSource, /useState\(\(\) => initialAssistantAnnouncement \?\? ""/);
  });
});

describe("Cycle 4E6A-C2 — P. non-régression A/B", () => {
  it("shouldShowF010AnalysisStatus et labels review conservés", () => {
    assert.match(panelSource, /shouldShowF010AnalysisStatus\(analyzingDocumentId, busy, resumeAnalysisActive\)/);
    assert.match(panelSource, /buildF010ReviewFieldA11yIds/);
    assert.match(panelSource, /id="f010-step-heading"/);
  });
});

describe("Cycle 4E6A-C2 — détection transition false→true", () => {
  it("detectF010NewConflictFields isole les nouveaux conflits", () => {
    const already = new Set<"prixAcquisition">(["prixAcquisition"]);
    assert.deepEqual(detectF010NewConflictFields(already, ["prixAcquisition", "typeBien"]), ["typeBien"]);
  });

  it("resolveF010AnnouncementDedup évite la double annonce textuelle", () => {
    const first = resolveF010AnnouncementDedup("Prix d'achat : cette information diffère.", null);
    const second = resolveF010AnnouncementDedup("Prix d'achat : cette information diffère.", first.nextLastAnnounced);
    assert.ok(first.text);
    assert.equal(second.text, null);
  });
});
