/**
 * Lot 5.4-A — extraction bornée PDF → CandidateHistoricalAsset[].
 *
 * PROPOSITION DOCUMENTAIRE uniquement — même contrat que Lot 4C.1 (spreadsheet).
 * Pas d'Opening, pas de réconciliation 4E, pas de mint d'assetId.
 *
 * Pourquoi Vision plutôt que reconstruction spatiale déterministe :
 * un registre d'amortissements PDF (contrairement à un Cerfa à libellés de
 * case fixes, ou à un XLS/CSV déjà tabulaire) n'a pas de garantie de mise en
 * page une-ligne-par-immobilisation. Sur le document réel GEFFROY, chaque
 * immobilisation est imprimée sur 2-3 lignes visuelles, et les colonnes
 * numériques vides ne laissent aucune trace positionnelle (aucune cellule
 * vide émise) — un mapping par position serait ambigu et non généralisable
 * sans hypothèses propres à la mise en page d'un cabinet/logiciel donné.
 * cf. .agents/skills/document-extraction.md — pas de fallback pour compenser
 * un parseur incomplet ; ici on choisit Vision en amont, pas en compensation.
 *
 * Le texte natif (extractNativePdfPages) sert uniquement de :
 * (a) détection PDF scanné vs texté (hasNativeText, informatif) ;
 * (b) indice textuel (pageTextHint) transmis à Vision.
 * Il n'est jamais la source déterministe du mapping ligne → champ.
 *
 * Vision lit les cellules telles qu'imprimées (chaînes brutes, aucun calcul).
 * Le parsing montants/dates reste déterministe (réutilise Lot 4C.1).
 */

import { createConfidenceScore, type ConfidenceScore } from "@/lib/documents/types/confidence-score";
import { extractNativePdfPages, isPdfFile } from "@/lib/documents/ocr/pdf-native-text";
import { fileToRasterImages, OCR_RENDER_SCALE, type RasterPageImage } from "@/lib/documents/ocr/pdf-to-images";
import {
  parseRegisterAmount,
  parseRegisterStartDate,
  isNextYearRegisterTakeover,
  type DepreciationRegisterDiagnosticCode,
} from "./extract-depreciation-register-spreadsheet";
import type { CandidateDepreciationMethod, CandidateHistoricalAsset } from "./asset-candidates";
import {
  extractionImpossibleCandidate,
  missingCandidate,
  presentCandidate,
  type CandidateProvenance,
  type CandidateValue,
} from "./candidate-value";
import type {
  DepreciationRegisterPdfRow,
  DepreciationRegisterVisionRequester,
} from "./depreciation-register-pdf-row";
import { parsePcgAccountCode } from "./suggest-register-asset-classification";

const EXTRACTION_METHOD = "pdf_depreciation_register_vision_v1" as const;

/** En-tête de section compte/plan — même sans numéro PCG parseable. */
function looksLikeAccountSectionHeader(row: DepreciationRegisterPdfRow): boolean {
  const text = [row.scopeLabel, row.label, row.rawSnippet, row.accountCodeRaw]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(" ");
  if (!text) return false;
  if (/compte/i.test(text)) return true;
  if (row.rowType === "subtotal" && row.scopeLabel?.trim()) return true;
  return false;
}

export type DepreciationRegisterPdfDiagnosticCode =
  | DepreciationRegisterDiagnosticCode
  | "NOT_PDF"
  | "PDF_READ_FAILED"
  | "RASTER_FAILED"
  | "NO_RASTER_PAGES"
  | "VISION_FAILED"
  | "EXITED_ASSET_ROW_SKIPPED"
  | "UNRECOGNIZED_ROW_SKIPPED"
  | "NO_ASSET_ROWS_EXTRACTED"
  | "PDF_TRUNCATED"
  | "SOURCE_OPENING_CUMULATIVE_IGNORED";

export type DepreciationRegisterPdfDiagnostic = {
  code: DepreciationRegisterPdfDiagnosticCode;
  message: string;
  pageNumber?: number;
  rowRef?: string;
};

/**
 * Contrôle de complétude — jamais une tolérance générale cachée.
 * Compare une somme extraite (périmètre explicite) à un total imprimé
 * du même périmètre, lorsque ce périmètre est identifiable sans ambiguïté.
 */
