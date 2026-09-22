/**
 * Lot 4C.1 — extraction bornée XLS/XLSX → CandidateHistoricalAsset[].
 *
 * PROPOSITION DOCUMENTAIRE uniquement.
 * Pas d'Opening, pas de réconciliation 4E, pas de mint d'assetId,
 * pas d'appel aux moteurs amortissement, pas d'ouverture d'historique externe.
 *
 * candidateKey ≠ stable Fiscal AI asset ID.
 * sourceAssetRef = référence métier documentaire si présente (≠ OpeningAsset.id).
 */

import { createConfidenceScore, type ConfidenceScore } from "@/lib/documents/types/confidence-score";
import { normalizeMonetaryValue } from "@/lib/lmnp/services/revenue-monetary-normalize";
import { isDateLikeValue, normalizeDateValue } from "@/lib/lmnp/services/revenus-column-semantics";
import { readSpreadsheetGrid, type SpreadsheetSheetGrid } from "@/lib/lmnp/services/pipelines/revenus/spreadsheet-grid";

import type {
  CandidateAssetClassification,
  CandidateDepreciationMethod,
  CandidateHistoricalAsset,
} from "./asset-candidates";
import {
  extractionImpossibleCandidate,
  missingCandidate,
  presentCandidate,
  type CandidateProvenance,
  type CandidateValue,
} from "./candidate-value";

export type DepreciationRegisterExtractionStatus =
  | "extracted"
  | "review_required"
  | "unsupported";

export type DepreciationRegisterDiagnosticCode =
  | "NO_ELIGIBLE_SHEET"
  | "AMBIGUOUS_SHEET"
  | "AMBIGUOUS_HEADER_ROW"
  | "AMBIGUOUS_CUMULATIVE_COLUMN"
  | "RATE_WITHOUT_DURATION"
  | "ACQUISITION_DATE_ONLY"
  | "BASE_AMORTISSABLE_NOT_GROSS_COST"
  | "CUMUL_EXCEEDS_COST"
  | "DATED_CUMUL_YEAR_MISMATCH"
  | "UNPARSEABLE_AMOUNT"
  | "UNPARSEABLE_DATE"
  | "TOTAL_ROW_SKIPPED"
  | "EMPTY_ROW_SKIPPED"
  | "UNSUPPORTED_METHOD_VALUE"
  | "CLOSING_CUMULATIVE_IGNORED"
  | "DOTATION_IGNORED"
  | "VNC_IGNORED";

export type DepreciationRegisterDiagnostic = {
  code: DepreciationRegisterDiagnosticCode;
  message: string;
  sheetName?: string;
  rowIndex?: number;
  header?: string;
};

export type DepreciationRegisterSheetMeta = {
  sheetName: string;
  headerRowIndex: number;
  headers: string[];
  mappedRoles: Partial<Record<RegisterColumnRole, string>>;
};

export type DepreciationRegisterExtractionResult = {
  status: DepreciationRegisterExtractionStatus;
  candidates: CandidateHistoricalAsset[];
  diagnostics: DepreciationRegisterDiagnostic[];
  sheet?: DepreciationRegisterSheetMeta;
  /** Méthode d'extraction — jamais une validation Opening. */
  extractionMethod: "spreadsheet_depreciation_register_v1";
};

export type ExtractDepreciationRegisterInput = {
  file: File;
  documentId: string;
  /** Exercice cible N — utilisé uniquement pour colonnes cumul datées explicites. */
  targetFiscalYear: number;
};

/** Rôles colonnes V1 — mapping déterministe borné, pas de fuzzy/LLM. */
export type RegisterColumnRole =
  | "asset_ref"
  | "label"
  | "gross_cost"
  | "opening_cumulative"
  | "start_date"
  | "acquisition_date"
  | "duration"
  | "rate"
  | "method"
  | "classification"
  | "ambiguous_cumulative"
  | "closing_cumulative"
  | "dotation"
  | "vnc"
  | "amortizable_base";

const EXTRACTION_METHOD = "spreadsheet_depreciation_register_v1" as const;

const ROLE_ALIASES: Record<
  Exclude<
    RegisterColumnRole,
    "opening_cumulative" // handled with dated patterns
  >,
  readonly string[]
