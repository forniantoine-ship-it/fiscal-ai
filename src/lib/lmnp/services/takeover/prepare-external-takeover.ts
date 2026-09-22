/**
 * Lot 5.1 — orchestrateur mince External Takeover.
 *
 * documents + review answers → extracteurs existants → 4E → 4F.1
 * Aucune règle 4C1 / 4D / 4E / 4F dupliquée.
 */

import {
  extractDepreciationRegisterFromSpreadsheet,
  type DepreciationRegisterExtractionResult,
} from "./extract-depreciation-register-spreadsheet";
import {
  extractNativeTaxPackageControlFactsFromPdf,
  type ExtractNativeTaxPackageControlFactsFromPdfResult,
} from "./extract-native-tax-package-from-pdf";
import {
  extractScannedTaxPackageControlFactsFromPdf,
  type ExtractScannedTaxPackageControlFactsFromPdfResult,
  type TaxPackageScanRasterizer,
} from "./extract-scanned-tax-package-from-pdf";
import type { TaxPackageLiassePageClassifier } from "./classify-tax-package-liasse-page";
import type { TaxPackageLiasseVisionRequester } from "./extract-tax-package-liasse-observations";
import {
  reconcileHistoricalTaxPackageControls,
  type HistoricalTaxPackageControlsReconciliation,
} from "./reconcile-historical-tax-package-controls";
import {
  buildExternalTakeoverFiscalYearOpening,
  type BuildExternalTakeoverFiscalYearOpeningResult,
} from "./build-external-takeover-opening";
import type { CandidateHistoricalAsset } from "./asset-candidates";
import type { TaxPackageControlFacts } from "./tax-package-control-facts";
import type { FiscalYearOpening } from "@/lib/lmnp/services/fiscal-year-opening/types";
import {
  emptyDocumentaryFiscalStocks,
  mergeTakeoverReviewAnswers,
} from "./merge-review-answers";
import type { TakeoverReviewAnswers } from "./review-answers";
import {
  mapIssuesToTakeoverExceptions,
  type TakeoverException,
} from "./exceptions";
import { isCandidateAbsent, isCandidatePresent } from "./candidate-value";
import { selectBuiltExternalTakeoverOpening } from "./select-built-external-takeover-opening";

/** Rôles V1 explicites — distincts de DocumentRole DB (annual_evidence / durable_reference). */
export type ExternalTakeoverOrchestrationRole =
  | "prior_depreciation_register"
  | "prior_tax_package";

export type ExternalTakeoverRegisterDocument =
  | {
      role: "prior_depreciation_register";
      documentId: string;
      file: File;
    }
  | {
      role: "prior_depreciation_register";
      documentId: string;
      /** Injection / tests — évite de re-persister des candidates. */
      candidates: CandidateHistoricalAsset[];
    };

export type ExternalTakeoverTaxPackageDocument =
  | {
      role: "prior_tax_package";
      documentId: string;
      file: File;
    }
  | {
      role: "prior_tax_package";
      documentId: string;
      /** Injection / tests — package 4D déjà construit. */
      package: TaxPackageControlFacts;
    };

export type PrepareExternalTakeoverInput = {
  openingId: string;
  dossierId: string;
  takeoverId: string;
  targetFiscalYear: number;
  /** Exercice documentaire N-1. */
  sourceFiscalYear: number;
  /** Millésime formulaire Cerfa pour extraction liasse. */
  formYear: number;
  register: ExternalTakeoverRegisterDocument;
  taxPackage: ExternalTakeoverTaxPackageDocument;
  reviewAnswers?: TakeoverReviewAnswers;
  /**
   * assetId Fiscal AI stables — clé = candidateKey.
   * Défaut : `ext:${candidateKey}` (identité technique, pas une valeur fiscale).
   */
  stableAssetIdByCandidateKey?: ReadonlyMap<string, string> | Readonly<Record<string, string>>;
  validatedAt?: string;
  validator?: string;
  /** Requis uniquement si scan fallback (NO_NATIVE_TEXT). */
  pageClassifier?: TaxPackageLiassePageClassifier;
  visionRequester?: TaxPackageLiasseVisionRequester;
  rasterizer?: TaxPackageScanRasterizer;
};