export type DepreciationRegisterPdfControlCheck = {
  scopeLabel: string;
  field: "grossCost" | "openingCumulative";
  status: "CONCORDANT" | "CONFLICT" | "NOT_COMPARABLE";
  documentTotal: number | null;
  extractedSum: number | null;
  message: string;
};

export type DepreciationRegisterPdfExtractionStatus = "extracted" | "review_required" | "unsupported";

export type DepreciationRegisterPdfExtractionResult = {
  status: DepreciationRegisterPdfExtractionStatus;
  candidates: CandidateHistoricalAsset[];
  /** Lignes sortie détectées — jamais des candidates, conservées pour traçabilité/contrôle. */
  excludedExitRows: DepreciationRegisterPdfRow[];
  diagnostics: DepreciationRegisterPdfDiagnostic[];
  controlChecks: DepreciationRegisterPdfControlCheck[];
  hasNativeText: boolean;
  visionCalled: boolean;
  extractionMethod: typeof EXTRACTION_METHOD;
  /** Nombre réel de pages du PDF (non plafonné) — null si illisible (PDF_READ_FAILED). */
  totalPageCount: number | null;
  /** Nombre de pages effectivement rasterisées/soumises à Vision. */
  processedPageCount: number;
};

export type ExtractDepreciationRegisterFromPdfInput = {
  file: File;
  documentId: string;
  /** Exercice cible N (Opening). */
  targetFiscalYear: number;
  /**
   * Exercice couvert par le registre. Lorsque `sourceFiscalYear === targetFiscalYear - 1`
   * (reprise N depuis registre N-1), cumulOuverture ← « Amort. fin » (SAV-010).
   * Absent ou égal à targetFiscalYear → extraction same-year (Amort. début).
   */
  sourceFiscalYear?: number;
  visionRequester: DepreciationRegisterVisionRequester;
  /** Défaut : fileToRasterImages (browser). Injectable pour Node/tests. */
  rasterizer?: (file: File) => Promise<RasterPageImage[]>;
};

function buildConfidence(factors: string[], base = 0.85): ConfidenceScore {
  const penalty = Math.min(0.5, factors.length * 0.08);
  return createConfidenceScore(base - penalty, factors);
}

function makeProv(
  documentId: string,
  row: DepreciationRegisterPdfRow,
  fieldLabel: string,
  raw: string,
  factors: string[],
): CandidateProvenance {
  return {
    documentId,
    documentRole: "depreciation_register",
    fieldLabel,
    sourceRef: `pdf:p${row.pageNumber}:${row.assetRef ?? "?"}`,
    extractionMethod: EXTRACTION_METHOD,
    confidence: buildConfidence(factors),
    evidence: { snippet: row.rawSnippet.slice(0, 200) },
    fieldSource: "extracted",
  };
}

function presentOrMissingNumber(
  raw: string | undefined,
  documentId: string,
  row: DepreciationRegisterPdfRow,
  fieldLabel: string,
  factors: string[],
  diagnostics: DepreciationRegisterPdfDiagnostic[],
): CandidateValue<number> {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) {
    return missingCandidate("cellule vide", {
      documentId,
      documentRole: "depreciation_register",
      fieldLabel,
      sourceRef: `pdf:p${row.pageNumber}:${row.assetRef ?? "?"}`,
    });
  }
  const amount = parseRegisterAmount(trimmed);
  if (amount === null) {
    diagnostics.push({
      code: "UNPARSEABLE_AMOUNT",
      message: `Montant non parseable « ${trimmed} » (${fieldLabel}).`,
      pageNumber: row.pageNumber,
      rowRef: row.assetRef,
    });
    return extractionImpossibleCandidate("montant non parseable", {
      documentId,
      documentRole: "depreciation_register",
      fieldLabel,
      sourceRef: `pdf:p${row.pageNumber}:${row.assetRef ?? "?"}`,
    });
  }
  return presentCandidate(amount, "direct", makeProv(documentId, row, fieldLabel, trimmed, factors));
}

/** Mode d'amortissement — abréviations comptables standard, pas de règle propre au cabinet. */
function parsePdfMethod(raw: string): CandidateDepreciationMethod | "unrecognized" {
  const n = raw.trim().toUpperCase();
  if (n === "L" || n.startsWith("LIN")) return "lineaire";
  if (n === "D" || n.startsWith("DEG") || n.startsWith("DÉG")) return "degressif";
  return "unrecognized";
}

