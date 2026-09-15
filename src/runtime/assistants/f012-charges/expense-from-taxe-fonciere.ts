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
import {
  extractPaymentDate,
  extractPrelevements,
  isMontantPayableReliable,
  resolveTaxeFonciereAnnualAmount,
  sumPrelevements,
  yearFromPaymentDate,
} from "./proposals-from-taxe-fonciere";

/** Ré-export — non-régression : `sumPrelevements` vivait ici avant centralisation (Blocker #1). */
export { sumPrelevements };

export type TaxeFonciereExpenseInput = {
  corpus: string;
  documentId: string;
  fiscalYear: number;
};

/**
 * Correctif post-audit P0 (F012 V2 Phase 3 — impots) : un avis mensualisé
 * (plusieurs prélèvements) reste UNE SEULE taxe foncière annuelle — jamais
 * une `Expense` par prélèvement. `pendingTaxeFonciereExpense`/
 * `collected.taxeFonciereExpense` (types.ts) sont SCALAIRES par construction
 * (un seul `Expense` par famille "impots") ; produire un tableau de N
 * dépenses ferait écraser silencieusement les N-1 premières lors du
 * `dispatch` séquentiel du panel (`receive_taxe_fonciere_expense`,
 * "last write wins" — perte fiscale silencieuse, cf. audit).
 *
 * Correctif Blocker #1 (re-audit) : la résolution entre `montantPayable`
 * (montant annuel explicite) et la somme des prélèvements N'EST PLUS un
 * "prélèvements ≥ 2 priment toujours" aveugle — elle délègue à
 * `resolveTaxeFonciereAnnualAmount` (proposals-from-taxe-fonciere.ts, RÈGLE
 * UNIQUE partagée avec le chemin `ChargeProposal` historique). Si les deux
 * sources divergent au-delà de la tolérance d'arrondi documentée, AUCUNE
 * valeur n'est choisie silencieusement : la dépense reste `pending`,
 * `montantExtrait` absent, `reviewNeeded=true`, `montantConflict` porte les
 * deux montants pour que l'utilisateur tranche explicitement (jamais un
 * export d'aucune des deux valeurs avec une confiance apparente).
 *
 * `id` est dérivé du document seul (`taxe-annuelle`), jamais d'un index de
 * prélèvement : il n'y a plus qu'UNE dépense candidate par document, donc
 * plus de discriminant positionnel à stabiliser (P1 résolu comme
 * conséquence directe de l'agrégation P0, pas par un mécanisme séparé).
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

  const resolution = resolveTaxeFonciereAnnualAmount({
    montantPayable: parsed.data?.montantPayable,
    montantPayableReliable: isMontantPayableReliable(parsed),
    prelevements,
  });

  const base = {
    id: deriveExpenseIdFromDocument(input.documentId, resolution.status === "divergent" ? "taxe-fonciere" : "taxe-annuelle"),
    exerciceFiscal: exercice,
    dateDepense: paymentDate,
    origin: "document" as const,
    documentId: input.documentId,
    category: "taxe_fonciere" as const,
    decision: "pending" as const,
  };

  if (resolution.status === "divergent") {
    // Deux sources renseignées ET divergentes : jamais un montant retenu
    // silencieusement (invariant de sécurité, mission §2). `montantExtrait`
    // reste absent — même garde déjà existante que "aucun montant lisible"
    // (`taxeFonciereExpenseMissingAmount`/`reviewNeeded`, réutilisée telle
    // quelle) — aucune nouvelle architecture de blocage inventée ici.
    return [
      {
        ...base,
        id: deriveExpenseIdFromDocument(input.documentId, "taxe-fonciere"),
        montant: 0,
        montantExtrait: undefined,
        description: "Taxe foncière — montant à vérifier",
        fieldSources: {},
        reviewNeeded: true,
        montantConflict: {
          montantIndique: resolution.montantIndique,
          sommePrelevements: resolution.sommePrelevements,
        },
      },
    ];
  }

  if (resolution.status === "prelevements_only" || resolution.status === "concordant") {
    return [
      {
        ...base,
        id: deriveExpenseIdFromDocument(input.documentId, "taxe-annuelle"),
        montant: resolution.amount,
        montantExtrait: resolution.amount,
        description: `Taxe foncière (${resolution.prelevementsCount} prélèvements)`,
        fieldSources: { montant: "extracted" as const },
      },
    ];
  }

  const amount = resolution.status === "explicit_only" ? resolution.amount : undefined;
  return [
    {
      ...base,
      id: deriveExpenseIdFromDocument(input.documentId, "taxe-fonciere"),
      // Aucun montant reconnu : ne complète PAS artificiellement (mission
      // §1) — 0 n'est jamais inventé pour combler l'absence ; la dépense
      // reste "pending" avec un montant absent, jamais confirmable en l'état
      // (l'utilisateur devra le renseigner avant toute confirmation).
      montant: amount ?? 0,
      montantExtrait: amount,
      description: "Taxe foncière",
      fieldSources: amount !== undefined ? { montant: "extracted" as const } : {},
      reviewNeeded: amount === undefined,
    },
  ];
}

/** Pure predicate — même contrat que `ChargeProposal.missingFields` (amount manquant). */
export function taxeFonciereExpenseMissingAmount(expense: Pick<Expense, "montantExtrait" | "montant" | "decision">): boolean {
  return expense.decision === "pending" && expense.montantExtrait === undefined;
}
