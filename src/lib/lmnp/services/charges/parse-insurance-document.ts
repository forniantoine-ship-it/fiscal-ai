/**
 * Deterministic insurance habitation charge parser (regex + structural extraction).
 * Targets AXA-style OCR layouts for LMNP deductible insurance charges.
 */

import { parseFrenchAddress } from "@/lib/lmnp/services/parse-french-address";
import {
  logChargeParserTraces,
  normalizeChargeDateValue,
  normalizeChargeOcrText,
  parseFrenchCurrencyAmount,
  type ChargeParseTrace,
} from "./charge-parse-utils";

export type InsuranceChargeDocument = {
  type: "assurance_habitation";
  fournisseur: string;
  montantTTC: number;
  periodeDebut: string;
  periodeFin: string;
  adresseBien: string;
  deductible: boolean;
};

export type InsuranceParseResult = {
  data: InsuranceChargeDocument | null;
  traces: ChargeParseTrace[];
  errors: string[];
};

const PARSER_ID = "insurance-parser";

const KNOWN_INSURERS: { pattern: RegExp; name: string }[] = [
  { pattern: /\bAXA(?:\s+ASSURANCE|\s+FRANCE|\s+IARD)?\b/i, name: "AXA" },
  { pattern: /\bMAIF\b/i, name: "MAIF" },
  { pattern: /\bMACIF\b/i, name: "MACIF" },
  { pattern: /\bMMA\b/i, name: "MMA" },
  { pattern: /\bGROUPAMA\b/i, name: "GROUPAMA" },
  { pattern: /\bALLIANZ\b/i, name: "ALLIANZ" },
  { pattern: /\bGENERALI\b/i, name: "GENERALI" },
  { pattern: /\bAVIVA\b/i, name: "AVIVA" },
  { pattern: /\bMATMUT\b/i, name: "MATMUT" },
  { pattern: /\bGMF\b/i, name: "GMF" },
  { pattern: /\bMAAF\b/i, name: "MAAF" },
  { pattern: /\bPACIFICA\b/i, name: "PACIFICA" },
  { pattern: /\bCOVEA\b/i, name: "COVEA" },
  { pattern: /\bHABITASSUR\b/i, name: "HABITASSUR" },
];

const AMOUNT_LABEL_PATTERN =
  /(?:prime|montant|total|net|payer|cotisation|contribution)[^.\n]{0,40}ttc[^.\n]{0,25}(\d[\d\s.,]*)\s*(?:€|eur)?/gi;

const AMOUNT_TTC_FIRST_PATTERN =
  /(?:montant\s+)?(?:total\s+)?ttc\s*[:\-]?\s*(\d[\d\s.,]*)\s*(?:€|eur)?/gi;

const PERIOD_RANGE_PATTERN =
  /(?:p[eé]riode|couverture|garantie)\s*(?:du|:)?\s*(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{1,2}\s+[a-zéû]+?\s+\d{4})\s+au\s+(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{1,2}\s+[a-zéû]+?\s+\d{4})/i;

const PERIOD_DU_AU_PATTERN =
  /\bdu\s+(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{1,2}\s+[a-zéû]+?\s+\d{4})\s+au\s+(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{1,2}\s+[a-zéû]+?\s+\d{4})/i;

const EFFET_ECHEANCE_PATTERN =
  /date\s+d['']?effet\s*:?\s*(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}).{0,80}date\s+d['']?[eé]ch[eé]ance\s*:?\s*(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})/is;

const ADDRESS_HEADER_PATTERN =
  /(?:risque\s+situ[eé]|adresse\s+du\s+risque(?:\s+assur[eé])?|situation\s+du\s+risque|bien\s+assur[eé]|lieu\s+du\s+risque)\s*:?\s*/i;

const NON_DEDUCTIBLE_HINTS = [
  /indemnit[eé]\s+sinistre/i,
  /remboursement\s+sinistre/i,
  /attestation\s+uniquement/i,
];

const DEDUCTIBLE_HINTS = [
  /assurance\s+habitation/i,
  /multirisque\s+habitation/i,
  /assurance\s+logement/i,
  /\bpno\b/i,
  /prime\s+annuelle/i,
  /contrat\s+habitation/i,
  /meubl[eé]\s+de\s+tourisme/i,
];

