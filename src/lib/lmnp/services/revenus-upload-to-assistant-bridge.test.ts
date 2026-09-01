import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { produceFiscalResult } from "@/runtime/capabilities/f006/produce-fiscal-result";
import { buildRevenusAssistantFromSession } from "./revenus-upload-to-assistant-bridge";
import {
  buildSessionFromLines,
  buildWorkbook,
  runSpreadsheetPipelineForTest,
  workbookToFile,
} from "./pipelines/revenus/spreadsheet-revenue.fixtures";

/**
 * Cycle 15A — test d'intégration obligatoire (§2 du brief de correction) :
 * Excel réel → extraction → session → revenusAssistant → F-006 → résultat fiscal,
 * avec un montant vérifiable de bout en bout. Avant ce cycle, ce chemin n'existait
 * pas : draft.revenusExtraction (produit par l'upload) n'était jamais lu par F-006,
 * qui ne consommait que draft.revenusAssistant (produit par l'assistant
 * conversationnel uniquement).
 */
describe("Cycle 15A — Étape B : Excel → revenusAssistant → F-006 (bout en bout)", () => {
  it("un classeur réel alimente le résultat fiscal final avec le bon montant, sans repasser par l'assistant conversationnel", async () => {
    const wb = buildWorkbook({
      "2025": [
        ["Mois", "Loyer", "Airbnb", "GLI", "Date paiement"],
        ["Janvier", 1000, 350, "", "05/01/2025"],
        ["Février", 1000, "", 500, "05/02/2025"],
        ["Mars", 1000, "", "", "05/03/2025"],
        ["Avril", 1000, "", "", "05/04/2025"],
        ["Mai", 1000, "", "", "05/05/2025"],
        ["Juin", 1000, "", "", "05/06/2025"],
        ["Juillet", 1000, "", "", "05/07/2025"],
        ["Août", 1000, "", "", "05/08/2025"],
        ["Septembre", 1000, "", "", "05/09/2025"],
        ["Octobre", 1000, "", "", "05/10/2025"],
        ["Novembre", 1000, "", "", "05/11/2025"],
        // Loyer de décembre 2025, réellement encaissé en janvier 2026 (SAV-028) :
        // ne doit JAMAIS apparaître dans le résultat fiscal 2025.
        ["Décembre", 1000, "", "", "10/01/2026"],
      ],
    });
    const file = workbookToFile(wb);

    // 1. Excel → extraction (pipeline réel, aucun mock)
    const lines = await runSpreadsheetPipelineForTest(file, 2025);
    assert.ok(lines.length > 0, "des lignes ont bien été extraites du classeur réel");

    // 2. extraction → session (grille mensuelle, déjà correctement filtrée par exercice)
    const session = buildSessionFromLines(lines, 2025);

    // 3. session → revenusAssistant (pont Cycle 15A, réutilise computeRecettesExercice())
    const { revenusAssistant, anomalies } = buildRevenusAssistantFromSession(
      session,
      2025,
      "2020-01-01",
    );
    assert.equal(revenusAssistant.exerciceFiscal, 2025);
    assert.equal(revenusAssistant.loyersEncaisses, 11000, "11 mois à 1000€ — décembre exclu (encaissé en 2026)");
    assert.equal(revenusAssistant.recettesPlateforme, 350);
    assert.equal(revenusAssistant.indemnitesAssurance, 500);
    assert.equal(revenusAssistant.totalRecettes, 11850);
    assert.equal(anomalies.length, 0, "aucune anomalie attendue sur ce classeur propre");

    // 4. revenusAssistant → F-006 (produceFiscalResult, exactement comme le fait
    // run-declaration-generation.ts en production — même moteur, aucune duplication)
    const { result, anomalies: fiscalAnomalies } = produceFiscalResult({
      exerciceFiscal: 2025,
      activite: { dateMiseEnService: "2020-01-01" },
      revenusAssistant,
      chargesAssistant: {
        exerciceFiscal: 2025,
        totalDeductible: 4000,
        totalPreExploitation: 0,
      },
      financementCharges: {
        exerciceFiscal: 2025,
        totalChargesFinancementExercice: 0,
        totalInteretsPreExploitation: 0,
      },
      amortissementAssistant: {
        exerciceFiscal: 2025,
        totalDotations: 2000,
        status: "validated",
      },
      logementAmortissement: { computedAt: "2025-01-01T00:00:00.000Z" },
    });

    assert.equal(fiscalAnomalies.some((a) => a.severity === "fatal"), false);
    assert.ok(result, "le calcul fiscal n'est plus bloqué par l'absence de revenusAssistant");
    assert.equal(result!.recettes.total, 11850, "montant vérifiable de bout en bout : Excel → F-006");
    assert.equal(result!.resultatAvantAmort, 11850 - 4000, "7850€ (résultat AVANT amortissement — recettes - charges uniquement)");
  });

  it("sans aucun revenu importé ni saisi (session vide) — total nul, jamais undefined/NaN", () => {
    const emptySession = buildSessionFromLines([], 2025);
    const { revenusAssistant } = buildRevenusAssistantFromSession(emptySession, 2025, "2020-01-01");
    assert.equal(revenusAssistant.totalRecettes, 0);
  });
});
