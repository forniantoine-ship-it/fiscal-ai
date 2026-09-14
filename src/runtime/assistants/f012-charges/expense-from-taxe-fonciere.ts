/**
 * F012 V2 document-first — Phase 2, premier vertical slice (famille "impots" /
 * taxe foncière — choisie pour sa simplicité : un seul montant scalaire, peu
 * d'ambiguïté fiscale, cf. `proposals-from-taxe-fonciere.ts` déjà en
 * production pour cette même famille).
 *
 * Réutilise EXACTEMENT la même extraction déterministe que le chemin
 * `ChargeProposal` existant (`parseTaxeFonciereDocument`, `extractPaymentDate`,
 * `extractPrelevements`) — aucun nouveau parseur, aucun nouvel OCR, aucune
 * nouvelle règle. Seule la forme de sortie change : `Expense[]` au lieu de
 * `ChargeProposal[]`, pour cette famille migrée uniquement.
 */

import { parseTaxeFonciereDocument } from "@/lib/lmnp/services/charges/parse-taxe-fonciere-document";
import type { Expense } from "../../capabilities/f012/expense";
import { deriveExpenseIdFromDocument } from "../../capabilities/f012/expense";
import { extractPaymentDate, extractPrelevements, yearFromPaymentDate } from "./proposals-from-taxe-fonciere";

export type TaxeFonciereExpenseInput = {
  corpus: string;
  documentId: string;
  fiscalYear: number;
};

/**
 * `itemKey` mirroir le même schéma que `ChargeProposal.id` pour cette même
 * famille (`${documentId}:taxe-fonciere` / `${documentId}:prelevement:${n}`,
 * voir `proposals-from-taxe-fonciere.ts`) — même discriminant d'item stable,
 * jamais un index de tableau instable.
 */
export function expensesFromTaxeFonciereCorpus(input: TaxeFonciereExpenseInput): Expense[] {
  const parsed = parseTaxeFonciereDocument(input.corpus, { logTraces: false });
  const paymentDate = extractPaymentDate(input.corpus);
  const paymentYear = yearFromPaymentDate(paymentDate);
  const impositionYear = parsed.data?.anneeImposition
    ? Number.parseInt(parsed.data.anneeImposition, 10)
    : undefined;
  const exercice = paymentYear ?? (Number.isFinite(impositionYear) ? impositionYear : undefined) ?? input.fiscalYear;
  const prelevements = extractPrelevements(input.corpus);

  if (prelevements.length >= 2) {
    return prelevements.map((amount, index) => ({
      id: deriveExpenseIdFromDocument(input.documentId, `prelevement:${index + 1}`),
      exerciceFiscal: exercice,
      montant: amount,
      montantExtrait: amount,
      description: `Paiement ${index + 1} · taxe foncière`,
      dateDepense: paymentDate,
      origin: "document" as const,
      documentId: input.documentId,
      fieldSources: { montant: "extracted" as const },
      category: "taxe_fonciere" as const,
      decision: "pending" as const,
    }));
  }

  const amount = parsed.data?.montantPayable;
  return [
    {
      id: deriveExpenseIdFromDocument(input.documentId, "taxe-fonciere"),
      exerciceFiscal: exercice,
      // Aucun montant reconnu : ne complète PAS artificiellement (mission
      // §1) — 0 n'est jamais inventé pour combler l'absence ; la dépense
      // reste "pending" avec un montant absent, jamais confirmable en l'état
      // (l'utilisateur devra le renseigner avant toute confirmation).
      montant: amount ?? 0,
      montantExtrait: amount,
      description: "Taxe foncière",
      dateDepense: paymentDate,
      origin: "document",
      documentId: input.documentId,
      fieldSources: amount !== undefined ? { montant: "extracted" } : {},
      category: "taxe_fonciere",
      decision: "pending",
      reviewNeeded: amount === undefined,
    },
  ];
}

/** Pure predicate — même contrat que `ChargeProposal.missingFields` (amount manquant). */
export function taxeFonciereExpenseMissingAmount(expense: Pick<Expense, "montantExtrait" | "montant" | "decision">): boolean {
  return expense.decision === "pending" && expense.montantExtrait === undefined;
}