/** Durée "an-mois" (ex. "05 - 00", "05-00") → années décimales. Absente/illisible → null. */
export function parseRegisterDurationAnMois(raw: string): number | null {
  const trimmed = raw.trim().replace(/ /g, " ");
  if (!trimmed) return null;
  const m = trimmed.match(/^(\d{1,3})\s*-\s*(\d{1,2})$/);
  if (!m) return null;
  const years = Number.parseInt(m[1], 10);
  const months = Number.parseInt(m[2], 10);
  if (!Number.isFinite(years) || !Number.isFinite(months)) return null;
  const total = years + months / 12;
  return total > 0 ? Math.round(total * 100) / 100 : null;
}

function rowToCandidate(
  row: DepreciationRegisterPdfRow,
  documentId: string,
  diagnostics: DepreciationRegisterPdfDiagnostic[],
  nextYearTakeover: boolean,
  pcgAccountCodeRaw?: string | null,
): CandidateHistoricalAsset {
  const factors: string[] = [];

  if (row.dotationRaw) {
    diagnostics.push({
      code: "DOTATION_IGNORED",
      message: "Dotation exercice détectée — non mappée vers cumulOuverture.",
      pageNumber: row.pageNumber,
      rowRef: row.assetRef,
    });
  }
  if (nextYearTakeover) {
    // SAV-010 : Amort. fin N-1 → cumulOuverture(N). Amort. début N-1 n'est pas l'ouverture N.
    if (row.openingCumulativeRaw) {
      diagnostics.push({
        code: "SOURCE_OPENING_CUMULATIVE_IGNORED",
        message:
          "Amort. début N-1 détecté — non mappé vers cumulOuverture(N) ; source = Amort. fin N-1.",
        pageNumber: row.pageNumber,
        rowRef: row.assetRef,
      });
    }
  } else if (row.closingCumulativeRaw) {
    diagnostics.push({
      code: "CLOSING_CUMULATIVE_IGNORED",
      message: "Amort. fin détecté — non mappé vers cumulOuverture (extraction same-year).",
      pageNumber: row.pageNumber,
      rowRef: row.assetRef,
    });
  }
  if (row.vncRaw) {
    diagnostics.push({
      code: "VNC_IGNORED",
      message: "VNC détectée — non mappée vers coutBrut ni cumulOuverture.",
      pageNumber: row.pageNumber,
      rowRef: row.assetRef,
    });
  }

  const label: CandidateValue<string> = row.label
    ? presentCandidate(row.label, "direct", makeProv(documentId, row, "label", row.label, factors))
    : missingCandidate("libellé absent", {
        documentId,
        documentRole: "depreciation_register",
        sourceRef: `pdf:p${row.pageNumber}:${row.assetRef ?? "?"}`,
      });

  const coutBrut = presentOrMissingNumber(row.grossCostRaw, documentId, row, "grossCost", factors, diagnostics);
  // Reprise N←N-1 : Amort. fin. Same-year / sans sourceFiscalYear : Amort. début.
  // Jamais Amort. début + Dotation. Cellule Amort. fin vide → missing (fail closed).
  const cumulRaw = nextYearTakeover ? row.closingCumulativeRaw : row.openingCumulativeRaw;
  const cumulFieldLabel = nextYearTakeover ? "closingCumulative" : "openingCumulative";
  const cumulOuverture = presentOrMissingNumber(
    cumulRaw,
    documentId,
    row,
    cumulFieldLabel,
    factors,
    diagnostics,
  );

  if (coutBrut.status === "present" && cumulOuverture.status === "present" && cumulOuverture.value > coutBrut.value) {
    diagnostics.push({
      code: "CUMUL_EXCEEDS_COST",
      message: `cumulOuverture (${cumulOuverture.value}) > coutBrut (${coutBrut.value}) — aucune correction.`,
      pageNumber: row.pageNumber,
      rowRef: row.assetRef,
    });
  }

  const startRaw = row.startDateRaw ?? row.acquisitionDateRaw;
  let startDate: CandidateValue<string>;
  if (!startRaw) {
    startDate = missingCandidate("date mise en service absente", {
      documentId,
      documentRole: "depreciation_register",
      sourceRef: `pdf:p${row.pageNumber}:${row.assetRef ?? "?"}`,
    });
  } else {
    const iso = parseRegisterStartDate(startRaw);
    if (!iso) {
      diagnostics.push({
        code: "UNPARSEABLE_DATE",
        message: `Date non parseable « ${startRaw} ».`,
        pageNumber: row.pageNumber,
        rowRef: row.assetRef,
      });
      startDate = extractionImpossibleCandidate("date non parseable", {
        documentId,
        documentRole: "depreciation_register",
        sourceRef: `pdf:p${row.pageNumber}:${row.assetRef ?? "?"}`,
      });
    } else {
      startDate = presentCandidate(iso, "direct", makeProv(documentId, row, "startDate", startRaw, factors));
      if (!row.startDateRaw && row.acquisitionDateRaw) {
        diagnostics.push({
          code: "ACQUISITION_DATE_ONLY",
          message: "Date acquisition utilisée en l'absence de date mise en service explicite.",
          pageNumber: row.pageNumber,
          rowRef: row.assetRef,
        });
      }
    }
  }

  let durationYears: CandidateValue<number>;
  if (!row.durationRaw) {
    durationYears = missingCandidate("durée absente", {
      documentId,
      documentRole: "depreciation_register",
      sourceRef: `pdf:p${row.pageNumber}:${row.assetRef ?? "?"}`,
    });
  } else {
    const years = parseRegisterDurationAnMois(row.durationRaw);
    if (years === null) {
      durationYears = extractionImpossibleCandidate("durée non parseable", {
        documentId,
        documentRole: "depreciation_register",
        sourceRef: `pdf:p${row.pageNumber}:${row.assetRef ?? "?"}`,
      });
    } else {
      durationYears = presentCandidate(years, "direct", makeProv(documentId, row, "duration", row.durationRaw, factors));
    }
  }

  let method: CandidateValue<CandidateDepreciationMethod>;
  if (!row.methodRaw) {
    method = missingCandidate("méthode absente — linéaire non inventé", {
      documentId,
      documentRole: "depreciation_register",
      sourceRef: `pdf:p${row.pageNumber}:${row.assetRef ?? "?"}`,
    });
  } else {
    const parsed = parsePdfMethod(row.methodRaw);
    if (parsed === "unrecognized") {
      diagnostics.push({
        code: "UNSUPPORTED_METHOD_VALUE",
        message: `Méthode non reconnue « ${row.methodRaw} » — préservée comme autre.`,
        pageNumber: row.pageNumber,
        rowRef: row.assetRef,
      });
      method = presentCandidate(
        "autre",
        "direct",
        makeProv(documentId, row, "method", row.methodRaw, [...factors, "unsupported_method"]),
      );
    } else {
      method = presentCandidate(parsed, "direct", makeProv(documentId, row, "method", row.methodRaw, factors));
    }
  }

  const candidateKey = `pdf:p${row.pageNumber}:${row.assetRef ?? row.label ?? "row"}`;

  return {
    candidateKey,
    ...(row.assetRef ? { sourceAssetRef: row.assetRef } : {}),
    label,
    coutBrut,
    cumulOuverture,
    startDate,
    durationYears,
    method,
    prorataConvention: missingCandidate("convention de prorata absente du registre — non inférée", {
      documentId,
      documentRole: "depreciation_register",
      sourceRef: `pdf:p${row.pageNumber}:${row.assetRef ?? "?"}`,
    }),
    classification: missingCandidate("classification absente — non déduite du libellé", {
      documentId,
      documentRole: "depreciation_register",
      sourceRef: `pdf:p${row.pageNumber}:${row.assetRef ?? "?"}`,
    }),
    nonAmortizable: missingCandidate("nonAmortizable inconnu sans classification explicite", {
      documentId,
      documentRole: "depreciation_register",
      sourceRef: `pdf:p${row.pageNumber}:${row.assetRef ?? "?"}`,
    }),
    propertyId: missingCandidate("propertyId non assigné — aucun fallback mono-bien / properties[0]", {
      documentId,
      documentRole: "depreciation_register",
      sourceRef: `pdf:p${row.pageNumber}:${row.assetRef ?? "?"}`,
    }),
    ...(pcgAccountCodeRaw
      ? {
          pcgAccountCode: presentCandidate(
            pcgAccountCodeRaw,
            "direct",
            makeProv(documentId, row, "pcgAccountCode", pcgAccountCodeRaw, factors),
          ),
        }
      : {}),
  };
}

