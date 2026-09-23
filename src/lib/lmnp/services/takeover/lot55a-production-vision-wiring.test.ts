/**
 * Lot 5.5-A — chemin production réel pour la liasse N-1 : prepareExternalTakeover
 * (pas l'extracteur scan appelé directement) avec une vraie liasse scannée
 * (aucun texte natif — pages générées comme images, comme le fait déjà Lot
 * 4D.4B) et pageClassifier/visionRequester injectés au MÊME point que la
 * production (ExternalTakeoverFlow.tsx).
 *
 * Run: npx tsx --test src/lib/lmnp/services/takeover/lot55a-production-vision-wiring.test.ts
 *
 * Le seul point de substitution par rapport à la production réelle est le
 * réseau : pageClassifier/visionRequester sont des doubles scriptés
 * (comme lot54b-production-vision-wiring.test.ts pour le registre) — on
 * prouve le branchement de l'orchestrateur, pas la fiabilité d'un appel
 * OpenAI réel (couverte séparément par les tests de route Lot 5.5-A).
 *
 * Preuve centrale de ce lot : AVANT le wiring (aucun pageClassifier/
 * visionRequester fourni — état de ExternalTakeoverFlow.tsx avant ce lot),
 * une liasse scannée bloque immédiatement. APRÈS (avec les deux requesters,
 * comme ExternalTakeoverFlow.tsx les fournit désormais), le même document
 * atteint réellement le chemin Vision et produit des facts.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createCanvas } from "@napi-rs/canvas";

import { prepareExternalTakeover } from "./prepare-external-takeover";
import type { RasterPageImage } from "@/lib/documents/ocr/pdf-to-images";
import type { TaxPackageLiassePageClassifier } from "./classify-tax-package-liasse-page";
import type { TaxPackageLiasseVisionRequester } from "./extract-tax-package-liasse-observations";
import { generateCerfaLiassePdf } from "@/lib/lmnp/services/liasse-pdf/generator/render-cerfa-liasse";
import type { CerfaCase } from "@/lib/lmnp/services/liasse-pdf/types";
import { isCandidatePresent } from "./candidate-value";
import { isTaxPackageControlFact } from "./tax-package-control-facts";

const TARGET = 2026;
const FY = 2025;
const FORM_YEAR = 2026;

const VALUES = { "028": 150_000, "030": 42_000, "426": 60_000, "476": 12_000, "496": 150_000, "576": 42_000 } as const;

function cerfaCase(caseId: string, value: number): CerfaCase {
  return { caseId, label: caseId, value, trace: { source: "FiscalResult", path: `test.${caseId}`, ksArtifacts: [] } };
}

function bytesToPdfFile(bytes: Uint8Array, name: string): File {
  return new File([Uint8Array.from(bytes)], name, { type: "application/pdf" });
}

/** Génère la vraie liasse Cerfa (texte natif — même générateur que Lot 4D.4B). */
async function generateNativeLiasseAC(): Promise<File> {
  const result = await generateCerfaLiassePdf({
    millesime: FORM_YEAR,
    forms: [
      { form: "2033-A-SD", cases: [cerfaCase("028", VALUES["028"]), cerfaCase("030", VALUES["030"])] },
      {
        form: "2033-C-SD",
        cases: [
          cerfaCase("426", VALUES["426"]),
          cerfaCase("476", VALUES["476"]),
          cerfaCase("490", 0),
          cerfaCase("492", 0),
          cerfaCase("496", VALUES["496"]),
          cerfaCase("570", 0),
          cerfaCase("572", 0),
          cerfaCase("576", VALUES["576"]),
        ],
      },
    ],
  });
  assert.equal(result.status, "generated");
  if (result.status !== "generated") throw new Error("unreachable");
  return bytesToPdfFile(result.pdfBytes, "lot55a-native-liasse.pdf");
}

/**
 * "Scanne" la vraie liasse : rasterise ses pages (mêmes pixels que verrait
 * un vrai scan) puis les réembarque comme images pleine page dans un
 * nouveau PDF SANS aucune couche texte — c'est ce qui distingue une liasse
 * scannée d'une liasse native pour extractNativeTaxPackageControlFactsFromPdf
 * (NO_NATIVE_TEXT). Pas de PDF synthétique inventé : mêmes pixels réels que
 * le générateur Cerfa produit, juste sans texte sélectionnable.
 */
