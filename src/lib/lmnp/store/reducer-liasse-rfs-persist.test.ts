import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { lmnpReducer, type LmnpState } from "./reducer";
import type { FiscalYear, Property } from "../types";
import { runDeclarationGeneration } from "@/lib/lmnp/services/declaration/run-declaration-generation";
import type { DeclarationDraft } from "@/lib/lmnp/types/domain";

function baseFiscalYear(): FiscalYear {
  return {
    id: "fy-1",
    year: 2025,
    status: "draft",
    regime: "reel",
    propertyIds: ["prop-1"],
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  };
}

function baseProperty(): Property {
  return { id: "prop-1", label: "", address: "", city: "", postalCode: "" };
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

/**
 * P0-1 (audit 2026-09-02) — avant ce commit, `liasseRfs` (2031-bis, 2033-A/B/C,
 * assemblés depuis la RFS) était calculé par runDeclarationGeneration() mais
 * n'existait pas dans DeclarationDraft : DECLARATION_PATCH_DRAFT ne pouvait
 * donc pas le persister, contrairement à fiscalResult/liasseResult/rfs.
 */
describe("reducer.ts — P0-1 : DECLARATION_PATCH_DRAFT persiste liasseRfs", () => {
  it("liasseRfs survit au passage par le reducer, au même titre que rfs/liasseResult", () => {
    const draft: DeclarationDraft = {
      completedSteps: [],
      siret: "12345678901234",
      siren: "123456789",
      exploitantFirstName: "Marie",
      exploitantLastName: "Dupont",
      dateMiseEnService: "2020-01-01",
      revenusAssistant: { exerciceFiscal: 2025, totalRecettes: 9000 },
      chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 2000, totalPreExploitation: 0 },
      amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 1500, status: "validated" },
    } as unknown as DeclarationDraft;

    const generation = runDeclarationGeneration(draft, 2025);
    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") return;

    const next = lmnpReducer(baseState(), {
      type: "DECLARATION_PATCH_DRAFT",
      patch: {
        fiscalResult: generation.fiscalResult,
        liasseResult: generation.liasseResult,
        rfs: generation.rfs,
        liasseRfs: generation.liasseRfs,
      },
    });

    assert.ok(next.declarationDraft?.liasseRfs, "liasseRfs doit être persisté par DECLARATION_PATCH_DRAFT");
    assert.equal(next.declarationDraft?.liasseRfs?.form2031Bis.formId, "2031-Bis-SD");
    assert.equal(next.declarationDraft?.liasseRfs?.form2033A.formId, "2033-A-SD");
    assert.equal(next.declarationDraft?.liasseRfs?.form2033B.formId, "2033-B-SD");
    assert.equal(next.declarationDraft?.liasseRfs?.form2033C.formId, "2033-C-SD");
    // Champs historiques non affectés par l'ajout de liasseRfs au patch.
    assert.equal(next.declarationDraft?.fiscalResult?.totalRecettes, 9000);
  });
});
