/**
 * Business-facing supervision for amortization extraction.
 * Parser confidence stays internal; users see concrete fiscal warnings only.
 */

import type { CreditAmortizationExtraction } from "@/lib/documents/gpt/schemas/credit-amortization.schema";
import type { SpatialAmortizationParseResult } from "@/lib/lmnp/parsers/spatial-amortization-core";
import { countInstallmentSurvival } from "@/lib/lmnp/parsers/pipeline/installment-survival-debug";
import { spatialRowsToVisibleLoanInstallments } from "@/lib/lmnp/services/credit-installment-visibility";

export type AmortizationSupervisionLevel = "green" | "orange" | "red";

export type AmortizationSupervisionStatus = {
  level: AmortizationSupervisionLevel;
  title: string;
  message: string;
  installmentCount?: number;
  warnings?: string[];
};

export function attachAmortizationSupervision(
  extraction: CreditAmortizationExtraction,
  supervision: AmortizationSupervisionStatus,
): CreditAmortizationExtraction {
  return { ...extraction, supervision };
}

function countUndatedBridgeExclusions(spatial: SpatialAmortizationParseResult): number {
  const { exclusions } = spatialRowsToVisibleLoanInstallments(spatial.installments);
  return exclusions.filter((row) => row.reason === "missing_date_at_loan_bridge").length;
}

function countUnparseableBridgeExclusions(spatial: SpatialAmortizationParseResult): number {
  const { exclusions } = spatialRowsToVisibleLoanInstallments(spatial.installments);
  return exclusions.filter((row) => row.reason === "unparseable_date_at_loan_bridge").length;
}

function countInsuranceGaps(spatial: SpatialAmortizationParseResult): number {
  const survival = countInstallmentSurvival(spatial.installments);
  return Math.max(0, survival.withPayment - survival.insuranceBearing);
}

export function buildAmortizationSupervision(params: {
  spatial: SpatialAmortizationParseResult;
  visibleLoanInstallmentCount: number;
  structuralFailureReason?: string;
}): AmortizationSupervisionStatus {
  const { spatial, visibleLoanInstallmentCount, structuralFailureReason } = params;
  const rawCount = spatial.installments.length;
  const survival = countInstallmentSurvival(spatial.installments);
  const missingDateExclusions = countUndatedBridgeExclusions(spatial);
  const unparseableDateExclusions = countUnparseableBridgeExclusions(spatial);
  const insuranceGapRows = countInsuranceGaps(spatial);

  if (structuralFailureReason) {
    return buildStructuralFailureSupervision(structuralFailureReason, {
      rawCount,
      datedRawCount: survival.dated,
      visibleLoanInstallmentCount,
    });
  }

  if (visibleLoanInstallmentCount === 0) {
    return {
      level: "red",
      title: "Tableau illisible",
      message:
        "Les dates du tableau d'amortissement n'ont pas pu être reconstruites de façon fiable. Merci de déposer une version plus nette du PDF ou une capture zoomée de la zone concernée.",
      installmentCount: 0,
      warnings: ["dates_non_reconstructibles"],
    };
  }

  const warnings: string[] = [];

  if (missingDateExclusions > 0 || unparseableDateExclusions > 0) {
    warnings.push(
      `${missingDateExclusions + unparseableDateExclusions} échéance(s) n'ont pas pu être datées automatiquement.`,
    );
  }

  if (insuranceGapRows > rawCount * 0.05) {
    warnings.push(
      "Plusieurs lignes d'assurance paraissent ambiguës ou incomplètes. Vérifiez les montants d'assurance avant validation.",
    );
  }

  if (survival.undated > rawCount * 0.1) {
    warnings.push(
      "Une partie des échéances n'a pas de date explicite dans le document source.",
    );
  }

  if (warnings.length === 0) {
    return {
      level: "green",
      title: "Tableau d'amortissement analysé",
      message: `Tableau d'amortissement analysé avec succès. ${visibleLoanInstallmentCount} échéance(s) détectée(s). Aucune anomalie majeure détectée.`,
      installmentCount: visibleLoanInstallmentCount,
    };
  }

  return {
    level: "orange",
    title: "Tableau globalement cohérent",
    message: `Le tableau paraît globalement cohérent (${visibleLoanInstallmentCount} échéance(s) détectée(s)), mais certaines valeurs méritent une vérification avant validation finale.`,
    installmentCount: visibleLoanInstallmentCount,
    warnings,
  };
}

export function buildStructuralFailureSupervision(
  reason: string,
  counts?: {
    rawCount?: number;
    datedRawCount?: number;
    visibleLoanInstallmentCount?: number;
  },
): AmortizationSupervisionStatus {
  if (reason === "not_pdf" || reason.startsWith("ocr_provider_")) {
    return {
      level: "red",
      title: "Format non pris en charge",
      message:
        "Le tableau d'amortissement n'a pas pu être lu automatiquement sur ce type de document. Merci de déposer le PDF natif de la banque ou une capture nette du tableau.",
      warnings: [reason],
    };
  }

  if (reason === "spatial_parse_failed") {
    return {
      level: "red",
      title: "Analyse impossible",
      message:
        "Le tableau d'amortissement n'a pas pu être reconstruit. Merci de déposer une version plus lisible du document.",
      warnings: [reason],
    };
  }

  if (
    reason === "spatial_zero_raw_installments" ||
    reason === "spatial_zero_visible_installments" ||
    reason === "spatial_zero_dated_installments"
  ) {
    return {
      level: "red",
      title: "Tableau illisible",
      message:
        "Les échéances n'ont pas pu être reconstruites de façon fiable. Merci de déposer une version plus nette du PDF ou une capture zoomée de la zone concernée.",
      installmentCount: counts?.visibleLoanInstallmentCount ?? 0,
      warnings: [reason],
    };
  }

  return {
    level: "red",
    title: "Analyse incomplète",
    message:
      "Certaines informations importantes du tableau d'amortissement sont illisibles. Merci de vérifier le document ou d'envoyer une capture plus nette.",
    warnings: [reason],
  };
}
