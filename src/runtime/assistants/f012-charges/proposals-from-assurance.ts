/**
 * Cycle 9 — adaptateur assurance habitation / loyers impayés → ChargeProposal[].
 * Réutilise parseInsuranceDocument + detectFinancementOverlap.
 * N'invente aucun montant payé. Une prime annuelle n'est pas un paiement.
 */

import {
  normalizeChargeDateValue,
  parseFrenchCurrencyAmount,
} from "@/lib/lmnp/services/charges/charge-parse-utils";
import { parseInsuranceDocument } from "@/lib/lmnp/services/charges/parse-insurance-document";
import { detectFinancementOverlap } from "../../capabilities/f012/detect-financement-overlap";
import type { AssuranceProposalKind, ChargeProposal } from "./charge-proposal";

export type AssuranceProposalInput = {
  corpus: string;
  documentId: string;
  fiscalYear: number;
  fileName?: string;
};

export type AssuranceProposalDiagnostics = {
  /** Mention de loyers impayés sans montant séparable — pas une Charge inventée. */
  gliMentionedWithoutAmount: boolean;
};

const PAYMENT_DATE =
  /(?:date\s+de\s+paiement|pay[eé]\s+le|pr[eé]lev[eé]\s+le|pr[eé]l[eè]vement\s+du)[^\d\n]{0,12}(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})/i;

const MONTHLY_PACK =
  /(\d{1,2})\s*(?:x|×|paiements?|pr[eé]l[eè]vements?|mensualit[eé]s?)\s*(?:de\s*)?(\d{1,3}(?:\s\d{3})*,\d{2}|\d+,\d{2}|\d+)/i;

const MONTHLY_LINE =
  /(?:mensualit[eé]|pr[eé]l[eè]vement\s+mensuel|cotisation\s+mensuelle)[^\d\n]{0,24}(\d{1,3}(?:\s\d{3})*,\d{2}|\d+,\d{2}|\d+)/gi;

const LABELED_AMOUNT =
  /([^\n]{0,80}?)(\d{1,3}(?:\s\d{3})*,\d{2}|\d+,\d{2}|(?<![,\d])\d{2,5}(?![,\d]))\s*(?:€|eur)/gi;

const LOGEMENT_SIGNAL =
  /habitation|logement|multirisque|\bpno\b|propri[eé]taire|d[eé]g[aâ]t[s]?\s+des\s+eaux|incendie|meubl[eé]/i;

const GLI_SIGNAL = /loyers?\s+impay|garantie\s+locative|\bgli\b/i;

const NON_PREMIUM_NEARBY = /capital\s+(?:mobilier|assur)|franchise|plafond|montant\s+garanti/i;

function yearFromPaymentDate(date: string | undefined): number | undefined {
  if (!date) return undefined;
  const match = date.match(/(\d{4})$/);
  return match ? Number(match[1]) : undefined;
}

function extractPaymentDate(corpus: string): string | undefined {
  const match = PAYMENT_DATE.exec(corpus);
  if (!match?.[1]) return undefined;
  return normalizeChargeDateValue(match[1]) ?? undefined;
}

function collectPaymentYears(corpus: string): number[] {
  const years: number[] = [];
  const dateRe = /(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})/g;
  let match: RegExpExecArray | null;
  while ((match = dateRe.exec(corpus)) !== null) {
    const nearby = corpus.slice(Math.max(0, match.index - 40), match.index + match[0].length + 20);
    if (!/pay|pr[eé]l[eè]v|mensual|[eé]ch[eé]ance/i.test(nearby)) continue;
    const normalized = normalizeChargeDateValue(match[1] ?? "");
    const year = yearFromPaymentDate(normalized ?? undefined);
    if (year !== undefined) years.push(year);
  }
  return years;
}

function missingFields(input: {
  amount?: number;
  exercise?: number;
  paymentDate?: string;
  paymentProven?: boolean;
}): ChargeProposal["missingFields"] {
  const missing: ChargeProposal["missingFields"] = [];
  if (input.amount === undefined) missing.push("amount");
  if (input.exercise === undefined) missing.push("exercise");
  if (!input.paymentDate && !input.paymentProven) missing.push("paymentDate");
  return missing;
}

function isEmprunteurText(text: string): boolean {
  return detectFinancementOverlap({ description: text, montant: 0 }).kind === "assurance_emprunteur";
}

function isGliText(text: string): boolean {
  return GLI_SIGNAL.test(text);
}

function isLogementText(text: string): boolean {
  return LOGEMENT_SIGNAL.test(text) && !isEmprunteurText(text);
}

function classifySnippet(text: string): AssuranceProposalKind | undefined {
  if (isEmprunteurText(text)) return "emprunteur";
  if (isGliText(text) && !isLogementText(text)) return "gli";
  if (isLogementText(text)) return "logement";
  if (isGliText(text)) return "gli";
  return undefined;
}

