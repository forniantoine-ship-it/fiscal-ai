/**
 * R0.7 — No fake data.
 *
 * Une absence de donnée ne doit jamais être remplacée par une donnée métier inventée
 * (logement, montant, prêt, loyer, prix d'acquisition). Absence → absence.
 *
 * Run: npx tsx --test src/lib/lmnp/services/r07-no-fake-data.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import type { LmnpState } from "../store/reducer";
import type { PersistedWorkspace } from "../store/persistence";
import type { FiscalYear, Property } from "../types";
import * as amortissementProfile from "./amortissement-profile";
import * as inpiProfile from "./inpi-profile";
import * as logementProfile from "./logement-profile";
import * as revenusProfile from "./revenus-profile";
import { createEmptyRevenueSession } from "./revenue-gpt-ui-prefill";

const FISCAL_YEAR = 2026;

function fiscalYear(): FiscalYear {
  return {
    id: "fy-1",
    year: FISCAL_YEAR,
    status: "draft",
    regime: "reel",
    propertyIds: ["prop-1"],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

function blankProperty(id: string): Property {
  return { id, label: "", address: "", city: "", postalCode: "" };
}

function state(draft: LmnpState["declarationDraft"] = { completedSteps: [] }): LmnpState {
  return {
    fiscalYear: fiscalYear(),
    properties: [blankProperty("prop-1")],
    documents: [],
    extractions: [],
    validationItems: [],
    ledgerEntries: [],
    declarationDraft: draft,
    fileRegistry: new Map(),
  };
}

function workspace(draft: PersistedWorkspace["declarationDraft"] = { completedSteps: [] }): PersistedWorkspace {
  return {
    fiscalYear: fiscalYear(),
    properties: [blankProperty("prop-1")],
    documents: [],
    extractions: [],
    validationItems: [],
    ledgerEntries: [],
    declarationDraft: draft,
  };
}

async function reducer() {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://test.invalid.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
  return (await import("../store/reducer")).lmnpReducer;
}

function source(relative: string): string {
  return readFileSync(new URL(relative, import.meta.url), "utf8");
}

/** Valeurs fictives connues (R0.5) — jamais dans les chemins production concernés. */
const KNOWN_FAKE_MARKERS = [
  "Studio Lyon",
  "Bordeaux Gambetta",
  "Prêt immobilier détecté",
  "Tantièmes 45/1000",
  "185000",
  "Cuisine IKEA",
  "829456123",
  "Marie",
];

const PRODUCTION_FILES = [
  "./logement-profile.ts",
  "./revenue-gpt-ui-prefill.ts",
  "./revenus-profile.ts",
  "./amortissement-profile.ts",
  "./inpi-profile.ts",
  "../../../components/lmnp/documents/LogementDocumentStep.tsx",
  "../../../components/lmnp/documents/AmortissementDocumentStep.tsx",
];

describe("R0.7 — Oracle A : Logement", () => {
  it("le module logement n'expose aucun échafaudage MOCK_LOGEMENT_*", () => {
    const exported = Object.keys(logementProfile).filter((name) => name.startsWith("MOCK_"));
    assert.deepEqual(exported, []);
  });

  it("l'étape Logement ne peut pas reprendre un fond fictif à la confirmation", () => {
    assert.doesNotMatch(source("../../../components/lmnp/documents/LogementDocumentStep.tsx"), /MOCK_LOGEMENT/);
  });

  it("confirmation sans extraction : aucune valeur de fond n'est persistée", async () => {
    const lmnpReducer = await reducer();
    const empty = logementProfile.propertyToFormValues(blankProperty("prop-1"));
    const backgroundExtraction = logementProfile.logementBackgroundFromFormValues(empty, undefined);
    const next = lmnpReducer(state(), {
      type: "CONFIRM_LOGEMENT_PROFILE",
      profile: logementProfile.formValuesToProperty(empty),
      backgroundExtraction,
    });
    const persisted = next.declarationDraft?.propertyBackgroundExtraction;
    assert.equal(persisted?.furnitureAmount, undefined);
    assert.equal(persisted?.creditHints, undefined);
    assert.equal(persisted?.acquisitionPrice, undefined);
    assert.equal(persisted?.notaryFees, undefined);
    assert.doesNotMatch(JSON.stringify(next.declarationDraft ?? {}), /12000|180 000|245000|18500/);
  });

  it("une extraction réelle existante est conservée, un zéro réel reste zéro", async () => {
    const lmnpReducer = await reducer();
    const real = { furnitureAmount: 3_400, creditHints: "Offre BNP 2024" };
    const values = { ...logementProfile.propertyToFormValues(blankProperty("prop-1")), notaryFees: "0" };
    const backgroundExtraction = logementProfile.logementBackgroundFromFormValues(values, real);
    const next = lmnpReducer(state({ completedSteps: [], propertyBackgroundExtraction: real }), {
      type: "CONFIRM_LOGEMENT_PROFILE",
      profile: logementProfile.formValuesToProperty(values),
      backgroundExtraction,
    });
    assert.deepEqual(next.declarationDraft?.propertyBackgroundExtraction, { ...real, notaryFees: 0 });
  });
});

