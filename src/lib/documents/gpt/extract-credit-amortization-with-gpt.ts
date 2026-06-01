import OpenAI from "openai";

import {
  CREDIT_AMORTIZATION_JSON_SCHEMA,
  CREDIT_AMORTIZATION_SYSTEM_PROMPT,
  buildCreditAmortizationUserPrompt,
} from "./prompts/credit-amortization.prompt";
import {
  CreditAmortizationExtractionSchema,
  normalizeCreditAmortizationExtraction,
  type CreditAmortizationExtraction,
} from "./schemas/credit-amortization.schema";

const DEFAULT_MODEL = "gpt-4o-mini";
const MAX_OCR_CHARS_STRICT = 7_000;
const MAX_OCR_CHARS_RELAXED = 12_000;

type OcrFilterMode = "strict" | "relaxed";

const ROW_KEYWORD_RE =
  /échéance|échéancier|echeance|mensualit|amortissement|intérêt|interet|assurance|crd|capital\s+restant|restant\s+dû|restant\s+du/i;
const LINE_KEYWORD_RE =
  /échéance|échéancier|echeance|capital|intérêt|interet|assurance|mensualit|restant|restant\s+dû|crd|amortissement|annuit|emprunt|prêt|pret|durée|duree|taux|échéances/i;
const COLUMN_HEADER_RE =
  /date|échéance|echeance|capital|intérêt|interet|assurance|mensualit|frais|montant|annuit|crd|restant/i;
const PAGE_AMORT_RE =
  /tableau.*amortissement|échéancier|echeancier|relevé.*prêt|releve.*pret|décompte|decompte|capital restant|intérêts.*année|interets.*annee/i;
const PAGE_NOISE_RE =
  /mentions?\s+légales|conditions\s+générales|tout\s+différend|www\.|https?:\/\/|données\s+personnelles|cookies|assurance\s+vie\s+et\s+prévoyance|votre\s+conseiller|offre\s+commerciale/i;
const LEGAL_LINE_RE =
  /mentions?\s+légales|article\s+\d|conformément|code\s+(?:civil|de la consommation)|sauf\s+erreur|disclaimer|tous\s+droits\s+réservés|siret|rcs\s+/i;
const DATE_RE = /\b\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}\b/;

export type ExtractCreditAmortizationWithGptInput = {
  rawText: string;
  fileName: string;
  declarationYear: number;
  revenueYear: number;
};

export type CreditAmortizationGptExtractionResult = {
  success: boolean;
  extraction: CreditAmortizationExtraction;
  error?: string;
  debug?: {
    rawGptJson: unknown;
    normalized: CreditAmortizationExtraction;
  };
};

function getModel(): string {
  return (
    process.env.OPENAI_CREDIT_EXTRACTION_MODEL ??
    process.env.OPENAI_EXTRACTION_MODEL ??
    DEFAULT_MODEL
  );
}

function countMonetaryValues(line: string): number {
  return (line.match(/\d{1,3}(?:[\s.,]\d{3})*(?:[.,]\d+)?/g) ?? []).length;
}

function isAmortizationAnchorLine(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 500) return false;
  if (LEGAL_LINE_RE.test(t)) return false;
  if (PAGE_NOISE_RE.test(t) && !ROW_KEYWORD_RE.test(t) && countMonetaryValues(t) < 2) {
    return false;
  }
  if (DATE_RE.test(t)) return true;
  if (countMonetaryValues(t) >= 2) return true;
  if (ROW_KEYWORD_RE.test(t)) return true;
  if (/crd|capital restant|restant dû|restant du/i.test(t)) return true;
  return false;
}

function isInstallmentCandidateLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  return DATE_RE.test(t) && countMonetaryValues(t) >= 2;
}

function isColumnHeaderLine(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 140) return false;
  return COLUMN_HEADER_RE.test(t) && countMonetaryValues(t) <= 2;
}

function scoreAmortizationPage(page: string): number {
  const lines = page.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return -10;
  let score = 0;
  if (PAGE_AMORT_RE.test(page)) score += 15;
  if (PAGE_NOISE_RE.test(page) && !PAGE_AMORT_RE.test(page)) score -= 8;
  for (const line of lines) {
    if (isInstallmentCandidateLine(line)) score += 5;
    else if (isAmortizationAnchorLine(line)) score += 3;
    else if (LINE_KEYWORD_RE.test(line)) score += 1;
  }
  return score;
}

