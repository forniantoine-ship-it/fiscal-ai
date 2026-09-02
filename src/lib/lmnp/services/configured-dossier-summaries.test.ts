import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolveChargesDashboardSummary } from "./configured-dossier-summaries";
import { formatCurrency as formatChargesCurrency } from "./charges-profile";
import type { ChargesExtractionData, DeclarationDraft } from "@/lib/lmnp/types/domain";

function chargesExtractionFixture(totalCharges: number): ChargesExtractionData {
  return {
    categories: [],
    recoveredFromOtherSteps: 0,
    amortizationSuggestions: [],
    summary: { totalCharges, categoryCount: 0, recoverableTotal: 0, nonRecoverableTotal: 0 },
  };
}

/**
 * P0-3A (audit 2026-09-02) — resolveChargesDashboardSummary() ne doit plus
 * retourner null pour un dossier complété via le parcours officiel
 * (chargesAssistant, F-012) simplement parce que la structure legacy
 * (chargesExtraction, ChargesDocumentStep) n'a jamais été écrite.
 */
describe("resolveChargesDashboardSummary()", () => {
  it("chargesAssistant présent, chargesExtraction absent → résumé non-null dérivé de totalDeductible", () => {
    const draft = {
      completedSteps: [],
      chargesAssistant: {
        exerciceFiscal: 2025,
        totalDeductible: 2450,
        totalNonDeductible: 0,
        totalAmortissable: 0,
        totalPreExploitation: 0,
        parCategorie: {},
        composantsNouveaux: [],
        fieldSources: {},
        computedAt: "2026-08-31T00:00:00.000Z",
      },
    } as unknown as DeclarationDraft;

    const summary = resolveChargesDashboardSummary(draft);

    assert.notEqual(summary, null, "le parcours officiel (chargesAssistant seul) doit produire un résumé");
    assert.equal(summary, `${formatChargesCurrency(2450)} de charges déductibles`);
  });

  it("chargesExtraction présent → comportement historique inchangé (docs · total, chargesAssistant ignoré)", () => {
    const draft = {
      completedSteps: [],
      chargesConfirmedAt: "2026-08-31T00:00:00.000Z",
      chargesExtraction: chargesExtractionFixture(1200),
      chargesAssistant: {
        exerciceFiscal: 2025,
        totalDeductible: 9999,
        totalNonDeductible: 0,
        totalAmortissable: 0,
        totalPreExploitation: 0,
        parCategorie: {},
        composantsNouveaux: [],
        fieldSources: {},
        computedAt: "2026-08-31T00:00:00.000Z",
      },
    } as unknown as DeclarationDraft;

    const summary = resolveChargesDashboardSummary(draft);

    assert.equal(summary, `0 documents · ${formatChargesCurrency(1200)}`, "chargesExtraction reste la source du résumé quand elle est présente, comme avant P0-3A");
  });

  it("ni chargesExtraction ni chargesAssistant → null, comme avant P0-3A", () => {
    const draft = { completedSteps: [] } as unknown as DeclarationDraft;
    assert.equal(resolveChargesDashboardSummary(draft), null);
  });

  it("chargesConfirmedAt seul, sans chargesExtraction ni chargesAssistant → null, comme avant P0-3A", () => {
    const draft = {
      completedSteps: [],
      chargesConfirmedAt: "2026-08-31T00:00:00.000Z",
    } as unknown as DeclarationDraft;
    assert.equal(resolveChargesDashboardSummary(draft), null);
  });
});
