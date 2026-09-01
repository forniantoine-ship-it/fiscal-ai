import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { rawLinesToTransactions } from "./revenue-transaction-pipeline";
import type { RevenueRawLine } from "../types";

/**
 * Cycle 17 — P3 : le chemin OCR/vision (rawLinesToTransactions) appliquait un
 * Math.abs() sur le montant, transformant silencieusement tout remboursement
 * ou régularisation négatif en recette positive, sans jamais lever d'anomalie.
 * Le chemin Excel/CSV structuré avait déjà été corrigé au Cycle 15B ; ce test
 * verrouille la même règle côté OCR.
 */
describe("Cycle 17 — P3 : le signe d'un montant OCR négatif est préservé", () => {
  it("un montant négatif reste négatif après rawLinesToTransactions (jamais Math.abs())", () => {
    const line: RevenueRawLine = {
      id: "l1",
      date: "10/06/2025",
      label: "Régularisation GLI",
      amount: -150,
      direction: "credit",
      sourceDocumentId: "doc1",
      sourceType: "bank_statement",
      confidence: 90,
    };

    const [transaction] = rawLinesToTransactions([line]);
    assert.equal(transaction!.amount, -150, "le montant négatif ne doit jamais être transformé en positif");
  });

  it("un montant positif reste positif (non-régression)", () => {
    const line: RevenueRawLine = {
      id: "l2",
      date: "10/06/2025",
      label: "Loyer",
      amount: 1000,
      direction: "credit",
      sourceDocumentId: "doc1",
      sourceType: "bank_statement",
      confidence: 90,
    };

    const [transaction] = rawLinesToTransactions([line]);
    assert.equal(transaction!.amount, 1000);
  });
});
