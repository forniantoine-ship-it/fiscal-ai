/**
 * Lot 4D.4A — File PDF natif → pages → 4D.3 → 4D.2 → TaxPackageControlFacts.
 * Run: npx tsx --test src/lib/lmnp/services/takeover/lot4d4a-native-tax-package-from-pdf.test.ts
 *
 * Aucun réseau. Aucune Vision. Bytes PDF réels via pdfjs.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  extractNativePdfPages,
  extractNativePdfText,
  PAGE_SEPARATOR,
} from "@/lib/documents/ocr/pdf-native-text";
import { isCandidatePresent } from "./candidate-value";
import { extractNativeTaxPackageControlFactsFromPdf } from "./extract-native-tax-package-from-pdf";
import {
  identifyTaxPackageLiasseForm,
  isTaxPackageLiasseFormYearCompatible,
} from "./extract-tax-package-liasse-observations";
import { generateCerfaLiassePdf } from "@/lib/lmnp/services/liasse-pdf/generator/render-cerfa-liasse";
import type { CerfaCase } from "@/lib/lmnp/services/liasse-pdf/types";
import { isTaxPackageControlFact } from "./tax-package-control-facts";

const FORM_YEAR = 2026;
const FY = 2025;
const DOC = "doc-4d4a-native";

const OFFICIAL_2033_PDF = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../liasse-pdf/assets/2026/2033-sd.pdf",
);

function bytesToPdfFile(bytes: Uint8Array, name: string): File {
  // Copy into a fresh ArrayBuffer — File/Blob reject SharedArrayBuffer views.
  const copy = Uint8Array.from(bytes);
  return new File([copy], name, { type: "application/pdf" });
}

function loadOfficialPdfFile(): File {
  const bytes = readFileSync(OFFICIAL_2033_PDF);
  return bytesToPdfFile(bytes, "2033-sd.pdf");
}

function cerfaCase(caseId: string, value: number): CerfaCase {
  return {
    caseId,
    label: caseId,
    value,
    trace: { source: "FiscalResult", path: `test.${caseId}`, ksArtifacts: [] },
  };
}

async function generateFilled2033A(values: {
  "028": number;
  "030": number;
}): Promise<File> {
  const result = await generateCerfaLiassePdf({
    millesime: FORM_YEAR,
    forms: [
      {
        form: "2033-A-SD",
        cases: [cerfaCase("028", values["028"]), cerfaCase("030", values["030"])],
      },
    ],
  });
  assert.equal(result.status, "generated", JSON.stringify(result));
  if (result.status !== "generated") throw new Error("unreachable");
  return bytesToPdfFile(result.pdfBytes, "filled-2033a.pdf");
}

async function generateFilled2033C(values: {
  "426": number;
  "476": number;
  "496": number;
  "576": number;
}): Promise<File> {
  const result = await generateCerfaLiassePdf({
    millesime: FORM_YEAR,
    forms: [
      {
        form: "2033-C-SD",
        cases: [
          cerfaCase("426", values["426"]),
          cerfaCase("476", values["476"]),
          cerfaCase("490", 0),
          cerfaCase("492", 0),
          cerfaCase("496", values["496"]),
          cerfaCase("570", 0),
          cerfaCase("572", 0),
          cerfaCase("576", values["576"]),
        ],
      },
    ],
  });
  assert.equal(result.status, "generated", JSON.stringify(result));
  if (result.status !== "generated") throw new Error("unreachable");
  return bytesToPdfFile(result.pdfBytes, "filled-2033c.pdf");
}

describe("Lot 4D.4A — page-aware native reader (official blank PDF)", () => {
  it("lit le PDF officiel page par page avec pageNumber 1-indexed", async () => {
    const file = loadOfficialPdfFile();
    const { pages, pageCount } = await extractNativePdfPages(file);
    assert.equal(pageCount, 7);
    assert.equal(pages.length, 7);
    assert.deepEqual(
      pages.map((p) => p.pageNumber),
      [1, 2, 3, 4, 5, 6, 7],
    );

    const pageA = pages.find((p) => identifyTaxPackageLiasseForm(p.text) === "2033A");
    const pageC = pages.find((p) => identifyTaxPackageLiasseForm(p.text) === "2033C");
    assert.ok(pageA, "2033-A page");
    assert.ok(pageC, "2033-C page");
    assert.equal(pageA.pageNumber, 1);
    assert.equal(pageC.pageNumber, 3);
    assert.equal(isTaxPackageLiasseFormYearCompatible(pageA.text, "2033A", 2026), true);
    assert.equal(isTaxPackageLiasseFormYearCompatible(pageC.text, "2033C", 2026), true);
  });

  it("extractNativePdfText conserve PAGE_SEPARATOR et pageCount", async () => {
    const file = loadOfficialPdfFile();
    const joined = await extractNativePdfText(file);
    const paged = await extractNativePdfPages(file);
    assert.equal(joined.pageCount, paged.pageCount);
    assert.ok(joined.text.includes("2033-A-SD"));
    assert.ok(joined.text.includes("2033-C-SD"));
    // Contrat historique : pages non vides jointes
    const nonEmpty = paged.pages.filter((p) => p.text.trim()).map((p) => p.text);
    assert.equal(joined.text, nonEmpty.join(PAGE_SEPARATOR).trim());
  });
});

describe("Lot 4D.4A — E2E filled PDF bytes → 4D.3 → 4D.2", () => {
  it("2033-A rempli : 028/030 via bytes PDF réels", async () => {
    const file = await generateFilled2033A({ "028": 150_000, "030": 42_000 });
    const result = await extractNativeTaxPackageControlFactsFromPdf({
      file,
      documentId: DOC,
      formYear: FORM_YEAR,
      fiscalYear: FY,
      packageId: "pkg-4d4a-a",
    });
    assert.equal(result.status, "extracted");
    if (result.status !== "extracted") throw new Error("unreachable");
    assert.equal(result.visionCalled, false);

    const facts = Object.fromEntries(
      result.package.facts
        .filter((f) => isCandidatePresent(f.value))
        .map((f) => {
          assert.ok(isTaxPackageControlFact(f));
          return [f.sourceCase, f.value.value] as const;
        }),
    );
    assert.equal(facts["028"], 150_000);
    assert.equal(facts["030"], 42_000);

    for (const sourceCase of ["028", "030"] as const) {
      const obs = result.observations.find((o) => o.sourceCase === sourceCase)!;
      assert.ok(isCandidatePresent(obs.value));
      assert.equal(obs.formType, "2033A");
      assert.equal(obs.formYear, FORM_YEAR);
      assert.equal(obs.fiscalYear, FY);
      assert.equal(obs.value.provenance.documentId, DOC);
      assert.equal(obs.value.provenance.extractionMethod, "native_pdf_text_liasse_v1");
      assert.equal(obs.value.provenance.evidence?.page, 1);
    }
  });

  it("2033-C rempli : 426/476/496/576 via bytes PDF réels", async () => {
    const file = await generateFilled2033C({
      "426": 60_000,
      "476": 12_000,
      "496": 150_000,
      "576": 42_000,
    });
    const result = await extractNativeTaxPackageControlFactsFromPdf({
      file,
      documentId: `${DOC}-c`,
      formYear: FORM_YEAR,
      fiscalYear: FY,
      packageId: "pkg-4d4a-c",
    });
    assert.equal(result.status, "extracted");
    if (result.status !== "extracted") throw new Error("unreachable");
    assert.equal(result.visionCalled, false);

    const facts = Object.fromEntries(
      result.package.facts
        .filter((f) => isCandidatePresent(f.value))
        .map((f) => [f.sourceCase, (f.value as { value: number }).value] as const),
    );
    assert.equal(facts["426"], 60_000);
    assert.equal(facts["476"], 12_000);
    assert.equal(facts["496"], 150_000);
    assert.equal(facts["576"], 42_000);

    for (const sourceCase of ["426", "476", "496", "576"] as const) {
      const obs = result.observations.find((o) => o.sourceCase === sourceCase)!;
      assert.ok(isCandidatePresent(obs.value));
      assert.equal(obs.formType, "2033C");
      assert.equal(obs.formYear, FORM_YEAR);
      assert.equal(obs.fiscalYear, FY);
      assert.equal(obs.value.provenance.documentId, `${DOC}-c`);
      assert.equal(obs.value.provenance.extractionMethod, "native_pdf_text_liasse_v1");
      assert.ok(obs.value.provenance.evidence?.page);
    }
  });

  it("present(0) survit au raccord PDF natif", async () => {
    const file = await generateFilled2033A({ "028": 0, "030": 0 });
    const result = await extractNativeTaxPackageControlFactsFromPdf({
      file,
      documentId: DOC,
      formYear: FORM_YEAR,
      fiscalYear: FY,
      packageId: "pkg-4d4a-zero",
    });
    assert.equal(result.status, "extracted");
    if (result.status !== "extracted") throw new Error("unreachable");
    const o28 = result.observations.find((o) => o.sourceCase === "028")!;
    assert.ok(isCandidatePresent(o28.value));
    assert.equal(o28.value.value, 0);
  });
});

describe("Lot 4D.4A — failure contract / safety", () => {
  it("non-PDF → rejected NOT_PDF", async () => {
    const file = new File([new TextEncoder().encode("hello")], "note.txt", {
      type: "text/plain",
    });
    const result = await extractNativeTaxPackageControlFactsFromPdf({
      file,
      documentId: DOC,
      formYear: FORM_YEAR,
      fiscalYear: FY,
      packageId: "pkg-x",
    });
    assert.equal(result.status, "rejected");
    if (result.status !== "rejected") throw new Error("unreachable");
    assert.equal(result.reason, "NOT_PDF");
    assert.equal(result.observations.length, 0);
  });

  it("PDF officiel vierge → pas de present inventé sur cases vides", async () => {
    const result = await extractNativeTaxPackageControlFactsFromPdf({
      file: loadOfficialPdfFile(),
      documentId: DOC,
      formYear: FORM_YEAR,
      fiscalYear: FY,
      packageId: "pkg-blank",
    });
    assert.equal(result.status, "extracted");
    if (result.status !== "extracted") throw new Error("unreachable");
    const presents = result.observations.filter((o) => isCandidatePresent(o.value));
    assert.equal(presents.length, 0);
  });

  it("PDF sans 2033-A/C → aucune valeur fiscale inventée", async () => {
    // Mini PDF texte via pdf-lib sans formulaire Cerfa
    const { PDFDocument, StandardFonts } = await import("pdf-lib");
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 200]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    page.drawText("Facture cabinet — aucun formulaire 2033", { x: 20, y: 100, size: 12, font });
    const bytes = await doc.save();
    const file = bytesToPdfFile(bytes, "invoice.pdf");

    const result = await extractNativeTaxPackageControlFactsFromPdf({
      file,
      documentId: DOC,
      formYear: FORM_YEAR,
      fiscalYear: FY,
      packageId: "pkg-noform",
    });
    assert.equal(result.status, "extracted");
    if (result.status !== "extracted") throw new Error("unreachable");
    assert.equal(result.identifiedForms.length, 0);
    assert.equal(
      result.observations.every((o) => o.value.status === "document_absent"),
      true,
    );
    assert.equal(
      result.observations.some((o) => isCandidatePresent(o.value)),
      false,
    );
  });

  it("mauvais formYear → protections 4D.3.1 via le raccord", async () => {
    const file = await generateFilled2033A({ "028": 150_000, "030": 42_000 });
    const result = await extractNativeTaxPackageControlFactsFromPdf({
      file,
      documentId: DOC,
      formYear: 2025,
      fiscalYear: FY,
      packageId: "pkg-wrong-year",
    });
    assert.equal(result.status, "extracted");
    if (result.status !== "extracted") throw new Error("unreachable");
    for (const sourceCase of ["028", "030"]) {
      const obs = result.observations.find((o) => o.sourceCase === sourceCase)!;
      assert.equal(obs.value.status, "extraction_impossible");
      assert.equal(isCandidatePresent(obs.value), false);
    }
  });

  it("PDF corrompu → rejected PDF_READ_FAILED", async () => {
    const file = new File([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])], "corrupt.pdf", {
      type: "application/pdf",
    });
    const result = await extractNativeTaxPackageControlFactsFromPdf({
      file,
      documentId: DOC,
      formYear: FORM_YEAR,
      fiscalYear: FY,
      packageId: "pkg-corrupt",
    });
    assert.equal(result.status, "rejected");
    if (result.status !== "rejected") throw new Error("unreachable");
    assert.equal(result.reason, "PDF_READ_FAILED");
    assert.equal(result.observations.length, 0);
  });

  it("PDF valide sans texte natif → rejected NO_NATIVE_TEXT", async () => {
    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.create();
    const page = doc.addPage([200, 200]);
    // Page valide, aucun objet texte — uniquement un rectangle.
    page.drawRectangle({ x: 20, y: 20, width: 80, height: 40 });
    const bytes = await doc.save();
    const file = bytesToPdfFile(bytes, "blank-page.pdf");

    const result = await extractNativeTaxPackageControlFactsFromPdf({
      file,
      documentId: DOC,
      formYear: FORM_YEAR,
      fiscalYear: FY,
      packageId: "pkg-no-text",
    });
    assert.equal(result.status, "rejected");
    if (result.status !== "rejected") throw new Error("unreachable");
    assert.equal(result.reason, "NO_NATIVE_TEXT");
    assert.equal(result.observations.length, 0);
  });
});
