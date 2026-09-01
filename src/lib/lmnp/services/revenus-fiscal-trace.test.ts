import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { produceFiscalResult } from "@/runtime/capabilities/f006/produce-fiscal-result";
import { gridSummary, sessionFromPipelineLines } from "./revenue-gpt-ui-prefill";
import { buildRevenusAssistantFromSession } from "./revenus-upload-to-assistant-bridge";
import {
  buildWorkbook,
  runSpreadsheetPipelineForTest,
  TEST_PROPERTY,
  TEST_PROPERTY_B,
  uploadSequentially,
  workbookToFile,
} from "./pipelines/revenus/spreadsheet-revenue.fixtures";

/**
 * Cycle 16 — audit fiscal de bout en bout : Excel → RevenueRawLine →
 * RevenueTransaction → session → buildRevenusAssistantFromSession →
 * computeRecettesExercice → F-006. Chaque test vérifie explicitement que le
 * montant survit jusqu'à `produceFiscalResult()`, pas seulement jusqu'à la
 * grille F-013 ou à `revenusAssistant`.
 */

function fiscalFor(revenusAssistant: any, charges = 0, amort = 0) {
  return produceFiscalResult({
    exerciceFiscal: revenusAssistant.exerciceFiscal,
    activite: { dateMiseEnService: "2020-01-01" },
    revenusAssistant,
    chargesAssistant: { exerciceFiscal: revenusAssistant.exerciceFiscal, totalDeductible: charges, totalPreExploitation: 0 },
    financementCharges: {
      exerciceFiscal: revenusAssistant.exerciceFiscal,
      totalChargesFinancementExercice: 0,
      totalInteretsPreExploitation: 0,
    },
    amortissementAssistant: { exerciceFiscal: revenusAssistant.exerciceFiscal, totalDotations: amort, status: "validated" },
    logementAmortissement: { computedAt: "2025-01-01T00:00:00.000Z" },
  });
}