function extractPaymentAmount(corpus: string): number | undefined {
  const match =
    /(?:pay[eé]|pr[eé]l[eè]v|r[eè]gl[eé]|montant\s+(?:pay[eé]|r[eé]gl[eé]))[^\d\n]{0,28}(\d{1,3}(?:\s\d{3})*,\d{2}|\d+,\d{2})/i.exec(
      corpus,
    );
  if (!match?.[1]) return undefined;
  return parseFrenchCurrencyAmount(match[1], { min: 1, max: 50_000 }) ?? undefined;
}

function extractMonthlyTotal(corpus: string): { amount: number; count: number } | undefined {
  const pack = MONTHLY_PACK.exec(corpus);
  if (pack) {
    const count = Number.parseInt(pack[1] ?? "", 10);
    const unit = parseFrenchCurrencyAmount(pack[2] ?? "", { min: 1, max: 50_000 });
    if (Number.isFinite(count) && count >= 2 && count <= 12 && unit !== null) {
      return { amount: Math.round(count * unit * 100) / 100, count };
    }
  }
  MONTHLY_LINE.lastIndex = 0;
  const units: number[] = [];
  let line: RegExpExecArray | null;
  while ((line = MONTHLY_LINE.exec(corpus)) !== null) {
    const amount = parseFrenchCurrencyAmount(line[1] ?? "", { min: 1, max: 50_000 });
    if (amount !== null) units.push(amount);
  }
  if (units.length >= 2 && units.every((item) => item === units[0])) {
    return { amount: Math.round(units.length * units[0]! * 100) / 100, count: units.length };
  }
  return undefined;
}

type LabeledSlice = { kind: AssuranceProposalKind; amount: number };

function extractLabeledSlices(corpus: string): LabeledSlice[] {
  const slices: LabeledSlice[] = [];
  LABELED_AMOUNT.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = LABELED_AMOUNT.exec(corpus)) !== null) {
    const from = Math.max(0, match.index - 120);
    const to = Math.min(corpus.length, match.index + match[0].length + 40);
    const nearby = corpus.slice(from, to);
    const sameLine = `${match[1] ?? ""} ${match[0] ?? ""}`;
    if (NON_PREMIUM_NEARBY.test(nearby)) continue;
    const amount = parseFrenchCurrencyAmount(match[2] ?? "", { min: 1, max: 50_000 });
    if (amount === null) continue;
    const kind = classifySnippet(sameLine) ?? classifySnippet(nearby);
    if (!kind) continue;
    if (!slices.some((item) => item.kind === kind && item.amount === amount)) {
      slices.push({ kind, amount });
    }
  }
  return slices;
}

function descriptionFor(kind: AssuranceProposalKind): string {
  if (kind === "emprunteur") return "Assurance de votre prêt";
  if (kind === "gli") return "Assurance loyers impayés";
  return "Assurance du logement";
}

function exclusionFor(kind: AssuranceProposalKind): string | undefined {
  if (kind === "emprunteur") {
    return "Cette assurance concerne votre prêt. Elle est déjà prise en compte dans Financement.";
  }
  return undefined;
}

function buildProposal(input: {
  documentId: string;
  kind: AssuranceProposalKind;
  amount?: number;
  exercise?: number;
  paymentDate?: string;
  paymentProven: boolean;
  suffix: string;
  groupId?: string;
}): ChargeProposal {
  return {
    id: `${input.documentId}:${input.suffix}`,
    documentId: input.documentId,
    familyId: "assurances",
    description: descriptionFor(input.kind),
    amount: input.amount,
    exercise: input.exercise,
    paymentDate: input.paymentDate,
    insuranceKind: input.kind,
    paymentProven: input.paymentProven,
    exclusionReason: exclusionFor(input.kind),
    missingFields: missingFields({
      amount: input.amount,
      exercise: input.exercise,
      paymentDate: input.paymentDate,
      paymentProven: input.paymentProven,
    }),
    decision: "pending",
    groupId: input.groupId,
  };
}

export function assuranceProposalDiagnostics(proposals: ChargeProposal[], corpus: string): AssuranceProposalDiagnostics {
  const hasGliProposal = proposals.some((item) => item.insuranceKind === "gli" && item.amount !== undefined);
  return {
    gliMentionedWithoutAmount: GLI_SIGNAL.test(corpus) && !hasGliProposal,
  };
}