function splitOcrPages(rawText: string): string[] {
  const byFf = rawText.split(/\f+/).map((p) => p.trim()).filter((p) => p.length > 40);
  if (byFf.length > 1) return byFf;

  const byMarker = rawText.split(/\n(?=\s*(?:page\s*)?\d{1,3}\s*(?:\/\s*\d{1,3})?\s*\n)/gi);
  if (byMarker.length > 1) {
    return byMarker.map((p) => p.trim()).filter((p) => p.length > 40);
  }

  const byBlocks = rawText.split(/\n{3,}/).map((p) => p.trim()).filter((p) => p.length > 80);
  if (byBlocks.length > 1) return byBlocks;

  return [rawText];
}

function countTableSections(lineCount: number, kept: Set<number>): number {
  let sections = 0;
  let open = false;
  for (let i = 0; i < lineCount; i++) {
    if (kept.has(i)) {
      if (!open) {
        sections += 1;
        open = true;
      }
    } else {
      open = false;
    }
  }
  return sections;
}

function expandNeighborIndices(lineCount: number, anchors: Set<number>, radius: number): Set<number> {
  const kept = new Set<number>();
  for (const i of anchors) {
    for (let offset = -radius; offset <= radius; offset++) {
      const j = i + offset;
      if (j < 0 || j >= lineCount) continue;
      kept.add(j);
    }
  }
  return kept;
}

function filterPageText(pageText: string, mode: OcrFilterMode): {
  lines: string[];
  keptRowCount: number;
  removedRowCount: number;
  detectedTableSections: number;
  installmentCandidateLines: number;
} {
  const rawLines = pageText.split(/\r?\n/);
  const nonEmptyCount = rawLines.filter((l) => l.trim()).length;
  const anchors = new Set<number>();

  for (let i = 0; i < rawLines.length; i++) {
    if (isAmortizationAnchorLine(rawLines[i] ?? "")) anchors.add(i);
  }

  const radius = mode === "strict" ? 2 : 3;
  const kept = expandNeighborIndices(rawLines.length, anchors, radius);

  if (mode === "relaxed") {
    for (let i = 0; i < rawLines.length; i++) {
      if (isColumnHeaderLine(rawLines[i] ?? "")) kept.add(i);
    }
  }

  const lines: string[] = [];
  let installmentCandidateLines = 0;
  for (let i = 0; i < rawLines.length; i++) {
    if (!kept.has(i)) continue;
    const t = rawLines[i]!.trim();
    if (!t) continue;
    if (LEGAL_LINE_RE.test(t) && !isAmortizationAnchorLine(t)) continue;
    lines.push(t);
    if (isInstallmentCandidateLine(t)) installmentCandidateLines += 1;
  }

  return {
    lines,
    keptRowCount: lines.length,
    removedRowCount: Math.max(0, nonEmptyCount - lines.length),
    detectedTableSections: countTableSections(rawLines.length, kept),
    installmentCandidateLines,
  };
}

function capPreservingInstallmentRows(lines: string[], maxChars: number): string {
  const joined = lines.join("\n");
  if (joined.length <= maxChars) return joined;

  const mustKeep = new Set<number>();
  lines.forEach((line, index) => {
    if (isInstallmentCandidateLine(line) || isAmortizationAnchorLine(line)) {
      mustKeep.add(index);
      for (let d = -1; d <= 1; d++) {
        const j = index + d;
        if (j >= 0 && j < lines.length) mustKeep.add(j);
      }
    }
  });

  const required = [...mustKeep]
    .sort((a, b) => a - b)
    .map((i) => lines[i]!);
  let requiredText = required.join("\n");
  if (requiredText.length > maxChars) {
    return requiredText.slice(0, maxChars);
  }

  let budget = maxChars - requiredText.length - (required.length > 0 ? 1 : 0);
  const optional: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (mustKeep.has(i)) continue;
    const add = lines[i]!.length + 1;
    if (budget < add) continue;
    optional.push(lines[i]!);
    budget -= add;
  }

  return [...required, ...optional].join("\n");
}

