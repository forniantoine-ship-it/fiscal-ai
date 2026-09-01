import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";

import {
  buildSessionFromLines,
  buildWorkbook,
  runSpreadsheetPipelineForTest,
  totalRevenueForYear,
  workbookToFile,
} from "./spreadsheet-revenue.fixtures";
import { gridSummary } from "@/lib/lmnp/services/revenue-gpt-ui-prefill";

describe("Cycle 15A — Étape C : contamination inter-années (scénario audité)", () => {
  it("décembre N payé en janvier N+1, janvier N+1 payé en janvier N+1 — exercice N demandé = 0€", async () => {
    const wb = buildWorkbook({
      Feuille1: [
        ["Mois", "Loyer", "Complément", "Date paiement"],
        ["Décembre", 1000, 0, "10/01/2026"],
        ["Janvier", 1100, 0, "08/01/2026"],
      ],
    });
    const file = workbookToFile(wb);

    const total2025 = await totalRevenueForYear(file, 2025);
    assert.equal(total2025, 0, "aucun encaissement réel en 2025 — le total ne doit surtout pas être 2100€");

    const total2026 = await totalRevenueForYear(file, 2026);
    assert.equal(total2026, 2100, "les deux montants sont réellement encaissés en janvier 2026");
  });

  it("janvier N payé en décembre N-1 — n'appartient pas à l'exercice N", async () => {
    const wb = buildWorkbook({
      Feuille1: [
        ["Mois", "Loyer", "Complément", "Date paiement"],
        ["Janvier", 1000, 0, "28/12/2024"],
      ],
    });
    const file = workbookToFile(wb);

    assert.equal(await totalRevenueForYear(file, 2025), 0);
    assert.equal(await totalRevenueForYear(file, 2024), 1000);
  });

  it("critère de clôture obligatoire — fichier 2024+2025+2026 mélangé : total(2024) ≠ total(2025) ≠ total(2026)", async () => {
    const wb = buildWorkbook({
      Toutes_annees: [
        ["Mois", "Loyer", "Complément", "Date paiement"],
        ["Novembre", 900, 0, "05/11/2024"],
        ["Décembre", 900, 0, "05/12/2024"],
        ["Janvier", 1000, 0, "05/01/2025"],
        ["Février", 1000, 0, "05/02/2025"],
        ["Mars", 1000, 0, "05/03/2025"],
        ["Avril", 1000, 0, "05/04/2025"],
        ["Mai", 1000, 0, "05/05/2025"],
        ["Juin", 1000, 0, "05/06/2025"],
        ["Juillet", 1000, 0, "05/07/2025"],
        ["Août", 1000, 0, "05/08/2025"],
        ["Septembre", 1000, 0, "05/09/2025"],
        ["Octobre", 1000, 0, "05/10/2025"],
        ["Novembre", 1000, 0, "05/11/2025"],
        ["Décembre", 1000, 0, "10/01/2026"],
        ["Janvier", 1100, 0, "08/01/2026"],
        ["Février", 1100, 0, "05/02/2026"],
      ],
    });
    const file = workbookToFile(wb);

    const total2024 = await totalRevenueForYear(file, 2024);
    const total2025 = await totalRevenueForYear(file, 2025);
    const total2026 = await totalRevenueForYear(file, 2026);

    assert.equal(total2024, 1800, "novembre + décembre 2024, tous deux réellement encaissés en 2024");
    assert.equal(total2025, 11000, "janvier à novembre 2025 uniquement — le loyer de décembre encaissé en 2026 en est exclu");
    assert.equal(total2026, 3200, "loyer de décembre (encaissé 10/01/2026) + janvier + février 2026");

    assert.notEqual(total2024, total2025);
    assert.notEqual(total2025, total2026);
    assert.notEqual(total2024, total2026);
  });

  it("exercice inconnu de la feuille (aucun encaissement) — total strictement nul, jamais un repli sur l'exercice demandé", async () => {
    const wb = buildWorkbook({
      Feuille1: [
        ["Mois", "Loyer", "Complément", "Date paiement"],
        ["Janvier", 1000, 0, "05/01/2024"],
        ["Février", 1000, 0, "05/02/2024"],
      ],
    });
    const file = workbookToFile(wb);
    assert.equal(await totalRevenueForYear(file, 2030), 0);
  });
});