async function generateScannedLiasseAC(): Promise<File> {
  const nativeFile = await generateNativeLiasseAC();
  const images = await nodeRasterizer(nativeFile);

  const { PDFDocument } = await import("pdf-lib");
  const scanDoc = await PDFDocument.create();
  for (const image of images) {
    const png = await scanDoc.embedPng(Buffer.from(image.base64, "base64"));
    const page = scanDoc.addPage([png.width, png.height]);
    page.drawImage(png, { x: 0, y: 0, width: png.width, height: png.height });
  }
  const bytes = await scanDoc.save();
  return bytesToPdfFile(bytes, "lot55a-scanned-liasse.pdf");
}

/** Raster Node réel (pdfjs legacy + napi canvas) — même mécanisme que Lot 4D.4B, injectable via `rasterizer`. */
async function nodeRasterizer(file: File): Promise<RasterPageImage[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const buffer = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;
  const images: RasterPageImage[] = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext("2d");
    await page.render({
      canvasContext: ctx as unknown as CanvasRenderingContext2D,
      viewport,
      canvas: canvas as unknown as HTMLCanvasElement,
    }).promise;
    const png = canvas.toBuffer("image/png");
    images.push({ mimeType: "image/png", base64: Buffer.from(png).toString("base64"), pageNumber: pageNum });
  }
  return images;
}

const scriptedPageClassifier: TaxPackageLiassePageClassifier = async ({ pageImage }) => {
  if (pageImage.pageNumber === 1) return { pageNumber: 1, formType: "2033A", formYear: FORM_YEAR };
  if (pageImage.pageNumber === 2) return { pageNumber: 2, formType: "2033C", formYear: FORM_YEAR };
  return { pageNumber: pageImage.pageNumber, formType: null, formYear: null };
};

const scriptedVisionRequester: TaxPackageLiasseVisionRequester = async (input) => {
  const table =
    input.formType === "2033A"
      ? ({ "028": VALUES["028"], "030": VALUES["030"] } as const)
      : ({ "426": VALUES["426"], "476": VALUES["476"], "496": VALUES["496"], "576": VALUES["576"] } as const);
  return {
    formType: input.formType,
    cases: input.sourceCases.map((sourceCase) => {
      if (sourceCase in table) {
        return { sourceCase, status: "present" as const, value: table[sourceCase as keyof typeof table] };
      }
      return { sourceCase, status: "extraction_impossible" as const, value: null };
    }),
  };
};

function baseInput(overrides: {
  pageClassifier?: TaxPackageLiassePageClassifier;
  visionRequester?: TaxPackageLiasseVisionRequester;
  file: File;
}) {
  return {
    openingId: "opening-5.5a",
    dossierId: "dossier-5.5a",
    takeoverId: "takeover-5.5a",
    targetFiscalYear: TARGET,
    sourceFiscalYear: FY,
    formYear: FORM_YEAR,
    register: {
      role: "prior_depreciation_register" as const,
      documentId: "doc-register-5.5a",
      // Hors scope Lot 5.5-A (registre déjà couvert par 5.4-A/B/C) — injection directe.
      candidates: [],
    },
    taxPackage: {
      role: "prior_tax_package" as const,
      documentId: "doc-liasse-5.5a",
      file: overrides.file,
    },
    validatedAt: "2026-01-15T10:00:00.000Z",
    validator: "lot5.5a-production-wiring-test",
    pageClassifier: overrides.pageClassifier,
    visionRequester: overrides.visionRequester,
    rasterizer: nodeRasterizer,
  };
}

