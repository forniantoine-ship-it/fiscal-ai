/**
 * Lot 4D.4B — raccord PDF scan → raster → classify → Vision → 4D.3 → 4D.2.
 *
 * Pas de double OCR générique. Pas de construction manuelle de TaxPackageControlFact.
 * Native PDF reste sur 4D.4A — ce bridge est le chemin scan/image uniquement.
 */

import {
  fileToRasterImages,
  OCR_RENDER_SCALE,
  type RasterPageImage,
} from "@/lib/documents/ocr/pdf-to-images";
import { isPdfFile } from "@/lib/documents/ocr/pdf-native-text";
import {
  extractTaxPackageControlFactsFromLiasse,
  type TaxPackageLiasseCaseObservation,
} from "./extract-tax-package-control-facts-from-liasse";
import {
  extractTaxPackageLiasseObservations,
  type TaxPackageLiasseFormType,
  type TaxPackageLiassePageImage,
  type TaxPackageLiassePageText,
  type TaxPackageLiasseVisionRequester,
} from "./extract-tax-package-liasse-observations";
import type {
  TaxPackageLiassePageClassification,
  TaxPackageLiassePageClassifier,
} from "./classify-tax-package-liasse-page";
import type { TaxPackageControlFacts } from "./tax-package-control-facts";

export type TaxPackageScanRasterizer = (
  file: File,
) => Promise<RasterPageImage[]>;

export type ExtractScannedTaxPackageControlFactsFromPdfInput = {
  file: File;
  documentId: string;
  formYear: number;
  fiscalYear: number;
  packageId: string;
  /** Obligatoire pour le chemin scan (fake en tests CI, réel serveur en prod). */
  pageClassifier: TaxPackageLiassePageClassifier;
  /** Obligatoire — satisfait le contrat 4D.3. */
  visionRequester: TaxPackageLiasseVisionRequester;
  /** Défaut : fileToRasterImages (browser). Injectable pour Node/tests. */
  rasterizer?: TaxPackageScanRasterizer;
};

export type ExtractScannedTaxPackageControlFactsFromPdfResult =
  | {
      status: "extracted";
      images: TaxPackageLiassePageImage[];
      classifications: TaxPackageLiassePageClassification[];
      pages: TaxPackageLiassePageText[];
      observations: TaxPackageLiasseCaseObservation[];
      package: TaxPackageControlFacts;
      identifiedForms: TaxPackageLiasseFormType[];
      visionCalled: boolean;
      diagnostics: string[];
    }
  | {
      status: "rejected";
      reason: string;
      images: TaxPackageLiassePageImage[];
      classifications: TaxPackageLiassePageClassification[];
      pages: TaxPackageLiassePageText[];
      observations: TaxPackageLiasseCaseObservation[];
      package?: TaxPackageControlFacts;
      diagnostics: string[];
      visionCalled: boolean;
    };

function formMarkerText(
  formType: TaxPackageLiasseFormType,
  formYear: number | null,
): string {
  const letter = formType === "2033A" ? "A" : "C";
  // Sans millésime → marqueur fort mais année absente → 4D.3 fail-closed millésime.
  if (formYear === null) {
    return `Cerfa N° 2033-${letter}-SD`;
  }
  return `Cerfa N° 2033-${letter}-SD ${formYear}`;
}

function toPageImages(images: RasterPageImage[]): TaxPackageLiassePageImage[] {
  return images.map((img) => ({
    pageNumber: img.pageNumber,
    mimeType: img.mimeType,
    base64: img.base64,
  }));
}

/**
 * Chaîne scan-only :
 * File PDF → raster → classify pages → pages synthétiques (marqueurs) →
 * 4D.3 (visionOnMissing + pageImages + visionRequester) → 4D.2.
 *
 * Le classifier / Vision reçoivent des images, jamais le texte source Cerfa.
 */
