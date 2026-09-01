import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildWorkbook, runSpreadsheetPipelineForTest, workbookToFile } from "./spreadsheet-revenue.fixtures";

/**
 * Cycle 18 — audit adversarial : une ligne portant une date de paiement réelle
 * et valide était rejetée intégralement ("invalid_month") si AUCUNE cellule de
 * la ligne ne contenait un nom de mois français reconnaissable — même avec un
 * montant parfaitement valide. Cas réaliste et sévère : un relevé bancaire
 * brut avec uniquement des colonnes Date + Montant (aucune colonne "Mois",
 * aucun libellé en français) perdait 100% de son contenu, silencieusement
 * (seule trace : un console.log de développement jamais vu par l'utilisateur).
 */
describe("Cycle 18 — une ligne avec une date valide n'a pas besoin d'un nom de mois pour être extraite", () => {
  it("relevé bancaire brut (colonnes Date + Loyer uniquement, aucun nom de mois nulle part) — rien n'est perdu", async () => {
    const file = workbookToFile(
      buildWorkbook({ Feuille1: [["Date", "Loyer"], ["01/06/2025", 1000], ["01/07/2025", 1000]] }),
      "releve-bancaire.xlsx",
    );
    const lines = await runSpreadsheetPipelineForTest(file, 2025);
    assert.equal(lines.length, 2, "les 2 lignes doivent être extraites malgré l'absence de colonne Mois");
    assert.deepEqual(
      lines.map((l) => l.amount).sort(),
      [1000, 1000],
    );
  });

  it("une ligne datetime native (\"15/06/2025 08:30\") est également rattachée au bon mois, pas rejetée", async () => {
    const wb = buildWorkbook({ Feuille1: [["Date", "Loyer"], ["15/06/2025 08:30", 1000]] });
    const file = workbookToFile(wb, "datetime.xlsx");
    const lines = await runSpreadsheetPipelineForTest(file, 2025);
    assert.equal(lines.length, 1, "la ligne datetime ne doit pas être rejetée");
    assert.equal(lines[0]!.date, "15/06/2025", "l'heure doit être ignorée, jamais laissée dans la date");
  });

  it("une ligne sans date ET sans nom de mois reste correctement rejetée (non-régression)", async () => {
    const file = workbookToFile(
      buildWorkbook({ Feuille1: [["Libellé", "Loyer"], ["Virement reçu", 1000]] }),
      "sans-date-sans-mois.xlsx",
    );
    const lines = await runSpreadsheetPipelineForTest(file, 2025);
    assert.equal(lines.length, 0, "sans aucune date ni mois reconnaissable, la ligne reste, à raison, rejetée");
  });
});
