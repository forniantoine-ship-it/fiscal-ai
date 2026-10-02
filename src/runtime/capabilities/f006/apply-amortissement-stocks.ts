import type { ApplicationAmortissementStocks, StockDeficit } from "./types";
import { round2 } from "./types";

export type ApplyAmortissementStocksInput = {
  exercice: number;
  resultatAvantAmort: number;
  amortCalcule: number;
  stockDeficitsAnterieurs?: StockDeficit[];
  stockAmortissementsReportes?: number;
};

const DEFICIT_REPORT_YEARS = 10;

function sortDeficitsOldestFirst(deficits: StockDeficit[]): StockDeficit[] {
  return [...deficits].sort((a, b) => a.millesime - b.millesime);
}

function expireDeficits(exercice: number, deficits: StockDeficit[]): {
  actifs: StockDeficit[];
  expires: StockDeficit[];
} {
  const actifs: StockDeficit[] = [];
  const expires: StockDeficit[] = [];

  for (const row of deficits) {
    if (exercice - row.millesime > DEFICIT_REPORT_YEARS) {
      expires.push(row);
    } else if (row.montant > 0) {
      actifs.push(row);
    }
  }

  return { actifs, expires };
}

/**
 * TRF-0031 — Application de l'amortissement et gestion des stocks.
 * Séquence SAV-030 / AX-015 / AX-016 / AX-017 — vérifiée contre VER-047 à VER-051.
 *
 * P0-39C — le plafond de l'article 39 C est le résultat avant amortissement.
 * Il ne dépend pas du stock de déficits antérieurs (SAV-027, deprecated).
 * Ordre : dotation de l'exercice, puis stock d'amortissements réputés différés,
 * puis imputation des déficits antérieurs sur le bénéfice restant.
 */
export function applyAmortissementStocks(
  input: ApplyAmortissementStocksInput,
): ApplicationAmortissementStocks {
  const stockAmortInitial = round2(input.stockAmortissementsReportes ?? 0);
  const { actifs: deficitsActifs, expires: deficitsExpires } = expireDeficits(
    input.exercice,
    input.stockDeficitsAnterieurs ?? [],
  );

  if (input.resultatAvantAmort < 0) {
    const deficitNouveau = round2(Math.abs(input.resultatAvantAmort));
    const stockDeficitsMisAJour = sortDeficitsOldestFirst([
      ...deficitsActifs,
      { millesime: input.exercice, montant: deficitNouveau },
    ]);

    return {
      resultatFiscal: 0,
      resultatFiscalAvantDeficits: round2(input.resultatAvantAmort),
      amortDeduct: 0,
      amortReporte: round2(input.amortCalcule + stockAmortInitial),
      amortReportesUtilises: 0,
      deficitNouveau,
      deficitsImputes: 0,
      stockDeficitsMisAJour,
      stockAmortissementsReportesMisAJour: round2(input.amortCalcule + stockAmortInitial),
      deficitsExpires,
    };
  }

  const plafond39C = round2(input.resultatAvantAmort);
  const amortDeduct = round2(Math.min(input.amortCalcule, plafond39C));
  let reste = round2(plafond39C - amortDeduct);

  const amortReportesUtilises = round2(Math.min(stockAmortInitial, reste));
  reste = round2(reste - amortReportesUtilises);
  const resultatFiscalAvantDeficits = reste;

  let deficitsImputes = 0;
  const stockDeficitsMisAJour: StockDeficit[] = [];

  for (const row of sortDeficitsOldestFirst(deficitsActifs)) {
    if (reste <= 0) {
      if (row.montant > 0) stockDeficitsMisAJour.push(row);
      continue;
    }
    const impute = round2(Math.min(row.montant, reste));
    deficitsImputes = round2(deficitsImputes + impute);
    reste = round2(reste - impute);
    const reliquat = round2(row.montant - impute);
    if (reliquat > 0) {
      stockDeficitsMisAJour.push({ millesime: row.millesime, montant: reliquat });
    }
  }

  const amortReporte = round2(input.amortCalcule - amortDeduct + stockAmortInitial - amortReportesUtilises);

  return {
    resultatFiscal: reste,
    resultatFiscalAvantDeficits,
    amortDeduct,
    amortReporte,
    amortReportesUtilises,
    deficitNouveau: 0,
    deficitsImputes,
    stockDeficitsMisAJour,
    stockAmortissementsReportesMisAJour: amortReporte,
    deficitsExpires,
  };
}