/** Pre-filter OCR: pages → anchor rows + neighbors → cap (headers kept for multi-page tables). */
export function filterAmortizationOcrForGpt(
  rawText: string,
  mode: OcrFilterMode = "strict",
): {
  filteredText: string;
  originalCharCount: number;
  filteredCharCount: number;
  removedCharCount: number;
  pagesKept: number;
  pagesSkipped: number;
  keptRowCount: number;
  removedRowCount: number;
  detectedTableSections: number;
  installmentCandidateLines: number;
  filterMode: OcrFilterMode;
} {
  const originalCharCount = rawText.length;
  const maxChars = mode === "relaxed" ? MAX_OCR_CHARS_RELAXED : MAX_OCR_CHARS_STRICT;
  const pages = splitOcrPages(rawText);
  const scoredPages = pages.map((text) => ({ text, score: scoreAmortizationPage(text) }));

  const maxScore = Math.max(0, ...scoredPages.map((p) => p.score));
  const threshold =
    mode === "relaxed" ? Math.max(2, maxScore * 0.12) : Math.max(3, maxScore * 0.18);
  const keptPages = scoredPages.filter((p) => p.score >= threshold);
  const pagesToUse =
    keptPages.length > 0
      ? keptPages
      : scoredPages.sort((a, b) => b.score - a.score).slice(0, mode === "relaxed" ? 4 : 2);

  const allLines: string[] = [];
  let keptRowCount = 0;
  let removedRowCount = 0;
  let detectedTableSections = 0;
  let installmentCandidateLines = 0;

  for (const page of pagesToUse) {
    const chunk = filterPageText(page.text, mode);
    if (allLines.length > 0 && chunk.lines.length > 0) allLines.push("---");
    allLines.push(...chunk.lines);
    keptRowCount += chunk.keptRowCount;
    removedRowCount += chunk.removedRowCount;
    detectedTableSections += chunk.detectedTableSections;
    installmentCandidateLines += chunk.installmentCandidateLines;
  }

  const filteredText = capPreservingInstallmentRows(allLines, maxChars);
  const filteredCharCount = filteredText.length;

  return {
    filteredText,
    originalCharCount,
    filteredCharCount,
    removedCharCount: Math.max(0, originalCharCount - filteredCharCount),
    pagesKept: pagesToUse.length,
    pagesSkipped: pages.length - pagesToUse.length,
    keptRowCount,
    removedRowCount,
    detectedTableSections,
    installmentCandidateLines,
    filterMode: mode,
  };
}

