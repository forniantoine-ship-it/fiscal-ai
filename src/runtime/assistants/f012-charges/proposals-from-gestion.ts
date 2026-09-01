/**
 * Cycle 10 — adaptateur relevé agence / facture comptable → ChargeProposal[].
 * Aucun parser Tunnel A agence n'existe : on réutilise parseFrenchCurrencyAmount
 * + normalizeChargeDateValue + detectFinancementOverlap. Pas de pipeline OCR.
 * Les loyers encaissés ne deviennent jamais une Charge.
 */

import {
  normalizeChargeDateValue,
  parseFrenchCurrencyAmount,
} from "@/lib/lmnp/services/charges/charge-parse-utils";
import { detectFinancementOverlap } from "../../capabilities/f012/detect-financement-overlap";
import type { ChargeProposal, GestionProposalKind } from "./charge-proposal";

export type GestionProposalInput = {
  corpus: string;
  documentId: string;
  fiscalYear: number;
  fileName?: string;
};

export type GestionProposalDiagnostics = {
  /** Loyers / encaissements vus, jamais proposés comme Charge déductible. */
  rentsExcludedAmount: number;
  /** Publicité vue — pas de catégorie fiscale dédiée, mappée honoraires_gestion. */
  publiciteMappedToGestion: boolean;
};

const LABELED_AMOUNT =
  /([^\n]{0,80}?)(\d{1,3}(?:\s\d{3})*,\d{2}|\d+,\d{2}|\d{1,3}(?:\s\d{3})+(?![,\d])|(?<![,\d])\d{2,5}(?![,\d]))\s*(?:€|eur)/gi;

const PAYMENT_DATE =
  /(?:date\s+de\s+paiement|pay[eé]\s+le|pr[eé]lev[eé]\s+le|pr[eé]l[eè]vement\s+du)[^\d\n]{0,12}(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})/i;

const MONTHLY_PACK =
  /(\d{1,2})\s*(?:x|×|paiements?|pr[eé]l[eè]vements?|mensualit[eé]s?)\s*(?:de\s*)?(\d{1,3}(?:\s\d{3})*,\d{2}|\d+,\d{2}|\d+)/i;

const LOYER_SIGNAL =
  /loyers?\s+(encaiss|per[cç]u|re[cç]u)|recettes?\s+locativ|reversement|revers[eé]\s+au\s+propri|d[eé]p[oô]t\s+de\s+garantie|provisions?\s+(locataire|sur\s+loyers?)|total\s+loyers?|loyers?\s+encaiss[eé]s?|montant\s+encaiss[eé]/i;

const GESTION_SIGNAL = /honoraires?\s+(de\s+)?gestion|frais\s+de\s+gestion|gestion\s+locative|\bgestion\b/i;
const EDL_SIGNAL = /[eé]tat\s+des\s+lieux|\bedl\b/i;
const MISE_LOCATION_SIGNAL = /mise\s+en\s+location|frais\s+d['']entr[eé]e|commission\s+d['']entr[eé]e/i;
const COMPTABLE_SIGNAL = /expert[-\s]?comptable|\bcomptable\b|honoraires?\s+comptab/i;
const LOGICIEL_SIGNAL = /logiciel|abonnement\s+(comptable|pennylane|indy|tiime)/i;
const PUBLICITE_SIGNAL = /publicit[eé]|annonces?\s+(de\s+)?location|frais\s+d['']annonce/i;
const ADMIN_SIGNAL = /honoraires?\s+administratif|frais\s+administratif|prestation/i;
const FINANCEMENT_FEE = /frais.{0,40}(cr[eé]dit|pr[eê]t|emprunt|financement)|int[eé]r[eê]ts?\s+(du\s+)?pr[eê]t/i;

function yearFromDate(date: string | undefined): number | undefined {
  if (!date) return undefined;
  const match = date.match(/(\d{4})$/);
  return match ? Number(match[1]) : undefined;
}

