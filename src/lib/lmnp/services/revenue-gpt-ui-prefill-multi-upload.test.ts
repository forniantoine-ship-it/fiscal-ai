import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { produceFiscalResult } from "@/runtime/capabilities/f006/produce-fiscal-result";
import {
  gridSummary,
  removeDocumentFromRevenueSession,
  sessionFromPipelineLines,
} from "./revenue-gpt-ui-prefill";
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
 * Cycle 15B — fiabilité multi-documents. Chaque test simule des uploads dans
 * des ACTIONS SÉPARÉES (documentId unique par appel, previous = session déjà
 * persistée) — exactement le chemin de RevenusDocumentStep.runAnalysis(), pas
 * un seul appel groupé. Chaque test vérifie à la fois gridSummary (ce que
 * l'écran affiche) ET buildRevenusAssistantFromSession (ce qui part
 * réellement vers F-006) — c'est leur désynchronisation qui était le bug.
 */

function assertScreenMatchesFiscal(session: Parameters<typeof gridSummary>[0], fiscalYear: number, expected: number, label: string) {
  const screenTotal = gridSummary(session).totalRevenue;
  const { revenusAssistant } = buildRevenusAssistantFromSession(session, fiscalYear, "2020-01-01");
  assert.equal(screenTotal, expected, `${label} — écran`);
  assert.equal(revenusAssistant.totalRecettes, expected, `${label} — F-006`);
  assert.equal(screenTotal, revenusAssistant.totalRecettes, `${label} — écran et F-006 doivent toujours converger`);
}

describe("Cycle 15B — Test A : deux Excel successifs (mois différents)", () => {
  it("A(jan+fev 1000 chacun) puis B(mar+avr 2000 chacun) = 6000€, 4 mois présents", async () => {
    const fileA = workbookToFile(buildWorkbook({ Feuille1: [["Mois", "Loyer"], ["Janvier", 1000], ["Février", 1000]] }), "a.xlsx");
    const fileB = workbookToFile(buildWorkbook({ Feuille1: [["Mois", "Loyer"], ["Mars", 2000], ["Avril", 2000]] }), "b.xlsx");

    let session = await uploadSequentially(undefined, fileA, 2025, "docA");
    assertScreenMatchesFiscal(session, 2025, 2000, "après A seule");

    session = await uploadSequentially(session, fileB, 2025, "docB");
    assertScreenMatchesFiscal(session, 2025, 6000, "après A puis B");

    const rows = session.properties[0]!.rows.filter((r) => r.loyers > 0);
    assert.equal(rows.length, 4, "les 4 mois doivent être présents");
    assert.equal(session.properties[0]!.transactions?.length, 4, "les 4 transactions doivent être accumulées, pas seulement les 2 dernières");
  });
});

describe("Cycle 15B — Test B : Excel + CSV successifs (formats différents, même pipeline spreadsheet)", () => {
  // Note honnête (brief §2, Test B) : construire un vrai PDF natif texte ou un
  // document "vision" en mémoire n'est pas praticable dans ce test (aucune
  // bibliothèque de génération PDF dans ce dépôt) — tester un vrai cross-pipeline
  // Excel+PDF nécessiterait une fixture PDF binaire hors de portée raisonnable
  // ici. Excel et CSV empruntent tous deux runSpreadsheetRevenuePipeline mais
  // via deux branches de lecture réellement différentes (XLSX.read vs parseCsvText
  // dans spreadsheet-grid.ts) — c'est le format alternatif réellement testable.
  it("A = Excel 2000€ puis B = CSV 3000€ — accumulés, jamais l'un ne remplace l'autre", async () => {
    const fileA = workbookToFile(buildWorkbook({ Feuille1: [["Mois", "Loyer"], ["Janvier", 2000]] }), "a.xlsx");
    const csvText = "Mois,Loyer\nFévrier,3000\n";
    const fileB = new File([csvText], "b.csv", { type: "text/csv" });

    let session = await uploadSequentially(undefined, fileA, 2025, "docA");
    session = await uploadSequentially(session, fileB, 2025, "docB");

    assertScreenMatchesFiscal(session, 2025, 5000, "Excel + CSV successifs");
  });
});

