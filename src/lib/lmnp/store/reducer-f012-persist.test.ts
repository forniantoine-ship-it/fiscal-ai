import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { lmnpReducer, type LmnpState } from "./reducer";
import type { FiscalYear, Property } from "../types";
import type { F012PersistedState } from "@/runtime";

function baseFiscalYear(): FiscalYear {
  return {
    id: "fy-1",
    year: 2024,
    status: "draft",
    regime: "reel",
    propertyIds: ["prop-1"],
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
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

function persistedAt(step: F012PersistedState["step"], currentCategoryIndex: number, updatedAt: string): F012PersistedState {
  return {
    step,
    categoryInventory: ["taxe_fonciere", "assurance_pno", "frais_bancaires", "divers"],
    currentCategoryIndex,
    collected: { coproLignes: [], travaux: [], divers: [], skippedCategories: [] },
    fieldSources: {},
    updatedAt,
  };
}

describe("reducer.ts — F-012 Cycle 2 (K) double save rapide", () => {
  it("deux DECLARATION_PATCH_DRAFT successifs : la dernière version de chargesAssistantState gagne", () => {
    const first = persistedAt("category_collect", 1, "2024-03-01T10:00:00.000Z");
    const second = persistedAt("category_collect", 2, "2024-03-01T10:00:00.500Z");

    const afterFirst = lmnpReducer(baseState(), {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { chargesAssistantState: first },
    });
    const afterSecond = lmnpReducer(afterFirst, {
      type: "DECLARATION_PATCH_DRAFT",
      patch: { chargesAssistantState: second },
    });

    assert.equal(afterSecond.declarationDraft?.chargesAssistantState?.currentCategoryIndex, 2);
    assert.equal(afterSecond.declarationDraft?.chargesAssistantState?.updatedAt, "2024-03-01T10:00:00.500Z");
  });
});
