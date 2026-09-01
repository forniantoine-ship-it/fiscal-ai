/**
 * Deterministic copropriété / syndic charge parser (regex + line-level structural extraction).
 * Classifies charges_copro, fonds_travaux, and avance_tresorerie separately for LMNP fiscal rules.
 */

import {
  logChargeParserTraces,
  parseFrenchCurrencyAmount,
  type ChargeParseTrace,
} from "./charge-parse-utils";

export type CoproTransactionCategory =
  | "charges_copro"
  | "fonds_travaux"
  | "avance_tresorerie";

export type CoproParsedTransaction = {
  category: CoproTransactionCategory;
  label: string;
  amount: number;
  deductible: boolean;
  amortizable: boolean;
  sourceDocument: string;
};

export type CoproTransactionInput = {
  label: string;
  amount: number;
  category?: CoproTransactionCategory;
  sourceDocument: string;
  lineIndex?: number;
  rawLine?: string;
};

export type CoproParseResult = {
  transactions: CoproParsedTransaction[];
  traces: ChargeParseTrace[];
  errors: string[];
  sourceDocument: string;
};

const PARSER_ID = "copro-parser";

/** Fiscal flags per category — fonds travaux and avance are never merged with deductible copro charges. */
const FISCAL_BY_CATEGORY: Record<
  CoproTransactionCategory,
  { deductible: boolean; amortizable: boolean }
> = {
  charges_copro: { deductible: true, amortizable: false },
  fonds_travaux: { deductible: false, amortizable: false },
  avance_tresorerie: { deductible: false, amortizable: false },
};

const SKIP_LINE_PATTERNS: RegExp[] = [
  /^total\b/i,
  /^sous[- ]?total\b/i,
  /^montant\s+total\b/i,
  /^total\s+appel\b/i,
  /^total\s+general\b/i,
  /^solde\b/i,
  /^net\s+a\s+payer\b/i,
  /^reste\s+a\s+payer\b/i,
  /^a\s+payer\b/i,
  /^montant\s+du\b/i,
  /^recapitulatif\b/i,
  /^page\s+\d/i,
  /^lot\s+n[°o]?\s*\d+\s*[-—]\s*tanti/i,
];

const CATEGORY_RULES: {
  category: CoproTransactionCategory;
  patterns: RegExp[];
}[] = [
  {
    category: "avance_tresorerie",
    patterns: [
      /avance\s+(de\s+)?tresorerie/i,
      /avance\s+tresorerie/i,
      /remboursement\s+avance/i,
      /\bat\s+syndic\b/i,
      /\bat\s+coprop/i,
    ],
  },
  {
    category: "fonds_travaux",
    patterns: [
      /fonds\s+(de\s+)?travaux/i,
      /fonds\s+alur/i,
      /contribution\s+(au\s+)?fonds/i,
      /provision\s+(pour\s+)?travaux/i,
      /appel\s+.{0,20}fonds\s+(de\s+)?travaux/i,
    ],
  },
  {
    category: "charges_copro",
    patterns: [
      /charges?\s+communes/i,
      /charges?\s+batiment/i,
      /charges?\s+escalier/i,
      /charges?\s+generales/i,
      /charges?\s+courantes/i,
      /charges?\s+speciales/i,
      /charges?\s+exceptionnelles/i,
      /charges?\s+de\s+coprop/i,
      /charges?\s+copro/i,
      /budget\s+previsionnel/i,
      /appel\s+de\s+fonds.{0,30}charges/i,
      /repartition\s+charges/i,
    ],
  },
];

const AMOUNT_SUFFIX_PATTERN =
  /^(.+?)\s+(\d{1,3}(?:\s\d{3})*,\d{2}|\d+,\d{2})\s*(?:€|eur)?\s*$/i;

const AMOUNT_ONLY_PATTERN =
  /^(\d{1,3}(?:\s\d{3})*,\d{2}|\d+,\d{2})\s*(?:€|eur)?\s*$/i;

