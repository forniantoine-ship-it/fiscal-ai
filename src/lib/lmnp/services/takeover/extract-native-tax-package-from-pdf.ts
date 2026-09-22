/**
 * Lot 4D.4A — raccord File PDF natif → pages → 4D.3 → 4D.2 → TaxPackageControlFacts.
 *
 * Native text uniquement. Aucun Vision / OCR scan / 4D.4B.
 * Réutilise extractNativePdfPages (pdfjs) puis les contrats 4D.3 et 4D.2.
 */

import {
  extractNativePdfPages,
  isPdfFile,
} from "@/lib/documents/ocr/pdf-native-text";
import {
  extractTaxPackageControlFactsFromLiasse,
  type TaxPackageLiasseCaseObservation,
} from "./extract-tax-package-control-facts-from-liasse";
import {
  extractTaxPackageLiasseObservations,
  type ExtractTaxPackageLiasseObservationsResult,
  type TaxPackageLiassePageText,
} from "./extract-tax-package-liasse-observations";
import type { TaxPackageControlFacts } from "./tax-package-control-facts";

export type ExtractNativeTaxPackageControlFactsFromPdfInput = {
  file: File;
  documentId: string;
  formYear: number;
  fiscalYear: number;
  packageId: string;
};

export type ExtractNativeTaxPackageControlFactsFromPdfResult =
  | {
      status: "extracted";
      pages: TaxPackageLiassePageText[];
      observations: TaxPackageLiasseCaseObservation[];
      package: TaxPackageControlFacts;
      identifiedForms: ExtractTaxPackageLiasseObservationsResult["identifiedForms"];
      visionCalled: false;
      diagnostics: string[];
    }
  | {
      status: "rejected";
      reason: string;
      pages: TaxPackageLiassePageText[];
      observations: TaxPackageLiasseCaseObservation[];
      package?: TaxPackageControlFacts;
      diagnostics: string[];
      visionCalled: false;
    };

/**
 * Chaîne native-only :
 * File PDF → extractNativePdfPages → 4D.3 → 4D.2.
 * Ne fournit jamais de visionRequester.
 */
export async function extractNativeTaxPackageControlFactsFromPdf(
  input: ExtractNativeTaxPackageControlFactsFromPdfInput,
): Promise<ExtractNativeTaxPackageControlFactsFromPdfResult> {
  if (!isPdfFile(input.file)) {
    return {
      status: "rejected",
      reason: "NOT_PDF",
      pages: [],
      observations: [],
      diagnostics: ["fichier non PDF"],
      visionCalled: false,
    };
  }

  let pages: TaxPackageLiassePageText[];
  try {
    const native = await extractNativePdfPages(input.file);
    pages = native.pages.map((page) => ({
      pageNumber: page.pageNumber,
      text: page.text,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "pdf_read_failed";
    return {
      status: "rejected",
      reason: "PDF_READ_FAILED",
      pages: [],
      observations: [],
      diagnostics: [`lecture PDF native échouée: ${message}`],
      visionCalled: false,
    };
  }

  const hasNativeText = pages.some((page) => page.text.trim().length > 0);
  if (!hasNativeText) {
    return {
      status: "rejected",
      reason: "NO_NATIVE_TEXT",
      pages,
      observations: [],
      diagnostics: ["PDF sans texte natif exploitable"],
      visionCalled: false,
    };
  }

  // 4D.3 — jamais de Vision dans 4D.4A
  const extracted = await extractTaxPackageLiasseObservations({
    documentId: input.documentId,
    formYear: input.formYear,
    fiscalYear: input.fiscalYear,
    pages,
  });

  // 4D.2
  const adapted = extractTaxPackageControlFactsFromLiasse({
    packageId: input.packageId,
    observations: extracted.observations,
  });

  return {
    status: "extracted",
    pages,
    observations: extracted.observations,
    package: adapted.package,
    identifiedForms: extracted.identifiedForms,
    visionCalled: false,
    diagnostics: [
      ...extracted.diagnostics,
      ...adapted.skipped.map(
        (s) => `4D.2 skipped ${s.formType}/${s.sourceCase}: ${s.reason}`,
      ),
      ...adapted.issues.map((i) => `4D.2 issue ${i.code}: ${i.message}`),
    ],
  };
}