export type PrepareExternalTakeoverResult =
  | {
      status: "built";
      opening: FiscalYearOpening;
      controls: HistoricalTaxPackageControlsReconciliation;
      exceptions: [];
    }
  | {
      status: "incomplete";
      exceptions: TakeoverException[];
      controls?: HistoricalTaxPackageControlsReconciliation;
      buildResult?: BuildExternalTakeoverFiscalYearOpeningResult;
    }
  | {
      status: "manual_review_required";
      opening: FiscalYearOpening;
      exceptions: TakeoverException[];
      controls: HistoricalTaxPackageControlsReconciliation;
      buildResult: BuildExternalTakeoverFiscalYearOpeningResult;
    }
  | {
      status: "blocked";
      exceptions: TakeoverException[];
      controls?: HistoricalTaxPackageControlsReconciliation;
      buildResult?: BuildExternalTakeoverFiscalYearOpeningResult;
    };

function defaultStableIds(
  assets: readonly CandidateHistoricalAsset[],
  provided?: PrepareExternalTakeoverInput["stableAssetIdByCandidateKey"],
): Map<string, string> {
  const map = new Map<string, string>();
  if (provided instanceof Map) {
    for (const [k, v] of provided) map.set(k, v);
  } else if (provided) {
    for (const [k, v] of Object.entries(provided)) map.set(k, v);
  }
  for (const asset of assets) {
    if (!map.has(asset.candidateKey)) {
      map.set(asset.candidateKey, `ext:${asset.candidateKey}`);
    }
  }
  return map;
}

function preBuildClientExceptions(
  assets: readonly CandidateHistoricalAsset[],
  stocks: ReturnType<typeof emptyDocumentaryFiscalStocks>,
): TakeoverException[] {
  const exceptions: TakeoverException[] = [];

  for (const asset of assets) {
    if (isCandidateAbsent(asset.propertyId)) {
      exceptions.push({
        code: "PROPERTY_MATCH_REQUIRED",
        message: `propertyId manquant pour « ${asset.candidateKey} ».`,
        answerability: "client",
        candidateKey: asset.candidateKey,
        documentId: asset.propertyId.provenance?.documentId,
        fieldPath: `assets.${asset.candidateKey}.propertyId`,
      });
    }

    const amortizable =
      isCandidatePresent(asset.nonAmortizable) && asset.nonAmortizable.value === false
        ? true
        : isCandidatePresent(asset.classification) &&
          asset.classification.value !== "terrain";

    if (amortizable && isCandidateAbsent(asset.prorataConvention)) {
      exceptions.push({
        code: "PRORATA_REQUIRED",
        message: `prorataConvention manquante pour « ${asset.candidateKey} ».`,
        answerability: "client",
        candidateKey: asset.candidateKey,
        documentId: asset.prorataConvention.provenance?.documentId,
        fieldPath: `assets.${asset.candidateKey}.prorataConvention`,
      });
    }

    if (isCandidateAbsent(asset.classification)) {
      exceptions.push({
        code: "CLASSIFICATION_REQUIRED",
        message: `classification manquante pour « ${asset.candidateKey} ».`,
        answerability: "client",
        candidateKey: asset.candidateKey,
        documentId: asset.classification.provenance?.documentId,
        fieldPath: `assets.${asset.candidateKey}.classification`,
      });
    }
  }

  if (!isCandidatePresent(stocks.deficits)) {
    exceptions.push({
      code: "DEFICITS_REQUIRED",
      message: "Déficits d'ouverture non répondus — unanswered ≠ [].",
      answerability: "client",
      fieldPath: "stocks.deficits",
    });
  }

  if (!isCandidatePresent(stocks.amortissementsReportes)) {
    exceptions.push({
      code: "ARD_REQUIRED",
      message: "Amortissements reportés non répondus — unanswered ≠ 0.",
      answerability: "client",
      fieldPath: "stocks.amortissementsReportes",
    });
  }

  return exceptions;
}

