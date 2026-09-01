/**
 * Cycle 7 — adaptateur avis de taxe foncière → ChargeProposal[].
 * Réutilise parseTaxeFonciereDocument + helpers de dates/montants existants.
 * N'invente aucun montant.
 */

import {
  normalizeChargeDateValue,
  parseFrenchCurrencyAmount,
} from "@/lib/lmnp/services/charges/charge-parse-utils";
import { parseTaxeFonciereDocument } from "@/lib/lmnp/services/charges/parse-taxe-fonciere-document";
import type { ChargeProposal } from "./charge-proposal";

export type TaxeFonciereProposalInput = {
  corpus: string;
  documentId: string;
  fiscalYear: number;
  fileName?: string;
};

const PRELEVEMENT_LINE =
  /pr[eé]l[eè]vement[^\d\n]{0,20}(?:\d+\s*[:.)-]?\s*)?(\d{1,3}(?:\s\d{3})*,\d{2}|\d+,\d{2})/gi;

const PAYMENT_DATE =
  /(?:date\s+de\s+paiement|pay[eé]\s+le|pr[eé]lev[eé]\s+le)[^\d\n]{0,12}(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})/i;

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

function extractPrelevements(corpus: string): number[] {
  const amounts: number[] = [];
  PRELEVEMENT_LINE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PRELEVEMENT_LINE.exec(corpus)) !== null) {
    const nearby = match[0] ?? "";
    if (/teom/i.test(nearby)) continue;
    const amount = parseFrenchCurrencyAmount(match[1] ?? "", { min: 1, max: 50_000 });
    if (amount !== null) amounts.push(amount);
  }
  return amounts;
}

function missingFields(input: {
  amount?: number;
  exercise?: number;
  paymentDate?: string;
}): ChargeProposal["missingFields"] {
  const missing: ChargeProposal["missingFields"] = [];
  if (input.amount === undefined) missing.push("amount");
  if (input.exercise === undefined) missing.push("exercise");
  if (!input.paymentDate) missing.push("paymentDate");
  return missing;
}

export function proposalsFromTaxeFonciereCorpus(input: TaxeFonciereProposalInput): ChargeProposal[] {
  const parsed = parseTaxeFonciereDocument(input.corpus, { logTraces: false });
  const paymentDate = extractPaymentDate(input.corpus);
  const paymentYear = yearFromPaymentDate(paymentDate);
  const impositionYear = parsed.data?.anneeImposition
    ? Number.parseInt(parsed.data.anneeImposition, 10)
    : undefined;
  const exercise = paymentYear ?? (Number.isFinite(impositionYear) ? impositionYear : undefined);
  const prelevements = extractPrelevements(input.corpus);

  if (prelevements.length >= 2) {
    const groupId = `${input.documentId}:taxe-annuelle`;
    return prelevements.map((amount, index) => ({
      id: `${input.documentId}:prelevement:${index + 1}`,
      documentId: input.documentId,
      familyId: "impots" as const,
      description: `Paiement ${index + 1} · taxe foncière`,
      amount,
      exercise,
      paymentDate,
      missingFields: missingFields({ amount, exercise, paymentDate }),
      decision: "pending" as const,
      groupId,
    }));
  }

  const amount = parsed.data?.montantPayable;
  if (amount === undefined) {
    return [
      {
        id: `${input.documentId}:taxe-fonciere`,
        documentId: input.documentId,
        familyId: "impots",
        description: "Taxe foncière",
        exercise,
        paymentDate,
        missingFields: missingFields({ exercise, paymentDate }),
        decision: "pending",
      },
    ];
  }

  return [
    {
      id: `${input.documentId}:taxe-fonciere`,
      documentId: input.documentId,
      familyId: "impots",
      description: "Taxe foncière",
      amount,
      exercise,
      paymentDate,
      missingFields: missingFields({ amount, exercise, paymentDate }),
      decision: "pending",
    },
  ];
}