function extractDate(corpus: string, pattern: RegExp): string | undefined {
  const match = pattern.exec(corpus);
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
    const year = yearFromDate(normalized ?? undefined);
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

export function isGestionFinancementText(text: string): boolean {
  if (detectFinancementOverlap({ description: text, montant: 0 }).kind !== "none") return true;
  return FINANCEMENT_FEE.test(text);
}

function classifySnippet(text: string): GestionProposalKind | undefined {
  if (isGestionFinancementText(text)) return "financement";
  if (LOYER_SIGNAL.test(text)) return "loyer";
  if (EDL_SIGNAL.test(text)) return "etat_des_lieux";
  if (MISE_LOCATION_SIGNAL.test(text)) return "mise_en_location";
  if (LOGICIEL_SIGNAL.test(text)) return "logiciel";
  if (COMPTABLE_SIGNAL.test(text)) return "comptable";
  if (PUBLICITE_SIGNAL.test(text) || ADMIN_SIGNAL.test(text)) return "autre";
  if (GESTION_SIGNAL.test(text) || /honoraires?/i.test(text)) return "gestion";
  return undefined;
}

function descriptionFor(kind: GestionProposalKind): string {
  switch (kind) {
    case "etat_des_lieux":
      return "État des lieux";
    case "mise_en_location":
      return "Mise en location";
    case "comptable":
      return "Comptable";
    case "logiciel":
      return "Logiciel";
    case "autre":
      return "Autre frais professionnel";
    case "loyer":
      return "Loyers encaissés";
    case "financement":
      return "Frais liés à votre prêt";
    default:
      return "Frais de l'agence";
  }
}

function exclusionFor(kind: GestionProposalKind): string | undefined {
  if (kind === "loyer") {
    return "Ces montants sont des loyers encaissés. Ce n'est pas une dépense.";
  }
  if (kind === "financement") {
    return "Cette dépense concerne votre prêt. Elle est déjà prise en compte dans Financement.";
  }
  return undefined;
}

type LabeledSlice = { kind: GestionProposalKind; amount: number };

function extractLabeledSlices(corpus: string): LabeledSlice[] {
  const slices: LabeledSlice[] = [];
  LABELED_AMOUNT.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = LABELED_AMOUNT.exec(corpus)) !== null) {
    const sameLine = `${match[1] ?? ""} ${match[0] ?? ""}`;
    const nearby = corpus.slice(Math.max(0, match.index - 80), Math.min(corpus.length, match.index + match[0].length + 40));
    const amount = parseFrenchCurrencyAmount(match[2] ?? "", { min: 1, max: 200_000 });
    if (amount === null) continue;
    const kind = classifySnippet(sameLine) ?? classifySnippet(nearby);
    if (!kind) continue;
    slices.push({ kind, amount });
  }
  return slices;
}

function extractMonthlyTotal(corpus: string): { amount: number; count: number } | undefined {
  const pack = MONTHLY_PACK.exec(corpus);
  if (!pack) return undefined;
  const count = Number.parseInt(pack[1] ?? "", 10);
  const unit = parseFrenchCurrencyAmount(pack[2] ?? "", { min: 1, max: 50_000 });
  if (!Number.isFinite(count) || count < 2 || count > 12 || unit === null) return undefined;
  return { amount: Math.round(count * unit * 100) / 100, count };
}

function collapseByKind(slices: LabeledSlice[]): LabeledSlice[] {
  const byKind = new Map<GestionProposalKind, number>();
  for (const slice of slices) {
    byKind.set(slice.kind, Math.round(((byKind.get(slice.kind) ?? 0) + slice.amount) * 100) / 100);
  }
  return [...byKind.entries()].map(([kind, amount]) => ({ kind, amount }));
}

function buildProposal(input: {
  documentId: string;
  kind: GestionProposalKind;
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
    familyId: "gestion",
    description: descriptionFor(input.kind),
    amount: input.amount,
    exercise: input.exercise,
    paymentDate: input.paymentDate,
    gestionKind: input.kind,
    paymentProven: input.kind === "loyer" || input.kind === "financement" ? true : input.paymentProven,
    exclusionReason: exclusionFor(input.kind),
    missingFields: missingFields({
      amount: input.amount,
      exercise: input.exercise,
      paymentDate: input.paymentDate,
      paymentProven: input.kind === "loyer" || input.kind === "financement" ? true : input.paymentProven,
    }),
    decision: "pending",
    groupId: input.groupId,
  };
}

