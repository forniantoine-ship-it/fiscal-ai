/**
 * Cycle 0 — bug 1 : CONFIRM_LOGEMENT_PROFILE ne doit jamais remplacer
 * `propertyBackgroundExtraction` en totalité, seulement le fusionner avec l'existant.
 * Run: npx tsx src/lib/lmnp/store/reducer-logement-background.test.ts
 */
import { lmnpReducer, type LmnpState } from "./reducer";
import type { FiscalYear, Property } from "../types";

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function baseFiscalYear(): FiscalYear {
  return {
    id: "fy-1",
    year: 2026,
    status: "draft",
    regime: "reel",
    propertyIds: ["prop-1"],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

function baseProperty(): Property {
  return {
    id: "prop-1",
    label: "",
    address: "",
    city: "",
    postalCode: "",
  };
}

function baseState(): LmnpState {
  return {
    fiscalYear: baseFiscalYear(),
    properties: [baseProperty()],
    documents: [],
    extractions: [],
    validationItems: [],
    ledgerEntries: [],
    declarationDraft: { completedSteps: [] },
    fileRegistry: new Map(),
  };
}

function runTests(): void {
  let passed = 0;
  let total = 0;

  function test(name: string, fn: () => void): void {
    total++;
    try {
      fn();
      passed++;
      console.log(`  ✓ ${name}`);
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(`    ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log("reducer.ts — Cycle 0, bug 1 (propertyBackgroundExtraction merge)");

  test("clé additionnelle existante (coproReferences) conservée après une confirmation ultérieure sans cette clé", () => {
    const afterFirst = lmnpReducer(baseState(), {
      type: "CONFIRM_LOGEMENT_PROFILE",
      profile: { address: "1 rue Test", city: "Paris" },
      backgroundExtraction: {
        acquisitionPrice: 200_000,
        coproReferences: "Lot 42 — Tantièmes 45/1000",
      },
    });
    assertEqual(
      afterFirst.declarationDraft?.propertyBackgroundExtraction?.coproReferences,
      "Lot 42 — Tantièmes 45/1000",
      "coproReferences présent après le premier CONFIRM_LOGEMENT_PROFILE",
    );

    const afterSecond = lmnpReducer(afterFirst, {
      type: "CONFIRM_LOGEMENT_PROFILE",
      profile: { address: "1 rue Test", city: "Paris" },
      backgroundExtraction: { acquisitionPrice: 210_000 },
    });
    assertEqual(
      afterSecond.declarationDraft?.propertyBackgroundExtraction?.coproReferences,
      "Lot 42 — Tantièmes 45/1000",
      "coproReferences toujours présent après un second CONFIRM_LOGEMENT_PROFILE qui ne la mentionne pas",
    );
    assertEqual(
      afterSecond.declarationDraft?.propertyBackgroundExtraction?.acquisitionPrice,
      210_000,
      "acquisitionPrice mis à jour par le second appel",
    );
  });

  test("comportement réel F010 (persistCompletion) : Tunnel A puis F010 ne perd pas coproReferences", () => {
    // Étape 1 — Tunnel A a déjà confirmé le logement avec des données de copropriété.
    const afterTunnelA = lmnpReducer(baseState(), {
      type: "CONFIRM_LOGEMENT_PROFILE",
      profile: { address: "1 rue Test", city: "Paris", label: "Appartement" },
      backgroundExtraction: {
        acquisitionPrice: 245_000,
        notaryFees: 18_500,
        coproReferences: "Lot 42 — Tantièmes 45/1000",
      },
      documentId: "doc-acte-1",
    });

    // Étape 2 — F010LogementAssistantPanel.persistCompletion (F010LogementAssistantPanel.tsx:189-206) :
    // reconstruit un littéral { acquisitionPrice, notaryFees, furnitureAmount } sans jamais lire
    // l'existant. Reproduit ici tel quel pour vérifier que le reducer, lui, fusionne correctement.
    const afterF010 = lmnpReducer(afterTunnelA, {
      type: "CONFIRM_LOGEMENT_PROFILE",
      profile: { propertyType: "appartement", surface: 62, acquisitionDate: "2022-09-14" },
      backgroundExtraction: {
        acquisitionPrice: 245_000,
        notaryFees: 18_500,
        furnitureAmount: 12_000,
      },
    });

    assertEqual(
      afterF010.declarationDraft?.propertyBackgroundExtraction?.coproReferences,
      "Lot 42 — Tantièmes 45/1000",
      "coproReferences (extrait par Tunnel A) survit à la complétion F010",
    );
    assertEqual(
      afterF010.declarationDraft?.propertyBackgroundExtraction?.furnitureAmount,
      12_000,
      "furnitureAmount (propre à F010) est bien écrit",
    );
  });

  test("idempotence : appliquer deux fois le même backgroundExtraction produit le même résultat", () => {
    const patch = { acquisitionPrice: 300_000, notaryFees: 20_000 };
    const once = lmnpReducer(baseState(), {
      type: "CONFIRM_LOGEMENT_PROFILE",
      profile: {},
      backgroundExtraction: patch,
    });
    const twice = lmnpReducer(once, {
      type: "CONFIRM_LOGEMENT_PROFILE",
      profile: {},
      backgroundExtraction: patch,
    });
    assertEqual(
      JSON.stringify(once.declarationDraft?.propertyBackgroundExtraction),
      JSON.stringify(twice.declarationDraft?.propertyBackgroundExtraction),
      "propertyBackgroundExtraction identique après application répétée du même patch",
    );
  });

  test("Tunnel A inchangé : son propre merge amont (...existing) reste correct une fois passé par le reducer", () => {
    // LogementDocumentStep.handleConfirm construit déjà backgroundExtraction via
    // logementBackgroundFromFormValues({...existing, ...}) avant de dispatcher — le reducer ne
    // doit pas casser ce comportement déjà correct (double-merge idempotent).
    const withExisting = lmnpReducer(baseState(), {
      type: "CONFIRM_LOGEMENT_PROFILE",
      profile: {},
      backgroundExtraction: { acquisitionPrice: 100_000, amortizationHints: "Bâtiment 85 %" },
    });
    const tunnelAMergedUpstream = {
      ...withExisting.declarationDraft?.propertyBackgroundExtraction,
      acquisitionPrice: 150_000,
    };
    const afterTunnelA = lmnpReducer(withExisting, {
      type: "CONFIRM_LOGEMENT_PROFILE",
      profile: {},
      backgroundExtraction: tunnelAMergedUpstream,
    });
    assertEqual(
      afterTunnelA.declarationDraft?.propertyBackgroundExtraction?.amortizationHints,
      "Bâtiment 85 %",
      "amortizationHints préservé via le merge amont de Tunnel A + le merge du reducer",
    );
    assertEqual(
      afterTunnelA.declarationDraft?.propertyBackgroundExtraction?.acquisitionPrice,
      150_000,
      "acquisitionPrice mis à jour",
    );
  });

  console.log(`\n${passed}/${total} tests passés`);
  if (passed !== total) process.exit(1);
}

runTests();