describe("Cycle 16 — classeur de référence complet, toutes natures, jusqu'à F-006", () => {
  it("loyer + Airbnb + Booking + Abritel + GLI + Visale + remboursement, dépôt et virement exclus", async () => {
    const wb = buildWorkbook({
      Revenus2025: [
        ["Mois", "Date", "Loyer", "Airbnb", "Booking", "Abritel", "GLI", "Visale", "Remboursement charges", "Dépôt de garantie", "Virement"],
        ["Janvier", "05/01/2025", 1000, "", "", "", "", "", "", "", ""],
        ["Février", "05/02/2025", 1000, "", "", "", "", "", "", "", ""],
        ["Mars", "05/03/2025", 1000, "", "", "", "", "", "", "", ""],
        ["Avril", "05/04/2025", 1000, "", "", "", "", "", "", "", ""],
        ["Mai", "05/05/2025", 1000, "", "", "", "", "", "", "", ""],
        ["Juin", "05/06/2025", 1000, "", "", "", "", "", "", "", ""],
        ["Juillet", "05/07/2025", 1000, "", "", "", "", "", "", "", ""],
        ["Août", "05/08/2025", 1000, "", "", "", "", "", "", "", ""],
        ["Septembre", "05/09/2025", 1000, "", "", "", "", "", "", "", ""],
        ["Octobre", "05/10/2025", 1000, "", "", "", "", "", "", "", ""],
        ["Novembre", "05/11/2025", 1000, "", "", "", "", "", "", "", ""],
        ["Décembre", "05/12/2025", 1000, "", "", "", "", "", "", "", ""],
        ["Janvier", "12/01/2025", "", 4000, "", "", "", "", "", "", ""],
        ["Février", "10/02/2025", "", "", 2000, "", "", "", "", "", ""],
        ["Mars", "10/03/2025", "", "", "", 1000, "", "", "", "", ""],
        ["Avril", "01/04/2025", "", "", "", "", 3000, "", "", "", ""],
        ["Mai", "01/05/2025", "", "", "", "", "", 1000, "", "", ""],
        ["Juin", "01/06/2025", "", "", "", "", "", "", 500, "", ""],
        ["Juillet", "01/07/2025", "", "", "", "", "", "", "", 1500, ""],
        ["Août", "01/08/2025", "", "", "", "", "", "", "", "", 750],
        // deux transactions réellement distinctes, même mois/montant (ex. deux
        // régularisations de loyer le même mois) — jamais fusionnées.
        ["Septembre", "15/09/2025", 200, "", "", "", "", "", "", "", ""],
        ["Septembre", "20/09/2025", 200, "", "", "", "", "", "", "", ""],
      ],
    });
    const file = workbookToFile(wb, "reference-2025.xlsx");
    const lines = await runSpreadsheetPipelineForTest(file, 2025);

    assert.equal(
      lines.some((l) => (l.sourceColumnHeader ?? "").toLowerCase().includes("dépôt")),
      false,
      "le dépôt de garantie ne doit jamais être extrait comme une ligne de revenu",
    );
    assert.equal(
      lines.some((l) => l.amount === 750),
      false,
      "le virement bancaire générique (colonne non qualifiée) ne doit jamais devenir une recette",
    );

    const session = sessionFromPipelineLines([TEST_PROPERTY], 2025, new Map([[TEST_PROPERTY.id, lines]]), "ocr_lines");
    const { revenusAssistant, anomalies } = buildRevenusAssistantFromSession(session, 2025, "2020-01-01");

    // loyersEncaisses = 12 mois à 1000 + remboursement 500 (pas de bucket dédié,
    // fondu dans la base recette — décision Cycle 15A, pas un bug) + 2×200 (sept.)
    assert.equal(revenusAssistant.loyersEncaisses, 12000 + 500 + 400);
    assert.equal(revenusAssistant.recettesPlateforme, 4000 + 2000 + 1000, "Airbnb + Booking + Abritel");
    assert.equal(revenusAssistant.indemnitesAssurance, 3000 + 1000, "GLI + Visale");
    assert.equal(revenusAssistant.totalRecettes, 12900 + 7000 + 4000);
    assert.equal(anomalies.length, 0);

    const { result, anomalies: fiscalAnomalies } = fiscalFor(revenusAssistant, 2000, 1000);
    assert.equal(fiscalAnomalies.some((a) => a.severity === "fatal"), false);
    assert.ok(result);
    assert.equal(result!.recettes.total, 23900, "montant vérifiable de bout en bout, jusqu'à F-006");

    // Bug Cycle 16 trouvé et corrigé : indemnitesAssurance était absent de la
    // ventilation FiscalResult.recettes (le total, lui, était déjà correct —
    // aucune perte fiscale, mais un contrat de données incomplet).
    assert.equal(result!.recettes.indemnitesAssurance, 4000);
    assert.equal(result!.recettes.loyersEncaisses, revenusAssistant.loyersEncaisses);
    assert.equal(result!.recettes.recettesPlateforme, revenusAssistant.recettesPlateforme);
    assert.equal(
      (result!.recettes.loyersEncaisses ?? 0) + (result!.recettes.recettesPlateforme ?? 0) + (result!.recettes.indemnitesAssurance ?? 0),
      result!.recettes.total,
      "la ventilation détaillée doit toujours sommer exactement au total",
    );
  });
});

describe("Cycle 16 — plateformes : montant net pris tel quel, jamais recalculé", () => {
  it("Airbnb = 4000€ isolé — exactement 4000€ dans recettesPlateforme, jamais 0/8000/mélangé aux loyers", async () => {
    const file = workbookToFile(buildWorkbook({ S: [["Mois", "Loyer", "Airbnb"], ["Janvier", 1000, 4000]] }));
    const lines = await runSpreadsheetPipelineForTest(file, 2025);
    const session = sessionFromPipelineLines([TEST_PROPERTY], 2025, new Map([[TEST_PROPERTY.id, lines]]), "ocr_lines");
    const { revenusAssistant } = buildRevenusAssistantFromSession(session, 2025, "2020-01-01");
    assert.equal(revenusAssistant.recettesPlateforme, 4000);
    assert.equal(revenusAssistant.loyersEncaisses, 1000);
    const { result } = fiscalFor(revenusAssistant);
    assert.equal(result!.recettes.total, 5000);
  });

  it("colonnes Brut/Commission/Net non qualifiées par un mot-clé plateforme — aucune n'est extraite (comportement conservateur, pas un double comptage)", async () => {
    const file = workbookToFile(
      buildWorkbook({ S: [["Mois", "Loyer", "Brut", "Commission", "Net"], ["Janvier", 1000, 5000, -500, 4500]] }),
    );
    const lines = await runSpreadsheetPipelineForTest(file, 2025);
    assert.equal(lines.length, 1, "seule la colonne Loyer est reconnue — Brut/Commission/Net ne matchent aucun alias");
    const session = sessionFromPipelineLines([TEST_PROPERTY], 2025, new Map([[TEST_PROPERTY.id, lines]]), "ocr_lines");
    const { revenusAssistant } = buildRevenusAssistantFromSession(session, 2025, "2020-01-01");
    assert.equal(revenusAssistant.totalRecettes, 1000);
    assert.notEqual(revenusAssistant.totalRecettes, 1000 + 5000 + 4500);
    assert.notEqual(revenusAssistant.totalRecettes, 1000 + 5000 - 500 + 4500);
  });
});

