import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildWorkbook, totalRevenueForYear, workbookToFile } from "./spreadsheet-revenue.fixtures";

const ROWS_2025: (string | number)[][] = [
  ["Mois", "Loyer", "Complément"],
  ["Janvier", 1000, 0],
  ["Février", 1000, 0],
  ["Mars", 1000, 0],
  ["Avril", 1000, 0],
  ["Mai", 1000, 0],
  ["Juin", 1000, 0],
  ["Juillet", 1000, 0],
  ["Août", 1000, 0],
  ["Septembre", 1000, 0],
  ["Octobre", 1000, 0],
  ["Novembre", 1000, 0],
  ["Décembre", 1000, 0],
];
const ROWS_2026: (string | number)[][] = [
  ["Mois", "Loyer", "Complément"],
  ["Janvier", 1200, 0],
  ["Février", 1200, 0],
];
const ROWS_RECAP: (string | number)[][] = [
  ["Mois", "Loyer", "Complément"],
  ["Total 2025", 12000, 0],
  ["Total 2026", 2400, 0],
];

describe("Cycle 15A — Étape D : feuilles multiples", () => {
  it("feuille 2025 en premier — exercice 2025 correctement retenu (12000€), pas la feuille 2026", async () => {
    const wb = buildWorkbook({ "2025": ROWS_2025, "2026": ROWS_2026 });
    const file = workbookToFile(wb);
    assert.equal(await totalRevenueForYear(file, 2025), 12000);
    assert.equal(await totalRevenueForYear(file, 2026), 2400);
  });

  it("feuille 2026 en premier — l'exercice 2025 demandé n'est plus perdu (régression du bug audité)", async () => {
    const wb = buildWorkbook({ "2026": ROWS_2026, "2025": ROWS_2025 });
    const file = workbookToFile(wb);
    assert.equal(
      await totalRevenueForYear(file, 2025),
      12000,
      "avant Cycle 15A : renvoyait 2400€ (feuille 2026 lue par erreur pour l'exercice 2025)",
    );
    assert.equal(await totalRevenueForYear(file, 2026), 2400);
  });

  it("ordre inversé (Récap, 2026, 2025) — toutes les feuilles pertinentes sont prises en compte", async () => {
    const wb = buildWorkbook({ Récap: ROWS_RECAP, "2026": ROWS_2026, "2025": ROWS_2025 });
    const file = workbookToFile(wb);
    assert.equal(await totalRevenueForYear(file, 2025), 12000);
    assert.equal(await totalRevenueForYear(file, 2026), 2400);
  });

  it("feuille Récap présente — jamais comptée (pas de double comptage transactions + total)", async () => {
    const wb = buildWorkbook({ "2025": ROWS_2025, Récap: ROWS_RECAP });
    const file = workbookToFile(wb);
    assert.equal(
      await totalRevenueForYear(file, 2025),
      12000,
      "12000€ (les transactions), jamais 24000€ (transactions + récap)",
    );
  });

  it("plusieurs feuilles de transactions réelles — fusionnées, pas seulement la première", async () => {
    const rowsA: (string | number)[][] = [
      ["Mois", "Loyer", "Complément", "Date paiement"],
      ["Janvier", 500, 0, "05/01/2025"],
    ];
    const rowsB: (string | number)[][] = [
      ["Mois", "Loyer", "Complément", "Date paiement"],
      ["Février", 500, 0, "05/02/2025"],
    ];
    const wb = buildWorkbook({ "Bien A": rowsA, "Bien B": rowsB });
    const file = workbookToFile(wb);
    assert.equal(await totalRevenueForYear(file, 2025), 1000);
  });

  it("exercice demandé ne correspond à aucune feuille nommée — repli sur le comportement mono-feuille existant sans contamination", async () => {
    const wb = buildWorkbook({ "2025": ROWS_2025, "2026": ROWS_2026 });
    const file = workbookToFile(wb);
    assert.equal(await totalRevenueForYear(file, 2027), 0);
  });
});
