/**
 * Cycle 7 — adaptateur avis de taxe foncière → ChargeProposal[].
 * Réutilise parseTaxeFonciereDocument + helpers de dates/montants existants.
 * N'invente aucun montant.
 */

import {
  normalizeChargeDateValue,
  parseFrenchCurrencyAmount,
} from "@/lib/lmnp/services/charges/charge-parse-utils";
import {
  parseTaxeFonciereDocument,
  type TaxeFonciereParseResult,
} from "@/lib/lmnp/services/charges/parse-taxe-fonciere-document";
import { hasPrimaryPayableSignal } from "@/lib/lmnp/services/charges/taxe-fonciere-amount-selection";
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

/**
 * Exportées (Phase 2 F012 V2) pour réutilisation par `expense-from-taxe-fonciere.ts`
 * — même extraction, jamais une seconde implémentation des mêmes regex.
 */
export function yearFromPaymentDate(date: string | undefined): number | undefined {
  if (!date) return undefined;
  const match = date.match(/(\d{4})$/);
  return match ? Number(match[1]) : undefined;
}

export function extractPaymentDate(corpus: string): string | undefined {
  const match = PAYMENT_DATE.exec(corpus);
  if (!match?.[1]) return undefined;
  return normalizeChargeDateValue(match[1]) ?? undefined;
}

