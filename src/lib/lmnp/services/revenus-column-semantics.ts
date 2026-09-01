import type { RevenueTransactionCategory } from "../types";
import {
  hasCurrencyContext,
  hasMonetaryDecimalStructure,
  looksLikeMonetaryAmount,
  normalizeMonetaryValue,
} from "./revenue-monetary-normalize";
import {
  categoryFromColumnHeader,
  classifyRevenueHeader,
  isProtectedMonetaryHeader,
  logRevenueHeaderClassification,
} from "./revenus-header-classification";
import type { RevenueGridColumn } from "./revenus-row-mapping";

export {
  hasCurrencyContext,
  looksLikeMonetaryAmount,
  normalizeMonetaryValue,
} from "./revenue-monetary-normalize";

export type ColumnSemanticType = "date" | "amount" | "label" | "month" | "text";

export type ColumnTargetField =
  | "transactionDate"
  | "monthKey"
  | "loyers"
  | "autresRevenus"
  | "charges"
  | "none";

export type LockedColumn = {
  index: number;
  header: string;
  lockedType: ColumnSemanticType;
  targetField: ColumnTargetField;
  monetaryHeader: boolean;
};

const MAX_REASONABLE_MONTHLY_AMOUNT = 50_000;

const DATE_TOKEN_PATTERNS = [
  /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/,
  /^\d{4}[/.-]\d{1,2}[/.-]\d{1,2}$/,
  /^\d{1,2}[/.-]\d{1,2}[/.-]\d{4}$/,
];