export function gestionProposalDiagnostics(proposals: ChargeProposal[], corpus: string): GestionProposalDiagnostics {
  const rents = proposals
    .filter((item) => item.gestionKind === "loyer")
    .reduce((sum, item) => sum + (item.amount ?? 0), 0);
  return {
    rentsExcludedAmount: rents,
    publiciteMappedToGestion: PUBLICITE_SIGNAL.test(corpus) && proposals.some((item) => item.gestionKind === "autre"),
  };
}

export function proposalsFromGestionCorpus(input: GestionProposalInput): ChargeProposal[] {
  const paymentDate = extractDate(input.corpus, PAYMENT_DATE);
  const paymentYears = collectPaymentYears(input.corpus);
  const paymentYear = yearFromDate(paymentDate) ?? paymentYears[0];
  const allPaymentsNextYear =
    paymentYears.length > 0 && paymentYears.every((year) => year === input.fiscalYear + 1);
  const paymentProven = !allPaymentsNextYear && (Boolean(paymentDate) || paymentYears.length > 0);
  const exercise = allPaymentsNextYear
    ? input.fiscalYear + 1
    : paymentYear ?? (paymentProven ? input.fiscalYear : undefined);

  const labeled = collapseByKind(extractLabeledSlices(input.corpus));
  const monthly = extractMonthlyTotal(input.corpus);
  const corpusKind = classifySnippet(input.corpus);

  const proposals: ChargeProposal[] = [];
  const seen = new Set<string>();

  const push = (kind: GestionProposalKind, amount: number | undefined, suffix: string, groupId?: string) => {
    const key = `${kind}:${amount ?? "missing"}`;
    if (seen.has(key)) return;
    seen.add(key);
    proposals.push(
      buildProposal({
        documentId: input.documentId,
        kind,
        amount,
        exercise: kind === "loyer" || kind === "financement" ? exercise ?? input.fiscalYear : exercise,
        paymentDate,
        paymentProven: Boolean(paymentProven && amount !== undefined),
        suffix,
        groupId,
      }),
    );
  };

  const monthlyUnit = monthly ? Math.round((monthly.amount / monthly.count) * 100) / 100 : undefined;
  for (const slice of labeled) {
    const monthlyKindMatch = slice.kind === "gestion" || slice.kind === corpusKind;
    if (
      monthly &&
      monthlyKindMatch &&
      (Math.abs(monthly.amount - slice.amount) < 0.01 ||
        (monthlyUnit !== undefined && Math.abs(monthlyUnit - slice.amount) < 0.01))
    ) {
      continue;
    }
    push(slice.kind, slice.amount, `${slice.kind}:${slice.amount}`);
  }

  if (monthly && !labeled.some((item) => item.kind === "loyer" && item.amount === monthly.amount)) {
    const monthlyKind =
      corpusKind && corpusKind !== "loyer" && corpusKind !== "financement" ? corpusKind : "gestion";
    const monthlyExercise = allPaymentsNextYear ? input.fiscalYear + 1 : paymentYear ?? input.fiscalYear;
    if (!seen.has(`${monthlyKind}:${monthly.amount}`)) {
      seen.add(`${monthlyKind}:${monthly.amount}`);
      proposals.push(
        buildProposal({
          documentId: input.documentId,
          kind: monthlyKind,
          amount: monthly.amount,
          exercise: monthlyExercise,
          paymentDate,
          paymentProven: !allPaymentsNextYear && (paymentProven || paymentYears.length > 0),
          suffix: "mensualites",
          groupId: `${input.documentId}:prime-annuelle`,
        }),
      );
    }
  }

  if (proposals.length === 0) {
    const kind = corpusKind && corpusKind !== "loyer" ? corpusKind : "gestion";
    return [
      buildProposal({
        documentId: input.documentId,
        kind,
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
