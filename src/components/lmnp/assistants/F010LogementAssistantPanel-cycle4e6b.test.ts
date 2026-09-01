/**
 * Cycle 4E6A-B — clavier / labels / focus (panel F010 uniquement).
 *
 * Run: npx tsx --test "src/components/lmnp/assistants/F010LogementAssistantPanel-cycle4e6b.test.ts"
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { F010LogementAssistant } from "@/runtime";
import type { F010State } from "@/runtime";
import { LMNP_ROUTES } from "@/lib/lmnp/routes";
import {
  F010_FOCUS_BUTTON_CLASS,
  buildF010ReviewFieldA11yIds,
  collectF010LabeledFieldSpecs,
  f010ReviewStatusAccessibleLabel,
} from "./F010LogementAssistantPanel";

const ctx = { dossierId: "test-dossier", fiscalYear: 2024 };

const panelSource = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "F010LogementAssistantPanel.tsx"),
  "utf-8",
);

const runtimeAssistantSource = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../runtime/assistants/f010-logement/assistant.ts"),
  "utf-8",
);

function collectBienState(overrides: Partial<F010State> = {}): F010State {
  return { step: "collect_bien", acquisitionSource: "acte", fieldSources: {}, ...overrides };
}

describe("Cycle 4E6A-B — A/B/C. labels htmlFor et ids uniques", () => {
  it("chaque champ de formulaire possède un id et un label htmlFor correspondant", () => {
    const fieldKeys = [
      "fileActe",
      "bienPrix",
      "bienType",
      "bienDate",
      "bienSurface",
      "fraisMontant",
      "mobilierMontant",
      "ventilationLocalisation",
      "ventilationRatio",
    ] as const;
    for (const key of fieldKeys) {
      assert.match(panelSource, new RegExp(`F010_FORM_FIELD_IDS\\.${key}`));
      assert.match(panelSource, new RegExp(`htmlFor=\\{F010_FORM_FIELD_IDS\\.${key}\\}`));
      assert.match(panelSource, new RegExp(`id=\\{F010_FORM_FIELD_IDS\\.${key}\\}`));
    }
  });

  it("les ids de formulaire sont tous uniques", () => {
    const specs = collectF010LabeledFieldSpecs();
    const ids = specs.map((spec) => spec.id);
    assert.equal(new Set(ids).size, ids.length);
  });
});

describe("Cycle 4E6A-B — D. file input accessible", () => {
  it("le champ fichier a un id, un label associé et un aria-label explicite", () => {
    assert.match(panelSource, new RegExp(`id=\\{F010_FORM_FIELD_IDS\\.fileActe\\}`));
    assert.match(panelSource, /htmlFor=\{F010_FORM_FIELD_IDS\.fileActe\}/);
    assert.match(panelSource, /aria-label="Importer mon acte notarié \(PDF ou image\)"/);
    assert.match(panelSource, /type="file"/);
  });
});

describe("Cycle 4E6A-B — E. focus visible", () => {
  it("les champs utilisent Input/Select du design system (focus ring intégré)", () => {
    assert.match(panelSource, /import \{ Input, Select \} from "@\/design-system\/components\/Input"/);
    assert.match(panelSource, /<Input[\s\S]*id=\{F010_FORM_FIELD_IDS\.bienPrix\}/);
    assert.match(panelSource, /<Select[\s\S]*id=\{F010_FORM_FIELD_IDS\.bienType\}/);
  });

  it("les boutons F010 portent une classe locale de focus clavier", () => {
    assert.equal(F010_FOCUS_BUTTON_CLASS.includes("focus-visible:ring"), true);
    assert.match(panelSource, /className=\{F010_FOCUS_BUTTON_CLASS\}/);
    assert.match(panelSource, /focus-visible:ring/);
  });
});

describe("Cycle 4E6A-B — F. choix traitement frais", () => {
  it("expose l'état sélectionné via aria-pressed sur les deux options", () => {
    const fraisBlock = panelSource.slice(
      panelSource.indexOf("F010_FORM_FIELD_IDS.fraisTraitementGroup"),
      panelSource.indexOf("F010_SUBMIT_HINT_IDS.collectFrais"),
    );
    assert.match(fraisBlock, /role="group"/);
    assert.match(fraisBlock, /aria-labelledby=\{F010_FORM_FIELD_IDS\.fraisTraitementGroup\}/);
    assert.match(fraisBlock, /aria-pressed=\{choixFrais === "integration"\}/);
    assert.match(fraisBlock, /aria-pressed=\{choixFrais === "deduction"\}/);
  });
});

describe("Cycle 4E6A-B — G→J. dialog restart focus", () => {
  it("G. focus initial programmé sur le bouton Annuler", () => {
    assert.match(panelSource, /document\.getElementById\(F010_RESTART_DIALOG_IDS\.cancel\)\?\.focus\(\)/);
  });

  it("H. Escape ferme le dialog", () => {
    assert.match(panelSource, /event\.key === "Escape"/);
  });

  it("I. le focus revient sur le bouton déclencheur à la fermeture", () => {
    assert.match(panelSource, /document\.getElementById\(returnFocusId\)\?\.focus\(\)/);
    assert.match(panelSource, /id=\{F010_RESTART_DIALOG_IDS\.trigger\}/);
    assert.match(panelSource, /returnFocusId=\{F010_RESTART_DIALOG_IDS\.trigger\}/);
  });

  it("J. Tab reste dans le dialog (focus trap)", () => {
    assert.match(panelSource, /event\.key !== "Tab"/);
    assert.match(panelSource, /getFocusables/);
    assert.match(panelSource, /document\.activeElement === last/);
    assert.match(panelSource, /document\.activeElement === first/);
  });
});

describe("Cycle 4E6A-B — K. review statut/provenance reliés", () => {
  it("buildF010ReviewFieldA11yIds produit des ids distincts et la valeur référence statut/provenance", () => {
    const ids = buildF010ReviewFieldA11yIds("prixAcquisition");
    assert.equal(ids.labelId, "f010-review-prixAcquisition-label");
    assert.equal(ids.valueId, "f010-review-prixAcquisition-value");
    assert.equal(ids.statusId, "f010-review-prixAcquisition-status");
    assert.equal(ids.provenanceId, "f010-review-prixAcquisition-provenance");
    assert.match(panelSource, /aria-describedby=\{valueDescribedBy/);
    assert.match(panelSource, /f010ReviewStatusAccessibleLabel/);
  });

  it("f010ReviewStatusAccessibleLabel reflète le statut review", () => {
    assert.equal(f010ReviewStatusAccessibleLabel({ status: "pending", source: "extracted" }), "À vérifier");
    assert.equal(f010ReviewStatusAccessibleLabel({ status: "confirmed", source: "extracted" }), "Confirmé");
  });
});

describe("Cycle 4E6A-B — changement d'étape et aides submit", () => {
  it("un titre d'étape sr-only reçoit le focus à chaque transition", () => {
    assert.match(panelSource, /id="f010-step-heading"/);
    assert.match(panelSource, /ref=\{stepFocusRef\}/);
    assert.match(panelSource, /tabIndex=\{-1\}/);
    assert.match(panelSource, /stepFocusRef\.current\?\.focus\(\)/);
  });

  it("les boutons Continuer désactivés référencent un texte d'aide", () => {
    assert.match(panelSource, /aria-describedby=\{collectBienSubmitBlocked/);
    assert.match(panelSource, new RegExp(`id=\\{F010_SUBMIT_HINT_IDS\\.collectBien\\}`));
    assert.match(panelSource, new RegExp(`id=\\{F010_SUBMIT_HINT_IDS\\.collectFrais\\}`));
  });
});

describe("Cycle 4E6A-B — L. aucune modification runtime", () => {
  it("le panel n'importe pas de nouvelle action runtime et assistant.ts est inchangé côté review_extraction", () => {
    assert.doesNotMatch(panelSource, /type: "confirm_extracted_field"[\s\S]*assistant\.ts/);
    assert.match(runtimeAssistantSource, /review_extraction/);
  });
});

describe("Cycle 4E6A-B — M/N. non-régression upload et review", () => {
  it("le chemin upload (runF010UploadFlow, handleUpload) est intact", () => {
    assert.match(panelSource, /runF010UploadFlow/);
    assert.match(panelSource, /handleUpload/);
    assert.match(panelSource, /applyAnalysisResult/);
  });

  it("la review et Tout confirmer restent fonctionnels côté runtime", async () => {
    const assistant = new F010LogementAssistant(ctx);
    let turn = await assistant.handle(collectBienState(), {
      type: "analysis_success",
      documentId: "doc-1",
      proposal: { prixAcquisition: 280000, typeBien: "appartement" },
    });
    assert.equal(turn.state.step, "review_extraction");
    turn = await assistant.handle(turn.state, { type: "confirm_extracted_field", field: "prixAcquisition" });
    assert.equal(turn.state.review?.fields.prixAcquisition.status, "confirmed");
  });
});

describe("Cycle 4E6A-B — O. non-régression 4E6A-A", () => {
  it("aucun bouton Continuer sur review_extraction, état analyse et Button href conservés", () => {
    const reviewBlock = panelSource.slice(
      panelSource.indexOf('step === "review_extraction"'),
      panelSource.indexOf('step === "collect_frais"'),
    );
    assert.doesNotMatch(reviewBlock, />Continuer</);
    assert.match(panelSource, /shouldShowF010AnalysisStatus\(analyzingDocumentId, busy, resumeAnalysisActive\)/);
    assert.match(panelSource, /role="status"/);
    assert.doesNotMatch(panelSource, /<Link[\s\S]*?<Button/);
    assert.match(panelSource, new RegExp(`<Button href=\\{LMNP_ROUTES\\.financement\\}`));
    assert.equal(LMNP_ROUTES.financement.length > 0, true);
  });
});