function normalizeHeader(header: string): string {
  return header
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function logRevenueColumnLock(params: {
  index: number;
  header: string;
  lockedType: ColumnSemanticType;
  targetField: ColumnTargetField;
  source: "header" | "content" | "override";
}): void {
  console.log("[revenue-column-lock]", {
    index: params.index,
    header: params.header,
    lockedType: params.lockedType,
    targetField: params.targetField,
    source: params.source,
  });
}

export function logRevenueDateRejected(params: {
  rawValue: string;
  columnType: ColumnSemanticType;
  targetField: ColumnTargetField;
  header: string;
  reason: string;
}): void {
  console.log("[revenue-date-rejected]", {
    rawValue: params.rawValue,
    inferredColumnType: params.columnType,
    targetField: params.targetField,
    header: params.header,
    rejectionReason: params.reason,
  });
}

export function logRevenueMoneyAccepted(params: {
  rawValue: string;
  columnType: ColumnSemanticType;
  targetField: ColumnTargetField;
  header: string;
  amount: number;
}): void {
  console.log("[revenue-money-accepted]", {
    rawValue: params.rawValue,
    inferredColumnType: params.columnType,
    targetField: params.targetField,
    header: params.header,
    amount: params.amount,
  });
}

export function logRevenueColumnSemantic(params: {
  header: string;
  rawValue: string;
  parsedType: ColumnSemanticType;
  targetField: ColumnTargetField;
  accepted?: boolean;
  reason?: string;
}): void {
  console.log("[revenue-column-semantic]", {
    header: params.header,
    rawValue: params.rawValue,
    parsedType: params.parsedType,
    targetField: params.targetField,
    accepted: params.accepted ?? false,
    reason: params.reason ?? null,
  });
}

/**
 * Une vraie date a TOUJOURS au moins deux séparateurs entre trois groupes de
 * chiffres (JJ/MM/AAAA, AAAA-MM-JJ...) — jamais un seul. Un simple signe "-"
 * en tête d'un nombre négatif ("-1200") n'est jamais un séparateur de date
 * (Cycle 15A). Un point décimal isolé ("1000.5", forme que prend TOUT montant
 * non entier une fois passé par `String(nombre)` en JavaScript, quelle que
 * soit sa saisie d'origine — virgule ou point) n'en est pas un non plus : le
 * correctif Cycle 15A, en n'exigeant qu'un seul séparateur, confondait les
 * deux et faisait disparaître silencieusement tout montant décimal non entier
 * du pipeline structuré — régression trouvée et corrigée au Cycle 17.
 */
export function hadDateSeparators(raw: string): boolean {
  return /\d[/.-]\d+[/.-]\d/.test(raw.trim());
}

function digitsOnly(raw: string): string {
  return raw.replace(/[^\d]/g, "");
}

function isValidCalendarParts(day: number, month: number, year: number): boolean {
  return day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1900 && year <= 2100;
}

function tryCalendarLayout(
  digits: string,
  dayLen: number,
  monthLen: number,
  yearLen: number,
): boolean {
  if (digits.length !== dayLen + monthLen + yearLen) return false;
  const day = Number.parseInt(digits.slice(0, dayLen), 10);
  const month = Number.parseInt(digits.slice(dayLen, dayLen + monthLen), 10);
  const year = Number.parseInt(digits.slice(dayLen + monthLen), 10);
  const normalizedYear = yearLen === 2 ? (year >= 70 ? 1900 + year : 2000 + year) : year;
  return isValidCalendarParts(day, month, normalizedYear);
}

export function looksLikeCalendarInteger(raw: string): boolean {
  const trimmed = raw.trim();
  if (hadDateSeparators(trimmed)) return true;

  const digits = digitsOnly(trimmed);
  if (digits.length < 6 || digits.length > 8 || !/^\d+$/.test(digits)) return false;

  const layouts: Array<[number, number, number]> = [
    [2, 2, 4],
    [1, 2, 4],
    [2, 1, 4],
    [1, 1, 4],
    [2, 2, 2],
    [1, 2, 2],
  ];

  return layouts.some(([dayLen, monthLen, yearLen]) =>
    tryCalendarLayout(digits, dayLen, monthLen, yearLen),
  );
}

export function isDateLikeValue(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;

  if (looksLikeMonetaryAmount(trimmed)) {
    return false;
  }

  if (DATE_TOKEN_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return true;
  }

  if (hadDateSeparators(trimmed)) {
    return true;
  }

  return looksLikeCalendarInteger(trimmed);
}

function parseDateDigits(
  digits: string,
  layout: "ddmmyyyy" | "yyyymmdd",
): { day: number; month: number; year: number } | null {
  let day: number;
  let month: number;
  let year: number;

  if (layout === "ddmmyyyy") {
    day = Number.parseInt(digits.slice(0, 2), 10);
    month = Number.parseInt(digits.slice(2, 4), 10);
    year = Number.parseInt(digits.slice(4, 8), 10);
  } else {
    year = Number.parseInt(digits.slice(0, 4), 10);
    month = Number.parseInt(digits.slice(4, 6), 10);
    day = Number.parseInt(digits.slice(6, 8), 10);
  }

  if (!isValidCalendarParts(day, month, year)) return null;
  return { day, month, year };
}

export function normalizeDateValue(raw: string): string | null {
  const trimmed = raw.trim();
  if (!isDateLikeValue(trimmed)) return null;

  // Cycle 18 — un suffixe heure optionnel ("15/06/2025 08:30", cellule
  // datetime native LibreOffice/Excel) est toléré puis ignoré : la fiscalité
  // s'attache au jour calendaire, jamais à l'heure. Sans ce suffixe optionnel,
  // ces 3 motifs (ancrés en fin de chaîne) échouaient tous et la date entière,
  // heure comprise, retombait inchangée jusqu'à parseEventDate() en aval — où
  // `date.split("/").reverse().join("-")` la corrompait en une chaîne non-ISO
  // que `new Date()` acceptait quand même, silencieusement, en un mois erroné.
  for (const pattern of [
    /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/,
    /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/,
    /^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/,
  ]) {
    const match = trimmed.match(pattern);
    if (!match) continue;

    if (match[1]?.length === 4) {
      const year = match[1];
      const month = match[2]?.padStart(2, "0") ?? "01";
      const day = match[3]?.padStart(2, "0") ?? "01";
      return `${day}/${month}/${year}`;
    }

    const day = match[1]?.padStart(2, "0") ?? "01";
    const month = match[2]?.padStart(2, "0") ?? "01";
    let year = match[3] ?? "2000";
    if (year.length === 2) {
      year = Number.parseInt(year, 10) >= 70 ? `19${year}` : `20${year}`;
    }
    return `${day}/${month}/${year}`;
  }

  const digits = digitsOnly(trimmed);
  if (digits.length >= 6) {
    if (digits.length === 8) {
      const ddMmYyyy = parseDateDigits(digits, "ddmmyyyy");
      if (ddMmYyyy) {
        return `${String(ddMmYyyy.day).padStart(2, "0")}/${String(ddMmYyyy.month).padStart(2, "0")}/${ddMmYyyy.year}`;
      }
    }

    const layouts: Array<[number, number, number]> = [
      [2, 2, 4],
      [1, 2, 4],
      [2, 1, 4],
      [1, 1, 4],
    ];
    for (const [dayLen, monthLen, yearLen] of layouts) {
      if (digits.length !== dayLen + monthLen + yearLen) continue;
      const day = Number.parseInt(digits.slice(0, dayLen), 10);
      const month = Number.parseInt(digits.slice(dayLen, dayLen + monthLen), 10);
      let year = Number.parseInt(digits.slice(dayLen + monthLen), 10);
      if (yearLen === 2) year = year >= 70 ? 1900 + year : 2000 + year;
      if (isValidCalendarParts(day, month, year)) {
        return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
      }
    }
  }

  // Cycle 17/18 — ODS (SheetJS) : une cellule date native peut restituer une
  // chaîne ISO 8601 complète ("2025-04-04T22:00:00.000Z") au lieu d'un format
  // reconnu ci-dessus — l'aller-retour d'écriture/lecture ODS ne préserve pas
  // le format personnalisé de la cellule et retombe sur .w au format ISO.
  //
  // Un vrai fichier .ods produit par LibreOffice encode une date native SANS
  // désignateur de fuseau ("2025-01-01T00:00:21", vérifié Cycle 18 sur un
  // fichier généré par un vrai `soffice --headless`) : une chaîne sans "Z" ni
  // offset est interprétée par `new Date()` comme une heure LOCALE, et la
  // relire ensuite via les composantes LOCALES (`getDate`/`getMonth`/
  // `getFullYear`) restitue donc le même jour calendaire quel que soit le
  // fuseau du serveur (parse-local + lecture-local = aller-retour invariant
  // au fuseau — vérifié Cycle 18 sous TZ=UTC/Europe/Paris/America/New_York/
  // Pacific/Auckland, toujours identique).
  //
  // À l'inverse, une chaîne portant un désignateur explicite ("Z" ou un
  // offset +HH:MM/-HH:MM — jamais observée sur un vrai fichier ODS, mais
  // produite par le seul aller-retour SheetJS-vers-SheetJS d'un objet Date JS
  // construit en heure locale) DOIT être relue avec les composantes UTC : la
  // relire en composantes locales ferait dépendre le jour calendaire — et
  // donc potentiellement l'exercice fiscal d'une écriture au 31/12 ou au
  // 01/01 — du fuseau horaire du serveur, ce qui est explicitement interdit
  // par la règle métier (Cycle 18) : une date d'encaissement reste attachée
  // au jour indiqué par le document, jamais au fuseau du serveur.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(trimmed)) {
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      const hasExplicitZoneDesignator = /(?:Z|[+-]\d{2}:?\d{2})$/.test(trimmed);
      const day = hasExplicitZoneDesignator
        ? String(parsed.getUTCDate()).padStart(2, "0")
        : String(parsed.getDate()).padStart(2, "0");
      const month = hasExplicitZoneDesignator
        ? String(parsed.getUTCMonth() + 1).padStart(2, "0")
        : String(parsed.getMonth() + 1).padStart(2, "0");
      const year = hasExplicitZoneDesignator
        ? String(parsed.getUTCFullYear())
        : String(parsed.getFullYear());
      return `${day}/${month}/${year}`;
    }
  }

  return trimmed;
}