function pushTrace(
  traces: ChargeParseTrace[],
  step: string,
  detail: string,
  value?: string | number | boolean | null,
): void {
  traces.push({ step, detail, value });
}

function extractInsurer(text: string, traces: ChargeParseTrace[]): string | null {
  for (const { pattern, name } of KNOWN_INSURERS) {
    if (pattern.test(text)) {
      pushTrace(traces, "insurer", `Matched known insurer ${name}`, name);
      return name;
    }
  }

  const generic = text.match(
    /\b(?:assurance|compagnie)\s+([A-Z][A-Z0-9\s-]{2,24})\b/,
  );
  if (generic?.[1]) {
    const name = generic[1].trim().split(/\s+/).slice(0, 3).join(" ");
    pushTrace(traces, "insurer", "Matched generic assurance label", name);
    return name;
  }

  pushTrace(traces, "insurer", "No insurer matched", null);
  return null;
}

function extractAmountTTC(text: string, traces: ChargeParseTrace[]): number | null {
  const candidates: { amount: number; label: string; priority: number }[] = [];

  const scanPattern = (
    pattern: RegExp,
    label: string,
    priority: number,
  ): void => {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const raw = match[1]!.trim();
      const amount = parseFrenchCurrencyAmount(raw);
      if (amount === null) {
        pushTrace(traces, "amount-reject", `Malformed amount for ${label}`, raw);
        continue;
      }
      candidates.push({ amount, label, priority });
      pushTrace(traces, "amount-candidate", `${label} → ${amount}`, raw);
    }
  };

  scanPattern(AMOUNT_LABEL_PATTERN, "label+ttc", 3);
  scanPattern(AMOUNT_TTC_FIRST_PATTERN, "ttc-first", 2);

  const fallbackEuro = text.match(
    /(\d{1,3}(?:\s\d{3})*,\d{2}|\d+,\d{2})\s*(?:€|eur)\b/gi,
  );
  if (fallbackEuro) {
    for (const raw of fallbackEuro) {
      const amount = parseFrenchCurrencyAmount(raw);
      if (amount !== null) {
        candidates.push({ amount, label: "euro-suffix", priority: 1 });
        pushTrace(traces, "amount-candidate", `euro-suffix → ${amount}`, raw);
      }
    }
  }

  if (candidates.length === 0) {
    pushTrace(traces, "amount", "No valid TTC amount", null);
    return null;
  }

  candidates.sort((a, b) => b.priority - a.priority || b.amount - a.amount);
  const winner = candidates[0]!;
  pushTrace(traces, "amount", `Selected ${winner.label}`, winner.amount);
  return winner.amount;
}

function extractPeriod(
  text: string,
  traces: ChargeParseTrace[],
): { debut: string | null; fin: string | null } {
  const tryPair = (debutRaw: string, finRaw: string, source: string): boolean => {
    const debut = normalizeChargeDateValue(debutRaw);
    const fin = normalizeChargeDateValue(finRaw);
    if (debut && fin) {
      pushTrace(traces, "period", source, `${debut} → ${fin}`);
      return true;
    }
    pushTrace(traces, "period-reject", `${source} invalid dates`, `${debutRaw} / ${finRaw}`);
    return false;
  };

  let stored: { debut: string; fin: string } | null = null;

  const effet = text.match(EFFET_ECHEANCE_PATTERN);
  if (effet) {
    const debut = normalizeChargeDateValue(effet[1]!);
    const fin = normalizeChargeDateValue(effet[2]!);
    if (debut && fin) {
      stored = { debut, fin };
      pushTrace(traces, "period", "effet-echeance", `${debut} → ${fin}`);
    }
  }

  if (!stored) {
    const range = text.match(PERIOD_RANGE_PATTERN) ?? text.match(PERIOD_DU_AU_PATTERN);
    if (range && tryPair(range[1]!, range[2]!, "range")) {
      const debut = normalizeChargeDateValue(range[1]!)!;
      const fin = normalizeChargeDateValue(range[2]!)!;
      stored = { debut, fin };
    }
  }

  if (!stored) {
    pushTrace(traces, "period", "No contract period found", null);
    return { debut: null, fin: null };
  }

  return { debut: stored.debut, fin: stored.fin };
}

