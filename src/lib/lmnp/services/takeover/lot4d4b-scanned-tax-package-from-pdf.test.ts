/**
 * Lot 4D.4B — PDF scan → raster → classify → Vision → 4D.3 → 4D.2.
 * Run: npx tsx --test src/lib/lmnp/services/takeover/lot4d4b-scanned-tax-package-from-pdf.test.ts
 *
 * Aucun appel OpenAI en CI. Raster réel via pdfjs legacy + @napi-rs/canvas.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createCanvas } from "@napi-rs/canvas";

import type { RasterPageImage } from "@/lib/documents/ocr/pdf-to-images";
import { isCandidatePresent } from "./candidate-value";
import {
  parseTaxPackageLiassePageClassifierPayload,
  type TaxPackageLiassePageClassifier,
} from "./classify-tax-package-liasse-page";
import { extractScannedTaxPackageControlFactsFromPdf } from "./extract-scanned-tax-package-from-pdf";
import {
  extractTaxPackageLiasseObservations,
  parseTaxPackageLiasseVisionFormPayload,
  TaxPackageLiasseVisionFormZodSchema,
  type TaxPackageLiasseVisionRequester,
} from "./extract-tax-package-liasse-observations";
import { extractNativeTaxPackageControlFactsFromPdf } from "./extract-native-tax-package-from-pdf";
import { generateCerfaLiassePdf } from "@/lib/lmnp/services/liasse-pdf/generator/render-cerfa-liasse";
import type { CerfaCase } from "@/lib/lmnp/services/liasse-pdf/types";
import { isTaxPackageControlFact } from "./tax-package-control-facts";

const FORM_YEAR = 2026;
const FY = 2025;
const DOC = "doc-4d4b-scan";

const VALUES = {
  "028": 150_000,
  "030": 42_000,
  "426": 60_000,
  "476": 12_000,
  "496": 150_000,
  "576": 42_000,
} as const;

function bytesToPdfFile(bytes: Uint8Array, name: string): File {
  const copy = Uint8Array.from(bytes);
  return new File([copy], name, { type: "application/pdf" });
}

function cerfaCase(caseId: string, value: number): CerfaCase {
  return {
    caseId,
    label: caseId,
    value,
    trace: { source: "FiscalResult", path: `test.${caseId}`, ksArtifacts: [] },
  };
}

async function generateFilledLiasseAC(values = VALUES): Promise<File> {
  const result = await generateCerfaLiassePdf({
    millesime: FORM_YEAR,
    forms: [
      {
        form: "2033-A-SD",
        cases: [
          cerfaCase("028", values["028"]),
          cerfaCase("030", values["030"]),
        ],
      },
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
  return bytesToPdfFile(result.pdfBytes, "filled-ac-scan.pdf");
}

/** Raster Node : pixels PNG réels (pdfjs legacy + napi canvas). */
async function nodeRasterizer(file: File): Promise<RasterPageImage[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const buffer = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;
  const images: RasterPageImage[] = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = createCanvas(
      Math.ceil(viewport.width),
      Math.ceil(viewport.height),
    );
    const ctx = canvas.getContext("2d");
    await page.render({
      canvasContext: ctx as unknown as CanvasRenderingContext2D,
      viewport,
      canvas: canvas as unknown as HTMLCanvasElement,
    }).promise;
    const png = canvas.toBuffer("image/png");
    images.push({
      mimeType: "image/png",
      base64: Buffer.from(png).toString("base64"),
      pageNumber: pageNum,
    });
  }
  return images;
}

function assertRaster(pageImage: { base64?: string } | undefined): void {
  assert.ok(pageImage?.base64 && pageImage.base64.length > 50, "must receive raster bytes");
}

describe("Lot 4D.4B — schema / parse (no network)", () => {
  it("classifier Zod : unknown + invalid → fail-closed null", () => {
    assert.deepEqual(
      parseTaxPackageLiassePageClassifierPayload(
        { formType: "unknown", formYear: null },
        2,
      ),
      { pageNumber: 2, formType: null, formYear: null },
    );
    assert.deepEqual(
      parseTaxPackageLiassePageClassifierPayload({ bogus: true }, 3),
      { pageNumber: 3, formType: null, formYear: null },
    );
    assert.deepEqual(
      parseTaxPackageLiassePageClassifierPayload(
        { formType: "2033A", formYear: 2026 },
        1,
      ),
      { pageNumber: 1, formType: "2033A", formYear: 2026 },
    );
  });

  it("Vision form Zod : invalid JSON → extraction_impossible, jamais inventé", () => {
    const payload = parseTaxPackageLiasseVisionFormPayload(
      { not: "valid" },
      "2033A",
      ["028", "030"],
    );
    assert.equal(payload.formType, "unknown");
    assert.equal(payload.cases.length, 2);
    assert.ok(
      payload.cases.every((c) => c.status === "extraction_impossible" && c.value === null),
    );
    assert.equal(
      TaxPackageLiasseVisionFormZodSchema.safeParse({
        formType: "2033A",
        cases: [{ sourceCase: "028", status: "present", value: 0 }],
      }).success,
      true,
    );
  });
});

