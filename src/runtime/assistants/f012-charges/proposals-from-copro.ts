/**
 * Cycle 7 — adaptateur décompte syndic → ChargeProposal[].
 * Réutilise parseCoproprieteDocument + normalizeChargeTransactions.
 * Le total du document n'est jamais une Charge.
 */

import { parseFrenchCurrencyAmount } from "@/lib/lmnp/services/charges/charge-parse-utils";
import {
  normalizeChargeTransactions,
  rawTransactionsFromCopro,
} from "@/lib/lmnp/services/charges/normalize-charge-transactions";
import { parseCoproprieteDocument } from "@/lib/lmnp/services/charges/parse-copropriete-document";
import type { CoproLigneType } from "../../capabilities/f012/types";
import type { ChargeProposal } from "./charge-proposal";

export type CoproProposalInput = {
  corpus: string;
  documentId: string;
  fiscalYear: number;
  fileName?: string;
};

export type CoproProposalDiagnostics = {
  documentLineTotal: number;
  deductibleProposed: number;
};

function coproTypeFromLine(label: string, category: string): CoproLigneType | undefined {
  if (/r[eé]gularis/i.test(label)) return "regularisation";
  if (category === "fonds_travaux") return "fonds_travaux";
  if (category === "charges_copro") return "provisions";
  return undefined;
}

function exclusionFor(category: string, coproType: CoproLigneType | undefined): string | undefined {
  if (category === "fonds_travaux" || coproType === "fonds_travaux") {
    return "épargne pour de futurs travaux — pas encore une dépense";
  }
  if (category === "avance_tresorerie") {
    return "avance de trésorerie — pas une charge de l'exercice";
  }
  return undefined;
}

export function coproProposalDiagnostics(proposals: ChargeProposal[]): CoproProposalDiagnostics {
  const documentLineTotal = proposals.reduce((sum, item) => sum + (item.amount ?? 0), 0);
  const deductibleProposed = proposals
    .filter((item) => !item.exclusionReason)
    .reduce((sum, item) => sum + (item.amount ?? 0), 0);
  return { documentLineTotal, deductibleProposed };
}

export function proposalsFromCoproCorpus(input: CoproProposalInput): ChargeProposal[] {
  const parsed = parseCoproprieteDocument(input.corpus, { logTraces: false });
  const normalized = normalizeChargeTransactions(rawTransactionsFromCopro(parsed.transactions), {
    logTraces: false,
  });

  if (normalized.transactions.length === 0) {
    return [
      {
        id: `${input.documentId}:copro-incomplete`,
        documentId: input.documentId,
        familyId: "syndic",
        description: "Ligne du décompte syndic",
        exercise: input.fiscalYear,
        missingFields: ["amount"],
        decision: "pending",
      },
    ];
  }

  const fromParser = normalized.transactions.map((tx, index) => {
    const label = tx.label ?? tx.category;
    const coproType = coproTypeFromLine(label, tx.category);
    const exclusionReason = exclusionFor(tx.category, coproType);
    return {
      id: `${input.documentId}:copro:${index + 1}`,
      documentId: input.documentId,
      familyId: "syndic" as const,
      description: label,
      amount: tx.amount,
      exercise: input.fiscalYear,
      ...(coproType !== undefined ? { coproType } : {}),
      ...(exclusionReason !== undefined ? { exclusionReason } : {}),
      missingFields: [] as ChargeProposal["missingFields"],
      decision: "pending" as const,
    };
  });
  const alreadyHasRegularisation = fromParser.some((item) => item.coproType === "regularisation");
  if (alreadyHasRegularisation) return fromParser;
  return [...fromParser, ...regularisationProposalsFromCorpus(input)];
}

const REGULARISATION_LINE =
  /r[eé]gularis[\s\S]{0,80}?(\d{1,3}(?:\s\d{3})*,\d{2}|\d+,\d{2})/gi;

function regularisationProposalsFromCorpus(input: CoproProposalInput): ChargeProposal[] {
  const proposals: ChargeProposal[] = [];
  REGULARISATION_LINE.lastIndex = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = REGULARISATION_LINE.exec(input.corpus)) !== null) {
    const amount = parseFrenchCurrencyAmount(match[1] ?? "", { min: 0.01, max: 50_000 });
    if (amount === null) continue;
    index += 1;
    proposals.push({
      id: `${input.documentId}:regularisation:${index}`,
      documentId: input.documentId,
      familyId: "syndic",
      description: match[0]!.replace(/\s+/g, " ").trim(),
      amount,
      exercise: input.fiscalYear,
      coproType: "regularisation",
      missingFields: [],
      decision: "pending",
    });
  }
  return proposals;
}
