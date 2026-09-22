/**
 * Lot 3B — bridge pur `FiscalYearOpening.stocks` → shape F006 / stocksOuverture.
 *
 * Aucune formule fiscale. Fail-closed : `unavailable` ≠ `[]` / `0`.
 * Double source : identité sémantique obligatoire, jamais de priorité silencieuse.
 */

import type { FiscalEngineOutput } from "@/lib/lmnp/types/domain";
import { isAvailable } from "./opening-fact";
import { isOpeningValidationIntact } from "./content-hash";
import { validateFiscalYearOpening } from "./validate-opening";
import type { FiscalYearOpening, OpeningIssue } from "./types";

/**
 * Shape minimale déjà consommée par `runDeclarationGeneration` → F006.
 * Réutilise le type canonique existant (pas de troisième modèle).
 */
export type OpeningFiscalStocks = Pick<
  FiscalEngineOutput["stocks"],
  "deficits" | "amortissementsReportes"
>;

export type ResolveOpeningFiscalStocksReady = {
  status: "ready";
  stocks: OpeningFiscalStocks;
};

export type ResolveOpeningFiscalStocksBlocked = {
  status: "blocked";
  issues: OpeningIssue[];
};

export type ResolveOpeningFiscalStocksResult =
  | ResolveOpeningFiscalStocksReady
  | ResolveOpeningFiscalStocksBlocked;

export type ResolveOpeningFiscalStocksInput = {
  opening: FiscalYearOpening;
  expectedDossierId?: string;
  expectedExerciceFiscal?: number;
};

export type ResolveCanonicalOpeningFiscalStocksReady = {
  status: "ready";
  /** `undefined` = aucune source (1ʳᵉ année) — F006 reçoit alors l'absence historique. */
  stocks: OpeningFiscalStocks | undefined;
};

export type ResolveCanonicalOpeningFiscalStocksResult =
  | ResolveCanonicalOpeningFiscalStocksReady
  | ResolveOpeningFiscalStocksBlocked;

export type ResolveCanonicalOpeningFiscalStocksInput = {
  opening?: FiscalYearOpening;
  stocksOuverture?: OpeningFiscalStocks | FiscalEngineOutput["stocks"];
  expectedDossierId?: string;
  expectedExerciceFiscal?: number;
};

function block(issues: OpeningIssue[]): ResolveOpeningFiscalStocksBlocked {
  return { status: "blocked", issues };
}

function push(
  issues: OpeningIssue[],
  code: string,
  message: string,
  fieldPath?: string,
): void {
  issues.push({ code, message, severity: "error", fieldPath });
}

function sortDeficitsForCompare(
  rows: OpeningFiscalStocks["deficits"],
): OpeningFiscalStocks["deficits"] {
  return [...rows].sort((a, b) => a.millesime - b.millesime || a.montant - b.montant);
}

/** Égalité sémantique — ordre des déficits sans importance. */
export function fiscalStocksSemanticallyEqual(
  a: OpeningFiscalStocks,
  b: OpeningFiscalStocks,
): boolean {
  if (a.amortissementsReportes !== b.amortissementsReportes) return false;
  const sa = sortDeficitsForCompare(a.deficits);
  const sb = sortDeficitsForCompare(b.deficits);
  if (sa.length !== sb.length) return false;
  for (let i = 0; i < sa.length; i += 1) {
    if (sa[i]!.millesime !== sb[i]!.millesime || sa[i]!.montant !== sb[i]!.montant) {
      return false;
    }
  }
  return true;
}

function pickOpeningStocks(
  source: OpeningFiscalStocks | FiscalEngineOutput["stocks"],
): OpeningFiscalStocks {
  return {
    deficits: source.deficits.map((d) => ({ millesime: d.millesime, montant: d.montant })),
    amortissementsReportes: source.amortissementsReportes,
  };
}

/**
 * Déroule `FiscalYearOpening.stocks` en shape F006.
 * `available([])` / `available(0)` → ready.
 * `unavailable` → blocked (jamais normalisé).
 */