export function columnTypeFromHeader(header: string): ColumnSemanticType {
  const classification = classifyRevenueHeader(header);
  if (classification.semanticCategory === "month") return "month";
  if (classification.semanticCategory === "date") return "date";
  if (classification.semanticCategory === "label") return "label";
  if (classification.isMonetary) return "amount";
  return "text";
}

export function isExplicitMonetaryHeader(header: string): boolean {
  return classifyRevenueHeader(header).isMonetary;
}

export function targetFieldFromHeader(header: string): ColumnTargetField {
  const classification = classifyRevenueHeader(header);
  if (classification.targetGridField !== "none") {
    return classification.targetGridField;
  }
  return "none";
}

export function gridColumnForTargetField(field: ColumnTargetField): RevenueGridColumn | null {
  switch (field) {
    case "loyers":
      return "loyers";
    case "autresRevenus":
      return "autresRevenus";
    case "charges":
      return "charges";
    default:
      return null;
  }
}

function inferColumnTypeFromSamples(values: string[]): ColumnSemanticType | null {
  const samples = values.map((value) => value.trim()).filter(Boolean);
  if (samples.length === 0) return null;

  const dateHits = samples.filter((value) => isDateLikeValue(value)).length;
  if (dateHits / samples.length >= 0.6) return "date";

  const moneyHits = samples.filter((value) => qualifiesAsMonetaryShape(value, true)).length;
  if (moneyHits / samples.length >= 0.6) return "amount";

  const monthHits = samples.filter((value) =>
    /^(janvier|f[eé]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[eé]cembre)$/i.test(
      normalizeHeader(value),
    ),
  ).length;
  if (monthHits / samples.length >= 0.6) return "month";

  return null;
}