describe("Cycle 15A — Étape G : dates Excel natives", () => {
  it("cellule date native avec format explicite — correctement reconnue", async () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ["Mois", "Loyer", "Complément", "Date paiement"],
      ["Janvier", 1000, 0, null],
    ]);
    ws["D2"] = { t: "d", v: new Date(2025, 0, 5), z: "dd/mm/yyyy" };
    ws["!ref"] = "A1:D2";
    XLSX.utils.book_append_sheet(wb, ws, "Dates");
    const file = workbookToFile(wb);

    const lines = await runSpreadsheetPipelineForTest(file, 2025);
    assert.equal(lines.length, 1);
    assert.equal(lines[0]?.date, "05/01/2025");
  });

  it("cellule date native SANS format explicite (serial Excel brut) — reconnue, pas ignorée", async () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ["Mois", "Loyer", "Complément", "Date paiement"],
      ["Février", 1000, 0, null],
    ]);
    ws["D2"] = { t: "n", v: 45689 }; // 01/02/2025, sans format de date appliqué
    ws["!ref"] = "A1:D2";
    XLSX.utils.book_append_sheet(wb, ws, "Dates");
    const file = workbookToFile(wb);

    const lines = await runSpreadsheetPipelineForTest(file, 2025);
    assert.equal(lines.length, 1);
    assert.equal(lines[0]?.date, "01/02/2025", "le serial Excel brut doit être converti, pas remplacé par une date fabriquée");
  });

  it("frontière 31/12/N vs 01/01/N+1 — chaque montant reste dans son exercice réel", async () => {
    const wb = buildWorkbook({
      Feuille1: [
        ["Mois", "Loyer", "Complément", "Date paiement"],
        ["Décembre", 500, 0, "31/12/2025"],
        ["Janvier", 600, 0, "01/01/2026"],
      ],
    });
    const file = workbookToFile(wb);
    assert.equal(await totalRevenueForYear(file, 2025), 500);
    assert.equal(await totalRevenueForYear(file, 2026), 600);
  });

  it("mélange dates texte et dates natives dans le même fichier", async () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ["Mois", "Loyer", "Complément", "Date paiement"],
      ["Janvier", 1000, 0, "05/01/2025"],
      ["Février", 1000, 0, null],
    ]);
    ws["D3"] = { t: "d", v: new Date(2025, 1, 5), z: "dd/mm/yyyy" };
    ws["!ref"] = "A1:D3";
    XLSX.utils.book_append_sheet(wb, ws, "Mixte");
    const file = workbookToFile(wb);

    assert.equal(await totalRevenueForYear(file, 2025), 2000);
  });
});

describe("Cycle 15A — cohérence grille finale / gridSummary", () => {
  it("le total affiché correspond exactement à la somme des lignes mensuelles retenues", async () => {
    const wb = buildWorkbook({
      Feuille1: [
        ["Mois", "Loyer", "Complément", "Date paiement"],
        ["Décembre", 1000, 0, "10/01/2026"],
        ["Janvier", 1100, 0, "08/01/2026"],
      ],
    });
    const file = workbookToFile(wb);
    const lines = await runSpreadsheetPipelineForTest(file, 2025);
    const session = buildSessionFromLines(lines, 2025);
    const summed = session.properties[0]!.rows.reduce((sum, row) => sum + row.loyers + row.autresRevenus, 0);
    assert.equal(summed, 0);
    assert.equal(gridSummary(session).totalRevenue, summed);
  });
});