export function resolveOpeningFiscalStocks(
  input: ResolveOpeningFiscalStocksInput,
): ResolveOpeningFiscalStocksResult {
  const { opening } = input;
  const issues: OpeningIssue[] = [];

  if (opening.validation.status !== "validated") {
    push(
      issues,
      "OPENING_NOT_VALIDATED",
      `Validation status « ${opening.validation.status} » — pending ≠ validé.`,
      "validation",
    );
    return block(issues);
  }

  if (!isOpeningValidationIntact(opening)) {
    push(
      issues,
      "OPENING_VALIDATION_STALE",
      "Révision/hash de validation périmés.",
      "validation",
    );
    return block(issues);
  }

  const structural = validateFiscalYearOpening(opening).filter((i) => i.severity === "error");
  issues.push(...structural);

  if (input.expectedDossierId !== undefined && opening.dossierId !== input.expectedDossierId) {
    push(
      issues,
      "DOSSIER_MISMATCH",
      `dossierId opening (${opening.dossierId}) ≠ attendu (${input.expectedDossierId}).`,
      "dossierId",
    );
  }
  if (
    input.expectedExerciceFiscal !== undefined &&
    opening.targetFiscalYear !== input.expectedExerciceFiscal
  ) {
    push(
      issues,
      "EXERCICE_MISMATCH",
      `targetFiscalYear (${opening.targetFiscalYear}) ≠ attendu (${input.expectedExerciceFiscal}).`,
      "targetFiscalYear",
    );
  }

  if (!isAvailable(opening.stocks.deficits)) {
    push(
      issues,
      "DEFICITS_UNAVAILABLE",
      "stocks.deficits unavailable — jamais [] silencieux.",
      "stocks.deficits",
    );
  }
  if (!isAvailable(opening.stocks.amortissementsReportes)) {
    push(
      issues,
      "AMORT_STOCK_UNAVAILABLE",
      "stocks.amortissementsReportes unavailable — jamais 0 silencieux.",
      "stocks.amortissementsReportes",
    );
  }

  if (issues.length > 0) {
    return block(issues);
  }

  // Garde TypeScript — facts disponibles après les checks ci-dessus.
  if (!isAvailable(opening.stocks.deficits) || !isAvailable(opening.stocks.amortissementsReportes)) {
    return block(issues);
  }

  return {
    status: "ready",
    stocks: {
      deficits: opening.stocks.deficits.value.map((d) => ({
        millesime: d.millesime,
        montant: d.montant,
      })),
      amortissementsReportes: opening.stocks.amortissementsReportes.value,
    },
  };
}

/**
 * Point de convergence unique avant F006 :
 * stocksOuverture et/ou FiscalYearOpening → une seule shape canonique.
 *
 * - aucune source → ready(undefined) (comportement 1ʳᵉ année inchangé)
 * - une source → ready(stocks)
 * - deux sources → ready si sémantiquement identiques, sinon blocked
 */
export function resolveCanonicalOpeningFiscalStocks(
  input: ResolveCanonicalOpeningFiscalStocksInput,
): ResolveCanonicalOpeningFiscalStocksResult {
  const hasOpening = input.opening !== undefined;
  const hasStocksOuverture = input.stocksOuverture !== undefined;

  if (!hasOpening && !hasStocksOuverture) {
    return { status: "ready", stocks: undefined };
  }

  if (!hasOpening && hasStocksOuverture) {
    return { status: "ready", stocks: pickOpeningStocks(input.stocksOuverture!) };
  }

  const fromOpening = resolveOpeningFiscalStocks({
    opening: input.opening!,
    expectedDossierId: input.expectedDossierId,
    expectedExerciceFiscal: input.expectedExerciceFiscal,
  });
  if (fromOpening.status === "blocked") {
    return fromOpening;
  }

  if (!hasStocksOuverture) {
    return { status: "ready", stocks: fromOpening.stocks };
  }

  const fromOuverture = pickOpeningStocks(input.stocksOuverture!);
  if (!fiscalStocksSemanticallyEqual(fromOpening.stocks, fromOuverture)) {
    return block([
      {
        code: "OPENING_STOCKS_DIVERGE",
        message:
          "FiscalYearOpening.stocks et stocksOuverture divergent — aucune source prioritaire, aucune fusion.",
        severity: "error",
        fieldPath: "stocks",
      },
    ]);
  }

  return { status: "ready", stocks: fromOpening.stocks };
}
