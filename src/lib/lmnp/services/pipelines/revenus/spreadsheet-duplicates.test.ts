import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { LmnpDocument } from "@/lib/lmnp/types";
import { buildWorkbook, TEST_PROPERTY, workbookToFile } from "./spreadsheet-revenue.fixtures";

/**
 * revenus-document-pipeline.ts importe transitivement src/lib/supabase.ts, qui
 * crée un client au chargement du module et lève si les variables d'env sont
 * absentes (cas normal hors Next.js). Import dynamique, après avoir posé des
 * valeurs factices — ce test ne fait aucun appel réseau, seul le pipeline
 * d'extraction déterministe est exercé.
 */
async function loadRunRevenusDocumentPipeline() {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://test.invalid.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
  const mod = await import("@/lib/lmnp/services/revenus-document-pipeline");
  return mod.runRevenusDocumentPipeline;
}

function makeDocument(id: string, fileName: string): LmnpDocument {
  return {
    id,
    fiscalYearId: "fy-1",
    fileName,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    sizeBytes: 1000,
    category: "revenus",
    documentType: "rent_bank_statement",
    status: "uploaded",
    uploadedAt: new Date().toISOString(),
  };
}

const ROWS: (string | number)[][] = [
  ["Mois", "Loyer", "Complément"],
  ["Janvier", 1000, 0],
  ["Février", 1000, 0],
  ["Mars", 1000, 0],
];