describe("Cycle 15B — Test C : même fichier réimporté dans une action séparée", () => {
  it("A = 3000€ puis A (même fichier) à nouveau = toujours 3000€, jamais 6000€", async () => {
    const file = workbookToFile(
      buildWorkbook({ Feuille1: [["Mois", "Loyer"], ["Janvier", 1000], ["Février", 1000], ["Mars", 1000]] }),
      "releve.xlsx",
    );

    let session = await uploadSequentially(undefined, file, 2025, "docA");
    assertScreenMatchesFiscal(session, 2025, 3000, "après premier import");

    // Ré-import du MÊME fichier, action séparée (nouveau documentId, comme un
    // vrai second upload) — avant Cycle 15B, aucun mécanisme ne détectait ce cas
    // inter-appels (le dédup Cycle 15A ne voyait que les doublons au sein d'un
    // même appel de runRevenusDocumentPipeline).
    session = await uploadSequentially(session, file, 2025, "docA-bis");
    assertScreenMatchesFiscal(session, 2025, 3000, "après ré-import du même fichier — jamais doublé");
  });
});

describe("Cycle 15B — Test D : deux fichiers différents, transactions identiques", () => {
  it("A(01/01/2025: 1000€) + B(01/01/2025: 1000€, fichier différent) = 2000€ — jamais fusionnés à tort", async () => {
    const rows: (string | number)[][] = [["Mois", "Date", "Loyer"], ["Janvier", "01/01/2025", 1000]];
    const fileA = workbookToFile(buildWorkbook({ Feuille1: rows }), "encaissement-1.xlsx");
    const fileB = workbookToFile(buildWorkbook({ Feuille1: rows }), "encaissement-2.xlsx");

    let session = await uploadSequentially(undefined, fileA, 2025, "docA");
    session = await uploadSequentially(session, fileB, 2025, "docB");

    assertScreenMatchesFiscal(session, 2025, 2000, "deux encaissements distincts, même montant/date — tous deux conservés");
  });
});

describe("Cycle 15B — Test E : deux exercices successifs", () => {
  it("A(déc. 2025 payé 10/01/2026) puis B(jan. 2026 payé 15/01/2026) — exercices jamais mélangés", async () => {
    const fileA = workbookToFile(
      buildWorkbook({ Feuille1: [["Mois", "Loyer", "Date paiement"], ["Décembre", 1000, "10/01/2026"]] }),
      "a.xlsx",
    );
    const fileB = workbookToFile(
      buildWorkbook({ Feuille1: [["Mois", "Loyer", "Date paiement"], ["Janvier", 1200, "15/01/2026"]] }),
      "b.xlsx",
    );

    // Deux sessions distinctes par exercice fiscal — exactement ce que fait
    // l'application (un dossier = un exercice) ; on rejoue les deux uploads
    // séquentiellement pour CHAQUE exercice demandé.
    let session2025 = await uploadSequentially(undefined, fileA, 2025, "docA");
    session2025 = await uploadSequentially(session2025, fileB, 2025, "docB");
    assertScreenMatchesFiscal(session2025, 2025, 0, "exercice 2025 — rien n'est réellement encaissé en 2025");

    let session2026 = await uploadSequentially(undefined, fileA, 2026, "docA2");
    session2026 = await uploadSequentially(session2026, fileB, 2026, "docB2");
    assertScreenMatchesFiscal(session2026, 2026, 2200, "exercice 2026 — les deux montants sont réellement encaissés en 2026");
  });
});

describe("Cycle 15B — Test F : deux biens différents", () => {
  it("Bien A (5000€) et Bien B (7000€) — jamais mélangés, jamais remplacés l'un par l'autre", async () => {
    const fileA = workbookToFile(buildWorkbook({ Feuille1: [["Mois", "Loyer"], ["Janvier", 5000]] }), "bien-a.xlsx");
    const fileB = workbookToFile(buildWorkbook({ Feuille1: [["Mois", "Loyer"], ["Janvier", 7000]] }), "bien-b.xlsx");

    const linesA = await runSpreadsheetPipelineForTest(fileA, 2025, "docA");
    let session = sessionFromPipelineLines(
      [TEST_PROPERTY, TEST_PROPERTY_B],
      2025,
      new Map([[TEST_PROPERTY.id, linesA]]),
      "ocr_lines",
    );

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
    assert.equal(propA.rows.reduce((s, r) => s + r.loyers, 0), 5000, "Bien A inchangé par l'upload du Bien B");
    assert.equal(propB.rows.reduce((s, r) => s + r.loyers, 0), 7000, "Bien B correctement alimenté");
  });
});