export function proposalsFromAssuranceCorpus(input: AssuranceProposalInput): ChargeProposal[] {
  const parsed = parseInsuranceDocument(input.corpus, { logTraces: false });
  const paymentDate = extractPaymentDate(input.corpus);
  const paymentYears = collectPaymentYears(input.corpus);
  const paymentYear = yearFromPaymentDate(paymentDate) ?? paymentYears[0];
  const allPaymentsNextYear =
    paymentYears.length > 0 && paymentYears.every((year) => year === input.fiscalYear + 1);
  const paymentProven =
    !allPaymentsNextYear && (Boolean(paymentDate) || paymentYears.length > 0);
  const exercise = allPaymentsNextYear
    ? input.fiscalYear + 1
    : paymentYear ?? (paymentProven ? input.fiscalYear : undefined);

  const labeled = extractLabeledSlices(input.corpus);
  const monthly = extractMonthlyTotal(input.corpus);
  const corpusKind = classifySnippet(input.corpus);
  const parsedAmount =
    parsed.data?.montantTTC ?? parsed.amountFieldRanking?.deterministicDefault?.amount;
  const paymentAmount = extractPaymentAmount(input.corpus);
  const monthlyIsInYear =
    monthly !== undefined &&
    !allPaymentsNextYear &&
    (paymentYears.length === 0 || paymentYears.some((year) => year === input.fiscalYear));

  const corpusIsEmprunteurOnly =
    isEmprunteurText(input.corpus) && !LOGEMENT_SIGNAL.test(input.corpus) && !GLI_SIGNAL.test(input.corpus);

  const parserAmountIsEmprunteur = labeled.some(
    (item) => item.kind === "emprunteur" && item.amount === parsedAmount,
  );
  const mixedEmprunteurAndLogement =
    isEmprunteurText(input.corpus) && LOGEMENT_SIGNAL.test(input.corpus);
  const logementFromParser =
    parsedAmount !== undefined &&
    corpusKind !== "gli" &&
    !GLI_SIGNAL.test(input.corpus) &&
    (LOGEMENT_SIGNAL.test(input.corpus) || parsed.data?.type === "assurance_habitation") &&
    !corpusIsEmprunteurOnly &&
    !parserAmountIsEmprunteur &&
    !mixedEmprunteurAndLogement;

  const proposals: ChargeProposal[] = [];
  const seen = new Set<string>();

  const push = (kind: AssuranceProposalKind, amount: number | undefined, suffix: string, groupId?: string) => {
    const key = `${kind}:${amount ?? "missing"}`;
    if (seen.has(key)) return;
    seen.add(key);
    proposals.push(
      buildProposal({
        documentId: input.documentId,
        kind,
        amount,
        exercise: kind === "emprunteur" ? exercise ?? input.fiscalYear : exercise,
        paymentDate,
        paymentProven:
          kind === "emprunteur"
            ? true
            : Boolean((paymentProven || monthlyIsInYear) && amount !== undefined),
        suffix,
        groupId,
      }),
    );
  };

  const monthlyUnit = monthly ? Math.round((monthly.amount / monthly.count) * 100) / 100 : undefined;
  for (const slice of labeled) {
    if (
      slice.kind === "logement" &&
      monthly &&
      (Math.abs(monthly.amount - slice.amount) < 0.01 ||
        (monthlyUnit !== undefined && Math.abs(monthlyUnit - slice.amount) < 0.01))
    ) {
      continue;
    }
    push(slice.kind, slice.amount, `${slice.kind}:${slice.amount}`);
  }

  if (monthly && !corpusIsEmprunteurOnly) {
    const groupId = `${input.documentId}:prime-annuelle`;
    const monthlyExercise = allPaymentsNextYear ? input.fiscalYear + 1 : paymentYear ?? input.fiscalYear;
    proposals.push(
      buildProposal({
        documentId: input.documentId,
        kind: "logement",
        amount: monthly.amount,
        exercise: monthlyExercise,
        paymentDate,
        paymentProven: monthlyIsInYear,
        suffix: "mensualites",
        groupId,
      }),
    );
    seen.add(`logement:${monthly.amount}`);
    if (parsedAmount !== undefined && Math.abs(parsedAmount - monthly.amount) < 0.01) {
      seen.add(`logement:${parsedAmount}`);
    }
  } else if (logementFromParser && parsedAmount !== undefined) {
    push("logement", parsedAmount, "logement");
  } else if (paymentAmount !== undefined && !corpusIsEmprunteurOnly && corpusKind !== "gli") {
    push("logement", paymentAmount, "paiement");
  }

  if (corpusKind === "gli" || (GLI_SIGNAL.test(input.corpus) && !LOGEMENT_SIGNAL.test(input.corpus))) {
    const gliAmount = labeled.find((item) => item.kind === "gli")?.amount ?? parsedAmount ?? paymentAmount;
    if (gliAmount !== undefined) push("gli", gliAmount, "gli");
  }

  if (proposals.every((item) => item.insuranceKind !== "logement") && !corpusIsEmprunteurOnly) {
    if (
      parsedAmount !== undefined &&
      corpusKind !== "gli" &&
      !parserAmountIsEmprunteur &&
      !mixedEmprunteurAndLogement &&
      LOGEMENT_SIGNAL.test(input.corpus)
    ) {
      push("logement", parsedAmount, "logement");
    } else if (proposals.length === 0 && corpusKind !== "gli" && !GLI_SIGNAL.test(input.corpus)) {
      push("logement", undefined, "logement-incomplete");
    }
  }

  if (proposals.length === 0) {
    return [
      buildProposal({
        documentId: input.documentId,
        kind: corpusKind === "emprunteur" ? "emprunteur" : "logement",
        amount: undefined,
        exercise: undefined,
        paymentDate,
        paymentProven: false,
        suffix: "incomplete",
      }),
    ];
  }

  return proposals;
}