describe("Cycle 15A — Étape E : doublons", () => {
  it("A. même fichier importé deux fois — pas de double comptage", async () => {
    const file = workbookToFile(buildWorkbook({ Feuille1: ROWS }));
    const docA = makeDocument("docA", "releve.xlsx");
    const docB = makeDocument("docB", "releve.xlsx"); // même contenu, id de document différent (deuxième upload)

    const files = new Map<string, File>([
      ["docA", file],
      ["docB", file],
    ]);

    const runRevenusDocumentPipeline = await loadRunRevenusDocumentPipeline();
    const result = await runRevenusDocumentPipeline({
      documents: [docA, docB],
      documentIds: ["docA", "docB"],
      getFile: (id) => files.get(id),
      fiscalYear: 2025,
      properties: [TEST_PROPERTY],
    });

    assert.equal(result.duplicateDocumentIds.length, 1, "le second document est reconnu comme doublon");
    const total = [...result.linesByPropertyId.values()].flat().reduce((s, l) => s + l.amount, 0);
    assert.equal(total, 3000, "3000€ (un seul jeu de lignes), jamais 6000€");
  });

  it("B1. même NOM de fichier, contenu identique (re-export du même relevé) — pas de double comptage", async () => {
    const fileA = workbookToFile(buildWorkbook({ Feuille1: ROWS }), "releve.xlsx");
    const fileB = workbookToFile(buildWorkbook({ Feuille1: ROWS }), "releve.xlsx");
    const docA = makeDocument("docA", "releve.xlsx");
    const docB = makeDocument("docB", "releve.xlsx");

    const files = new Map<string, File>([
      ["docA", fileA],
      ["docB", fileB],
    ]);

    const runRevenusDocumentPipeline = await loadRunRevenusDocumentPipeline();
    const result = await runRevenusDocumentPipeline({
      documents: [docA, docB],
      documentIds: ["docA", "docB"],
      getFile: (id) => files.get(id),
      fiscalYear: 2025,
      properties: [TEST_PROPERTY],
    });

    assert.equal(result.duplicateDocumentIds.length, 1);
    const total = [...result.linesByPropertyId.values()].flat().reduce((s, l) => s + l.amount, 0);
    assert.equal(total, 3000);
  });

  /**
   * Cycle 15B — précision de spécification par rapport au Cycle 15A : deux
   * fichiers de noms DIFFÉRENTS ne sont jamais des doublons, même à contenu
   * identique — ce sont potentiellement deux encaissements réellement distincts
   * (brief Cycle 15B, Test D). Le Cycle 15A traitait par erreur ce cas comme un
   * doublon (le hash de contenu seul, sans le nom de fichier, ne pouvait pas
   * distinguer "même fichier réimporté" de "deux fichiers différents,
   * transactions identiques") — corrigé ici : hashDocumentContent inclut
   * désormais sourceFileName.
   */
  it("B2. noms de fichiers DIFFÉRENTS, contenu identique — jamais fusionnés à tort (Cycle 15B)", async () => {
    const fileA = workbookToFile(buildWorkbook({ Feuille1: ROWS }), "export-banque-A.xlsx");
    const fileB = workbookToFile(buildWorkbook({ Feuille1: ROWS }), "export-banque-B.xlsx");
    const docA = makeDocument("docA", "export-banque-A.xlsx");
    const docB = makeDocument("docB", "export-banque-B.xlsx");

    const files = new Map<string, File>([
      ["docA", fileA],
      ["docB", fileB],
    ]);

    const runRevenusDocumentPipeline = await loadRunRevenusDocumentPipeline();
    const result = await runRevenusDocumentPipeline({
      documents: [docA, docB],
      documentIds: ["docA", "docB"],
      getFile: (id) => files.get(id),
      fiscalYear: 2025,
      properties: [TEST_PROPERTY],
    });

    assert.equal(result.duplicateDocumentIds.length, 0, "deux fichiers distincts, jamais déduits comme doublons sur le seul contenu");
    const total = [...result.linesByPropertyId.values()].flat().reduce((s, l) => s + l.amount, 0);
    assert.equal(total, 6000, "les deux fichiers sont deux encaissements potentiellement réels — tous deux comptés");
  });

  it("C. deux transactions distinctes, même montant/date mais libellés différents — toutes deux conservées", async () => {
    const rowsA: (string | number)[][] = [
      ["Mois", "Date", "Loyer", "Airbnb"],
      ["Janvier", "05/01/2025", 1000, ""],
    ];
    const rowsB: (string | number)[][] = [
      ["Mois", "Date", "Loyer", "Airbnb"],
      ["Janvier", "05/01/2025", "", 1000],
    ];
    const fileA = workbookToFile(buildWorkbook({ Feuille1: rowsA }), "a.xlsx");
    const fileB = workbookToFile(buildWorkbook({ Feuille1: rowsB }), "b.xlsx");
    const docA = makeDocument("docA", "a.xlsx");
    const docB = makeDocument("docB", "b.xlsx");
    const files = new Map<string, File>([
      ["docA", fileA],
      ["docB", fileB],
    ]);

    const runRevenusDocumentPipeline = await loadRunRevenusDocumentPipeline();
    const result = await runRevenusDocumentPipeline({
      documents: [docA, docB],
      documentIds: ["docA", "docB"],
      getFile: (id) => files.get(id),
      fiscalYear: 2025,
      properties: [TEST_PROPERTY],
    });

    assert.equal(result.duplicateDocumentIds.length, 0, "libellés différents (Loyer vs Revenus plateforme) : pas des doublons");
    const total = [...result.linesByPropertyId.values()].flat().reduce((s, l) => s + l.amount, 0);
    assert.equal(total, 2000, "les deux transactions distinctes sont conservées");
  });

  it("D. deux lignes strictement identiques dans le MÊME fichier — conservées (pas fusionnées arbitrairement)", async () => {
    const rows: (string | number)[][] = [
      ["Mois", "Loyer", "Complément"],
      ["Janvier", 1000, 0],
      ["Janvier", 1000, 0],
      ["Février", 1000, 0],
    ];
    const file = workbookToFile(buildWorkbook({ Feuille1: rows }));
    const doc = makeDocument("doc1", "releve.xlsx");

    const runRevenusDocumentPipeline = await loadRunRevenusDocumentPipeline();
    const result = await runRevenusDocumentPipeline({
      documents: [doc],
      documentIds: ["doc1"],
      getFile: () => file,
      fiscalYear: 2025,
      properties: [TEST_PROPERTY],
    });

    const total = [...result.linesByPropertyId.values()].flat().reduce((s, l) => s + l.amount, 0);
    assert.equal(total, 3000, "les deux lignes identiques de janvier restent toutes deux comptées — ce sont peut-être deux vrais loyers");
  });

  it("ligne TOTAL — toujours exclue, jamais comptée comme une transaction", async () => {
    const rows: (string | number)[][] = [
      ["Mois", "Loyer", "Complément"],
      ["Janvier", 1000, 0],
      ["Février", 1000, 0],
      ["TOTAL", 2000, 0],
    ];
    const file = workbookToFile(buildWorkbook({ Feuille1: rows }));
    const doc = makeDocument("doc1", "releve.xlsx");

    const runRevenusDocumentPipeline = await loadRunRevenusDocumentPipeline();
    const result = await runRevenusDocumentPipeline({
      documents: [doc],
      documentIds: ["doc1"],
      getFile: () => file,
      fiscalYear: 2025,
      properties: [TEST_PROPERTY],
    });

    const total = [...result.linesByPropertyId.values()].flat().reduce((s, l) => s + l.amount, 0);
    assert.equal(total, 2000, "2000€ (le détail), jamais 4000€ (détail + ligne total)");
  });
});