export function lockTableColumns(headerCells: string[], dataRows: string[][]): LockedColumn[] {
  const locked: LockedColumn[] = headerCells.map((header, index) => {
    const classification = classifyRevenueHeader(header);
    logRevenueHeaderClassification(classification);

    const headerType = columnTypeFromHeader(header);
    const column: LockedColumn = {
      index,
      header,
      lockedType: headerType,
      targetField: targetFieldFromHeader(header),
      monetaryHeader: classification.isMonetary,
    };

    logRevenueColumnLock({
      index,
      header,
      lockedType: column.lockedType,
      targetField: column.targetField,
      source: "header",
    });

    return column;
  });

  for (const column of locked) {
    const samples = dataRows
      .map((row) => row[column.index] ?? "")
      .filter((value) => value.trim().length > 0)
      .slice(0, 12);

    const inferred = inferColumnTypeFromSamples(samples);
    if (!inferred) continue;

    if (
      inferred === "date" &&
      column.lockedType !== "date" &&
      !isProtectedMonetaryHeader(column.header)
    ) {
      column.lockedType = "date";
      column.targetField = "transactionDate";
      column.monetaryHeader = false;
      logRevenueColumnLock({
        index: column.index,
        header: column.header,
        lockedType: "date",
        targetField: "transactionDate",
        source: "content",
      });
      continue;
    }

    if (inferred === "amount" && column.lockedType === "text") {
      const classification = classifyRevenueHeader(column.header);
      column.lockedType = "amount";
      column.targetField = classification.targetGridField;
      column.monetaryHeader = classification.isMonetary;
      logRevenueColumnLock({
        index: column.index,
        header: column.header,
        lockedType: "amount",
        targetField: column.targetField,
        source: "content",
      });
    }
  }

  for (const column of locked) {
    if (column.lockedType === "date") {
      column.targetField = "transactionDate";
      column.monetaryHeader = false;
      continue;
    }

    if (isProtectedMonetaryHeader(column.header)) {
      column.lockedType = "amount";
      column.targetField = targetFieldFromHeader(column.header);
      column.monetaryHeader = true;
    }
  }

  return locked;
}