export function extractPrelevements(corpus: string): number[] {
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

/**
 * Agrégation explicite, pure et testable isolément — la somme ne dépend que
 * des VALEURS des prélèvements, jamais de leur position dans le tableau —
 * stable au reorder par construction (addition commutative), aucun état,
 * aucun effet de bord. Réutilisée par les deux chemins (`Expense` ET
 * `ChargeProposal` historique) — une seule implémentation, jamais deux
 * sommes divergentes.
 */
export function sumPrelevements(prelevements: number[]): number {
  return prelevements.reduce((sum, amount) => sum + amount, 0);
}

/**
 * Correctif Blocker #1 (post-re-audit) : tolérance d'arrondi OCR pour
 * réconcilier `montantPayable` (montant annuel explicite, ancré sur un
 * libellé fiable — voir `taxe-fonciere-amount-selection.ts`,
 * `PRIMARY_PAYABLE_LABELS`) et la somme des prélèvements détectés
 * (mensualités OCR, susceptibles d'un écart de quelques centimes à 1€ par
 * arrondi cumulé sur plusieurs échéances). Documentée explicitement (mission
 * §7) : 1500 vs 1499 ou 1501 reste "concordant" ; tout écart supérieur est
 * un désaccord réel entre deux sources, jamais absorbé silencieusement.
 */
export const TAXE_FONCIERE_AMOUNT_TOLERANCE = 1;

/**
 * Résolution UNIQUE du montant annuel de taxe foncière — centralise la règle
 * de priorité entre `montantPayable` (montant annuel explicite, ancré sur un
 * libellé fiable type "net à payer"/"montant à payer"/"total des impôts"/
 * "solde à payer", voir `taxe-fonciere-amount-selection.ts`) et la somme des
 * prélèvements détectés dans le corpus. Réutilisée par `expensesFromTaxeFonciereCorpus`
 * ET `proposalsFromTaxeFonciereCorpus` — une seule règle métier, jamais deux
 * règles divergentes dans le repo (correctif Blocker #1, mission §1/§4).
 *
 * Invariant de sécurité : si les deux sources sont renseignées ET divergent
 * au-delà de la tolérance d'arrondi, AUCUNE valeur n'est choisie
 * silencieusement — `status: "divergent"` force une review utilisateur
 * explicite (les deux chemins consommateurs bloquent alors toute
 * confirmation automatique via leurs mécanismes existants : `missingFields`
 * côté `ChargeProposal`, `reviewNeeded`/`taxeFonciereExpenseMissingAmount`
 * côté `Expense`).
 *
 * Un seul prélèvement isolé (`prelevements.length < 2`) ne prouve jamais, à
 * lui seul, le montant annuel total — il est ignoré au profit du montant
 * explicite s'il existe (même règle que l'historique `annualImpotsAmount`,
 * `document-review-decisions.ts`), jamais combiné ni comparé.
 */
export type TaxeFonciereAmountResolution =
  | { status: "explicit_only"; amount: number }
  | { status: "prelevements_only"; amount: number; prelevementsCount: number }
  | {
      status: "concordant";
      amount: number;
      montantIndique: number;
      sommePrelevements: number;
      prelevementsCount: number;
    }
  | {
      status: "divergent";
      montantIndique: number;
      sommePrelevements: number;
      prelevementsCount: number;
    }
  | { status: "insufficient" };

export function resolveTaxeFonciereAnnualAmount(input: {
  montantPayable: number | undefined;
  /**
   * Correctif Blocker #1 (re-audit — découverte en test) : le ranking
   * déterministe (`taxe-fonciere-amount-selection.ts`) peut retenir un
   * candidat `montantPayable` sans AUCUN signal positif (score=0, ex. un
   * nombre OCR isolé près d'une année) quand c'est le seul candidat trouvé —
   * ce n'est PAS un signal fiable au sens de la mission ("ancré sur un
   * libellé fiable type 'net à payer'..."). Par défaut `true` (comportement
   * historique inchangé pour le cas mono-source) : seuls les appelants qui
   * COMPARENT `montantPayable` aux prélèvements doivent explicitement
   * passer le résultat réel de `hasPrimaryPayableSignal()` — sinon un faux
   * positif OCR bloquerait à tort une agrégation de prélèvements par
   * ailleurs fiable (cas démontré par `AVIS_10_PRELEVEMENTS` en test).
   */
  montantPayableReliable?: boolean;
  prelevements: number[];
}): TaxeFonciereAmountResolution {
  const { montantPayable, prelevements } = input;
  const montantPayableReliable = input.montantPayableReliable ?? true;

  if (prelevements.length < 2) {
    if (montantPayable !== undefined) return { status: "explicit_only", amount: montantPayable };
    return { status: "insufficient" };
  }

  const sommePrelevements = sumPrelevements(prelevements);
  if (montantPayable === undefined || !montantPayableReliable) {
    return { status: "prelevements_only", amount: sommePrelevements, prelevementsCount: prelevements.length };
  }

  const diverges = Math.abs(montantPayable - sommePrelevements) > TAXE_FONCIERE_AMOUNT_TOLERANCE;
  if (diverges) {
    return {
      status: "divergent",
      montantIndique: montantPayable,
      sommePrelevements,
      prelevementsCount: prelevements.length,
    };
  }

  // Concordant (égal ou dans la tolérance d'arrondi) : le montant explicite,
  // ancré sur un libellé fiable, sert de référence canonique.
  return {
    status: "concordant",
    amount: montantPayable,
    montantIndique: montantPayable,
    sommePrelevements,
    prelevementsCount: prelevements.length,
  };
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

/**
 * `montantPayable` n'est comparable aux prélèvements que s'il est ancré sur
 * un libellé primaire fiable ("net à payer"/"montant à payer"/"total des
 * impôts"/"total à payer"/"solde à payer") — jamais un candidat retenu par
 * défaut (seul candidat trouvé, score=0, aucun signal). Réutilisée par les
 * deux chemins (`Expense` ET `ChargeProposal`), une seule règle.
 */
export function isMontantPayableReliable(parsed: TaxeFonciereParseResult): boolean {
  const deterministicDefault = parsed.amountFieldRanking?.deterministicDefault;
  if (!deterministicDefault) return false;
  return hasPrimaryPayableSignal(deterministicDefault.positiveSignals);
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

  const resolution = resolveTaxeFonciereAnnualAmount({
    montantPayable: parsed.data?.montantPayable,
    montantPayableReliable: isMontantPayableReliable(parsed),
    prelevements,
  });

  // Correctif Blocker #1 : deux sources renseignées ET divergentes au-delà
  // de la tolérance — jamais un découpage par prélèvement qui jetterait
  // silencieusement `montantPayable` (défaut démontré par le re-audit).
  // Une seule proposition, montant volontairement absent : `missingFields`
  // inclut "amount", donc `canConfirmAll`/`hasMissingRecordableAmount`
  // (document-review-decisions.ts, mécanisme déjà existant) bloquent toute
  // confirmation automatique — même garde que le cas "montant non lu"
  // ci-dessous, réutilisée telle quelle, aucune nouvelle architecture.
  if (resolution.status === "divergent") {
    return [
      {
        id: `${input.documentId}:taxe-fonciere`,
        documentId: input.documentId,
        familyId: "impots",
        description:
          `Taxe foncière — montant à vérifier ` +
          `(document : ${resolution.montantIndique.toLocaleString("fr-FR")} €, ` +
          `prélèvements détectés : ${resolution.sommePrelevements.toLocaleString("fr-FR")} €)`,
        exercise,
        paymentDate,
        missingFields: missingFields({ exercise, paymentDate }),
        decision: "pending",
      },
    ];
  }

  if (resolution.status === "prelevements_only" || resolution.status === "concordant") {
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

  const amount = resolution.status === "explicit_only" ? resolution.amount : undefined;
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