describe("Cycle 16 — date d'encaissement jusqu'à F-006", () => {
  it("décembre 2025 encaissé le 10/01/2026 : 0€ en 2025, contribue à 2026", async () => {
    const wb = buildWorkbook({
      S: [
        ["Mois", "Loyer", "Date paiement"],
        ["Décembre", 1000, "10/01/2026"],
        ["Janvier", 1200, "15/01/2026"],
      ],
    });
    const file = workbookToFile(wb);

    const lines2025 = await runSpreadsheetPipelineForTest(file, 2025);
    const session2025 = sessionFromPipelineLines([TEST_PROPERTY], 2025, new Map([[TEST_PROPERTY.id, lines2025]]), "ocr_lines");
    const bridge2025 = buildRevenusAssistantFromSession(session2025, 2025, "2020-01-01");
    const f2025 = fiscalFor(bridge2025.revenusAssistant);
    assert.equal(bridge2025.revenusAssistant.totalRecettes, 0);
    assert.equal(f2025.result!.recettes.total, 0);

    const lines2026 = await runSpreadsheetPipelineForTest(file, 2026);
    const session2026 = sessionFromPipelineLines([TEST_PROPERTY], 2026, new Map([[TEST_PROPERTY.id, lines2026]]), "ocr_lines");
    const bridge2026 = buildRevenusAssistantFromSession(session2026, 2026, "2020-01-01");
    const f2026 = fiscalFor(bridge2026.revenusAssistant);
    assert.equal(bridge2026.revenusAssistant.totalRecettes, 2200);
    assert.equal(f2026.result!.recettes.total, 2200);
  });
});

describe("Cycle 16 — non-divergence écran / revenusAssistant / F-006 (multi-upload)", () => {
  it("A(2000) + B(4000) : les quatre couches convergent strictement", async () => {
    const fileA = workbookToFile(buildWorkbook({ S: [["Mois", "Loyer"], ["Janvier", 2000]] }), "a.xlsx");
    const fileB = workbookToFile(buildWorkbook({ S: [["Mois", "Loyer"], ["Février", 4000]] }), "b.xlsx");

    let session = await uploadSequentially(undefined, fileA, 2025, "docA");
    session = await uploadSequentially(session, fileB, 2025, "docB");

    const gridTotal = gridSummary(session).totalRevenue;
    const { revenusAssistant } = buildRevenusAssistantFromSession(session, 2025, "2020-01-01");
    const { result } = fiscalFor(revenusAssistant);

    assert.equal(gridTotal, 6000);
    assert.equal(revenusAssistant.totalRecettes, 6000);
    assert.equal(result!.recettes.total, 6000);
    assert.equal(gridTotal, revenusAssistant.totalRecettes);
    assert.equal(revenusAssistant.totalRecettes, result!.recettes.total);
  });
});

describe("Cycle 16 — multi-années jusqu'au calcul fiscal", () => {
  it("2024/2025/2026 dans le même fichier — F-006 rend exactement le montant de chaque exercice", async () => {
    const wb = buildWorkbook({
      S: [
        ["Mois", "Loyer", "Date paiement"],
        ["Décembre", 5000, "15/12/2024"],
        ["Juin", 11000, "15/06/2025"],
        ["Mars", 3000, "15/03/2026"],
      ],
    });
    const file = workbookToFile(wb);
    const expected: Record<number, number> = { 2024: 5000, 2025: 11000, 2026: 3000 };

    for (const [fiscalYear, amount] of Object.entries(expected)) {
      const fy = Number(fiscalYear);
      const lines = await runSpreadsheetPipelineForTest(file, fy);
      const session = sessionFromPipelineLines([TEST_PROPERTY], fy, new Map([[TEST_PROPERTY.id, lines]]), "ocr_lines");
      const { revenusAssistant } = buildRevenusAssistantFromSession(session, fy, "2020-01-01");
      const { result } = fiscalFor(revenusAssistant);
      assert.equal(result!.recettes.total, amount, `F-006(${fy})`);
    }
  });
});

