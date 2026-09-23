/**
 * Lot 5.4-A — PDF registre d'amortissements → CandidateHistoricalAsset[].
 * Run: npx tsx --test src/lib/lmnp/services/takeover/lot54a-depreciation-register-pdf.test.ts
 *
 * Vision est injectée (fixtures scriptées) — aucun appel réseau, aucun modèle
 * vision réel. Prouve le mapping déterministe, l'exclusion des sorties, le
 * contrôle de complétude, et la détection d'extraction partielle.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { isCandidateAbsent, isCandidatePresent } from "./candidate-value";
import {
  extractDepreciationRegisterFromPdf,
  parseRegisterDurationAnMois,
} from "./extract-depreciation-register-pdf";
import type {
  DepreciationRegisterPdfRow,
  DepreciationRegisterVisionRequester,
} from "./depreciation-register-pdf-row";
import type { RasterPageImage } from "@/lib/documents/ocr/pdf-to-images";

const DOC = "doc-lot54a";

function fakePdfFile(name = "register.pdf"): File {
  // Bytes invalides pour pdfjs — extractNativePdfPages échoue proprement
  // (PDF_READ_FAILED, hasNativeText=false) et le test exerce le chemin Vision seul.
  return new File([new Uint8Array([1, 2, 3])], name, { type: "application/pdf" });
}

function fakeRasterizer(pageCount: number): (file: File) => Promise<RasterPageImage[]> {
  return async () =>
    Array.from({ length: pageCount }, (_, i) => ({
      pageNumber: i + 1,
      mimeType: "image/png" as const,
      base64: "AAAA",
    }));
}

function visionReturning(
  rowsByPage: Record<number, DepreciationRegisterPdfRow[]>,
): DepreciationRegisterVisionRequester {
  return async ({ pageNumber }) => ({ rows: rowsByPage[pageNumber] ?? [] });
}

function assetRow(overrides: Partial<DepreciationRegisterPdfRow> = {}): DepreciationRegisterPdfRow {
  return {
    rowType: "asset",
    pageNumber: 1,
    assetRef: "B70500",
    label: "Teletower telescopique Jefco",
    acquisitionDateRaw: "31/05/2017",
    grossCostRaw: "1 292,81",
    openingCumulativeRaw: "1 292,81",
    methodRaw: "L",
    durationRaw: "05 - 00",
    rawSnippet: "B70500 ... Teletower telescopique Jefco ... 1 292,81 1 292,81",
    ...overrides,
  };
}

describe("Lot 5.4-A — extractDepreciationRegisterFromPdf", () => {
  it("produit un CandidateHistoricalAsset pour une ligne immobilisation exploitable", async () => {
    const result = await extractDepreciationRegisterFromPdf({
      file: fakePdfFile(),
      documentId: DOC,
      targetFiscalYear: 2023,
      rasterizer: fakeRasterizer(1),
      visionRequester: visionReturning({ 1: [assetRow()] }),
    });

    assert.equal(result.status, "extracted");
    assert.equal(result.candidates.length, 1);
    const c = result.candidates[0];
    assert.equal(c.sourceAssetRef, "B70500");
    assert.ok(isCandidatePresent(c.label));
    assert.ok(isCandidatePresent(c.coutBrut));
    if (isCandidatePresent(c.coutBrut)) assert.equal(c.coutBrut.value, 1292.81);
    assert.ok(isCandidatePresent(c.cumulOuverture));
    if (isCandidatePresent(c.cumulOuverture)) assert.equal(c.cumulOuverture.value, 1292.81);
    assert.ok(isCandidatePresent(c.startDate));
    if (isCandidatePresent(c.startDate)) assert.equal(c.startDate.value, "2017-05-31");
    assert.ok(isCandidatePresent(c.method));
    if (isCandidatePresent(c.method)) assert.equal(c.method.value, "lineaire");
  });

  it("zéro explicite reste present(0), jamais missing", async () => {
    const result = await extractDepreciationRegisterFromPdf({
      file: fakePdfFile(),
      documentId: DOC,
      targetFiscalYear: 2023,
      rasterizer: fakeRasterizer(1),
      visionRequester: visionReturning({
        1: [assetRow({ assetRef: "X1", grossCostRaw: "0,00", openingCumulativeRaw: "0,00" })],
      }),
    });

    const c = result.candidates[0];
    assert.ok(isCandidatePresent(c.coutBrut));
    if (isCandidatePresent(c.coutBrut)) assert.equal(c.coutBrut.value, 0);
    assert.ok(isCandidatePresent(c.cumulOuverture));
    if (isCandidatePresent(c.cumulOuverture)) assert.equal(c.cumulOuverture.value, 0);
  });

  it("valeur absente reste missing — jamais normalisée à 0", async () => {
    const result = await extractDepreciationRegisterFromPdf({
      file: fakePdfFile(),
      documentId: DOC,
      targetFiscalYear: 2023,
      rasterizer: fakeRasterizer(1),
      visionRequester: visionReturning({
        1: [assetRow({ assetRef: "X2", openingCumulativeRaw: undefined })],
      }),
    });

    const c = result.candidates[0];
    assert.ok(isCandidateAbsent(c.cumulOuverture));
    assert.equal(c.cumulOuverture.status, "missing");
  });

  it("ligne avec montant non parseable → extraction_impossible, jamais une valeur inventée", async () => {
    const result = await extractDepreciationRegisterFromPdf({
      file: fakePdfFile(),
      documentId: DOC,
      targetFiscalYear: 2023,
      rasterizer: fakeRasterizer(1),
      visionRequester: visionReturning({
        1: [assetRow({ assetRef: "X3", grossCostRaw: "??? illisible ???" })],
      }),
    });

    const c = result.candidates[0];
    assert.equal(c.coutBrut.status, "extraction_impossible");
    assert.ok(result.diagnostics.some((d) => d.code === "UNPARSEABLE_AMOUNT"));
    assert.equal(result.status, "review_required");
  });

  it("sortie explicite exclue des candidates, tracée dans excludedExitRows + diagnostic", async () => {
    const result = await extractDepreciationRegisterFromPdf({
      file: fakePdfFile(),
      documentId: DOC,
      targetFiscalYear: 2023,
      rasterizer: fakeRasterizer(1),
      visionRequester: visionReturning({
        1: [
          assetRow({ assetRef: "KEEP" }),
          {
            rowType: "exit",
            pageNumber: 1,
            assetRef: "B71200",
            label: "2 iphone Apple",
            acquisitionDateRaw: "01/12/2017",
            grossCostRaw: "2 215,00",
            openingCumulativeRaw: "2 215,00",
            exitDateRaw: "31/12/2023",
            exitLabelRaw: "Except. (Sortie tot.)",
            rawSnippet: "B71200 2 iphone Apple ... Except. (Sortie tot.) ... 2 215,00",
          },
        ],
      }),
    });

    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0].sourceAssetRef, "KEEP");
    assert.equal(result.excludedExitRows.length, 1);
    assert.equal(result.excludedExitRows[0].assetRef, "B71200");
    assert.ok(
      result.diagnostics.some(
        (d) => d.code === "EXITED_ASSET_ROW_SKIPPED" && d.rowRef === "B71200",
      ),
    );
  });

  it("contrôle de total CONCORDANT quand la somme extraite égale le total documentaire", async () => {
    const result = await extractDepreciationRegisterFromPdf({
      file: fakePdfFile(),
      documentId: DOC,
      targetFiscalYear: 2023,
      rasterizer: fakeRasterizer(1),
      visionRequester: visionReturning({
        1: [
          assetRow({ assetRef: "A1", grossCostRaw: "1 000,00", openingCumulativeRaw: "400,00" }),
          assetRow({ assetRef: "A2", grossCostRaw: "2 000,00", openingCumulativeRaw: "600,00" }),
          {
            rowType: "total",
            pageNumber: 1,
            scopeLabel: "Total Hors Sorties",
            grossCostRaw: "3 000,00",
            openingCumulativeRaw: "1 000,00",
            rawSnippet: "Total Hors Sorties 3 000,00 1 000,00",
          },
        ],
      }),
    });

    assert.equal(result.status, "extracted");
    const check = result.controlChecks.find(
      (c) => c.scopeLabel === "Total Hors Sorties" && c.field === "grossCost",
    );
    assert.ok(check);
    assert.equal(check?.status, "CONCORDANT");
  });

  it("contrôle de total CONFLICT quand une immobilisation imprimée est absente des sous-totaux du document (cas réel B80400 GEFFROY)", async () => {
    const result = await extractDepreciationRegisterFromPdf({
      file: fakePdfFile(),
      documentId: DOC,
      targetFiscalYear: 2023,
      rasterizer: fakeRasterizer(1),
      visionRequester: visionReturning({
        1: [
          assetRow({ assetRef: "A1", grossCostRaw: "1 000,00", openingCumulativeRaw: "400,00" }),
          // Ligne imprimée avec coût brut présent mais aucun cumul — comme B80400 (mode N).
          assetRow({
            assetRef: "AMBIGUOUS",
            grossCostRaw: "1 559,91",
            openingCumulativeRaw: undefined,
          }),
          {
            rowType: "total",
            pageNumber: 1,
            scopeLabel: "Total Hors Sorties",
            // Le document exclut AMBIGUOUS de son propre total.
            grossCostRaw: "1 000,00",
            rawSnippet: "Total Hors Sorties 1 000,00",
          },
        ],
      }),
    });

    const check = result.controlChecks.find(
      (c) => c.scopeLabel === "Total Hors Sorties" && c.field === "grossCost",
    );
    assert.ok(check);
    assert.equal(check?.status, "CONFLICT");
    assert.equal(check?.extractedSum, 2559.91);
    assert.equal(check?.documentTotal, 1000);
    assert.equal(result.status, "review_required");
    // La ligne ambiguë reste néanmoins un candidate — jamais supprimée silencieusement.
    assert.ok(result.candidates.some((c) => c.sourceAssetRef === "AMBIGUOUS"));
  });

  it("adversarial — extraction partielle jamais acceptée comme complète", async () => {
    // Document : 3 immobilisations, total brut 30 000. Vision n'en renvoie que 2 (20 000).
    const result = await extractDepreciationRegisterFromPdf({
      file: fakePdfFile(),
      documentId: DOC,
      targetFiscalYear: 2023,
      rasterizer: fakeRasterizer(1),
      visionRequester: visionReturning({
        1: [
          assetRow({ assetRef: "P1", grossCostRaw: "10 000,00", openingCumulativeRaw: "1 000,00" }),
          assetRow({ assetRef: "P2", grossCostRaw: "10 000,00", openingCumulativeRaw: "1 000,00" }),
          {
            rowType: "total",
            pageNumber: 1,
            scopeLabel: "Total Hors Sorties",
            grossCostRaw: "30 000,00",
            rawSnippet: "Total Hors Sorties 30 000,00",
          },
        ],
      }),
    });

    const check = result.controlChecks.find(
      (c) => c.scopeLabel === "Total Hors Sorties" && c.field === "grossCost",
    );
    assert.equal(check?.status, "CONFLICT");
    assert.equal(check?.extractedSum, 20000);
    assert.equal(check?.documentTotal, 30000);
    assert.notEqual(result.status, "extracted");
    assert.equal(result.status, "review_required");
  });

  it("aucune ligne reconnue → unsupported, jamais un résultat vide silencieusement accepté", async () => {
    const result = await extractDepreciationRegisterFromPdf({
      file: fakePdfFile(),
      documentId: DOC,
      targetFiscalYear: 2023,
      rasterizer: fakeRasterizer(1),
      visionRequester: visionReturning({ 1: [] }),
    });

    assert.equal(result.status, "unsupported");
    assert.equal(result.candidates.length, 0);
    assert.ok(result.diagnostics.some((d) => d.code === "NO_ASSET_ROWS_EXTRACTED"));
  });

  it("fichier non PDF → unsupported (NOT_PDF)", async () => {
    const notPdf = new File([new Uint8Array([1])], "reg.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const result = await extractDepreciationRegisterFromPdf({
      file: notPdf,
      documentId: DOC,
      targetFiscalYear: 2023,
      rasterizer: fakeRasterizer(1),
      visionRequester: visionReturning({}),
    });

    assert.equal(result.status, "unsupported");
    assert.ok(result.diagnostics.some((d) => d.code === "NOT_PDF"));
  });
});

describe("Lot 5.4-A — parseRegisterDurationAnMois", () => {
  it("parse un format an-mois standard", () => {
    assert.equal(parseRegisterDurationAnMois("05 - 00"), 5);
    assert.equal(parseRegisterDurationAnMois("03-00"), 3);
  });

  it("retourne null pour une valeur illisible ou absente", () => {
    assert.equal(parseRegisterDurationAnMois(""), null);
    assert.equal(parseRegisterDurationAnMois("n/a"), null);
  });
});