function extractRiskAddress(text: string, traces: ChargeParseTrace[]): string {
  const headerMatch = text.match(ADDRESS_HEADER_PATTERN);
  if (!headerMatch || headerMatch.index === undefined) {
    pushTrace(traces, "address", "No risk address header", null);
    return "";
  }

  const start = headerMatch.index + headerMatch[0].length;
  const tail = text.slice(start);
  const lines: string[] = [];

  for (const line of tail.split(/\n+/)) {
    const trimmed = line.trim();
    if (!trimmed) break;
    if (
      /^(?:p[eé]riode|prime|montant|total|date|contrat|n[°o])/i.test(trimmed) ||
      /\bttc\b/i.test(trimmed)
    ) {
      break;
    }
    lines.push(trimmed);
    if (lines.length >= 5) break;
  }

  if (lines.length === 0) {
    pushTrace(traces, "address", "Address block empty", null);
    return "";
  }

  const block = lines.join("\n");
  const parsed = parseFrenchAddress(block);
  const parts = [parsed.address, parsed.postalCode, parsed.city].filter(Boolean);
  const adresse = parts.join(" ").replace(/\s+/g, " ").trim();
  pushTrace(traces, "address", "Extracted risk address", adresse);
  return adresse;
}

function assessDeductible(text: string, traces: ChargeParseTrace[]): boolean {
  if (NON_DEDUCTIBLE_HINTS.some((p) => p.test(text))) {
    pushTrace(traces, "deductible", "Non-deductible document hints", false);
    return false;
  }

  const habitationContext = DEDUCTIBLE_HINTS.some((p) => p.test(text));
  pushTrace(
    traces,
    "deductible",
    habitationContext ? "LMNP habitation insurance charge" : "No habitation context",
    habitationContext,
  );
  return habitationContext;
}

export type ParseInsuranceDocumentOptions = {
  /** Emit console traces (default true). */
  logTraces?: boolean;
};

/**
 * Parses OCR text from an insurance habitation PDF into structured LMNP charge fields.
 */
export function parseInsuranceDocument(
  rawOcrText: string,
  options?: ParseInsuranceDocumentOptions,
): InsuranceParseResult {
  const traces: ChargeParseTrace[] = [];
  const errors: string[] = [];
  const logTraces = options?.logTraces !== false;

  const normalized = normalizeChargeOcrText(rawOcrText);
  pushTrace(traces, "normalize", "OCR text normalized", normalized.length);

  if (!normalized) {
    errors.push("empty_ocr_text");
    if (logTraces) logChargeParserTraces(PARSER_ID, traces, { ok: false, errors });
    return { data: null, traces, errors };
  }

  const fournisseur = extractInsurer(normalized, traces);
  const montantTTC = extractAmountTTC(normalized, traces);
  const { debut: periodeDebut, fin: periodeFin } = extractPeriod(normalized, traces);
  const adresseBien = extractRiskAddress(rawOcrText, traces);
  const deductible = assessDeductible(normalized, traces);

  if (!fournisseur) errors.push("missing_fournisseur");
  if (montantTTC === null) errors.push("missing_or_invalid_montant_ttc");
  if (!periodeDebut) errors.push("missing_periode_debut");
  if (!periodeFin) errors.push("missing_periode_fin");

  const ok =
    fournisseur !== null &&
    montantTTC !== null &&
    periodeDebut !== null &&
    periodeFin !== null;

  const data: InsuranceChargeDocument | null = ok
    ? {
        type: "assurance_habitation",
        fournisseur: fournisseur!,
        montantTTC: montantTTC!,
        periodeDebut: periodeDebut!,
        periodeFin: periodeFin!,
        adresseBien,
        deductible: deductible && montantTTC! > 0,
      }
    : null;

  pushTrace(traces, "result", ok ? "Parse succeeded" : "Parse incomplete", ok);

  if (logTraces) {
    logChargeParserTraces(PARSER_ID, traces, {
      ok,
      errors,
      fournisseur,
      montantTTC,
      periodeDebut,
      periodeFin,
      adresseBien: adresseBien || null,
      deductible: data?.deductible ?? false,
    });
  }

  return { data, traces, errors };
}