> = {
  asset_ref: [
    "n",
    "no",
    "numero",
    "n immobilisation",
    "numero immobilisation",
    "reference",
    "code immobilisation",
  ],
  label: ["libelle", "designation", "immobilisation"],
  gross_cost: [
    "valeur brute",
    "valeur d origine",
    "valeur origine",
    "prix d acquisition",
    "prix acquisition",
    "cout d acquisition",
    "cout acquisition",
  ],
  start_date: [
    "date mise en service",
    "date de mise en service",
    "debut amortissement",
    "date debut amortissement",
    "date de debut amortissement",
  ],
  acquisition_date: [
    "date acquisition",
    "date d acquisition",
    "date dachat",
    "date achat",
  ],
  duration: [
    "duree",
    "duree amortissement",
    "duree d amortissement",
    "nombre d annees",
    "nombre annees",
  ],
  rate: ["taux", "taux amortissement", "taux d amortissement"],
  method: ["methode", "mode amortissement", "mode d amortissement"],
  classification: [
    "nature",
    "categorie",
    "type immobilisation",
    "type d immobilisation",
  ],
  ambiguous_cumulative: [
    "amortissements cumules",
    "cumul amortissements",
    "cumul",
  ],
  closing_cumulative: [
    "cumul fin",
    "cumul fin exercice",
    "amortissements cumules fin",
    "amortissements cumules fin exercice",
  ],
  dotation: ["dotation", "dotation n", "dotation exercice", "dotation de l exercice"],
  vnc: ["vnc", "valeur nette", "valeur nette comptable"],
  amortizable_base: ["base amortissable", "base d amortissement"],
};

/** Ouverture — aliases exacts (hors formes datées). */
const OPENING_CUMUL_ALIASES: readonly string[] = [
  "amortissements anterieurs",
  "cumul debut",
  "cumul debut exercice",
  "amortissements cumules debut",
  "amortissements cumules debut exercice",
  "amortissements cumules debut d exercice",
  "cumul au 01 01",
];

const TOTAL_LABELS = new Set(["total", "total general", "sous total", "sous-total"]);

const CLASSIFICATION_EXACT: Record<string, CandidateAssetClassification> = {
  terrain: "terrain",
  batiment: "batiment",
  mobilier: "mobilier",
  travaux: "travaux",
};

type ColumnMapping = {
  roleByCol: Map<number, RegisterColumnRole>;
  headerByCol: Map<number, string>;
  roles: Set<RegisterColumnRole>;
};

type SheetCandidate = {
  sheetName: string;
  headerRowIndex: number;
  mapping: ColumnMapping;
  score: number;
};

