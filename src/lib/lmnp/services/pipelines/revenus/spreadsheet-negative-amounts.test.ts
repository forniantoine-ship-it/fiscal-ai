import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildRevenusAssistantFromSession } from "@/lib/lmnp/services/revenus-upload-to-assistant-bridge";
import {
  buildSessionFromLines,
  buildWorkbook,
  runSpreadsheetPipelineForTest,
  workbookToFile,
} from "./spreadsheet-revenue.fixtures";

describe("Cycle 15A — Étape H : montants négatifs", () => {
  it("-1200 (signe simple) — extrait avec son signe, jamais silencieusement ignoré", async () => {
    const wb = buildWorkbook({
      Feuille1: [
        ["Mois", "Loyer"],
        ["Avril", "-1200"],
      ],
    });
    const file = workbookToFile(wb);
    const lines = await runSpreadsheetPipelineForTest(file, 2025);
    assert.equal(lines.length, 1, "avant Cycle 15A : 0 ligne (le signe '-' était pris pour un séparateur de date)");
    assert.equal(lines[0]?.amount, -1200);
  });

  it("(1 200) — parenthèses comptables — extrait avec son signe", async () => {
    const wb = buildWorkbook({
      Feuille1: [
        ["Mois", "Loyer"],
        ["Avril", "(1 200)"],
      ],
    });
    const file = workbookToFile(wb);
    const lines = await runSpreadsheetPipelineForTest(file, 2025);
    assert.equal(lines.length, 1);
    assert.equal(lines[0]?.amount, -1200);
  });

  it("un montant négatif réduit la recette du mois, ne l'augmente jamais", async () => {
    const wb = buildWorkbook({
      Feuille1: [
        ["Mois", "Loyer"],
        ["Avril", 1000],
        ["Avril", "-200"],
      ],
    });
    const file = workbookToFile(wb);
    const lines = await runSpreadsheetPipelineForTest(file, 2025);
    const session = buildSessionFromLines(lines, 2025);
    const avril = session.properties[0]!.rows.find((r) => r.monthKey === "2025-04");
    assert.equal(avril?.loyers, 800, "1000 - 200 = 800, jamais 1200 (jamais Math.abs)");
  });

  it("un montant négatif dans une colonne revenu produit une anomalie explicite, pas un silence", async () => {
    const wb = buildWorkbook({
      Feuille1: [
        ["Mois", "Loyer"],
        ["Avril", 1000],
        ["Mai", "-200"],
      ],
    });
    const file = workbookToFile(wb);
    const lines = await runSpreadsheetPipelineForTest(file, 2025);
    const session = buildSessionFromLines(lines, 2025);
    const { anomalies, revenusAssistant } = buildRevenusAssistantFromSession(session, 2025, "2020-01-01");

    assert.ok(
      anomalies.some((a) => a.severity === "warning" && /négatif/i.test(a.message)),
      "une anomalie doit signaler le montant négatif au lieu de le laisser passer sans avertissement",
    );
    assert.equal(revenusAssistant.loyersEncaisses, 800, "1000 - 200, jamais 1200");
  });

  it("négatif dans une colonne charges (débit) — comportement inchangé, pas concerné par le garde-fou revenu", async () => {
    const wb = buildWorkbook({
      Feuille1: [
        ["Mois", "Loyer", "Charges"],
        ["Avril", 1000, 150],
      ],
    });
    const file = workbookToFile(wb);
    const lines = await runSpreadsheetPipelineForTest(file, 2025);
    const session = buildSessionFromLines(lines, 2025);
    const avril = session.properties[0]!.rows.find((r) => r.monthKey === "2025-04");
    assert.equal(avril?.charges, 150);
  });
});