async function resolveRegisterCandidates(
  register: ExternalTakeoverRegisterDocument,
  targetFiscalYear: number,
): Promise<
  | { status: "ok"; candidates: CandidateHistoricalAsset[]; extraction?: DepreciationRegisterExtractionResult }
  | { status: "failed"; exceptions: TakeoverException[] }
> {
  if ("candidates" in register) {
    return { status: "ok", candidates: [...register.candidates] };
  }

  const extraction = await extractDepreciationRegisterFromSpreadsheet({
    file: register.file,
    documentId: register.documentId,
    targetFiscalYear,
  });

  if (extraction.status === "unsupported" || extraction.candidates.length === 0) {
    return {
      status: "failed",
      exceptions: [
        {
          code: "DOCUMENT_EXTRACTION_FAILED",
          message: `Registre d'amortissements non extractible (${extraction.status}).`,
          answerability: "blocked",
          documentId: register.documentId,
        },
      ],
    };
  }

  return { status: "ok", candidates: extraction.candidates, extraction };
}

async function resolveTaxPackageFacts(
  input: PrepareExternalTakeoverInput,
): Promise<
  | { status: "ok"; package: TaxPackageControlFacts; path: "injected" | "native" | "scanned" }
  | { status: "failed"; exceptions: TakeoverException[] }
> {
  const doc = input.taxPackage;
  if ("package" in doc) {
    return { status: "ok", package: doc.package, path: "injected" };
  }

  const nativeInput = {
    file: doc.file,
    documentId: doc.documentId,
    formYear: input.formYear,
    fiscalYear: input.sourceFiscalYear,
    packageId: input.takeoverId,
  };

  const native: ExtractNativeTaxPackageControlFactsFromPdfResult =
    await extractNativeTaxPackageControlFactsFromPdf(nativeInput);

  if (native.status === "extracted") {
    return { status: "ok", package: native.package, path: "native" };
  }

  // Uniquement NO_NATIVE_TEXT → bridge scan. Autres erreurs natives = échec réel.
  if (native.reason !== "NO_NATIVE_TEXT") {
    return {
      status: "failed",
      exceptions: [
        {
          code: "DOCUMENT_EXTRACTION_FAILED",
          message: `Liasse native rejetée (${native.reason}).`,
          answerability: "blocked",
          documentId: doc.documentId,
        },
      ],
    };
  }

  if (!input.pageClassifier || !input.visionRequester) {
    return {
      status: "failed",
      exceptions: [
        {
          code: "DOCUMENT_EXTRACTION_FAILED",
          message:
            "PDF sans texte natif — scan bridge requis (pageClassifier + visionRequester absents).",
          answerability: "blocked",
          documentId: doc.documentId,
        },
      ],
    };
  }

  const scanned: ExtractScannedTaxPackageControlFactsFromPdfResult =
    await extractScannedTaxPackageControlFactsFromPdf({
      file: doc.file,
      documentId: doc.documentId,
      formYear: input.formYear,
      fiscalYear: input.sourceFiscalYear,
      packageId: input.takeoverId,
      pageClassifier: input.pageClassifier,
      visionRequester: input.visionRequester,
      rasterizer: input.rasterizer,
    });

  if (scanned.status !== "extracted") {
    return {
      status: "failed",
      exceptions: [
        {
          code: "DOCUMENT_EXTRACTION_FAILED",
          message: `Liasse scan rejetée (${scanned.reason}).`,
          answerability: "blocked",
          documentId: doc.documentId,
        },
      ],
    };
  }

  return { status: "ok", package: scanned.package, path: "scanned" };
}

/**
 * Assemble documents N-1 + réponses → Opening externe ou exceptions 5.2.
 */