function normalizeHeader(raw: string): string {
  return raw
    .replace(/\u00a0/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[°º]/g, " ")
    .replace(/['’]/g, " ")
    .replace(/[^a-z0-9/\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchRole(normalizedHeader: string): RegisterColumnRole | null {
  if (!normalizedHeader) return null;

  // Dated opening cumul: "cumul au 01/01" or "cumul au 01/01/2026"
  const datedOpening = normalizedHeader.match(/^cumul au 01\s*\/?\s*01(?:\s*\/?\s*(\d{4}))?$/);
  if (datedOpening) return "opening_cumulative";
  // After punctuation→space: "cumul au 01 01" or "cumul au 01 01 2026"
  const datedOpeningSpaced = normalizedHeader.match(/^cumul au 01 01(?: (\d{4}))?$/);
  if (datedOpeningSpaced) return "opening_cumulative";

  for (const alias of OPENING_CUMUL_ALIASES) {
    if (normalizedHeader === alias) return "opening_cumulative";
  }

  // Longer / more specific roles first to avoid "cumul" swallowing "cumul fin"
  const order: RegisterColumnRole[] = [
    "closing_cumulative",
    "opening_cumulative",
    "ambiguous_cumulative",
    "amortizable_base",
    "gross_cost",
    "start_date",
    "acquisition_date",
    "duration",
    "rate",
    "method",
    "classification",
    "dotation",
    "vnc",
    "asset_ref",
    "label",
  ];

  for (const role of order) {
    if (role === "opening_cumulative") continue;
    const aliases = ROLE_ALIASES[role];
    for (const alias of aliases) {
      if (normalizedHeader === alias) return role;
    }
  }

  // "n°" alone often normalizes oddly — accept single-letter / numero variants already listed.
  // "immobilisation" as label is in aliases; avoid matching bare "amortissement".
  return null;
}

function extractDatedCumulYear(normalizedHeader: string): number | null {
  const m =
    normalizedHeader.match(/^cumul au 01\s*\/?\s*01\s*\/?\s*(\d{4})$/) ??
    normalizedHeader.match(/^cumul au 01 01 (\d{4})$/);
  if (!m?.[1]) return null;
  return Number.parseInt(m[1], 10);
}

function scoreMapping(roles: Set<RegisterColumnRole>): number | null {
  if (!roles.has("label") || !roles.has("gross_cost")) return null;
  const extras = (
    ["opening_cumulative", "start_date", "duration", "asset_ref"] as const
  ).filter((r) => roles.has(r)).length;
  if (extras < 1) return null;
  let score = 10 + extras * 3;
  if (roles.has("opening_cumulative")) score += 5;
  if (roles.has("method")) score += 1;
  if (roles.has("classification")) score += 1;
  return score;
}

function mapHeaderRow(headers: string[]): ColumnMapping | null {
  const roleByCol = new Map<number, RegisterColumnRole>();
  const headerByCol = new Map<number, string>();
  const roles = new Set<RegisterColumnRole>();
  const claimedRoles = new Set<RegisterColumnRole>();

  for (let col = 0; col < headers.length; col += 1) {
    const raw = headers[col] ?? "";
    const normalized = normalizeHeader(raw);
    const role = matchRole(normalized);
    if (!role) continue;
    // One column per role (first wins) — deterministic, no fuzzy conflict resolution.
    if (claimedRoles.has(role)) continue;
    claimedRoles.add(role);
    roleByCol.set(col, role);
    headerByCol.set(col, raw.trim());
    roles.add(role);
  }

  if (scoreMapping(roles) == null) return null;
  return { roleByCol, headerByCol, roles };
}

function findHeaderCandidates(grid: string[][]): Array<{ rowIndex: number; mapping: ColumnMapping; score: number }> {
  const out: Array<{ rowIndex: number; mapping: ColumnMapping; score: number }> = [];
  const scanLimit = Math.min(grid.length, 30);
  for (let rowIndex = 0; rowIndex < scanLimit; rowIndex += 1) {
    const row = grid[rowIndex] ?? [];
    const mapping = mapHeaderRow(row);
    if (!mapping) continue;
    const score = scoreMapping(mapping.roles);
    if (score == null) continue;
    out.push({ rowIndex, mapping, score });
  }
  return out;
}

function selectSheets(sheets: SpreadsheetSheetGrid[]): {
  selected?: SheetCandidate;
  diagnostics: DepreciationRegisterDiagnostic[];
  status?: DepreciationRegisterExtractionStatus;
} {
  const diagnostics: DepreciationRegisterDiagnostic[] = [];
  const eligible: SheetCandidate[] = [];

  for (const sheet of sheets) {
    const headers = findHeaderCandidates(sheet.grid);
    if (headers.length === 0) continue;
    if (headers.length > 1) {
      const top = Math.max(...headers.map((h) => h.score));
      const tied = headers.filter((h) => h.score === top);
      if (tied.length > 1) {
        diagnostics.push({
          code: "AMBIGUOUS_HEADER_ROW",
          message: `Plusieurs lignes d'en-tête candidates équivalentes dans la feuille « ${sheet.sheetName} ».`,
          sheetName: sheet.sheetName,
        });
        continue;
      }
    }
    const best = headers.reduce((a, b) => (b.score > a.score ? b : a));
    eligible.push({
      sheetName: sheet.sheetName,
      headerRowIndex: best.rowIndex,
      mapping: best.mapping,
      score: best.score,
    });
  }

  if (eligible.length === 0) {
    diagnostics.push({
      code: "NO_ELIGIBLE_SHEET",
      message: "Aucune feuille avec en-têtes registre immobilisations reconnaissables (libellé + valeur brute + signal plan/cumul/réf).",
    });
    return { diagnostics, status: "unsupported" };
  }

  if (eligible.length > 1) {
    diagnostics.push({
      code: "AMBIGUOUS_SHEET",
      message: `Plusieurs feuilles candidates (${eligible.map((e) => e.sheetName).join(", ")}) — aucune sélection automatique.`,
    });
    return { diagnostics, status: "review_required" };
  }

  return { selected: eligible[0], diagnostics };
}

/**
 * Parse montant registre incluant 0 explicite.
 * Cellule vide → null (missing). Jamais empty → 0.
 * `normalizeMonetaryValue` refuse ≤0 — chemin zéro local.
 */
export function parseRegisterAmount(raw: string): number | null {
  const trimmed = raw.trim().replace(/\u00a0/g, " ");
  if (!trimmed) return null;

  const positive = normalizeMonetaryValue(trimmed);
  if (positive && Number.isFinite(positive.parsedAmount) && positive.parsedAmount > 0) {
    return positive.parsedAmount;
  }

  const zeroLike = trimmed
    .replace(/€/gi, "")
    .replace(/\bEUR\b/gi, "")
    .replace(/\beuros?\b/gi, "")
    .replace(/[()\s]/g, "")
    .replace(/,/g, ".");
  if (/^-?0+(\.0+)?$/.test(zeroLike)) return 0;

  // Entier / décimal plain y compris 0 (ex. cellule Excel numérique "0")
  if (/^-?\d+([.,]\d+)?$/.test(trimmed.replace(/\s/g, ""))) {
    const n = Number.parseFloat(trimmed.replace(/\s/g, "").replace(",", "."));
    if (Number.isFinite(n) && n >= 0) return Math.round(n * 100) / 100;
  }

  return null;
}

function excelSerialToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 73050) return null;
  const utcMs = (serial - 25569) * 86_400_000;
  const date = new Date(utcMs);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getUTCFullYear();
  if (year < 1900 || year > 2100) return null;
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Sortie ISO YYYY-MM-DD pour alignement Opening / fixtures 4B. */
export function parseRegisterStartDate(raw: string): string | null {
  const trimmed = raw.trim().replace(/\u00a0/g, " ");
  if (!trimmed) return null;

  if (/^\d+$/.test(trimmed)) {
    const iso = excelSerialToIso(Number.parseInt(trimmed, 10));
    if (iso) return iso;
  }

  if (!isDateLikeValue(trimmed)) return null;
  const dmy = normalizeDateValue(trimmed);
  if (!dmy) return null;
  const m = dmy.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export function parseRegisterDurationYears(raw: string): number | null {
  const trimmed = raw.trim().replace(/\u00a0/g, " ");
  if (!trimmed) return null;
  const m = trimmed.match(/^(\d+(?:[.,]\d+)?)\s*(ans?|annees?|années?)?$/i);
  if (!m?.[1]) return null;
  const n = Number.parseFloat(m[1].replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function parseMethod(raw: string): CandidateDepreciationMethod | "unrecognized" | null {
  const n = normalizeHeader(raw);
  if (!n) return null;
  if (/^(lineaire|linear|lin)$/.test(n) || n.includes("lineaire")) return "lineaire";
  if (/^(degressif|degressive)$/.test(n) || n.includes("degressif")) return "degressif";
  return "unrecognized";
}

function parseClassification(raw: string): CandidateAssetClassification | null {
  const n = normalizeHeader(raw);
  if (!n) return null;
  return CLASSIFICATION_EXACT[n] ?? null;
}

function isTotalLabel(raw: string): boolean {
  const n = normalizeHeader(raw);
  return TOTAL_LABELS.has(n);
}

function cellAt(row: string[], col: number | undefined): string {
  if (col === undefined) return "";
  return (row[col] ?? "").trim();
}

function colFor(mapping: ColumnMapping, role: RegisterColumnRole): number | undefined {
  for (const [col, r] of mapping.roleByCol) {
    if (r === role) return col;
  }
  return undefined;
}

function buildConfidence(factors: string[], base = 0.9): ConfidenceScore {
  const penalty = Math.min(0.5, factors.length * 0.08);
  return createConfidenceScore(base - penalty, factors);
}

function makeProv(
  documentId: string,
  sheetName: string,
  rowIndex: number,
  colIndex: number | undefined,
  fieldLabel: string | undefined,
  raw: string,
  factors: string[],
): CandidateProvenance {
  const colPart = colIndex === undefined ? "" : `:${colIndex}`;
  return {
    documentId,
    documentRole: "depreciation_register",
    fieldLabel,
    sourceRef: `${sheetName}:${rowIndex}${colPart}`,
    extractionMethod: EXTRACTION_METHOD,
    confidence: buildConfidence(factors),
    evidence: { snippet: raw.slice(0, 200) },
    fieldSource: "extracted",
  };
}

function presentOrMissingNumber(
  raw: string,
  documentId: string,
  sheetName: string,
  rowIndex: number,
  col: number | undefined,
  fieldLabel: string | undefined,
  factors: string[],
  diagnostics: DepreciationRegisterDiagnostic[],
  unparseableCode: DepreciationRegisterDiagnosticCode = "UNPARSEABLE_AMOUNT",
): CandidateValue<number> {
  if (!raw) {
    return missingCandidate("cellule vide", {
      documentId,
      documentRole: "depreciation_register",
      fieldLabel,
      sourceRef: `${sheetName}:${rowIndex}${col === undefined ? "" : `:${col}`}`,
    });
  }
  const amount = parseRegisterAmount(raw);
  if (amount === null) {
    diagnostics.push({
      code: unparseableCode,
      message: `Montant non parseable « ${raw} ».`,
      sheetName,
      rowIndex,
      header: fieldLabel,
    });
    return extractionImpossibleCandidate("montant non parseable", {
      documentId,
      documentRole: "depreciation_register",
      fieldLabel,
      sourceRef: `${sheetName}:${rowIndex}${col === undefined ? "" : `:${col}`}`,
    });
  }
  return presentCandidate(amount, "direct", makeProv(documentId, sheetName, rowIndex, col, fieldLabel, raw, factors));
}

function extractRows(
  sheet: SpreadsheetSheetGrid,
  selected: SheetCandidate,
  documentId: string,
  targetFiscalYear: number,
): {
  candidates: CandidateHistoricalAsset[];
  diagnostics: DepreciationRegisterDiagnostic[];
  reviewRequired: boolean;
} {
  const diagnostics: DepreciationRegisterDiagnostic[] = [];
  let reviewRequired = false;
  const { mapping, headerRowIndex } = selected;
  const { roles } = mapping;

  if (roles.has("ambiguous_cumulative") && !roles.has("opening_cumulative")) {
    const ambCol = colFor(mapping, "ambiguous_cumulative");
    diagnostics.push({
      code: "AMBIGUOUS_CUMULATIVE_COLUMN",
      message: "Colonne de cumul sans notion début/antérieur — non mappée vers cumulOuverture.",
      sheetName: sheet.sheetName,
      header: ambCol === undefined ? undefined : mapping.headerByCol.get(ambCol),
    });
    reviewRequired = true;
  }

  if (roles.has("closing_cumulative")) {
    diagnostics.push({
      code: "CLOSING_CUMULATIVE_IGNORED",
      message: "Colonne cumul fin détectée — non mappée vers cumulOuverture.",
      sheetName: sheet.sheetName,
    });
  }
  if (roles.has("dotation")) {
    diagnostics.push({
      code: "DOTATION_IGNORED",
      message: "Colonne dotation détectée — non mappée vers cumulOuverture.",
      sheetName: sheet.sheetName,
    });
  }
  if (roles.has("vnc")) {
    diagnostics.push({
      code: "VNC_IGNORED",
      message: "Colonne VNC détectée — non mappée vers coutBrut ni cumulOuverture.",
      sheetName: sheet.sheetName,
    });
  }
  if (roles.has("amortizable_base") && !roles.has("gross_cost")) {
    // gross_cost is required for eligibility — this branch is defensive
    diagnostics.push({
      code: "BASE_AMORTISSABLE_NOT_GROSS_COST",
      message: "Base amortissable seule — non assimilée à coutBrut.",
      sheetName: sheet.sheetName,
    });
    reviewRequired = true;
  } else if (roles.has("amortizable_base")) {
    diagnostics.push({
      code: "BASE_AMORTISSABLE_NOT_GROSS_COST",
      message: "Colonne base amortissable ignorée pour coutBrut (valeur brute exigée).",
      sheetName: sheet.sheetName,
    });
  }

  if (roles.has("acquisition_date") && !roles.has("start_date")) {
    diagnostics.push({
      code: "ACQUISITION_DATE_ONLY",
      message: "Date acquisition présente sans date mise en service — startDate reste missing.",
      sheetName: sheet.sheetName,
    });
    reviewRequired = true;
  }

  if (roles.has("rate") && !roles.has("duration")) {
    diagnostics.push({
      code: "RATE_WITHOUT_DURATION",
      message: "Taux présent sans durée — aucune conversion taux→durée.",
      sheetName: sheet.sheetName,
    });
    reviewRequired = true;
  }

  // Dated opening cumul year check
  const openingCol = colFor(mapping, "opening_cumulative");
  if (openingCol !== undefined) {
    const header = mapping.headerByCol.get(openingCol) ?? "";
    const year = extractDatedCumulYear(normalizeHeader(header));
    if (year !== null && year !== targetFiscalYear) {
      diagnostics.push({
        code: "DATED_CUMUL_YEAR_MISMATCH",
        message: `Colonne cumul datée ${year} incompatible avec exercice cible ${targetFiscalYear}.`,
        sheetName: sheet.sheetName,
        header,
      });
      reviewRequired = true;
    }
  }

  const labelCol = colFor(mapping, "label");
  const grossCol = colFor(mapping, "gross_cost");
  const cumulCol = roles.has("opening_cumulative") ? openingCol : undefined;
  const startCol = colFor(mapping, "start_date");
  const durationCol = colFor(mapping, "duration");
  const methodCol = colFor(mapping, "method");
  const classCol = colFor(mapping, "classification");
  const refCol = colFor(mapping, "asset_ref");

  const candidates: CandidateHistoricalAsset[] = [];

  for (let rowIndex = headerRowIndex + 1; rowIndex < sheet.grid.length; rowIndex += 1) {
    const row = sheet.grid[rowIndex] ?? [];
    const hasAny = row.some((c) => c.trim().length > 0);
    if (!hasAny) {
      diagnostics.push({
        code: "EMPTY_ROW_SKIPPED",
        message: "Ligne vide ignorée.",
        sheetName: sheet.sheetName,
        rowIndex,
      });
      continue;
    }

    const labelRaw = cellAt(row, labelCol);
    const grossRaw = cellAt(row, grossCol);

    if (isTotalLabel(labelRaw)) {
      diagnostics.push({
        code: "TOTAL_ROW_SKIPPED",
        message: `Ligne agrégée ignorée (« ${labelRaw} »).`,
        sheetName: sheet.sheetName,
        rowIndex,
      });
      continue;
    }

    // Ligne sans libellé et sans montant exploitable → ignore
    if (!labelRaw && !grossRaw) {
      continue;
    }

    const factors: string[] = [];
    const candidateKey = `reg:${sheet.sheetName}:${rowIndex}`;
    // candidateKey ≠ stable Fiscal AI asset ID ; ≠ label seul.

    const sourceAssetRefRaw = cellAt(row, refCol);
    const sourceAssetRef =
      sourceAssetRefRaw.length > 0 ? sourceAssetRefRaw : undefined;

    const label: CandidateValue<string> = labelRaw
      ? presentCandidate(
          labelRaw,
          "direct",
          makeProv(
            documentId,
            sheet.sheetName,
            rowIndex,
            labelCol,
            mapping.headerByCol.get(labelCol!),
            labelRaw,
            factors,
          ),
        )
      : missingCandidate("libellé absent", {
          documentId,
          documentRole: "depreciation_register",
          sourceRef: `${sheet.sheetName}:${rowIndex}`,
        });

    const coutBrut = presentOrMissingNumber(
      grossRaw,
      documentId,
      sheet.sheetName,
      rowIndex,
      grossCol,
      mapping.headerByCol.get(grossCol!),
      factors,
      diagnostics,
    );

    let cumulOuverture: CandidateValue<number>;
    if (cumulCol === undefined) {
      cumulOuverture = missingCandidate(
        roles.has("ambiguous_cumulative")
          ? "cumul ambigu — non mappé"
          : "colonne cumul ouverture absente",
        {
          documentId,
          documentRole: "depreciation_register",
          sourceRef: `${sheet.sheetName}:${rowIndex}`,
        },
      );
      if (roles.has("ambiguous_cumulative")) factors.push("ambiguous_cumulative");
    } else {
      const cumulHeader = mapping.headerByCol.get(cumulCol);
      const year = extractDatedCumulYear(normalizeHeader(cumulHeader ?? ""));
      if (year !== null && year !== targetFiscalYear) {
        cumulOuverture = missingCandidate("année cumul incompatible avec exercice cible", {
          documentId,
          documentRole: "depreciation_register",
          fieldLabel: cumulHeader,
          sourceRef: `${sheet.sheetName}:${rowIndex}:${cumulCol}`,
        });
        factors.push("dated_cumul_year_mismatch");
      } else {
        cumulOuverture = presentOrMissingNumber(
          cellAt(row, cumulCol),
          documentId,
          sheet.sheetName,
          rowIndex,
          cumulCol,
          cumulHeader,
          factors,
          diagnostics,
        );
      }
    }

    // Structural: cumul > cost
    if (
      coutBrut.status === "present" &&
      cumulOuverture.status === "present" &&
      cumulOuverture.value > coutBrut.value
    ) {
      diagnostics.push({
        code: "CUMUL_EXCEEDS_COST",
        message: `cumulOuverture (${cumulOuverture.value}) > coutBrut (${coutBrut.value}) — aucune correction.`,
        sheetName: sheet.sheetName,
        rowIndex,
      });
      reviewRequired = true;
      factors.push("cumul_exceeds_cost");
    }

    let startDate: CandidateValue<string>;
    if (startCol === undefined) {
      startDate = missingCandidate(
        roles.has("acquisition_date")
          ? "date acquisition ≠ date mise en service"
          : "date mise en service absente",
        {
          documentId,
          documentRole: "depreciation_register",
          sourceRef: `${sheet.sheetName}:${rowIndex}`,
        },
      );
    } else {
      const startRaw = cellAt(row, startCol);
      if (!startRaw) {
        startDate = missingCandidate("cellule date vide", {
          documentId,
          documentRole: "depreciation_register",
          fieldLabel: mapping.headerByCol.get(startCol),
          sourceRef: `${sheet.sheetName}:${rowIndex}:${startCol}`,
        });
      } else {
        const iso = parseRegisterStartDate(startRaw);
        if (!iso) {
          diagnostics.push({
            code: "UNPARSEABLE_DATE",
            message: `Date non parseable « ${startRaw} ».`,
            sheetName: sheet.sheetName,
            rowIndex,
          });
          startDate = extractionImpossibleCandidate("date non parseable", {
            documentId,
            documentRole: "depreciation_register",
            fieldLabel: mapping.headerByCol.get(startCol),
            sourceRef: `${sheet.sheetName}:${rowIndex}:${startCol}`,
          });
          factors.push("partial_date");
        } else {
          startDate = presentCandidate(
            iso,
            "direct",
            makeProv(
              documentId,
              sheet.sheetName,
              rowIndex,
              startCol,
              mapping.headerByCol.get(startCol),
              startRaw,
              factors,
            ),
          );
        }
      }
    }

    let durationYears: CandidateValue<number>;
    if (durationCol === undefined) {
      durationYears = missingCandidate(
        roles.has("rate") ? "taux sans durée — conversion interdite" : "durée absente",
        {
          documentId,
          documentRole: "depreciation_register",
          sourceRef: `${sheet.sheetName}:${rowIndex}`,
        },
      );
    } else {
      const durRaw = cellAt(row, durationCol);
      if (!durRaw) {
        durationYears = missingCandidate("cellule durée vide", {
          documentId,
          documentRole: "depreciation_register",
          fieldLabel: mapping.headerByCol.get(durationCol),
          sourceRef: `${sheet.sheetName}:${rowIndex}:${durationCol}`,
        });
      } else {
        const years = parseRegisterDurationYears(durRaw);
        if (years === null) {
          durationYears = extractionImpossibleCandidate("durée non parseable", {
            documentId,
            documentRole: "depreciation_register",
            fieldLabel: mapping.headerByCol.get(durationCol),
            sourceRef: `${sheet.sheetName}:${rowIndex}:${durationCol}`,
          });
        } else {
          durationYears = presentCandidate(
            years,
            "direct",
            makeProv(
              documentId,
              sheet.sheetName,
              rowIndex,
              durationCol,
              mapping.headerByCol.get(durationCol),
              durRaw,
              factors,
            ),
          );
        }
      }
    }

    let method: CandidateValue<CandidateDepreciationMethod>;
    if (methodCol === undefined) {
      method = missingCandidate("méthode absente — linéaire non inventé", {
        documentId,
        documentRole: "depreciation_register",
        sourceRef: `${sheet.sheetName}:${rowIndex}`,
      });
    } else {
      const methodRaw = cellAt(row, methodCol);
      if (!methodRaw) {
        method = missingCandidate("cellule méthode vide", {
          documentId,
          documentRole: "depreciation_register",
          fieldLabel: mapping.headerByCol.get(methodCol),
          sourceRef: `${sheet.sheetName}:${rowIndex}:${methodCol}`,
        });
      } else {
        const parsed = parseMethod(methodRaw);
        if (parsed === null || parsed === "unrecognized") {
          diagnostics.push({
            code: "UNSUPPORTED_METHOD_VALUE",
            message: `Méthode non reconnue « ${methodRaw} » — préservée comme autre.`,
            sheetName: sheet.sheetName,
            rowIndex,
          });
          method = presentCandidate(
            "autre",
            "direct",
            makeProv(
              documentId,
              sheet.sheetName,
              rowIndex,
              methodCol,
              mapping.headerByCol.get(methodCol),
              methodRaw,
              [...factors, "unsupported_method"],
            ),
          );
          reviewRequired = true;
        } else {
          method = presentCandidate(
            parsed,
            "direct",
            makeProv(
              documentId,
              sheet.sheetName,
              rowIndex,
              methodCol,
              mapping.headerByCol.get(methodCol),
              methodRaw,
              factors,
            ),
          );
        }
      }
    }

    const prorataConvention = missingCandidate(
      "convention de prorata absente du registre — non inférée",
      {
        documentId,
        documentRole: "depreciation_register",
        sourceRef: `${sheet.sheetName}:${rowIndex}`,
      },
    );

    let classification: CandidateValue<CandidateAssetClassification>;
    let nonAmortizable: CandidateValue<boolean>;
    if (classCol === undefined) {
      classification = missingCandidate("classification absente — non déduite du libellé", {
        documentId,
        documentRole: "depreciation_register",
        sourceRef: `${sheet.sheetName}:${rowIndex}`,
      });
      nonAmortizable = missingCandidate("nonAmortizable inconnu sans classification explicite", {
        documentId,
        documentRole: "depreciation_register",
        sourceRef: `${sheet.sheetName}:${rowIndex}`,
      });
    } else {
      const classRaw = cellAt(row, classCol);
      if (!classRaw) {
        classification = missingCandidate("cellule classification vide", {
          documentId,
          documentRole: "depreciation_register",
          fieldLabel: mapping.headerByCol.get(classCol),
          sourceRef: `${sheet.sheetName}:${rowIndex}:${classCol}`,
        });
        nonAmortizable = missingCandidate("classification vide", {
          documentId,
          documentRole: "depreciation_register",
          sourceRef: `${sheet.sheetName}:${rowIndex}:${classCol}`,
        });
      } else {
        const parsed = parseClassification(classRaw);
        if (!parsed) {
          classification = missingCandidate(`classification inconnue « ${classRaw} »`, {
            documentId,
            documentRole: "depreciation_register",
            fieldLabel: mapping.headerByCol.get(classCol),
            sourceRef: `${sheet.sheetName}:${rowIndex}:${classCol}`,
          });
          nonAmortizable = missingCandidate("classification non mappable", {
            documentId,
            documentRole: "depreciation_register",
            sourceRef: `${sheet.sheetName}:${rowIndex}:${classCol}`,
          });
        } else {
          classification = presentCandidate(
            parsed,
            "direct",
            makeProv(
              documentId,
              sheet.sheetName,
              rowIndex,
              classCol,
              mapping.headerByCol.get(classCol),
              classRaw,
              factors,
            ),
          );
          nonAmortizable = presentCandidate(
            parsed === "terrain",
            "direct",
            makeProv(
              documentId,
              sheet.sheetName,
              rowIndex,
              classCol,
              mapping.headerByCol.get(classCol),
              classRaw,
              factors,
            ),
          );
        }
      }
    }

    const propertyId = missingCandidate(
      "propertyId non assigné — aucun fallback mono-bien / properties[0]",
      {
        documentId,
        documentRole: "depreciation_register",
        sourceRef: `${sheet.sheetName}:${rowIndex}`,
      },
    );

    // Skip rows that have neither label nor any monetary signal (defensive)
    if (label.status !== "present" && coutBrut.status !== "present") {
      continue;
    }

    candidates.push({
      candidateKey,
      ...(sourceAssetRef !== undefined ? { sourceAssetRef } : {}),
      label,
      coutBrut,
      cumulOuverture,
      startDate,
      durationYears,
      method,
      prorataConvention,
      classification,
      nonAmortizable,
      propertyId,
    });
  }

  return { candidates, diagnostics, reviewRequired };
}

/**
 * Point d'entrée Lot 4C.1.
 * documentRole forcé à depreciation_register (classifier loan_schedule hors scope).
 */
export async function extractDepreciationRegisterFromSpreadsheet(
  input: ExtractDepreciationRegisterInput,
): Promise<DepreciationRegisterExtractionResult> {
  const sheets = await readSpreadsheetGrid(input.file);
  const selection = selectSheets(sheets);

  if (!selection.selected) {
    return {
      status: selection.status ?? "unsupported",
      candidates: [],
      diagnostics: selection.diagnostics,
      extractionMethod: EXTRACTION_METHOD,
    };
  }

  const sheet = sheets.find((s) => s.sheetName === selection.selected!.sheetName);
  if (!sheet) {
    return {
      status: "unsupported",
      candidates: [],
      diagnostics: [
        ...selection.diagnostics,
        {
          code: "NO_ELIGIBLE_SHEET",
          message: "Feuille sélectionnée introuvable après lecture.",
        },
      ],
      extractionMethod: EXTRACTION_METHOD,
    };
  }

  const extracted = extractRows(
    sheet,
    selection.selected,
    input.documentId,
    input.targetFiscalYear,
  );

  const diagnostics = [...selection.diagnostics, ...extracted.diagnostics];
  const status: DepreciationRegisterExtractionStatus = extracted.reviewRequired
    ? "review_required"
    : "extracted";

  const mappedRoles: Partial<Record<RegisterColumnRole, string>> = {};
  for (const [col, role] of selection.selected.mapping.roleByCol) {
    mappedRoles[role] = selection.selected.mapping.headerByCol.get(col) ?? "";
  }

  return {
    status,
    candidates: extracted.candidates,
    diagnostics,
    sheet: {
      sheetName: selection.selected.sheetName,
      headerRowIndex: selection.selected.headerRowIndex,
      headers: sheet.grid[selection.selected.headerRowIndex] ?? [],
      mappedRoles,
    },
    extractionMethod: EXTRACTION_METHOD,
  };
}

/** Exposé pour tests unitaires de normalisation header (déterministe). */
export function normalizeRegisterHeaderForTest(raw: string): string {
  return normalizeHeader(raw);
}

export function matchRegisterHeaderRoleForTest(raw: string): RegisterColumnRole | null {
  return matchRole(normalizeHeader(raw));
}