function hasDecimalStructure(raw: string): boolean {
  return hasMonetaryDecimalStructure(raw) || /[.,]\d{1,2}\b/.test(raw.trim());
}

export function qualifiesAsMonetaryShape(raw: string, allowPlainInteger = false): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;

  if (looksLikeMonetaryAmount(trimmed)) {
    return true;
  }

  if (isDateLikeValue(trimmed)) return false;
  if (hadDateSeparators(trimmed)) return false;
  if (looksLikeCalendarInteger(trimmed)) return false;

  if (hasCurrencyContext(trimmed) || hasDecimalStructure(trimmed)) {
    return true;
  }

  if (!allowPlainInteger) return false;

  const digits = digitsOnly(trimmed);
  if (!digits || digits.length > 5) return false;

  const amount = Number.parseFloat(digits);
  return Number.isFinite(amount) && amount > 0 && amount <= MAX_REASONABLE_MONTHLY_AMOUNT;
}

export function isDateDerivedAmount(amount: number, rawValue: string): boolean {
  if (looksLikeMonetaryAmount(rawValue)) return false;
  if (isDateLikeValue(rawValue)) return true;
  if (hadDateSeparators(rawValue)) return true;
  if (looksLikeCalendarInteger(rawValue)) return true;

  const rounded = Math.round(Math.abs(amount));
  const digits = String(rounded);

  if (digits.length >= 6 && looksLikeCalendarInteger(digits)) return true;

  if (rounded >= 1_000_000) return true;
  if (rounded >= 100_000 && !hasCurrencyContext(rawValue) && !hasDecimalStructure(rawValue)) {
    return true;
  }

  return false;
}

/**
 * Convertit un serial Excel natif (époque 1899-12-30) en "JJ/MM/AAAA".
 * Plage plausible ~1900-2100. N'est utilisé que dans une colonne déjà
 * identifiée comme colonne date par l'en-tête — jamais pour interpréter un
 * nombre ordinaire dans une colonne de montant.
 */