export async function prepareExternalTakeover(
  input: PrepareExternalTakeoverInput,
): Promise<PrepareExternalTakeoverResult> {
  const registerResult = await resolveRegisterCandidates(
    input.register,
    input.targetFiscalYear,
  );
  if (registerResult.status === "failed") {
    return { status: "blocked", exceptions: registerResult.exceptions };
  }

  const taxResult = await resolveTaxPackageFacts(input);
  if (taxResult.status === "failed") {
    return { status: "blocked", exceptions: taxResult.exceptions };
  }

  const documentaryStocks = emptyDocumentaryFiscalStocks(
    input.taxPackage.documentId,
  );

  const merged = mergeTakeoverReviewAnswers({
    assets: registerResult.candidates,
    stocks: documentaryStocks,
    reviewAnswers: input.reviewAnswers,
  });

  const clientExceptions = preBuildClientExceptions(merged.assets, merged.stocks);

  const controls = reconcileHistoricalTaxPackageControls(taxResult.package);

  const buildResult = buildExternalTakeoverFiscalYearOpening({
    openingId: input.openingId,
    dossierId: input.dossierId,
    takeoverId: input.takeoverId,
    targetFiscalYear: input.targetFiscalYear,
    sourceFiscalYear: input.sourceFiscalYear,
    assets: merged.assets,
    stableAssetIdByCandidateKey: defaultStableIds(
      merged.assets,
      input.stableAssetIdByCandidateKey,
    ),
    stocks: merged.stocks,
    controls,
    validatedAt: input.validatedAt,
    validator: input.validator ?? "lot5.1-prepare-external-takeover",
  });

  if (buildResult.status === "built") {
    const selected = selectBuiltExternalTakeoverOpening({
      buildResult,
      requestedFiscalYear: input.targetFiscalYear,
    });
    if (selected.status !== "ready") {
      return {
        status: "blocked",
        exceptions: [
          {
            code: selected.code,
            message: selected.message,
            answerability: "blocked",
          },
        ],
        controls,
        buildResult,
      };
    }
    return {
      status: "built",
      opening: selected.opening,
      controls,
      exceptions: [],
    };
  }

  if (buildResult.status === "manual_review_required") {
    return {
      status: "manual_review_required",
      opening: buildResult.opening,
      exceptions: mapIssuesToTakeoverExceptions(buildResult.issues),
      controls,
      buildResult,
    };
  }

  // blocked — distinguer gaps client (5.2) vs hard-block (conflit 4E, mapping interdit…)
  const fromBuild = mapIssuesToTakeoverExceptions(buildResult.issues);
  const hardBlocks = fromBuild.filter(
    (e) =>
      e.answerability === "blocked" &&
      (e.code.includes("CONFLICT") ||
        e.code === "DOCUMENT_EXTRACTION_FAILED" ||
        e.code === "FORBIDDEN_ARD_SOURCE" ||
        e.code === "NO_ASSET_DETAIL" ||
        e.code === "INFERRED_NOT_ACCEPTED"),
  );
  const manualFromBuild = fromBuild.filter((e) => e.answerability === "manual_review");

  if (hardBlocks.length > 0) {
    return {
      status: "blocked",
      exceptions: dedupeExceptions([...hardBlocks, ...clientExceptions, ...fromBuild]),
      controls,
      buildResult,
    };
  }

  // Gaps client (property / prorata / stocks…) → incomplete pour 5.2,
  // même si 4F.1 remonte aussi ASSET_PLAN_* (conséquence, pas hard-block).
  if (clientExceptions.length > 0) {
    return {
      status: "incomplete",
      exceptions: dedupeExceptions([...clientExceptions, ...manualFromBuild]),
      controls,
      buildResult,
    };
  }

  return {
    status: "blocked",
    exceptions: fromBuild,
    controls,
    buildResult,
  };
}

function dedupeExceptions(exceptions: TakeoverException[]): TakeoverException[] {
  const seen = new Set<string>();
  const out: TakeoverException[] = [];
  for (const item of exceptions) {
    const key = `${item.code}|${item.candidateKey ?? ""}|${item.fieldPath ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