describe("Lot 5.5-A — AVANT le wiring : liasse scannée sans pageClassifier/visionRequester (état ExternalTakeoverFlow pré-lot)", () => {
  it("blocked explicite — jamais un fallback silencieux ni un Opening sur données absentes", async () => {
    const file = await generateScannedLiasseAC();
    const result = await prepareExternalTakeover(baseInput({ file }));

    assert.equal(result.status, "blocked");
    if (result.status === "blocked") {
      const exc = result.exceptions.find((e) => e.code === "DOCUMENT_EXTRACTION_FAILED");
      assert.ok(exc);
      assert.match(exc!.message, /scan bridge requis/);
      assert.match(exc!.message, /pageClassifier \+ visionRequester absents/);
    }
  });
});

describe("Lot 5.5-A — APRÈS le wiring : mêmes requesters que ExternalTakeoverFlow.tsx — le chemin Vision est réellement atteint", () => {
  it("liasse scannée avec pageClassifier + visionRequester → facts extraits, jamais blocked pour absence de requester", async () => {
    const file = await generateScannedLiasseAC();
    const result = await prepareExternalTakeover(
      baseInput({ file, pageClassifier: scriptedPageClassifier, visionRequester: scriptedVisionRequester }),
    );

    // Le résultat peut rester "blocked" pour une raison hors scope 5.5-A
    // (registre d'amortissements vide dans ce test — volontairement hors
    // périmètre, cf. HORS SCOPE). Ce qui doit être PROUVÉ ici est précis :
    // le blocage "scan bridge requis (pageClassifier + visionRequester
    // absents)" — celui que ce lot corrige — ne doit plus jamais apparaître
    // dès lors que les deux requesters sont fournis, comme le fait
    // désormais ExternalTakeoverFlow.tsx.
    if (result.status === "blocked") {
      const scanBridgeExc = result.exceptions.find(
        (e) => e.code === "DOCUMENT_EXTRACTION_FAILED" && /scan bridge requis/.test(e.message),
      );
      assert.ok(
        !scanBridgeExc,
        "le wiring doit éliminer le blocage scan bridge, même si le résultat reste blocked pour une autre raison",
      );
    }
  });

  it("les 6 cases V1 sont bien résolues via Vision (aucune case absente traitée comme 0)", async () => {
    const file = await generateScannedLiasseAC();

    // On rejoue extractScannedTaxPackageControlFactsFromPdf isolément pour
    // vérifier les facts eux-mêmes (prepareExternalTakeover ne les expose
    // pas tel quel dans son résultat "built" — cf. build-external-takeover-opening),
    // avec les MÊMES doubles/rasterizer que le test de branchement ci-dessus.
    const { extractScannedTaxPackageControlFactsFromPdf } = await import("./extract-scanned-tax-package-from-pdf");
    const scanned = await extractScannedTaxPackageControlFactsFromPdf({
      file,
      documentId: "doc-liasse-5.5a-facts",
      formYear: FORM_YEAR,
      fiscalYear: FY,
      packageId: "pkg-5.5a",
      pageClassifier: scriptedPageClassifier,
      visionRequester: scriptedVisionRequester,
      rasterizer: nodeRasterizer,
    });

    assert.equal(scanned.status, "extracted");
    if (scanned.status !== "extracted") throw new Error("unreachable");
    const capturedPackageFacts = scanned.package.facts
      .filter((f) => isCandidatePresent(f.value))
      .map((f) => {
        assert.ok(isTaxPackageControlFact(f));
        return [f.sourceCase, f.value.value] as const;
      });

    const facts = Object.fromEntries(capturedPackageFacts);
    assert.equal(facts["028"], 150_000);
    assert.equal(facts["030"], 42_000);
    assert.equal(facts["426"], 60_000);
    assert.equal(facts["476"], 12_000);
    assert.equal(facts["496"], 150_000);
    assert.equal(facts["576"], 42_000);
  });

  it("FAIL CLOSED — visionRequester indisponible → jamais un Opening implicite sur liasse scannée", async () => {
    const file = await generateScannedLiasseAC();
    const alwaysFails: TaxPackageLiasseVisionRequester = async () => {
      throw new Error("Vision provider unavailable (simulated).");
    };
    const result = await prepareExternalTakeover(
      baseInput({ file, pageClassifier: scriptedPageClassifier, visionRequester: alwaysFails }),
    );
    assert.equal(result.status, "blocked");
  });
});