describe("R0.7 — Oracle B : Revenus", () => {
  it("aucun bien réel → session vide, aucun logement inventé", () => {
    const session = createEmptyRevenueSession([], FISCAL_YEAR);
    assert.deepEqual(session.properties, []);
    assert.deepEqual(session.ui?.expandedPropertyIds, []);
  });

  it("biens réels sans libellé → identifiants réels, aucun libellé fictif", () => {
    const session = createEmptyRevenueSession([blankProperty("home-1"), blankProperty("home-2")], FISCAL_YEAR);
    assert.deepEqual(session.properties.map((p) => [p.id, p.propertyId]), [["home-1", "home-1"], ["home-2", "home-2"]]);
    assert.doesNotMatch(JSON.stringify(session), /Bordeaux|Gambetta|Lyon|Part-Dieu|Studio|Appartement|property-1/);
  });

  it("un libellé réel est conservé tel quel", () => {
    const session = createEmptyRevenueSession([{ ...blankProperty("home-1"), label: "T2 Nantes" }], FISCAL_YEAR);
    assert.equal(session.properties[0]?.label, "T2 Nantes");
  });

  it("aucun loyer fictif : le générateur buildRevenusExtraction n'existe plus", () => {
    assert.equal("buildRevenusExtraction" in revenusProfile, false);
  });
});

describe("R0.7 — Oracle C : Amortissement", () => {
  it("prix d'acquisition absent → aucun composant dérivé d'un prix inventé", () => {
    const ventilation = amortissementProfile.buildVentilationFromDossier(workspace(), []);
    assert.deepEqual(ventilation.components.filter((c) => c.source === "dossier"), []);
    assert.doesNotMatch(JSON.stringify(ventilation), /27750|185000/);
  });

  it("prix d'acquisition réel → ventilation inchangée (non-régression)", () => {
    const ventilation = amortissementProfile.buildVentilationFromDossier(
      workspace({ completedSteps: [], propertyBackgroundExtraction: { acquisitionPrice: 200_000 } }),
      [],
    );
    const terrain = ventilation.components.find((c) => c.label === "Terrain");
    assert.equal(terrain?.amount, 30_000);
  });

  it("aucune facture fictive exposée ni injectée en mode manuel", () => {
    assert.equal("MOCK_EXTRACTED_INVOICES" in amortissementProfile, false);
    assert.doesNotMatch(source("../../../components/lmnp/documents/AmortissementDocumentStep.tsx"), /MOCK_EXTRACTED_INVOICES/);
  });
});

describe("R0.7 — Oracle D : garde anti-fake sur les chemins production concernés", () => {
  it("aucune identité d'exploitant fictive exportée", () => {
    assert.equal("withActiviteMockFallbacks" in inpiProfile, false);
  });

  for (const file of PRODUCTION_FILES) {
    it(`${file} ne contient aucune valeur fictive connue`, () => {
      const content = source(file);
      for (const marker of KNOWN_FAKE_MARKERS) {
        assert.equal(content.includes(marker), false, `${file} contient « ${marker} »`);
      }
    });
  }
});