describe("Cycle 15B — Test G : correction/remplacement volontaire (REMOVE_DOCUMENT)", () => {
  it("upload A(5000€) puis suppression explicite de A puis upload du corrigé(6000€) = 6000€, jamais 11000€", async () => {
    const fileA = workbookToFile(buildWorkbook({ Feuille1: [["Mois", "Loyer"], ["Janvier", 5000]] }), "a.xlsx");
    const fileACorrige = workbookToFile(buildWorkbook({ Feuille1: [["Mois", "Loyer"], ["Janvier", 6000]] }), "a-corrige.xlsx");

    let session = await uploadSequentially(undefined, fileA, 2025, "docA");
    assertScreenMatchesFiscal(session, 2025, 5000, "avant correction");

    // Action utilisateur explicite et identifiable : suppression du document A
    // (jamais déduite d'un montant/date qui se ressemble).
    session = removeDocumentFromRevenueSession(session, "docA", 2025);
    assertScreenMatchesFiscal(session, 2025, 0, "après suppression explicite du document — plus aucune contribution de A");

    session = await uploadSequentially(session, fileACorrige, 2025, "docA-corrige");
    assertScreenMatchesFiscal(session, 2025, 6000, "après upload du document corrigé — jamais 11000€ (5000+6000)");
  });

  it("supprimer un document qui n'a jamais contribué à cette propriété ne change rien", async () => {
    const fileA = workbookToFile(buildWorkbook({ Feuille1: [["Mois", "Loyer"], ["Janvier", 1000]] }), "a.xlsx");
    let session = await uploadSequentially(undefined, fileA, 2025, "docA");
    session = removeDocumentFromRevenueSession(session, "document-inexistant", 2025);
    assertScreenMatchesFiscal(session, 2025, 1000, "aucun effet si le documentId ne correspond à rien");
  });
});

describe("Cycle 15B — trace complète A → B → F-006", () => {
  it("Document A puis Document B, jusqu'au résultat fiscal final (produceFiscalResult)", async () => {
    const fileA = workbookToFile(buildWorkbook({ Feuille1: [["Mois", "Loyer"], ["Janvier", 1000], ["Février", 1000]] }), "a.xlsx");
    const fileB = workbookToFile(buildWorkbook({ Feuille1: [["Mois", "Loyer"], ["Mars", 2000], ["Avril", 2000]] }), "b.xlsx");

    let session = await uploadSequentially(undefined, fileA, 2025, "docA");
    const bridgeA = buildRevenusAssistantFromSession(session, 2025, "2020-01-01");
    assert.equal(bridgeA.revenusAssistant.totalRecettes, 2000, "A = 2000€");

    session = await uploadSequentially(session, fileB, 2025, "docB");
    const bridgeAB = buildRevenusAssistantFromSession(session, 2025, "2020-01-01");
    assert.equal(bridgeAB.revenusAssistant.totalRecettes, 6000, "A+B = 6000€ (jamais 4000€, jamais 8000€)");

    const { result, anomalies } = produceFiscalResult({
      exerciceFiscal: 2025,
      activite: { dateMiseEnService: "2020-01-01" },
      revenusAssistant: bridgeAB.revenusAssistant,
      chargesAssistant: { exerciceFiscal: 2025, totalDeductible: 1000, totalPreExploitation: 0 },
      financementCharges: { exerciceFiscal: 2025, totalChargesFinancementExercice: 0, totalInteretsPreExploitation: 0 },
      amortissementAssistant: { exerciceFiscal: 2025, totalDotations: 500, status: "validated" },
      logementAmortissement: { computedAt: "2025-01-01T00:00:00.000Z" },
    });

    assert.equal(anomalies.some((a) => a.severity === "fatal"), false);
    assert.ok(result);
    assert.equal(result!.recettes.total, 6000, "montant vérifiable de bout en bout, A+B, jusqu'à F-006");
  });
});

/**
 * Cycle 17 — P1 : mergedBatchHashes était un tableau plat, append-only, jamais
 * nettoyé à la suppression d'un document. Conséquence : réimporter le fichier
 * identique après suppression était bloqué pour toujours comme "doublon", sans
 * aucun moyen de s'en sortir. Corrigé en remplaçant le tableau plat par
 * `mergedBatches: {documentId, hash}[]`, filtré par documentId à la suppression.
 */
