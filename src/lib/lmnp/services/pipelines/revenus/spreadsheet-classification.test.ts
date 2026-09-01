import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildWorkbook, runSpreadsheetPipelineForTest, workbookToFile } from "./spreadsheet-revenue.fixtures";

describe("Cycle 15A — Étape F : reconnaissance Airbnb / Booking / Abritel / GLI", () => {
  it("loyer + Airbnb + Booking + Abritel + GLI + remboursement + virement générique — chacun classé correctement", async () => {
    const wb = buildWorkbook({
      Releve: [
        ["Mois", "Date", "Loyer", "Airbnb", "Booking", "Abritel", "GLI", "Dépôt de garantie", "Remboursement charges", "Virement"],
        ["Janvier", "05/01/2025", 1000, "", "", "", "", "", "", ""],
        ["Janvier", "12/01/2025", "", 350, "", "", "", "", "", ""],
        ["Janvier", "18/01/2025", "", "", 250, "", "", "", "", ""],
        ["Janvier", "20/01/2025", "", "", "", 175, "", "", "", ""],
        ["Février", "03/02/2025", "", "", "", "", 1500, "", "", ""],
        ["Mars", "01/03/2025", "", "", "", "", "", 800, "", ""],
        ["Avril", "10/04/2025", "", "", "", "", "", "", 200, ""],
        ["Mai", "15/05/2025", "", "", "", "", "", "", "", 75],
      ],
    });
    const file = workbookToFile(wb);
    const lines = await runSpreadsheetPipelineForTest(file, 2025);

    const byCategory = (label: string) => lines.filter((l) => l.sourceColumnHeader === label);

    assert.equal(byCategory("Loyer").reduce((s, l) => s + l.amount, 0), 1000, "loyer");
    assert.equal(byCategory("Revenus plateforme").reduce((s, l) => s + l.amount, 0), 350 + 250 + 175, "Airbnb + Booking + Abritel, tous reconnus et sommés");
    assert.equal(byCategory("Indemnité assurance").reduce((s, l) => s + l.amount, 0), 1500, "GLI reconnue");
    assert.equal(lines.some((l) => l.sourceColumnHeader?.toLowerCase().includes("dépôt")), false, "dépôt de garantie jamais une recette");
    assert.equal(byCategory("Complément").reduce((s, l) => s + l.amount, 0), 200, "remboursement de charges capté (bucket générique)");
    assert.equal(
      lines.some((l) => l.amount === 75),
      false,
      "virement bancaire générique non reconnu comme colonne métier — jamais compté comme recette",
    );
  });

  it("Abritel seul (sans Airbnb ni Booking) — reconnu, pas seulement les deux autres", async () => {
    const wb = buildWorkbook({
      Releve: [
        ["Mois", "Loyer", "Abritel"],
        ["Janvier", 1000, 300],
      ],
    });
    const file = workbookToFile(wb);
    const lines = await runSpreadsheetPipelineForTest(file, 2025);
    assert.ok(lines.some((l) => l.sourceColumnHeader === "Revenus plateforme" && l.amount === 300));
  });

  it("cas critique brut/commission/net (sans colonne loyer reconnue) — comportement conservateur, aucune ligne inventée", async () => {
    const wb = buildWorkbook({
      Releve: [
        ["Mois", "Brut séjour", "Commission", "Net versé"],
        ["Janvier", 100, -20, 80],
      ],
    });
    const file = workbookToFile(wb);
    const lines = await runSpreadsheetPipelineForTest(file, 2025);
    // Aucune de ces trois colonnes ne matche un alias reconnu (ni "loyer", ni "complément",
    // ni "airbnb"/"booking"/"gli") : comportement délibérément conservateur (rien n'est
    // extrait) plutôt qu'un risque de double comptage brut+commission+net.
    assert.equal(lines.length, 0);
  });

  it("cas critique brut/commission/net à côté d'un vrai loyer — seul le loyer est retenu, jamais 180€ ni 200€", async () => {
    const wb = buildWorkbook({
      Releve: [
        ["Mois", "Loyer", "Brut séjour", "Commission", "Net versé"],
        ["Janvier", 1000, 100, -20, 80],
      ],
    });
    const file = workbookToFile(wb);
    const lines = await runSpreadsheetPipelineForTest(file, 2025);
    const total = lines.reduce((sum, l) => sum + l.amount, 0);
    assert.equal(total, 1000, "seul le loyer (colonne reconnue) est extrait");
    assert.notEqual(total, 1000 + 180);
    assert.notEqual(total, 1000 + 200);
  });

  it("GLI + VISALE simultanés — les deux colonnes d'indemnité sont sommées", async () => {
    const wb = buildWorkbook({
      Releve: [
        ["Mois", "Loyer", "GLI", "VISALE"],
        ["Janvier", 1000, 500, 300],
      ],
    });
    const file = workbookToFile(wb);
    const lines = await runSpreadsheetPipelineForTest(file, 2025);
    const indemnites = lines
      .filter((l) => l.sourceColumnHeader === "Indemnité assurance")
      .reduce((s, l) => s + l.amount, 0);
    assert.equal(indemnites, 800);
  });
});