describe("Lot 4D.4B — E2E scan raster → 4D.3 → 4D.2", () => {
  it("PDF rempli → pixels → classify → Vision → facts exacts (6 cases)", async () => {
    const file = await generateFilledLiasseAC();
    const seenImagePages: number[] = [];

    const pageClassifier: TaxPackageLiassePageClassifier = async ({
      pageImage,
    }) => {
      assert.ok(pageImage.base64.length > 100, "classifier receives real raster");
      seenImagePages.push(pageImage.pageNumber);
      // Ordre générateur : 2033-A puis 2033-C (pages 1 et 2).
      if (pageImage.pageNumber === 1) {
        return { pageNumber: 1, formType: "2033A", formYear: FORM_YEAR };
      }
      if (pageImage.pageNumber === 2) {
        return { pageNumber: 2, formType: "2033C", formYear: FORM_YEAR };
      }
      return {
        pageNumber: pageImage.pageNumber,
        formType: null,
        formYear: null,
      };
    };

    const visionRequester: TaxPackageLiasseVisionRequester = async (input) => {
      assertRaster(input.pageImage);
      const table =
        input.formType === "2033A"
          ? ({ "028": VALUES["028"], "030": VALUES["030"] } as const)
          : ({
              "426": VALUES["426"],
              "476": VALUES["476"],
              "496": VALUES["496"],
              "576": VALUES["576"],
            } as const);
      return {
        formType: input.formType,
        cases: input.sourceCases.map((sourceCase) => {
          if (sourceCase in table) {
            return {
              sourceCase,
              status: "present" as const,
              value: table[sourceCase as keyof typeof table],
            };
          }
          return {
            sourceCase,
            status: "extraction_impossible" as const,
            value: null,
          };
        }),
      };
    };

    const result = await extractScannedTaxPackageControlFactsFromPdf({
      file,
      documentId: DOC,
      formYear: FORM_YEAR,
      fiscalYear: FY,
      packageId: "pkg-4d4b-e2e",
      pageClassifier,
      visionRequester,
      rasterizer: nodeRasterizer,
    });

    assert.equal(result.status, "extracted");
    if (result.status !== "extracted") throw new Error("unreachable");
    assert.equal(result.visionCalled, true);
    assert.ok(result.images.every((img) => img.base64.length > 100));
    assert.deepEqual(seenImagePages.sort(), [1, 2]);
    assert.deepEqual(result.identifiedForms.sort(), ["2033A", "2033C"]);

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
    assert.equal(facts["426"], 60_000);
    assert.equal(facts["476"], 12_000);
    assert.equal(facts["496"], 150_000);
    assert.equal(facts["576"], 42_000);

    for (const sourceCase of Object.keys(VALUES)) {
      const obs = result.observations.find((o) => o.sourceCase === sourceCase)!;
      assert.ok(isCandidatePresent(obs.value));
      assert.equal(obs.value.provenance.extractionMethod, "vision_structured_liasse_v1");
      assert.equal(obs.formYear, FORM_YEAR);
      assert.equal(obs.fiscalYear, FY);
      assert.ok(obs.value.provenance.evidence?.page);
    }
  });

  it("present(0) via Vision scan reste present(0)", async () => {
    const file = await generateFilledLiasseAC({
      ...VALUES,
      "028": 0,
      "030": 0,
    });
    const pageClassifier: TaxPackageLiassePageClassifier = async ({
      pageImage,
    }) => {
      assert.ok(pageImage.base64.length > 50);
      if (pageImage.pageNumber === 1) {
        return { pageNumber: 1, formType: "2033A", formYear: FORM_YEAR };
      }
      return { pageNumber: pageImage.pageNumber, formType: null, formYear: null };
    };
    const visionRequester: TaxPackageLiasseVisionRequester = async ({
      formType,
      sourceCases,
      pageImage,
    }) => {
      assert.ok(pageImage?.base64);
      return {
        formType,
        cases: sourceCases.map((sourceCase) => ({
          sourceCase,
          status: "present" as const,
          value: 0,
        })),
      };
    };

    const result = await extractScannedTaxPackageControlFactsFromPdf({
      file,
      documentId: DOC,
      formYear: FORM_YEAR,
      fiscalYear: FY,
      packageId: "pkg-zero",
      pageClassifier,
      visionRequester,
      rasterizer: nodeRasterizer,
    });
    assert.equal(result.status, "extracted");
    if (result.status !== "extracted") throw new Error("unreachable");
    const o28 = result.observations.find((o) => o.sourceCase === "028")!;
    assert.ok(isCandidatePresent(o28.value));
    assert.equal(o28.value.value, 0);
  });
});

