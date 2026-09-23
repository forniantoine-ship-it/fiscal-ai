/**
 * Lot 5.4-C — interdire la troncature silencieuse des PDF (registre
 * d'amortissements). Un PDF dont le nombre réel de pages dépasse le nombre
 * de pages effectivement rasterisées/soumises à Vision (ex. limite de
 * rasterisation) ne doit jamais être traité comme complet, ni au niveau de
 * l'extracteur (extractDepreciationRegisterFromPdf) ni au niveau de
 * l'orchestrateur (prepareExternalTakeover).
 *
 * Run: npx tsx --test src/lib/lmnp/services/takeover/lot54c-pdf-truncation-safety.test.ts
 *
 * Aucun réseau, aucune Vision réelle — rasterizer et visionRequester
 * scriptés. Les PDF sont de vrais fichiers (pdf-lib) avec le nombre de
 * pages réel annoncé par chaque test — c'est extractNativePdfPages (pdfjs,
 * non plafonné pour totalPageCount) qui établit le nombre réel de pages,
 * indépendamment du rasterizer injecté.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  extractDepreciationRegisterFromPdf,
} from "./extract-depreciation-register-pdf";
import { prepareExternalTakeover } from "./prepare-external-takeover";
import type {
  DepreciationRegisterPdfRow,
  DepreciationRegisterVisionRequester,
} from "./depreciation-register-pdf-row";
import type { RasterPageImage } from "@/lib/documents/ocr/pdf-to-images";
import { createConfidenceScore } from "@/lib/documents/types/confidence-score";
import { presentCandidate, type CandidateProvenance } from "./candidate-value";
import {
  createTaxPackageControlFact,
  createTaxPackageControlFacts,
  type TaxPackageControlFactDraft,
} from "./tax-package-control-facts";

async function makePdfFile(pageCount: number, name: string): Promise<File> {
  const { PDFDocument, StandardFonts } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pageCount; i += 1) {
    const page = doc.addPage([200, 200]);
    page.drawText(`page ${i}`, { x: 20, y: 100, size: 12, font });
  }
  const bytes = await doc.save();
  return new File([Uint8Array.from(bytes)], name, { type: "application/pdf" });
}

function stubRasterizer(imageCount: number): (file: File) => Promise<RasterPageImage[]> {
  return async () =>
    Array.from({ length: imageCount }, (_, i) => ({
      pageNumber: i + 1,
      mimeType: "image/png" as const,
      base64: "AAAA",
    }));
}

function assetRow(pageNumber: number): DepreciationRegisterPdfRow {
  const assetRef = `A${pageNumber}`;
  return {
    rowType: "asset",
    pageNumber,
    assetRef,
    label: `Actif page ${pageNumber}`,
    startDateRaw: "01/01/2020",
    grossCostRaw: "1 000,00",
    openingCumulativeRaw: "500,00",
    methodRaw: "L",
    durationRaw: "05 - 00",
    rawSnippet: `${assetRef} page ${pageNumber}`,
  };
}

/** Une ligne asset par page rasterisée — jamais 0 candidate pour rester hors des retours anticipés "unsupported". */
function visionRequesterOnePerPage(): DepreciationRegisterVisionRequester {
  return async ({ pageNumber }) => ({ rows: [assetRow(pageNumber)] });
}

function taxProv(sourceRef: string): CandidateProvenance {
  return {
    documentId: "doc-liasse-minimal",
    documentRole: "prior_tax_package",
    fieldLabel: sourceRef,
    sourceRef,
    extractionMethod: "fixture_structured",
    confidence: createConfidenceScore(0.9, ["fixture"]),
    evidence: { snippet: sourceRef, page: 1 },
    fieldSource: "extracted",
  };
}

function minimalTaxPackage() {
  const drafts: TaxPackageControlFactDraft[] = (
    [
      ["2033A", "028", "total_gross", 100_000],
      ["2033C", "496", "total_gross", 100_000],
      ["2033A", "030", "total_cumulative_depreciation", 30_000],
      ["2033C", "576", "total_cumulative_depreciation", 30_000],
    ] as const
  ).map(([formType, sourceCase, kind, amount]) => ({
    formType,
    sourceCase,
    kind,
    formYear: 2024,
    fiscalYear: 2023,
    periodPosition: "closing" as const,
    value: presentCandidate(amount, "direct", taxProv(`${formType}:${sourceCase}`)),
  }));
  const facts = drafts.map((d) => {
    const created = createTaxPackageControlFact(d);
    assert.equal(created.status, "created");
    if (created.status !== "created") throw new Error("unreachable");
    return created.fact;
  });
  const pkg = createTaxPackageControlFacts("pkg-5.4c-minimal", facts);
  assert.equal(pkg.status, "created");
  if (pkg.status !== "created") throw new Error("unreachable");
  return pkg.package;
}

describe("Lot 5.4-C — PDF 1 page — complet, pas de troncature", () => {
  it("totalPageCount = processedPageCount = 1, aucun diagnostic PDF_TRUNCATED", async () => {
    const file = await makePdfFile(1, "un-page.pdf");
    const result = await extractDepreciationRegisterFromPdf({
      file,
      documentId: "doc-1page",
      targetFiscalYear: 2024,
      visionRequester: visionRequesterOnePerPage(),
      rasterizer: stubRasterizer(1),
    });
    assert.equal(result.totalPageCount, 1);
    assert.equal(result.processedPageCount, 1);
    assert.ok(!result.diagnostics.some((d) => d.code === "PDF_TRUNCATED"));
    assert.equal(result.candidates.length, 1);
  });
});