function normalizeLineForMatch(line: string): string {
  return line
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[''`´]/g, "'")
    .replace(/[""«»]/g, " ")
    .replace(/€/g, " EUR ")
    .replace(/[\u00a0\t\r]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pushTrace(
  traces: ChargeParseTrace[],
  step: string,
  detail: string,
  value?: string | number | boolean | null,
): void {
  traces.push({ step, detail, value });
}

function shouldSkipLine(normalizedLine: string): boolean {
  if (!normalizedLine || normalizedLine.length < 3) return true;
  return SKIP_LINE_PATTERNS.some((p) => p.test(normalizedLine));
}

/**
 * Classifies a charge label into a copropriété transaction category.
 * Avance and fonds travaux are checked before generic charges to preserve fiscal separation.
 */
export function classifyCoproLabel(label: string): CoproTransactionCategory | null {
  const normalized = normalizeLineForMatch(label);
  if (!normalized) return null;

  for (const { category, patterns } of CATEGORY_RULES) {
    if (patterns.some((p) => p.test(normalized))) {
      return category;
    }
  }

  if (/^charges?\s+/i.test(normalized) && !/fonds\s+travaux/i.test(normalized)) {
    return "charges_copro";
  }

  return null;
}

/**
 * Applies fiscal normalization to a single extracted copropriété line.
 */
export function normalizeCoproTransaction(
  input: CoproTransactionInput,
): CoproParsedTransaction | null {
  const label = input.label.replace(/\s+/g, " ").trim();
  if (!label) return null;

  const amount =
    Number.isFinite(input.amount) && input.amount > 0
      ? Math.round(input.amount * 100) / 100
      : null;
  if (amount === null) return null;

  const category = input.category ?? classifyCoproLabel(label);
  if (!category) return null;

  const fiscal = FISCAL_BY_CATEGORY[category];

  return {
    category,
    label,
    amount,
    deductible: fiscal.deductible,
    amortizable: fiscal.amortizable,
    sourceDocument: input.sourceDocument,
  };
}

type RawLineCandidate = {
  lineIndex: number;
  rawLine: string;
  label: string;
  amountRaw: string;
};

function splitOcrLines(rawOcrText: string): string[] {
  return rawOcrText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function extractAmountFromLine(normalizedLine: string): {
  label: string;
  amountRaw: string;
} | null {
  const match = normalizedLine.match(AMOUNT_SUFFIX_PATTERN);
  if (!match) return null;
  const label = match[1]!.trim();
  if (!label || shouldSkipLine(normalizeLineForMatch(label))) return null;
  return { label, amountRaw: match[2]!.trim() };
}

function extractLineCandidates(
  lines: string[],
  traces: ChargeParseTrace[],
): RawLineCandidate[] {
  const candidates: RawLineCandidate[] = [];
  let pendingLabel: { lineIndex: number; rawLine: string; label: string } | null =
    null;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]!;
    const normalized = normalizeLineForMatch(rawLine);

    if (shouldSkipLine(normalized)) {
      pushTrace(traces, "line-skip", "Ignored total/subtotal/header line", rawLine);
      pendingLabel = null;
      continue;
    }

    const inline = extractAmountFromLine(normalized);
    if (inline) {
      const category = classifyCoproLabel(inline.label);
      if (!category) {
        pushTrace(traces, "line-skip", "Unclassified label with amount", inline.label);
        pendingLabel = null;
        continue;
      }
      candidates.push({
        lineIndex: i,
        rawLine,
        label: inline.label,
        amountRaw: inline.amountRaw,
      });
      pushTrace(
        traces,
        "line-extract",
        `Inline ${category}`,
        `${inline.label} → ${inline.amountRaw}`,
      );
      pendingLabel = null;
      continue;
    }

    const amountOnly = normalized.match(AMOUNT_ONLY_PATTERN);
    if (amountOnly && pendingLabel) {
      const category = classifyCoproLabel(pendingLabel.label);
      if (category) {
        candidates.push({
          lineIndex: pendingLabel.lineIndex,
          rawLine: `${pendingLabel.rawLine} | ${rawLine}`,
          label: pendingLabel.label,
          amountRaw: amountOnly[1]!.trim(),
        });
        pushTrace(
          traces,
          "line-extract",
          `Split-line ${category}`,
          `${pendingLabel.label} → ${amountOnly[1]}`,
        );
      } else {
        pushTrace(traces, "line-skip", "Pending label unclassified", pendingLabel.label);
      }
      pendingLabel = null;
      continue;
    }

    if (amountOnly) {
      pushTrace(traces, "line-skip", "Orphan amount line", rawLine);
      pendingLabel = null;
      continue;
    }

    const possibleCategory = classifyCoproLabel(normalized);
    if (possibleCategory) {
      pendingLabel = { lineIndex: i, rawLine, label: normalized };
      pushTrace(traces, "line-pending", `Awaiting amount for ${possibleCategory}`, normalized);
    } else {
      pendingLabel = null;
    }
  }

  return candidates;
}

export type ParseCoproprieteDocumentOptions = {
  sourceDocument?: string;
  logTraces?: boolean;
};

/**
 * Parses OCR text from syndic / copropriété PDFs into normalized LMNP transactions.
 */
export function parseCoproprieteDocument(
  rawOcrText: string,
  options?: ParseCoproprieteDocumentOptions,
): CoproParseResult {
  const traces: ChargeParseTrace[] = [];
  const errors: string[] = [];
  const logTraces = options?.logTraces !== false;
  const sourceDocument = options?.sourceDocument?.trim() || "copropriete-document";

  const lines = splitOcrLines(rawOcrText);
  pushTrace(traces, "lines", "OCR split into lines", lines.length);

  if (lines.length === 0) {
    errors.push("empty_ocr_text");
    if (logTraces) {
      logChargeParserTraces(PARSER_ID, traces, { ok: false, errors, transactionCount: 0 });
    }
    return { transactions: [], traces, errors, sourceDocument };
  }

  const candidates = extractLineCandidates(lines, traces);
  const transactions: CoproParsedTransaction[] = [];

  for (const candidate of candidates) {
    const amount = parseFrenchCurrencyAmount(candidate.amountRaw, { min: 0.01 });
    if (amount === null) {
      pushTrace(
        traces,
        "amount-reject",
        "Malformed amount",
        `${candidate.label}: ${candidate.amountRaw}`,
      );
      errors.push(`invalid_amount:${candidate.lineIndex}`);
      continue;
    }

    const normalized = normalizeCoproTransaction({
      label: candidate.label,
      amount,
      sourceDocument,
      lineIndex: candidate.lineIndex,
      rawLine: candidate.rawLine,
    });

    if (!normalized) {
      pushTrace(traces, "normalize-reject", "Could not normalize transaction", candidate.label);
      errors.push(`unclassified:${candidate.lineIndex}`);
      continue;
    }

    transactions.push(normalized);
    pushTrace(
      traces,
      "transaction",
      `${normalized.category} line ${candidate.lineIndex}`,
      `${normalized.label} ${normalized.amount}`,
    );
  }

  if (transactions.length === 0 && errors.length === 0) {
    errors.push("no_transactions_extracted");
  }

  pushTrace(traces, "result", "Parse complete", transactions.length);

  if (logTraces) {
    logChargeParserTraces(PARSER_ID, traces, {
      ok: transactions.length > 0,
      errors,
      sourceDocument,
      transactionCount: transactions.length,
      byCategory: transactions.reduce(
        (acc, t) => {
          acc[t.category] = (acc[t.category] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      ),
    });
  }

  return { transactions, traces, errors, sourceDocument };
}