function normalizeScopeLabel(raw: string): string {
  return raw
    .replace(/ /g, " ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type GlobalScopeKind = "hors_sorties" | "sorties" | "all";

/**
 * Portée globale (document entier) uniquement — jamais un sous-total par
 * compte/plan comptable (exclu via "compte", non attribuable sans regrouper
 * les candidates par compte, hors périmètre Lot 5.4-A).
 * Vocabulaire générique standard (total / sous-total / sorties / hors sorties)
 * — même famille de libellés que TOTAL_LABELS du Lot 4C.1, pas un libellé
 * propre à un cabinet.
 */
function classifyGlobalScope(raw: string): GlobalScopeKind | null {
  const n = normalizeScopeLabel(raw);
  if (!n.includes("total")) return null;
  if (n.includes("compte")) return null;
  if (n.includes("sous")) return null;
  if (n.includes("hors") && n.includes("sorti")) return "hors_sorties";
  if (n.includes("sorti")) return "sorties";
  return "all";
}

type FieldSums = { grossCost: number; openingCumulative: number };
type FieldMissing = { grossCost: boolean; openingCumulative: boolean };

/**
 * Somme documentaire (Valeur entrée / Amort. début) — indépendante du mapping
 * Opening : pour reprise N←N-1, cumulOuverture vient d'Amort. fin (SAV-010),
 * alors que ce contrôle reste sur la colonne Amort. début imprimée.
 */
function sumRowsDocumentaryField(
  rows: DepreciationRegisterPdfRow[],
): { sums: FieldSums; missing: FieldMissing } {
  let grossCost = 0;
  let openingCumulative = 0;
  let grossCostMissing = false;
  let openingCumulativeMissing = false;
  for (const row of rows) {
    const gross = row.grossCostRaw ? parseRegisterAmount(row.grossCostRaw) : null;
    if (gross === null) grossCostMissing = true;
    else grossCost += gross;
    const cumul = row.openingCumulativeRaw ? parseRegisterAmount(row.openingCumulativeRaw) : null;
    if (cumul === null) openingCumulativeMissing = true;
    else openingCumulative += cumul;
  }
  return {
    sums: { grossCost, openingCumulative },
    missing: { grossCost: grossCostMissing, openingCumulative: openingCumulativeMissing },
  };
}

/**
 * Contrôle de complétude — rapproche la somme documentaire des lignes
 * (périmètre hors sorties / sorties) des totaux globaux imprimés.
 * Champ « openingCumulative » = colonne Amort. début (pas le mapping Opening).
 */
function buildControlChecks(
  assetRows: DepreciationRegisterPdfRow[],
  exitRows: DepreciationRegisterPdfRow[],
  totalRows: DepreciationRegisterPdfRow[],
): DepreciationRegisterPdfControlCheck[] {
  const checks: DepreciationRegisterPdfControlCheck[] = [];
  const candidateAgg = sumRowsDocumentaryField(assetRows);
  const exitAgg = sumRowsDocumentaryField(exitRows);

  for (const totalRow of totalRows) {
    const scopeLabel = totalRow.scopeLabel?.trim();
    if (!scopeLabel) continue;
    const kind = classifyGlobalScope(scopeLabel);
    if (!kind) continue; // sous-total par compte — hors périmètre de ce contrôle

    for (const field of ["grossCost", "openingCumulative"] as const) {
      const raw = field === "grossCost" ? totalRow.grossCostRaw : totalRow.openingCumulativeRaw;
      const documentTotal = raw ? parseRegisterAmount(raw) : null;
      if (documentTotal === null) continue;

      const missingForScope =
        kind === "hors_sorties"
          ? candidateAgg.missing[field]
          : kind === "sorties"
            ? exitAgg.missing[field]
            : candidateAgg.missing[field] || exitAgg.missing[field];

      if (missingForScope) {
        checks.push({
          scopeLabel,
          field,
          status: "NOT_COMPARABLE",
          documentTotal,
          extractedSum: null,
          message: `Portée « ${scopeLabel} » (${field}) : au moins une valeur manquante/non parseable dans les lignes concernées — rapprochement non fiable.`,
        });
        continue;
      }

      const rawSum =
        kind === "hors_sorties"
          ? candidateAgg.sums[field]
          : kind === "sorties"
            ? exitAgg.sums[field]
            : candidateAgg.sums[field] + exitAgg.sums[field];
      const extractedSum = Math.round(rawSum * 100) / 100;

      const diff = Math.round((extractedSum - documentTotal) * 100) / 100;
      checks.push({
        scopeLabel,
        field,
        status: diff === 0 ? "CONCORDANT" : "CONFLICT",
        documentTotal,
        extractedSum,
        message:
          diff === 0
            ? `Somme extraite (${extractedSum}) = total documentaire « ${scopeLabel} » (${documentTotal}).`
            : `Somme extraite (${extractedSum}) ≠ total documentaire « ${scopeLabel} » (${documentTotal}) — écart ${diff}.`,
      });
    }
  }

  return checks;
}

async function defaultRasterizer(file: File): Promise<RasterPageImage[]> {
  return fileToRasterImages(file, { scale: OCR_RENDER_SCALE });
}

export async function extractDepreciationRegisterFromPdf(
  input: ExtractDepreciationRegisterFromPdfInput,
): Promise<DepreciationRegisterPdfExtractionResult> {
  const diagnostics: DepreciationRegisterPdfDiagnostic[] = [];

  if (!isPdfFile(input.file)) {
    return {
      status: "unsupported",
      candidates: [],
      excludedExitRows: [],
      diagnostics: [{ code: "NOT_PDF", message: "Fichier non PDF." }],
      controlChecks: [],
      hasNativeText: false,
      visionCalled: false,
      extractionMethod: EXTRACTION_METHOD,
      totalPageCount: null,
      processedPageCount: 0,
    };
  }

  let nativePages: { pageNumber: number; text: string }[] = [];
  let totalPageCount: number | null = null;
  try {
    const native = await extractNativePdfPages(input.file);
    nativePages = native.pages;
    totalPageCount = native.totalPageCount;
  } catch (error) {
    const message = error instanceof Error ? error.message : "pdf_read_failed";
    diagnostics.push({ code: "PDF_READ_FAILED", message: `Lecture PDF native échouée: ${message}` });
  }
  const hasNativeText = nativePages.some((p) => p.text.trim().length > 0);
  const textHintByPage = new Map(nativePages.map((p) => [p.pageNumber, p.text]));

  const rasterizer = input.rasterizer ?? defaultRasterizer;
  let images: RasterPageImage[];
  try {
    images = await rasterizer(input.file);
  } catch (error) {
    const message = error instanceof Error ? error.message : "raster_failed";
    return {
      status: "unsupported",
      candidates: [],
      excludedExitRows: [],
      diagnostics: [...diagnostics, { code: "RASTER_FAILED", message: `Rasterisation échouée: ${message}` }],
      controlChecks: [],
      hasNativeText,
      visionCalled: false,
      extractionMethod: EXTRACTION_METHOD,
      totalPageCount,
      processedPageCount: 0,
    };
  }

  if (images.length === 0 || images.every((img) => !img.base64)) {
    return {
      status: "unsupported",
      candidates: [],
      excludedExitRows: [],
      diagnostics: [...diagnostics, { code: "NO_RASTER_PAGES", message: "Aucune page raster exploitable." }],
      controlChecks: [],
      hasNativeText,
      visionCalled: false,
      extractionMethod: EXTRACTION_METHOD,
      totalPageCount,
      processedPageCount: 0,
    };
  }

  const processedPageCount = images.length;
  if (totalPageCount !== null && totalPageCount > processedPageCount) {
    diagnostics.push({
      code: "PDF_TRUNCATED",
      message: `Document de ${totalPageCount} page(s) — seules ${processedPageCount} page(s) ont été rasterisées et soumises à Vision (limite de rasterisation) ; ${totalPageCount - processedPageCount} page(s) jamais traitées. Extraction non considérée complète.`,
    });
  }

  const allRows: DepreciationRegisterPdfRow[] = [];
  let visionCalled = false;
  for (const image of images) {
    visionCalled = true;
    try {
      const result = await input.visionRequester({
        documentId: input.documentId,
        pageNumber: image.pageNumber,
        pageImage: { mimeType: image.mimeType, base64: image.base64 },
        pageTextHint: textHintByPage.get(image.pageNumber),
      });
      allRows.push(...result.rows);
    } catch (error) {
      const message = error instanceof Error ? error.message : "vision_failed";
      diagnostics.push({
        code: "VISION_FAILED",
        message: `Vision échouée p.${image.pageNumber}: ${message}`,
        pageNumber: image.pageNumber,
      });
    }
  }

  const exitRows = allRows.filter((r) => r.rowType === "exit");
  const totalRows = allRows.filter((r) => r.rowType === "subtotal" || r.rowType === "total");
  const unrecognizedRows = allRows.filter((r) => r.rowType === "unrecognized");

  for (const row of exitRows) {
    diagnostics.push({
      code: "EXITED_ASSET_ROW_SKIPPED",
      message: `Sortie détectée (« ${row.label ?? row.assetRef ?? "?"} »${row.exitLabelRaw ? `, ${row.exitLabelRaw}` : ""}) — exclue de l'ouverture, jamais promue en CandidateHistoricalAsset.`,
      pageNumber: row.pageNumber,
      rowRef: row.assetRef,
    });
  }
  for (const row of unrecognizedRows) {
    diagnostics.push({
      code: "UNRECOGNIZED_ROW_SKIPPED",
      message: `Ligne détectée mais non classifiable (« ${row.rawSnippet.slice(0, 80)} ») — exclue, à revoir manuellement.`,
      pageNumber: row.pageNumber,
      rowRef: row.assetRef,
    });
  }

  const nextYearTakeover = isNextYearRegisterTakeover(
    input.sourceFiscalYear,
    input.targetFiscalYear,
  );
  const candidates: CandidateHistoricalAsset[] = [];
  const assetRows: DepreciationRegisterPdfRow[] = [];
  let currentPcgAccount: string | null = null;
  for (const row of allRows) {
    if (row.rowType === "subtotal" || row.rowType === "unrecognized") {
      const sectionAccount =
        parsePcgAccountCode(row.accountCodeRaw) ??
        parsePcgAccountCode(row.scopeLabel) ??
        parsePcgAccountCode(row.rawSnippet) ??
        parsePcgAccountCode(row.label);
      if (sectionAccount) {
        currentPcgAccount = sectionAccount;
      } else if (looksLikeAccountSectionHeader(row)) {
        // En-tête de section non mappable : ne pas laisser fuir le compte précédent.
        currentPcgAccount = null;
      }
    }
    if (row.rowType !== "asset") continue;
    assetRows.push(row);
    const assetAccount =
      parsePcgAccountCode(row.accountCodeRaw) ?? currentPcgAccount;
    candidates.push(
      rowToCandidate(row, input.documentId, diagnostics, nextYearTakeover, assetAccount),
    );
  }

  if (candidates.length === 0) {
    diagnostics.push({
      code: "NO_ASSET_ROWS_EXTRACTED",
      message: "Aucune ligne immobilisation reconnue par Vision.",
    });
    return {
      status: "unsupported",
      candidates: [],
      excludedExitRows: exitRows,
      diagnostics,
      controlChecks: [],
      hasNativeText,
      visionCalled,
      extractionMethod: EXTRACTION_METHOD,
      totalPageCount,
      processedPageCount,
    };
  }

  const controlChecks = buildControlChecks(assetRows, exitRows, totalRows);

  const reviewRequired =
    diagnostics.some((d) =>
      (
        [
          "UNPARSEABLE_AMOUNT",
          "UNPARSEABLE_DATE",
          "CUMUL_EXCEEDS_COST",
          "UNSUPPORTED_METHOD_VALUE",
          "UNRECOGNIZED_ROW_SKIPPED",
          "PDF_TRUNCATED",
        ] as DepreciationRegisterPdfDiagnosticCode[]
      ).includes(d.code),
    ) || controlChecks.some((c) => c.status === "CONFLICT");

  return {
    status: reviewRequired ? "review_required" : "extracted",
    candidates,
    excludedExitRows: exitRows,
    diagnostics,
    controlChecks,
    totalPageCount,
    processedPageCount,
    hasNativeText,
    visionCalled,
    extractionMethod: EXTRACTION_METHOD,
  };
}
