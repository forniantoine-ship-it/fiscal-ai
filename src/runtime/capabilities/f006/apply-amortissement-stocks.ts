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
 * Séquence SAV-027 / AX-015 / AX-016 / AX-017 — vérifiée contre VER-047 à VER-051.
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

  let reste = input.resultatAvantAmort;
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

  const amortDeduct = round2(Math.min(input.amortCalcule, reste));
  reste = round2(reste - amortDeduct);

  const amortReportesUtilises = round2(Math.min(stockAmortInitial, reste));
  reste = round2(reste - amortReportesUtilises);

  const amortReporte = round2(input.amortCalcule - amortDeduct + stockAmortInitial - amortReportesUtilises);

  return {
    resultatFiscal: reste,
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