describe("Lot 4D.4B — safety", () => {
  it("A — page neither → aucun fact inventé", async () => {
    const file = await generateFilledLiasseAC();
    let visionCalls = 0;
    const result = await extractScannedTaxPackageControlFactsFromPdf({
      file,
      documentId: DOC,
      formYear: FORM_YEAR,
      fiscalYear: FY,
      packageId: "pkg-neither",
      pageClassifier: async ({ pageImage }) => {
        assert.ok(pageImage.base64.length > 50);
        return {
          pageNumber: pageImage.pageNumber,
          formType: null,
          formYear: null,
        };
      },
      visionRequester: async () => {
        visionCalls += 1;
        return { formType: "unknown", cases: [] };
      },
      rasterizer: nodeRasterizer,
    });
    assert.equal(result.status, "extracted");
    if (result.status !== "extracted") throw new Error("unreachable");
    assert.equal(visionCalls, 0);
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

  it("B — classifier ambigu (unknown) → pas de present", async () => {
    const file = await generateFilledLiasseAC();
    const result = await extractScannedTaxPackageControlFactsFromPdf({
      file,
      documentId: DOC,
      formYear: FORM_YEAR,
      fiscalYear: FY,
      packageId: "pkg-ambig",
      pageClassifier: async ({ pageImage }) =>
        parseTaxPackageLiassePageClassifierPayload(
          { formType: "unknown", formYear: 2026 },
          pageImage.pageNumber,
        ),
      visionRequester: async () => ({
        formType: "2033A",
        cases: [
          { sourceCase: "028", status: "present", value: 999 },
          { sourceCase: "030", status: "present", value: 999 },
        ],
      }),
      rasterizer: nodeRasterizer,
    });
    assert.equal(result.status, "extracted");
    if (result.status !== "extracted") throw new Error("unreachable");
    assert.equal(
      result.observations.some((o) => isCandidatePresent(o.value)),
      false,
    );
  });

  it("C — mauvais millésime → aucun present", async () => {
    const file = await generateFilledLiasseAC();
    const result = await extractScannedTaxPackageControlFactsFromPdf({
      file,
      documentId: DOC,
      formYear: FORM_YEAR,
      fiscalYear: FY,
      packageId: "pkg-wrong-year",
      pageClassifier: async ({ pageImage }) => ({
        pageNumber: pageImage.pageNumber,
        formType: pageImage.pageNumber === 1 ? "2033A" : "2033C",
        formYear: 2025,
      }),
      visionRequester: async ({ formType, sourceCases }) => ({
        formType,
        cases: sourceCases.map((sourceCase) => ({
          sourceCase,
          status: "present" as const,
          value: 999_999,
        })),
      }),
      rasterizer: nodeRasterizer,
    });
    assert.equal(result.status, "extracted");
    if (result.status !== "extracted") throw new Error("unreachable");
    assert.equal(
      result.observations.some((o) => isCandidatePresent(o.value)),
      false,
    );
    assert.ok(
      result.observations.every(
        (o) =>
          o.value.status === "extraction_impossible" ||
          o.value.status === "document_absent",
      ),
    );
  });

  it("D — duplicate A → observations distinctes conservées", async () => {
    const file = await generateFilledLiasseAC();
    // Classifier force deux pages en 2033A (duplicate).
    const pageClassifier: TaxPackageLiassePageClassifier = async ({
      pageImage,
    }) => ({
      pageNumber: pageImage.pageNumber,
      formType: "2033A",
      formYear: FORM_YEAR,
    });
    const visionRequester: TaxPackageLiasseVisionRequester = async ({
      pageNumber,
      sourceCases,
      pageImage,
    }) => {
      assert.ok(pageImage?.base64);
      const base = pageNumber === 1 ? 100 : 200;
      return {
        formType: "2033A",
        cases: sourceCases.map((sourceCase) => ({
          sourceCase,
          status: "present" as const,
          value: sourceCase === "028" ? base : base + 1,
        })),
      };
    };

    const result = await extractScannedTaxPackageControlFactsFromPdf({
      file,
      documentId: DOC,
      formYear: FORM_YEAR,
      fiscalYear: FY,
      packageId: "pkg-dup",
      pageClassifier,
      visionRequester,
      rasterizer: nodeRasterizer,
    });
    assert.equal(result.status, "extracted");
    if (result.status !== "extracted") throw new Error("unreachable");
    const o28 = result.observations.filter((o) => o.sourceCase === "028");
    assert.ok(o28.length >= 2, "duplicates preserved as distinct observations");
    const values = new Set(
      o28.filter((o) => isCandidatePresent(o.value)).map((o) => o.value.value),
    );
    assert.ok(values.has(100) && values.has(200));
  });

  it("E — Vision refusal/error → rejected VISION_FAILED, aucun fact inventé", async () => {
    const file = await generateFilledLiasseAC();
    const result = await extractScannedTaxPackageControlFactsFromPdf({
      file,
      documentId: DOC,
      formYear: FORM_YEAR,
      fiscalYear: FY,
      packageId: "pkg-vision-fail",
      pageClassifier: async ({ pageImage }) => ({
        pageNumber: pageImage.pageNumber,
        formType: pageImage.pageNumber === 1 ? "2033A" : null,
        formYear: FORM_YEAR,
      }),
      visionRequester: async () => {
        throw new Error("openai refused");
      },
      rasterizer: nodeRasterizer,
    });
    assert.equal(result.status, "rejected");
    if (result.status !== "rejected") throw new Error("unreachable");
    assert.equal(result.reason, "VISION_FAILED");
    assert.equal(result.observations.length, 0);
  });
});

describe("Lot 4D.4B — Vision error fail-closed via 4D.3 path", () => {
  it("Vision requester reject → erreur propagée (pas de valeur inventée)", async () => {
    await assert.rejects(
      () =>
        extractTaxPackageLiasseObservations({
          documentId: DOC,
          formYear: FORM_YEAR,
          fiscalYear: FY,
          pages: [{ pageNumber: 1, text: `Cerfa N° 2033-A-SD ${FORM_YEAR}` }],
          pageImages: [
            { pageNumber: 1, mimeType: "image/png", base64: "aaaa" },
          ],
          visionOnMissing: true,
          visionRequester: async () => {
            throw new Error("vision_down");
          },
        }),
      /vision_down/,
    );
  });

  it("Vision invalid payload → extraction_impossible", async () => {
    const result = await extractTaxPackageLiasseObservations({
      documentId: DOC,
      formYear: FORM_YEAR,
      fiscalYear: FY,
      pages: [{ pageNumber: 1, text: `Cerfa N° 2033-A-SD ${FORM_YEAR}` }],
      pageImages: [{ pageNumber: 1, mimeType: "image/png", base64: "bbbb" }],
      visionOnMissing: true,
      visionRequester: async ({ formType, sourceCases }) =>
        parseTaxPackageLiasseVisionFormPayload(
          { garbage: true },
          formType,
          sourceCases,
        ),
    });
    assert.equal(result.visionCalled, true);
    for (const sourceCase of ["028", "030"]) {
      const o = result.observations.find((x) => x.sourceCase === sourceCase)!;
      assert.equal(o.value.status, "extraction_impossible");
      assert.equal(isCandidatePresent(o.value), false);
    }
  });
});

describe("Lot 4D.4B — native 4D.4A non-régression", () => {
  it("PDF natif rempli continue sans Vision", async () => {
    const resultPdf = await generateCerfaLiassePdf({
      millesime: FORM_YEAR,
      forms: [
        {
          form: "2033-A-SD",
          cases: [cerfaCase("028", 150_000), cerfaCase("030", 42_000)],
        },
      ],
    });
    assert.equal(resultPdf.status, "generated");
    if (resultPdf.status !== "generated") throw new Error("unreachable");
    const file = bytesToPdfFile(resultPdf.pdfBytes, "native-a.pdf");
    const result = await extractNativeTaxPackageControlFactsFromPdf({
      file,
      documentId: "doc-native-reg",
      formYear: FORM_YEAR,
      fiscalYear: FY,
      packageId: "pkg-native-reg",
    });
    assert.equal(result.status, "extracted");
    if (result.status !== "extracted") throw new Error("unreachable");
    assert.equal(result.visionCalled, false);
    const facts = Object.fromEntries(
      result.package.facts
        .filter((f) => isCandidatePresent(f.value))
        .map((f) => [f.sourceCase, (f.value as { value: number }).value]),
    );
    assert.equal(facts["028"], 150_000);
    assert.equal(facts["030"], 42_000);
  });
});
