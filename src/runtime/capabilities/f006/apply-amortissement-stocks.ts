import { applyArticle39cSequence } from "./article-39c-capacity";
import type { ApplicationAmortissementStocks, StockDeficit } from "./types";

export type ApplyAmortissementStocksInput = {
  exercice: number;
  resultatAvantAmort: number;
  amortCalcule: number;
  stockDeficitsAnterieurs?: StockDeficit[];
  stockAmortissementsReportes?: number;
};

/**
 * TRF-0031 — Application de l'amortissement et gestion des stocks.
 * Séquence SAV-030 / AX-015 / AX-016 / AX-017 — vérifiée contre VER-047 à VER-051.
 *
 * ADAPTATEUR HISTORIQUE (39C-FIX-1) — l'ordre C → dotation → ARD → résultat → déficits antérieurs est désormais porté
 * par `applyArticle39cSequence` (article-39c-capacity.ts), source unique de l'ordre.
 *
 * KNOWN DIVERGENCE — PROXY NON DÉFINITIF : cet adaptateur alimente la capacité avec `max(0, resultatAvantAmort)`,
 * c'est-à-dire avec le résultat global avant amortissement et NON avec `C = max(0, L − B)` (SAV-030). Les deux ne
 * coïncident que si le résultat global ne contient que L et B. Le chemin productif ne dispose pas encore de `L` exact
 * (F013 v1 = encaissements, hors F013 v2 non branché) ni de la qualification B / ACTIVITY / OTHER_PRODUCT : tant que
 * ces entrées n'existent pas, ce résultat ne doit pas être présenté comme l'application exacte de l'article 39 C.
 * Le moteur exact est `computeArticle39c`. Comportement numérique inchangé par 39C-FIX-1.
 */
export function applyAmortissementStocks(
  input: ApplyAmortissementStocksInput,
): ApplicationAmortissementStocks {
  const stockAmortInitial = input.stockAmortissementsReportes ?? 0;
  const deficitsAnterieurs = input.stockDeficitsAnterieurs ?? [];
  const sequence = applyArticle39cSequence({
    exercice: input.exercice,
    capacite: Math.max(0, input.resultatAvantAmort),
    resultatAvantAmort: input.resultatAvantAmort,
    currentDepreciation: input.amortCalcule,
    historicalArdStock: stockAmortInitial,
    priorDeficits: deficitsAnterieurs,
  });

  return {
    resultatFiscal: sequence.resultatFiscal,
    resultatFiscalAvantDeficits: sequence.resultatApresAmortissements,
    amortDeduct: sequence.amortDeduit,
    amortReporte: sequence.stockArdFinal,
    amortReportesUtilises: sequence.ardConsomme,
    deficitNouveau: sequence.deficitNouveau,
    deficitsImputes: sequence.deficitsImputes,
    stockDeficitsMisAJour: sequence.stockDeficits,
    stockAmortissementsReportesMisAJour: sequence.stockArdFinal,
    deficitsExpires: sequence.deficitsExpires,
  };
}
