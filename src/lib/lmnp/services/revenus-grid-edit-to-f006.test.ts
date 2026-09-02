import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { runDeclarationGeneration } from "@/lib/lmnp/services/declaration/run-declaration-generation";
import { createEmptyGridRows, gridSummary } from "@/lib/lmnp/services/revenue-gpt-ui-prefill";
import { buildRevenusAssistantFromSession } from "@/lib/lmnp/services/revenus-upload-to-assistant-bridge";
import type { RevenueGptSession, RevenueTransaction } from "@/lib/lmnp/types";

/**
 * Cycle 23 — reproduction : l'utilisateur corrige la grille après un second
 * import (fichier identique renommé) qui a doublé les transactions brutes.
 * L'écran et `sessionToExtractionData` voient le total corrigé ; F-006 / case AB
 * relisaient encore les transactions → divergence 4 780,9 vs 9 561,8.
 */
function tx(partial: Pick<RevenueTransaction, "amount" | "date" | "category">): RevenueTransaction {
  return {
    id: `tx-${partial.date}-${partial.amount}-${partial.category}`,
    date: partial.date,
    amount: partial.amount,
    direction: "credit",
    category: partial.category,
    description: partial.category,
    label: partial.category,
  };
}

function sessionWithDoubledTransactionsAndEditedGrid(): RevenueGptSession {
  const rows = createEmptyGridRows(2026);
  const jan = rows.find((row) => row.monthKey === "2026-01")!;
  const feb = rows.find((row) => row.monthKey === "2026-02")!;
  const mar = rows.find((row) => row.monthKey === "2026-03")!;
  jan.loyers = 2200.5;
  jan.autresRevenus = 180.4;
  feb.loyers = 1200;
  mar.loyers = 1200;

  const singleFileTransactions: RevenueTransaction[] = [
    tx({ date: "2026-01-08", amount: 1200, category: "rent" }),
    tx({ date: "2026-01-10", amount: 1000.5, category: "rent" }),
    tx({ date: "2026-01-08", amount: 180.4, category: "platform_payout" }),
    tx({ date: "2026-02-05", amount: 1200, category: "rent" }),
    tx({ date: "2026-03-05", amount: 1200, category: "rent" }),
  ];

  return {
    properties: [
      {
        id: "p1",
        label: "Mon bien locatif",
        rows,
        transactions: [...singleFileTransactions, ...singleFileTransactions],
        lowConfidenceTransactions: [],
        isolatedTransactions: [],
        gridUserEdited: true,
      },
    ],
    mode: "ocr_lines",
  };
}

describe("Cycle 23 — grille corrigée prime sur les transactions doublées jusqu'à F-006 / AB", () => {
  it("l'écran, revenusAssistant et la case AB portent le total corrigé, jamais le double brut", () => {
    const session = sessionWithDoubledTransactionsAndEditedGrid();
    const screenTotal = gridSummary(session).totalRevenue;
    assert.equal(screenTotal, 4780.9);

    const { revenusAssistant } = buildRevenusAssistantFromSession(session, 2026, "2020-03-01");
    assert.equal(
      revenusAssistant.totalRecettes,
      screenTotal,
      "après correction de grille, le pont F-013 ne doit plus relire les transactions brutes doublées",
    );
    assert.notEqual(revenusAssistant.totalRecettes, 9561.8);

    const generation = runDeclarationGeneration(
      {
        completedSteps: [],
        siret: "80890035100012",
        siren: "808900351",
        exploitantFirstName: "Marie",
        exploitantLastName: "Dupont",
        dateMiseEnService: "2020-03-01",
        revenusAssistant,
        chargesAssistant: { exerciceFiscal: 2026, totalDeductible: 0, totalPreExploitation: 0 },
        amortissementAssistant: { exerciceFiscal: 2026, totalDotations: 0, status: "validated" },
      } as unknown as import("@/lib/lmnp/types/domain").DeclarationDraft,
      2026,
    );

    assert.equal(generation.status, "generated");
    if (generation.status !== "generated") return;
    assert.equal(generation.fiscalResult.totalRecettes, 4780.9, "F-007 : totalRecettes = grille confirmée");
  });
});