async function callAmortizationGpt(
  openai: OpenAI,
  model: string,
  userPrompt: string,
): Promise<{ content: string; usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined }> {
  const completion = await openai.chat.completions.create({
    model,
    temperature: 0,
    messages: [
      { role: "system", content: CREDIT_AMORTIZATION_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: CREDIT_AMORTIZATION_JSON_SCHEMA,
    },
  });
  return {
    content: completion.choices[0]?.message?.content ?? "",
    usage: completion.usage,
  };
}

function parseAmortizationGptContent(content: string): CreditAmortizationGptExtractionResult {
  if (!content.trim()) {
    return { success: false, extraction: {}, error: "Réponse vide du modèle OpenAI." };
  }

  let rawResponse: unknown;
  try {
    rawResponse = JSON.parse(content) as unknown;
  } catch {
    return { success: false, extraction: {}, error: "Réponse JSON invalide du modèle OpenAI." };
  }

  const validation = CreditAmortizationExtractionSchema.safeParse(rawResponse);
  if (!validation.success) {
    return {
      success: false,
      extraction: {},
      error: "GPT response failed schema validation",
      debug: { rawGptJson: rawResponse, normalized: {} },
    };
  }

  const extraction = normalizeCreditAmortizationExtraction(validation.data);
  if (Object.keys(extraction).length === 0) {
    return { success: false, extraction: {}, error: "Aucun champ extrait." };
  }

  return {
    success: true,
    extraction,
    debug: { rawGptJson: rawResponse, normalized: extraction },
  };
}

export async function extractCreditAmortizationWithGpt(
  input: ExtractCreditAmortizationWithGptInput,
): Promise<CreditAmortizationGptExtractionResult> {
  const pipelineT0 = performance.now();
  const model = getModel();
  const ocrCharCount = input.rawText.length;
  const estTokens = (text: string) => Math.ceil(text.length / 4);

  console.log("[credit-gpt-amortization-trace]", {
    event: "start",
    fileName: input.fileName,
    model,
    ocrTextCharCount: ocrCharCount,
    ocrTextEstimatedTokens: estTokens(input.rawText),
    ocrFirst20Lines: input.rawText.split(/\r?\n/).slice(0, 20),
    pdfPageCount: null,
    note: "pdfPageCount not available in GPT extract layer",
  });

  console.log("[credit-gpt] amortization extraction start", {
    fileName: input.fileName,
    declarationYear: input.declarationYear,
    revenueYear: input.revenueYear,
    textLength: input.rawText.length,
  });

  if (!input.rawText.trim()) {
    return { success: false, extraction: {}, error: "OCR text is empty" };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { success: false, extraction: {}, error: "OPENAI_API_KEY non configurée." };
  }

  try {
    const openai = new OpenAI({ apiKey });
    const systemPrompt = CREDIT_AMORTIZATION_SYSTEM_PROMPT;

    const runPass = async (mode: OcrFilterMode, label: string) => {
      const filterT0 = performance.now();
      const filtered = filterAmortizationOcrForGpt(input.rawText, mode);
      const filterMs = performance.now() - filterT0;

      const userPrompt = buildCreditAmortizationUserPrompt({
        rawText: filtered.filteredText,
        fileName: input.fileName,
        declarationYear: input.declarationYear,
        revenueYear: input.revenueYear,
      });
      const finalPromptEstimatedTokens = estTokens(systemPrompt) + estTokens(userPrompt);

      console.log("[credit-gpt-amortization-trace]", {
        event: "ocr_filtered",
        pass: label,
        filterMode: filtered.filterMode,
        filterMs: Math.round(filterMs),
        originalCharCount: filtered.originalCharCount,
        filteredCharCount: filtered.filteredCharCount,
        removedCharCount: filtered.removedCharCount,
        keptRowCount: filtered.keptRowCount,
        removedRowCount: filtered.removedRowCount,
        detectedTableSections: filtered.detectedTableSections,
        installmentCandidateLines: filtered.installmentCandidateLines,
        finalPromptEstimatedTokens,
      });

      const openAiT0 = performance.now();
      const { content, usage } = await callAmortizationGpt(openai, model, userPrompt);
      const openAiCompletionMs = performance.now() - openAiT0;

      console.log("[credit-gpt-amortization-trace]", {
        event: "openai_request_end",
        pass: label,
        openAiCompletionMs: Math.round(openAiCompletionMs),
        cumulativeMs: Math.round(performance.now() - pipelineT0),
        responseCharCount: content.length,
        openAiUsage: usage ?? null,
      });

      const parsed = parseAmortizationGptContent(content);
      return {
        filtered,
        parsed,
        openAiCompletionMs,
        finalPromptEstimatedTokens,
        userPromptCharCount: userPrompt.length,
      };
    };

    let pass = await runPass("strict", "primary");
    let installmentCount = pass.parsed.extraction.installments?.length ?? 0;

    if (installmentCount === 0) {
      console.log("[credit-gpt-amortization-trace]", {
        event: "retry_relaxed_filter",
        reason: "installmentCount_zero_after_primary",
      });
      pass = await runPass("relaxed", "retry_relaxed");
      installmentCount = pass.parsed.extraction.installments?.length ?? 0;
    }

    const { filtered, parsed, openAiCompletionMs, finalPromptEstimatedTokens, userPromptCharCount } =
      pass;

    console.log("[credit-gpt] amortization extraction complete", {
      fileName: input.fileName,
      fieldCount: Object.keys(parsed.extraction).length,
      installmentCount,
      filterMode: filtered.filterMode,
    });

    console.log("[credit-gpt-amortization-trace]", {
      event: "complete",
      success: parsed.success,
      totalMs: Math.round(performance.now() - pipelineT0),
      openAiCompletionMs: Math.round(openAiCompletionMs),
      model,
      filterMode: filtered.filterMode,
      ocrTextCharCount: filtered.originalCharCount,
      filteredCharCount: filtered.filteredCharCount,
      keptRowCount: filtered.keptRowCount,
      removedRowCount: filtered.removedRowCount,
      detectedTableSections: filtered.detectedTableSections,
      installmentCandidateLines: filtered.installmentCandidateLines,
      finalPromptEstimatedTokens,
      installmentCount,
    });

    return parsed;
  } catch (err) {
    const message = err instanceof Error ? err.message : "GPT extraction failed";
    console.log("[credit-gpt-amortization-trace]", {
      event: "error",
      message,
      cumulativeMs: Math.round(performance.now() - pipelineT0),
    });
    console.log("[credit-gpt] amortization extraction failed", { fileName: input.fileName, reason: message });
    return { success: false, extraction: {}, error: message };
  }
}
