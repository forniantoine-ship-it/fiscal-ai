/**
 * Régression période — reprise N depuis registre N-1 :
 * cumulOuverture(N) ← Amort. fin N-1 (jamais Amort. début N-1).
 *
 * Run: npx tsx --test src/lib/lmnp/services/takeover/takeover-period-alignment.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { computeOpeningContentHash } from "@/lib/lmnp/services/fiscal-year-opening/content-hash";
import { available, unavailable } from "@/lib/lmnp/services/fiscal-year-opening/opening-fact";
import { propagateAnchoredDepreciation } from "@/lib/lmnp/services/fiscal-year-opening/propagate-anchored-depreciation";
import type { FiscalYearOpening, OpeningAsset } from "@/lib/lmnp/services/fiscal-year-opening/types";
import type { RasterPageImage } from "@/lib/documents/ocr/pdf-to-images";
import * as XLSX from "xlsx";

import { isCandidatePresent } from "./candidate-value";
import { extractDepreciationRegisterFromPdf } from "./extract-depreciation-register-pdf";
import { extractDepreciationRegisterFromSpreadsheet } from "./extract-depreciation-register-spreadsheet";
import type {
  DepreciationRegisterPdfRow,
  DepreciationRegisterVisionRequester,
} from "./depreciation-register-pdf-row";

const SOURCE_FY = 2023;
const TARGET_FY = 2024;

function stubPdfFile(): File {
  // Bytes minimaux « %PDF » — le chemin Vision est stubbé ; native text peut échouer.
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
  return new File([bytes], "period-oracle.pdf", { type: "application/pdf" });
}

function onePageRasterizer(): (file: File) => Promise<RasterPageImage[]> {
  return async () => [{ pageNumber: 1, mimeType: "image/png", base64: "AAAA" }];
}

describe("Takeover period alignment — Amort. fin N-1 → cumulOuverture(N)", () => {
  it("oracle déterministe PDF : début=200, dot=100, fin=300 → ouverture N = 300 (pas 200)", async () => {
    const row: DepreciationRegisterPdfRow = {
      rowType: "asset",
      pageNumber: 1,
      assetRef: "A1",
      label: "Immobilisation oracle",
      acquisitionDateRaw: "01/01/2020",
      startDateRaw: "01/01/2020",
      grossCostRaw: "1 000,00",
      openingCumulativeRaw: "200,00",
      dotationRaw: "100,00",
      closingCumulativeRaw: "300,00",
      methodRaw: "L",
      durationRaw: "10 - 00",
      rawSnippet: "A1 1000 200 100 300",
    };
    const vision: DepreciationRegisterVisionRequester = async () => ({ rows: [row] });

    const sameYear = await extractDepreciationRegisterFromPdf({
      file: stubPdfFile(),
      documentId: "doc-period",
      targetFiscalYear: SOURCE_FY,
      rasterizer: onePageRasterizer(),
      visionRequester: vision,
    });
    assert.ok(isCandidatePresent(sameYear.candidates[0]!.cumulOuverture));
    assert.equal(sameYear.candidates[0]!.cumulOuverture.value, 200, "same-year → Amort. début");

    const nextYear = await extractDepreciationRegisterFromPdf({
      file: stubPdfFile(),
      documentId: "doc-period",
      sourceFiscalYear: SOURCE_FY,
      targetFiscalYear: TARGET_FY,
      rasterizer: onePageRasterizer(),
      visionRequester: vision,
    });
    const candidate = nextYear.candidates[0]!;
    assert.ok(isCandidatePresent(candidate.cumulOuverture));
    assert.equal(candidate.cumulOuverture.value, 300, "N←N-1 → Amort. fin");
    assert.notEqual(candidate.cumulOuverture.value, 200);
    assert.equal(candidate.cumulOuverture.provenance.fieldLabel, "closingCumulative");
    assert.ok(nextYear.diagnostics.some((d) => d.code === "DOTATION_IGNORED"));
    assert.ok(nextYear.diagnostics.some((d) => d.code === "SOURCE_OPENING_CUMULATIVE_IGNORED"));
    assert.ok(!nextYear.diagnostics.some((d) => d.code === "CLOSING_CUMULATIVE_IGNORED"));

    // Dotation N : l'ancre 300 empêche de rejouer la dotation N-1 (100).
    // Plan linéaire 10 ans depuis 2020 → dotation annuelle pleine = 100.
    // Cumul clôture N = 300 + 100 = 400 (pas 200+100+100).
    const openingAsset: OpeningAsset = {
      id: "asset-oracle",
      propertyId: "prop-1",
      label: "Immobilisation oracle",
      categorie: "composant",
      origin: "historique",
      coutBrut: available(1_000),
      cumulOuverture: available(300),
      plan: available({
        kind: "amortizable",
        startDate: "2020-01-01",
        durationYears: 10,
        prorataConvention: "annuel_plein",
      }),
    };
    const opening: FiscalYearOpening = {
      openingId: "opening-period",
      revision: 1,
      targetFiscalYear: TARGET_FY,
      dossierId: "dossier-period",
      source: {
        kind: "external_takeover",
        takeoverId: "takeover-period",
        sourceFiscalYear: SOURCE_FY,
      },
      stocks: {
        deficits: available([]),
        amortissementsReportes: available(0),
      },
      assets: available([openingAsset]),
      loans: unavailable("hors scope"),
      patrimoine: {
        ouvertureCompteExploitant: unavailable("hors scope"),
        ran: unavailable("hors scope"),
        tresorerieOuverture: unavailable("hors scope"),
      },
      properties: available([
        { propertyId: "prop-1", label: "Bien", dateMiseEnService: "2020-01-01" },
      ]),
      identity: unavailable("hors scope"),
      provenance: {
        source: { fieldPath: "source", sourceKind: "external", sourceRef: "takeover-period" },
        "stocks.deficits": { fieldPath: "stocks.deficits", sourceKind: "external" },
        "stocks.amortissementsReportes": {
          fieldPath: "stocks.amortissementsReportes",
          sourceKind: "external",
        },
      },
      validation: { status: "pending" },
    };
    opening.validation = {
      status: "validated",
      openingRevision: opening.revision,
      contentHash: computeOpeningContentHash(opening),
      validatedAt: "2024-01-01T00:00:00.000Z",
      validator: "period-alignment-test",
    };

    const resolved = propagateAnchoredDepreciation({
      opening,
      expectedDossierId: "dossier-period",
      expectedExerciceFiscal: TARGET_FY,
    });
    assert.equal(resolved.status, "ready", JSON.stringify(resolved));
    if (resolved.status !== "ready") return;
    assert.equal(resolved.dotationExercice, 100, "dotation N = annuité, pas double N-1");
    assert.equal(resolved.cumulAmortissable, 400, "clôture N = 300 + 100");
  });

  it("fail closed : Amort. fin vide → cumulOuverture missing (jamais début+dotation)", async () => {
    const row: DepreciationRegisterPdfRow = {
      rowType: "asset",
      pageNumber: 1,
      assetRef: "B1",
      label: "Sans amort fin",
      acquisitionDateRaw: "01/01/2018",
      startDateRaw: "01/01/2018",
      grossCostRaw: "1 559,91",
      openingCumulativeRaw: undefined,
      dotationRaw: undefined,
      closingCumulativeRaw: undefined,
      vncRaw: "0,00",
      methodRaw: "N",
      durationRaw: "00 - 00",
      rawSnippet: "B1 1559.91 blank blank",
    };
    const result = await extractDepreciationRegisterFromPdf({
      file: stubPdfFile(),
      documentId: "doc-blank-fin",
      sourceFiscalYear: SOURCE_FY,
      targetFiscalYear: TARGET_FY,
      rasterizer: onePageRasterizer(),
      visionRequester: async () => ({ rows: [row] }),
    });
    assert.equal(result.candidates[0]!.cumulOuverture.status, "missing");
  });

  it("XLSX N←N-1 : les deux colonnes présentes → cumul fin (pas début)", async () => {
    const rows: (string | number)[][] = [
      [
        "Libellé",
        "Valeur brute",
        "Amortissements cumulés début",
        "Dotation",
        "Amortissements cumulés fin",
        "Durée",
        "Méthode",
        "Date mise en service",
      ],
      ["Bâtiment", 1_000, 200, 100, 300, 10, "Linéaire", "01/01/2020"],
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Registre");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const file = new File([buffer], "period-oracle.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const result = await extractDepreciationRegisterFromSpreadsheet({
      file,
      documentId: "doc-xlsx-period",
      sourceFiscalYear: SOURCE_FY,
      targetFiscalYear: TARGET_FY,
    });
    assert.equal(result.candidates.length, 1);
    assert.ok(isCandidatePresent(result.candidates[0]!.cumulOuverture));
    assert.equal(result.candidates[0]!.cumulOuverture.value, 300);
    assert.ok(result.diagnostics.some((d) => d.code === "SOURCE_OPENING_CUMULATIVE_IGNORED"));
    assert.ok(!result.diagnostics.some((d) => d.code === "CLOSING_CUMULATIVE_IGNORED"));
  });
});