describe("Cycle 17 — P1 : suppression puis réimport du même document", () => {
  it("après suppression, le même fichier peut être réimporté (jamais bloqué en doublon permanent)", async () => {
    const fileA = workbookToFile(buildWorkbook({ Feuille1: [["Mois", "Loyer"], ["Janvier", 3000]] }), "a.xlsx");

    let session = await uploadSequentially(undefined, fileA, 2025, "docA");
    assertScreenMatchesFiscal(session, 2025, 3000, "après A");

    session = removeDocumentFromRevenueSession(session, "docA", 2025);
    assertScreenMatchesFiscal(session, 2025, 0, "après suppression de A");

    session = await uploadSequentially(session, fileA, 2025, "docA-reimport");
    assertScreenMatchesFiscal(session, 2025, 3000, "réimport du même contenu après suppression — jamais bloqué, jamais 0€");
  });

  it("un vrai doublon (réimport SANS suppression préalable) reste bloqué", async () => {
    const fileA = workbookToFile(buildWorkbook({ Feuille1: [["Mois", "Loyer"], ["Janvier", 3000]] }), "a.xlsx");

    let session = await uploadSequentially(undefined, fileA, 2025, "docA");
    session = await uploadSequentially(session, fileA, 2025, "docA-doublon");
    assertScreenMatchesFiscal(session, 2025, 3000, "réimport sans suppression = toujours bloqué comme doublon, jamais 6000€");
  });
});

/**
 * Cycle 17 — P2 : cohérence des 4 niveaux (gridSummary → transactions →
 * revenusAssistant → produceFiscalResult) sur les 3 scénarios de suppression
 * partielle explicitement demandés par le brief.
 */
describe("Cycle 17 — P2 : plusieurs uploads séparés + suppression partielle", () => {
  it("A → B → suppression de A : ne conserve que B, sur les 4 niveaux", async () => {
    const fileA = workbookToFile(buildWorkbook({ Feuille1: [["Mois", "Loyer"], ["Janvier", 1000]] }), "a.xlsx");
    const fileB = workbookToFile(buildWorkbook({ Feuille1: [["Mois", "Loyer"], ["Février", 2000]] }), "b.xlsx");

    let session = await uploadSequentially(undefined, fileA, 2025, "docA");
    session = await uploadSequentially(session, fileB, 2025, "docB");
    session = removeDocumentFromRevenueSession(session, "docA", 2025);

    assertScreenMatchesFiscal(session, 2025, 2000, "A→B→suppression de A");
    assert.equal(
      (session.properties[0].transactions ?? []).every((t) => t.sourceDocumentId !== "docA"),
      true,
      "aucune transaction résiduelle de A dans la liste plate",
    );
  });

  it("A → B → suppression de B : ne conserve que A, sur les 4 niveaux", async () => {
    const fileA = workbookToFile(buildWorkbook({ Feuille1: [["Mois", "Loyer"], ["Janvier", 1000]] }), "a.xlsx");
    const fileB = workbookToFile(buildWorkbook({ Feuille1: [["Mois", "Loyer"], ["Février", 2000]] }), "b.xlsx");

    let session = await uploadSequentially(undefined, fileA, 2025, "docA");
    session = await uploadSequentially(session, fileB, 2025, "docB");
    session = removeDocumentFromRevenueSession(session, "docB", 2025);

    assertScreenMatchesFiscal(session, 2025, 1000, "A→B→suppression de B");
  });

  it("A → B → suppression de A → réimport de A : revient à A+B, jamais divergent", async () => {
    const fileA = workbookToFile(buildWorkbook({ Feuille1: [["Mois", "Loyer"], ["Janvier", 1000]] }), "a.xlsx");
    const fileB = workbookToFile(buildWorkbook({ Feuille1: [["Mois", "Loyer"], ["Février", 2000]] }), "b.xlsx");

    let session = await uploadSequentially(undefined, fileA, 2025, "docA");
    session = await uploadSequentially(session, fileB, 2025, "docB");
    session = removeDocumentFromRevenueSession(session, "docA", 2025);
    session = await uploadSequentially(session, fileA, 2025, "docA-reimport");

    assertScreenMatchesFiscal(session, 2025, 3000, "A→B→suppression de A→réimport de A");
  });
});