describe("Lot 5.4-C — PDF exactement 12 pages — complet, pas de troncature", () => {
  it("totalPageCount = processedPageCount = 12, aucun diagnostic PDF_TRUNCATED", async () => {
    const file = await makePdfFile(12, "douze-pages.pdf");
    const result = await extractDepreciationRegisterFromPdf({
      file,
      documentId: "doc-12page",
      targetFiscalYear: 2024,
      visionRequester: visionRequesterOnePerPage(),
      rasterizer: stubRasterizer(12),
    });
    assert.equal(result.totalPageCount, 12);
    assert.equal(result.processedPageCount, 12);
    assert.ok(!result.diagnostics.some((d) => d.code === "PDF_TRUNCATED"));
    assert.equal(result.candidates.length, 12);
  });
});

describe("Lot 5.4-C — PDF 13 pages avec limite de rasterisation 12 — troncature détectée explicitement", () => {
  it("totalPageCount = 13, processedPageCount = 12, diagnostic PDF_TRUNCATED présent, status review_required (jamais extracted)", async () => {
    const file = await makePdfFile(13, "treize-pages.pdf");
    const result = await extractDepreciationRegisterFromPdf({
      file,
      documentId: "doc-13page",
      targetFiscalYear: 2024,
      visionRequester: visionRequesterOnePerPage(),
      rasterizer: stubRasterizer(12), // reproduit la limite de rasterisation par défaut (MAX_PDF_PAGES = 12)
    });
    assert.equal(result.totalPageCount, 13);
    assert.equal(result.processedPageCount, 12);
    const truncated = result.diagnostics.find((d) => d.code === "PDF_TRUNCATED");
    assert.ok(truncated, "diagnostic PDF_TRUNCATED attendu");
    assert.match(truncated!.message, /13/);
    assert.match(truncated!.message, /12/);
    assert.notEqual(result.status, "extracted");
    assert.equal(result.status, "review_required");
    // Les 12 pages traitées restent visibles dans les candidates — jamais
    // effacées ni promues comme représentant la totalité du document.
    assert.equal(result.candidates.length, 12);
  });
});

describe("Lot 5.4-C — takeover : PDF 13 pages tronqué — jamais built sur les seules pages extraites", () => {
  it("prepareExternalTakeover renvoie blocked, jamais built ni manual_review_required avec un Opening implicite", async () => {
    const file = await makePdfFile(13, "treize-pages-takeover.pdf");
    const result = await prepareExternalTakeover({
      openingId: "opening-5.4c",
      dossierId: "dossier-5.4c",
      takeoverId: "takeover-5.4c",
      targetFiscalYear: 2024,
      sourceFiscalYear: 2023,
      formYear: 2024,
      register: {
        role: "prior_depreciation_register",
        documentId: "doc-13page-takeover",
        file,
      },
      taxPackage: {
        role: "prior_tax_package",
        documentId: "doc-liasse-minimal",
        package: minimalTaxPackage(),
      },
      validatedAt: "2026-01-15T10:00:00.000Z",
      validator: "lot5.4c-truncation-safety-test",
      registerVisionRequester: visionRequesterOnePerPage(),
      registerRasterizer: stubRasterizer(12),
    });

    assert.equal(result.status, "blocked");
    if (result.status === "blocked") {
      const exc = result.exceptions.find((e) => e.code === "DOCUMENT_EXTRACTION_FAILED");
      assert.ok(exc, "exception DOCUMENT_EXTRACTION_FAILED attendue");
      assert.match(exc!.message, /tronqu/i);
      assert.match(exc!.message, /12/);
      assert.match(exc!.message, /13/);
    }
    assert.notEqual(result.status, "built");
  });

  it("PDF exactement 12 pages (pas de troncature) — le blocage de ce lot ne s'applique pas", async () => {
    const file = await makePdfFile(12, "douze-pages-takeover.pdf");
    const result = await prepareExternalTakeover({
      openingId: "opening-5.4c-ok",
      dossierId: "dossier-5.4c-ok",
      takeoverId: "takeover-5.4c-ok",
      targetFiscalYear: 2024,
      sourceFiscalYear: 2023,
      formYear: 2024,
      register: {
        role: "prior_depreciation_register",
        documentId: "doc-12page-takeover",
        file,
      },
      taxPackage: {
        role: "prior_tax_package",
        documentId: "doc-liasse-minimal",
        package: minimalTaxPackage(),
      },
      validatedAt: "2026-01-15T10:00:00.000Z",
      validator: "lot5.4c-truncation-safety-test",
      registerVisionRequester: visionRequesterOnePerPage(),
      registerRasterizer: stubRasterizer(12),
    });

    // Le registre 12/12 pages ne doit pas être bloqué pour cause de
    // troncature (il peut échouer/être bloqué pour d'autres raisons hors
    // périmètre de ce lot, mais jamais avec le message de troncature).
    if (result.status === "blocked") {
      const truncationExc = result.exceptions.find(
        (e) => e.code === "DOCUMENT_EXTRACTION_FAILED" && /tronqu/i.test(e.message),
      );
      assert.ok(!truncationExc, "aucune exception de troncature attendue pour un PDF complet");
    }
  });
});