describe("Cycle 16 — test un euro : trace individuelle de chaque montant", () => {
  it("loyer=1, airbnb=2, gli=3, visale=4, remboursement=5 — chacun retrouvé exactement, total=15", async () => {
    const wb = buildWorkbook({
      S: [
        ["Mois", "Loyer", "Airbnb", "GLI", "Visale", "Remboursement charges"],
        ["Janvier", 1, 2, 3, 4, 5],
      ],
    });
    const file = workbookToFile(wb);
    const lines = await runSpreadsheetPipelineForTest(file, 2025);
    const session = sessionFromPipelineLines([TEST_PROPERTY], 2025, new Map([[TEST_PROPERTY.id, lines]]), "ocr_lines");
    const { revenusAssistant } = buildRevenusAssistantFromSession(session, 2025, "2020-01-01");
    const { result } = fiscalFor(revenusAssistant);

    // 1€ (loyer) + 5€ (remboursement, fondu dans la base recette) = 6€
    assert.equal(revenusAssistant.loyersEncaisses, 6);
    // 2€ (Airbnb)
    assert.equal(revenusAssistant.recettesPlateforme, 2);
    // 3€ (GLI) + 4€ (Visale) = 7€
    assert.equal(revenusAssistant.indemnitesAssurance, 7);
    assert.equal(revenusAssistant.totalRecettes, 15);
    assert.equal(result!.recettes.total, 15, "les 5 euros doivent tous être retrouvés dans le résultat fiscal final");
  });
});

describe("Cycle 16 — multi-biens : hors périmètre MVP, comportement actuel documenté", () => {
  /**
   * F-002 (KS) exclut explicitement la gestion multi-biens du MVP : "Créer
   * plusieurs biens dans le MVP" est listé comme hors-scope, "introduite dans
   * une version ultérieure". En pratique, `properties[]` ne contient qu'un
   * seul bien dans le produit actuel (runRevenusDocumentPipeline route même
   * tous les documents vers `properties[0]` uniquement — Cycle 15A).
   *
   * Ce test documente le comportement RÉEL de buildRevenusAssistantFromSession
   * si on lui passe malgré tout une session à deux biens : il les SOMME sans
   * distinction en un seul revenusAssistant. Non corrigé dans ce cycle — ce
   * n'est pas un bug pour un scope MVP mono-bien, seulement un point à traiter
   * explicitement si/quand F-002 multi-bien est activé (probablement en
   * introduisant un revenusAssistant par bien plutôt qu'un par dossier).
   */
  it("session à deux biens : buildRevenusAssistantFromSession les additionne sans distinction (documenté, pas corrigé)", async () => {
    const fileA = workbookToFile(buildWorkbook({ S: [["Mois", "Loyer"], ["Janvier", 10000]] }), "a.xlsx");
    const fileB = workbookToFile(buildWorkbook({ S: [["Mois", "Loyer"], ["Janvier", 20000]] }), "b.xlsx");

    const linesA = await runSpreadsheetPipelineForTest(fileA, 2025, "docA");
    let session = sessionFromPipelineLines([TEST_PROPERTY, TEST_PROPERTY_B], 2025, new Map([[TEST_PROPERTY.id, linesA]]), "ocr_lines");
    const linesB = await runSpreadsheetPipelineForTest(fileB, 2025, "docB");
    session = sessionFromPipelineLines(
      [TEST_PROPERTY, TEST_PROPERTY_B],
      2025,
      new Map([[TEST_PROPERTY_B.id, linesB]]),
      "ocr_lines",
      session,
    );

    const propA = session.properties.find((p) => p.id === TEST_PROPERTY.id)!;
    const propB = session.properties.find((p) => p.id === TEST_PROPERTY_B.id)!;
    assert.equal(propA.rows.reduce((s, r) => s + r.loyers, 0), 10000, "la grille par bien reste correctement isolée");
    assert.equal(propB.rows.reduce((s, r) => s + r.loyers, 0), 20000);

    const { revenusAssistant } = buildRevenusAssistantFromSession(session, 2025, "2020-01-01");
    assert.equal(revenusAssistant.totalRecettes, 30000, "comportement actuel : somme globale, sans notion de bien — attendu tant que F-002 multi-bien n'est pas activé");
  });
});
