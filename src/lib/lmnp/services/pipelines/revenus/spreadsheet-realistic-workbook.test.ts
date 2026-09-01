import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { produceFiscalResult } from "@/runtime/capabilities/f006/produce-fiscal-result";
import { buildRevenusAssistantFromSession } from "@/lib/lmnp/services/revenus-upload-to-assistant-bridge";
import {
  buildSessionFromLines,
  buildWorkbook,
  runSpreadsheetPipelineForTest,
  workbookToFile,
} from "./spreadsheet-revenue.fixtures";

/**
 * Cycle 15A — §10 : scénario utilisateur réaliste obligatoire. Un classeur avec
 * trois feuilles (2025 complète avec toutes les natures + décalage déc./janv. +
 * ligne TOTAL, 2026 avec des données différentes, Récap avec des totaux annuels
 * "pour l'utilisateur uniquement"), rejoué de bout en bout jusqu'à F-006.
 */
describe("Cycle 15A — Étape I : scénario réaliste complet", () => {
  const wb = buildWorkbook({
    "2025": [
      ["Mois", "Date", "Loyer", "Airbnb", "Booking", "Abritel", "GLI", "Dépôt de garantie", "Remboursement charges"],
      ["Janvier", "05/01/2025", 1000, 350, "", "", "", "", ""],
      ["Février", "05/02/2025", 1000, "", 250, "", "", "", ""],
      ["Mars", "05/03/2025", 1000, "", "", 175, "", "", ""],
      ["Avril", "05/04/2025", 1000, "", "", "", 500, "", ""],
      ["Mai", "05/05/2025", 1000, "", "", "", "", "", 200],
      ["Juin", "05/06/2025", 1000, "", "", "", "", 800, ""],
      ["Juillet", "05/07/2025", 1000, "", "", "", "", "", ""],
      ["Août", "05/08/2025", 1000, "", "", "", "", "", ""],
      ["Septembre", "05/09/2025", 1000, "", "", "", "", "", ""],
      ["Octobre", "05/10/2025", 1000, "", "", "", "", "", ""],
      ["Novembre", "05/11/2025", 1000, "", "", "", "", "", ""],
      // Décembre 2025 (mois de service), réellement encaissé le 10/01/2026 — SAV-028.
      ["Décembre", "10/01/2026", 1000, "", "", "", "", "", ""],
      ["TOTAL", "", 12000, 350, 250, 175, 500, 800, 200],
    ],
    "2026": [
      ["Mois", "Date", "Loyer"],
      ["Janvier", "08/01/2026", 1200],
      ["Février", "05/02/2026", 1200],
    ],
    Récap: [
      ["Mois", "Loyer"],
      ["Total 2025", 12000],
      ["Total 2026", 2400],
    ],
  });

  it("1-2-3. bonne feuille, bonne année, bon mois — 2025 isolé de 2026 et de la feuille Récap", async () => {
    const file = workbookToFile(wb);
    const lines2025 = await runSpreadsheetPipelineForTest(file, 2025);
    const session2025 = buildSessionFromLines(lines2025, 2025);
    const janvier = session2025.properties[0]!.rows.find((r) => r.monthKey === "2025-01");
    assert.equal(janvier?.loyers, 1000);

    const lines2026 = await runSpreadsheetPipelineForTest(file, 2026);
    const session2026 = buildSessionFromLines(lines2026, 2026);
    const janvier2026 = session2026.properties[0]!.rows.find((r) => r.monthKey === "2026-01");
    // Le loyer de décembre 2025 (service), réellement encaissé le 10/01/2026, doit
    // apparaître ici — c'est bien un encaissement de janvier 2026.
    assert.equal(janvier2026?.loyers, 1000 + 1200, "loyer décembre-service (1000, encaissé 10/01/2026) + loyer janvier 2026 (1200)");
  });

  it("4. bonne nature — Airbnb/Booking/Abritel/GLI/remboursement correctement répartis", async () => {
    const file = workbookToFile(wb);
    const lines = await runSpreadsheetPipelineForTest(file, 2025);
    const session = buildSessionFromLines(lines, 2025);
    const { revenusAssistant } = buildRevenusAssistantFromSession(session, 2025, "2020-01-01");

    assert.equal(revenusAssistant.recettesPlateforme, 350 + 250 + 175, "Airbnb + Booking + Abritel");
    assert.equal(revenusAssistant.indemnitesAssurance, 500, "GLI");
  });

  it("5. absence de doublons — la ligne TOTAL n'est jamais additionnée aux transactions", async () => {
    const file = workbookToFile(wb);
    const lines = await runSpreadsheetPipelineForTest(file, 2025);
    const session = buildSessionFromLines(lines, 2025);
    const { revenusAssistant } = buildRevenusAssistantFromSession(session, 2025, "2020-01-01");
    // Sans la protection anti-TOTAL, le total serait doublé (24000 + ...).
    assert.ok(revenusAssistant.totalRecettes < 20000);
  });

  it("6. dépôt de garantie exclu du total", async () => {
    const file = workbookToFile(wb);
    const lines = await runSpreadsheetPipelineForTest(file, 2025);
    assert.equal(
      lines.some((l) => (l.sourceColumnHeader ?? "").toLowerCase().includes("dépôt")),
      false,
    );
  });

  it("7-8-9. montant total correct, transmis jusqu'à F-006, résultat fiscal cohérent", async () => {
    const file = workbookToFile(wb);
    const lines = await runSpreadsheetPipelineForTest(file, 2025);
    const session = buildSessionFromLines(lines, 2025);
    const { revenusAssistant, anomalies } = buildRevenusAssistantFromSession(session, 2025, "2020-01-01");

    // 11 mois pleins (jan-nov) + remboursement de charges (mai, faute de bucket dédié,
    // compté dans la base recette — portée assumée Cycle 15A) — décembre exclu.
    const expectedLoyers = 11 * 1000 + 200;
    assert.equal(revenusAssistant.loyersEncaisses, expectedLoyers);
    assert.equal(revenusAssistant.recettesPlateforme, 775);
    assert.equal(revenusAssistant.indemnitesAssurance, 500);
    assert.equal(revenusAssistant.totalRecettes, expectedLoyers + 775 + 500);
    assert.equal(anomalies.length, 0);

    const { result, anomalies: fiscalAnomalies } = produceFiscalResult({
      exerciceFiscal: 2025,
      activite: { dateMiseEnService: "2020-01-01" },
      revenusAssistant,
      chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 3000, totalPreExploitation: 0 },
      financementCharges: {
        exerciceFiscal: 2025,
        totalChargesFinancementExercice: 0,
        totalInteretsPreExploitation: 0,
      },
      amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 1500, status: "validated" },
      logementAmortissement: { computedAt: "2025-01-01T00:00:00.000Z" },
    });

    assert.equal(fiscalAnomalies.some((a) => a.severity === "fatal"), false);
    assert.ok(result);
    assert.equal(result!.recettes.total, expectedLoyers + 775 + 500);
    assert.equal(result!.resultatAvantAmort, expectedLoyers + 775 + 500 - 3000, "résultat AVANT amortissement — recettes - charges");
  });
});