function excelSerialToDateString(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 73050) return null;
  const utcMs = (serial - 25569) * 86_400_000;
  const date = new Date(utcMs);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getUTCFullYear();
  if (year < 1900 || year > 2100) return null;
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${year}`;
}

export function parseDateCell(rawValue: string, column: LockedColumn): string | null {
  if (column.lockedType !== "date") return null;
  const trimmed = rawValue.trim();

  if (isDateLikeValue(trimmed)) {
    const normalized = normalizeDateValue(trimmed);
    logRevenueColumnSemantic({
      header: column.header,
      rawValue,
      parsedType: "date",
      targetField: "transactionDate",
      accepted: true,
      reason: "date_column_metadata",
    });
    return normalized;
  }

  // Cycle 15A — cellule numérique brute dans une colonne déjà identifiée comme date :
  // probable serial Excel natif sans format explicite (copier-coller, "General").
  // Auparavant silencieusement ignoré (repli sur une date fabriquée à partir du mois).
  if (/^\d+$/.test(trimmed)) {
    const asDate = excelSerialToDateString(Number.parseInt(trimmed, 10));
    if (asDate) {
      logRevenueColumnSemantic({
        header: column.header,
        rawValue,
        parsedType: "date",
        targetField: "transactionDate",
        accepted: true,
        reason: "excel_serial_without_format",
      });
      return asDate;
    }
  }

  return null;
}

export function parseMonetaryCell(
  rawValue: string,
  column: LockedColumn,
): { amount: number; parsedType: "amount" } | null {
  const trimmed = rawValue.trim();
  if (!trimmed) return null;

  if (column.lockedType === "date") {
    logRevenueDateRejected({
      rawValue: trimmed,
      columnType: column.lockedType,
      targetField: column.targetField,
      header: column.header,
      reason: "date_column_locked",
    });
    return null;
  }

  if (column.lockedType !== "amount") {
    logRevenueDateRejected({
      rawValue: trimmed,
      columnType: column.lockedType,
      targetField: column.targetField,
      header: column.header,
      reason: "non_amount_column_locked",
    });
    return null;
  }

  if (isDateLikeValue(trimmed) && !looksLikeMonetaryAmount(trimmed)) {
    logRevenueDateRejected({
      rawValue: trimmed,
      columnType: column.lockedType,
      targetField: column.targetField,
      header: column.header,
      reason: "date_pattern_before_money_parse",
    });
    return null;
  }

  if (
    !qualifiesAsMonetaryShape(trimmed, column.monetaryHeader) &&
    !column.monetaryHeader
  ) {
    logRevenueDateRejected({
      rawValue: trimmed,
      columnType: column.lockedType,
      targetField: column.targetField,
      header: column.header,
      reason: "numeric_without_monetary_context",
    });
    return null;
  }

  if (
    !qualifiesAsMonetaryShape(trimmed, true) &&
    column.monetaryHeader &&
    !hasCurrencyContext(trimmed) &&
    !hasDecimalStructure(trimmed) &&
    looksLikeCalendarInteger(trimmed)
  ) {
    logRevenueDateRejected({
      rawValue: trimmed,
      columnType: column.lockedType,
      targetField: column.targetField,
      header: column.header,
      reason: "calendar_integer_on_monetary_header",
    });
    return null;
  }

  const monetary = normalizeMonetaryValue(trimmed, { log: true });
  if (!monetary) {
    logRevenueDateRejected({
      rawValue: trimmed,
      columnType: column.lockedType,
      targetField: column.targetField,
      header: column.header,
      reason: "not_a_finite_number",
    });
    return null;
  }

  const amount = monetary.parsedAmount;

  if (isDateDerivedAmount(amount, trimmed) || amount > MAX_REASONABLE_MONTHLY_AMOUNT) {
    logRevenueDateRejected({
      rawValue: trimmed,
      columnType: column.lockedType,
      targetField: column.targetField,
      header: column.header,
      reason: "date_derived_or_unreasonable_amount",
    });
    return null;
  }

  logRevenueMoneyAccepted({
    rawValue: trimmed,
    columnType: column.lockedType,
    targetField: column.targetField,
    header: column.header,
    amount,
  });

  return { amount, parsedType: "amount" };
}

export function parseMonetaryCellWithHeader(
  rawValue: string,
  header: string,
  options?: { monetaryHeaderOverride?: boolean },
): { amount: number; parsedType: "amount" } | null {
  const explicitMonetary = isExplicitMonetaryHeader(header);
  const column: LockedColumn = {
    index: -1,
    header,
    lockedType:
      explicitMonetary || options?.monetaryHeaderOverride
        ? "amount"
        : columnTypeFromHeader(header),
    targetField: targetFieldFromHeader(header),
    monetaryHeader: explicitMonetary || options?.monetaryHeaderOverride === true,
  };
  return parseMonetaryCell(rawValue, column);
}

export function categoryFromMonetaryHeader(header: string): RevenueTransactionCategory | null {
  if (columnTypeFromHeader(header) !== "amount") return null;
  return categoryFromColumnHeader(header);
}

export function monetaryColumns(columns: LockedColumn[]): LockedColumn[] {
  return columns.filter(
    (column) =>
      column.lockedType === "amount" &&
      (column.targetField === "loyers" ||
        column.targetField === "autresRevenus" ||
        column.targetField === "charges"),
  );
}

export function dateColumns(columns: LockedColumn[]): LockedColumn[] {
  return columns.filter((column) => column.lockedType === "date");
}

export function monthColumn(columns: LockedColumn[]): LockedColumn | undefined {
  return columns.find((column) => column.lockedType === "month");
}

export function rejectDateAsGridMoney(params: {
  rawValue: string;
  amount: number;
  header?: string;
  columnType?: ColumnSemanticType;
}): boolean {
  if (isDateLikeValue(params.rawValue)) return true;
  if (isDateDerivedAmount(params.amount, params.rawValue)) return true;
  if (params.columnType === "date") return true;
  return false;
}