export async function extractScannedTaxPackageControlFactsFromPdf(
  input: ExtractScannedTaxPackageControlFactsFromPdfInput,
): Promise<ExtractScannedTaxPackageControlFactsFromPdfResult> {
  if (!isPdfFile(input.file)) {
    return {
      status: "rejected",
      reason: "NOT_PDF",
      images: [],
      classifications: [],
      pages: [],
      observations: [],
      diagnostics: ["fichier non PDF"],
      visionCalled: false,
    };
  }

  const rasterizer =
    input.rasterizer ??
    ((file: File) =>
      fileToRasterImages(file, { scale: OCR_RENDER_SCALE }));

  let images: TaxPackageLiassePageImage[];
  try {
    const rasters = await rasterizer(input.file);
    images = toPageImages(rasters);
  } catch (error) {
    const message = error instanceof Error ? error.message : "raster_failed";
    return {
      status: "rejected",
      reason: "RASTER_FAILED",
      images: [],
      classifications: [],
      pages: [],
      observations: [],
      diagnostics: [`rasterisation échouée: ${message}`],
      visionCalled: false,
    };
  }

  if (images.length === 0 || images.every((img) => !img.base64)) {
    return {
      status: "rejected",
      reason: "NO_RASTER_PAGES",
      images,
      classifications: [],
      pages: [],
      observations: [],
      diagnostics: ["aucune page raster exploitable"],
      visionCalled: false,
    };
  }

  const classifications: TaxPackageLiassePageClassification[] = [];
  const diagnostics: string[] = [];
  for (const pageImage of images) {
    try {
      const classification = await input.pageClassifier({ pageImage });
      classifications.push(classification);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "classifier_failed";
      classifications.push({
        pageNumber: pageImage.pageNumber,
        formType: null,
        formYear: null,
      });
      diagnostics.push(
        `page ${pageImage.pageNumber}: classifier error → unknown (${message})`,
      );
    }
  }

  const pages: TaxPackageLiassePageText[] = [];

  for (const classification of classifications) {
    if (!classification.formType) {
      diagnostics.push(
        `page ${classification.pageNumber}: classifier → unknown/neither`,
      );
      continue;
    }
    // Marqueur synthétique pour 4D.3 (identification + garde millésime).
    // Aucune valeur de case — Vision lit les pixels via pageImages.
    pages.push({
      pageNumber: classification.pageNumber,
      text: formMarkerText(classification.formType, classification.formYear),
    });
    if (classification.formYear === null) {
      diagnostics.push(
        `page ${classification.pageNumber}: formYear illisible — millésime fail-closed`,
      );
    } else if (classification.formYear !== input.formYear) {
      diagnostics.push(
        `page ${classification.pageNumber}: millésime ${classification.formYear} ≠ formYear ${input.formYear}`,
      );
    }
  }

  let extracted;
  try {
    extracted = await extractTaxPackageLiasseObservations({
      documentId: input.documentId,
      formYear: input.formYear,
      fiscalYear: input.fiscalYear,
      pages,
      pageImages: images,
      visionRequester: input.visionRequester,
      visionOnMissing: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "vision_failed";
    return {
      status: "rejected",
      reason: "VISION_FAILED",
      images,
      classifications,
      pages,
      observations: [],
      diagnostics: [
        ...diagnostics,
        `Vision / 4D.3 échoué: ${message}`,
      ],
      visionCalled: true,
    };
  }

  const adapted = extractTaxPackageControlFactsFromLiasse({
    packageId: input.packageId,
    observations: extracted.observations,
  });

  return {
    status: "extracted",
    images,
    classifications,
    pages,
    observations: extracted.observations,
    package: adapted.package,
    identifiedForms: extracted.identifiedForms,
    visionCalled: extracted.visionCalled,
    diagnostics: [
      ...diagnostics,
      ...extracted.diagnostics,
      ...adapted.skipped.map(
        (s) => `4D.2 skipped ${s.formType}/${s.sourceCase}: ${s.reason}`,
      ),
      ...adapted.issues.map((i) => `4D.2 issue ${i.code}: ${i.message}`),
    ],
  };
}
