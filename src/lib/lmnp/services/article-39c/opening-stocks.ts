/**
 * INT-4 — AUTORITÉ DE LECTURE des stocks d'ouverture article 39 C (ARD historique, déficits LMNP antérieurs).
 *
 * Aucun stock nouveau, aucune règle fiscale nouvelle : ce module PUR réutilise les contrats d'ouverture déjà productifs
 *  - `resolvePriorHistoryEligibility` (antériorité LMNP : continuité native, reprise externe validée, première année
 *    DÉCLARÉE par le client — jamais déduite de `activityStartDate`, de `dateMiseEnService` ni de l'absence de données) ;
 *  - `resolveCanonicalOpeningFiscalStocks` (`FiscalYearOpening.stocks` / `stocksOuverture`, divergence = blocage).
 *
 * Priorité (mission § 11) :
 *  A — continuité native N−1 → N : stocks persistés de la clôture de N−1 (`fiscalYear.stocksOuverture`, avec `sourceClosureId`) ;
 *  B — reprise externe : `FiscalYearOpening` validée et fraîche, stocks démontrés ;
 *  C — première année : réponse explicite du client (`FIRST_REAL_YEAR`), persistée avec l'exercice → `NONE_FIRST_YEAR` ;
 *  D — sinon : `UNKNOWN` (jamais zéro implicite).
 *
 * ARD (art. 39 C, II-3) et déficits LMNP (art. 156 I 1° ter) restent DEUX stocks distincts jusqu'au moteur : le champ
 * `historicalArdStock` ne porte jamais un déficit et inversement. Aucune différence comptable ne crée un stock.
 *
 * NON CONSOMMÉ par F006 productif.
 */
import type { FiscalYear } from "@/lib/lmnp/types/domain";
import type { StockDeficit } from "@/runtime/capabilities/f006/types";
import {
  resolveExternalOpeningProofFromFiscalYear,
  resolvePriorHistoryEligibility,
} from "@/lib/lmnp/services/declaration/prior-history-eligibility";
import { resolveCanonicalOpeningFiscalStocks } from "@/lib/lmnp/services/fiscal-year-opening/resolve-opening-fiscal-stocks";

export type Article39cOpeningStocksBasis = "NATIVE_CONTINUITY" | "EXTERNAL_TAKEOVER" | "FIRST_REAL_YEAR_DECLARED";

/** Stocks d'ouverture : toujours établis par une source nommée (jamais déduits de l'absence de donnée). */
export type Article39cOpeningStocks =
  | { readonly kind: "NONE_FIRST_YEAR"; readonly basis?: Article39cOpeningStocksBasis; readonly declaredAt?: string }
  | {
      readonly kind: "PROVIDED";
      /** Stock d'ARD historique (art. 39 C) — JAMAIS un déficit LMNP. */
      readonly historicalArdStock: number;
      /** Déficits LMNP antérieurs (millésimés) — JAMAIS de l'ARD. */
      readonly priorDeficits: readonly StockDeficit[];
      readonly basis?: Article39cOpeningStocksBasis;
      /**
       * Portée du stock : `ACTIVITY_GLOBAL` = stock de l'activité consolidée (jamais réparti entre biens) — produit par les
       * sources d'ouverture existantes, activité par construction. `PROPERTY_ATTRIBUTED` ou ABSENT (fourni hors autorité) :
       * portée non démontrée ; en multi, un stock non nul dans ce cas exigerait une allocation par bien → hors domaine.
       */
      readonly scope?: "ACTIVITY_GLOBAL" | "PROPERTY_ATTRIBUTED";
      /** Clôture N−1 ou reprise d'où viennent les stocks (traçabilité). */
      readonly sourceRef?: string;
    };

export type Article39cOpeningStocksResolution =
  | { readonly status: "RESOLVED"; readonly stocks: Article39cOpeningStocks }
  | { readonly status: "UNKNOWN"; readonly reasons: readonly string[] };

type OpeningFiscalYear = Pick<
  FiscalYear,
  "year" | "previousFiscalYearId" | "stocksOuverture" | "stocksOuvertureUnavailableReason" | "priorHistoryDeclaration" | "externalTakeoverOpening"
>;

export function resolveArticle39cOpeningStocks(input: { fiscalYear: OpeningFiscalYear; expectedDossierId?: string }): Article39cOpeningStocksResolution {
  const fy = input.fiscalYear;
  const proof = resolveExternalOpeningProofFromFiscalYear(fy);
  const eligibility = resolvePriorHistoryEligibility(fy, proof);
  if (!eligibility.eligible) {
    return { status: "UNKNOWN", reasons: ["OPENING_STOCKS_UNKNOWN", `PRIOR_HISTORY_${eligibility.reason}`] };
  }

  if (eligibility.status === "FIRST_REAL_YEAR") {
    return {
      status: "RESOLVED",
      stocks: { kind: "NONE_FIRST_YEAR", basis: "FIRST_REAL_YEAR_DECLARED", ...(fy.priorHistoryDeclaration?.declaredAt !== undefined ? { declaredAt: fy.priorHistoryDeclaration.declaredAt } : {}) },
    };
  }

  if (eligibility.status === "NATIVE_CONTINUITY") {
    const resolved = resolveCanonicalOpeningFiscalStocks({ stocksOuverture: fy.stocksOuverture?.stocks });
    if (resolved.status === "blocked" || resolved.stocks === undefined) return { status: "UNKNOWN", reasons: ["OPENING_STOCKS_UNKNOWN", "NATIVE_STOCKS_UNREADABLE"] };
    return {
      status: "RESOLVED",
      stocks: {
        kind: "PROVIDED",
        historicalArdStock: resolved.stocks.amortissementsReportes,
        priorDeficits: resolved.stocks.deficits.map((d) => ({ millesime: d.millesime, montant: d.montant })),
        basis: "NATIVE_CONTINUITY",
        scope: "ACTIVITY_GLOBAL",
        ...(fy.stocksOuverture?.sourceClosureId !== undefined ? { sourceRef: fy.stocksOuverture.sourceClosureId } : {}),
      },
    };
  }

  // EXTERNAL_HISTORY prouvé par une Opening validée pour CET exercice.
  const opening = proof?.fiscalYearOpening;
  const resolved = resolveCanonicalOpeningFiscalStocks({
    ...(opening !== undefined ? { opening } : {}),
    ...(fy.stocksOuverture !== undefined ? { stocksOuverture: fy.stocksOuverture.stocks } : {}),
    ...(input.expectedDossierId !== undefined ? { expectedDossierId: input.expectedDossierId } : {}),
    expectedExerciceFiscal: fy.year,
  });
  if (resolved.status === "blocked") return { status: "UNKNOWN", reasons: ["OPENING_STOCKS_UNKNOWN", ...resolved.issues.map((i) => i.code)] };
  if (resolved.stocks === undefined) return { status: "UNKNOWN", reasons: ["OPENING_STOCKS_UNKNOWN", "EXTERNAL_OPENING_WITHOUT_STOCKS"] };
  return {
    status: "RESOLVED",
    stocks: {
      kind: "PROVIDED",
      historicalArdStock: resolved.stocks.amortissementsReportes,
      priorDeficits: resolved.stocks.deficits.map((d) => ({ millesime: d.millesime, montant: d.montant })),
      basis: "EXTERNAL_TAKEOVER",
      scope: "ACTIVITY_GLOBAL",
      ...(opening?.source.kind === "external_takeover" ? { sourceRef: opening.source.takeoverId } : {}),
    },
  };
}
