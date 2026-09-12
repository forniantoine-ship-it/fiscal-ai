/**
 * Extras documentaires — restitution du draft, aucun calcul.
 * Run: npx tsx --test src/lib/lmnp/services/declaration/collect-liasse-dossier-extras.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import type { DeclarationDraft, FiscalYear } from "@/lib/lmnp/types/domain";
import { collectLiasseDossierExtras } from "./collect-liasse-dossier-extras";

function draft(overrides: Partial<DeclarationDraft> = {}): DeclarationDraft {
  return { completedSteps: [], ...overrides };
}

describe("collectLiasseDossierExtras — architecture", () => {
  it("n'importe aucun moteur fiscal ni mapper Cerfa", () => {
    const source = readFileSync(path.join(import.meta.dirname, "collect-liasse-dossier-extras.ts"), "utf8");
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(code, /produceFiscalResult/);
    assert.doesNotMatch(code, /generateCerfa/);
    assert.doesNotMatch(code, /map-2033/);
    assert.doesNotMatch(code, /computeFinancementExercice/);
    assert.doesNotMatch(code, /computeChargesExercice/);
  });
});

describe("collectLiasseDossierExtras — omission si absent", () => {
  it("draft vide → undefined, jamais un fallback inventé", () => {
    assert.equal(collectLiasseDossierExtras({}), undefined);
    assert.equal(collectLiasseDossierExtras({ declarationDraft: draft() }), undefined);
    assert.equal(collectLiasseDossierExtras({ fiscalYear: { stocksOuverture: undefined } }), undefined);
  });

  it("n'invente pas LMNP / réel simplifié / bien / stocks d'ouverture", () => {
    const extras = collectLiasseDossierExtras({ declarationDraft: draft({ activityType: "SCI" as never }) });
    assert.equal(extras, undefined);
  });
});

describe("collectLiasseDossierExtras — restitution telle quelle", () => {
  it("transporte activityStartDate, activityType, régime F009 persisté", () => {
    const extras = collectLiasseDossierExtras({
      declarationDraft: draft({
        activityStartDate: "2025-02-01",
        activityType: "LMNP",
        activiteAssistantState: {
          step: "complete",
          regimeFiscal: "reel_simplifie",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      }),
    });
    assert.equal(extras?.activityStartDate, "2025-02-01");
    assert.equal(extras?.activityType, "LMNP");
    assert.equal(extras?.regimeFiscal, "reel_simplifie");
  });

  it("transporte le bien F010, les prêts F011 confirmés, les lignes F012, pas le pendingLoan", () => {
    const extras = collectLiasseDossierExtras({
      declarationDraft: draft({
        logementAssistantState: {
          step: "complete",
          adresse: "15 Rue Saint-Germain",
          typeBien: "appartement",
          dateAcquisition: "2025-02-01",
          prixAcquisition: 72500,
          fraisNotaire: 73,
          choixTraitementFrais: "deduction",
          fieldSources: {},
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        financementAssistantState: {
          step: "complete",
          currentLoanIndex: 0,
          loans: [
            {
              pretId: "pret-1",
              typePret: "amortissable",
              capitalInitial: 130751,
              tauxNominal: 0.032,
              dureeMois: 300,
              datePremiereMensualite: "2025-03-01",
            },
          ],
          pendingLoan: {
            pretId: "pending",
            typePret: "amortissable",
            capitalInitial: 1,
            tauxNominal: 0.01,
            dureeMois: 12,
            datePremiereMensualite: "2025-01-01",
          },
          fieldSources: {},
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        chargesAssistantState: {
          step: "complete",
          categoryInventory: [],
          currentCategoryIndex: 0,
          collected: {
            coproLignes: [{ type: "provisions", montant: 837, description: "T1" }],
            travaux: [{ id: "t1", description: "Peinture", montant: 400, choix: "reparation_identique" }],
            divers: [{ id: "d1", description: "Clé", montant: 12 }],
            familyLines: [{ id: "f1", familyId: "taxe_fonciere", category: "taxe_fonciere", description: "TF", montant: 50 }],
            skippedCategories: [],
          },
          fieldSources: {},
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      }),
    });
    assert.deepEqual(extras?.bien, {
      adresse: "15 Rue Saint-Germain",
      typeBien: "appartement",
      dateAcquisition: "2025-02-01",
      prixAcquisition: 72500,
      fraisNotaire: 73,
      choixTraitementFrais: "deduction",
    });
    assert.equal(extras?.pretsDescriptifs?.length, 1);
    assert.equal(extras?.pretsDescriptifs?.[0]?.pretId, "pret-1");
    assert.equal(extras?.pretsDescriptifs?.[0]?.capitalInitial, 130751);
    assert.equal(
      extras?.pretsDescriptifs?.some((p) => p.pretId === "pending"),
      false,
      "pendingLoan n'est pas un prêt confirmé",
    );
    assert.equal(extras?.chargesDescriptives?.coproLignes?.[0]?.montant, 837);
    assert.equal(extras?.chargesDescriptives?.travaux?.[0]?.description, "Peinture");
    assert.equal(extras?.chargesDescriptives?.divers?.[0]?.montant, 12);
    assert.equal(extras?.chargesDescriptives?.familyLines?.[0]?.montant, 50);
  });

  it("transporte stocksOuverture uniquement s'ils sont persistés sur l'exercice", () => {
    const fiscalYear: Pick<FiscalYear, "stocksOuverture"> = {
      stocksOuverture: {
        sourceClosureId: "c1",
        stocks: {
          deficits: [{ millesime: 2024, montant: 200 }],
          amortissementsReportes: 100,
        },
      },
    };
    const extras = collectLiasseDossierExtras({ fiscalYear });
    assert.deepEqual(extras?.stocksOuverture, {
      deficits: [{ millesime: 2024, montant: 200 }],
      amortissementsReportes: 100,
    });
  });
});
