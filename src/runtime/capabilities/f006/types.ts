/**
 * Types de domaine F-006 — Fiscal Engine (TRF-0030 → TRF-0032).
 */

import type { Anomaly } from "../../contracts/Anomaly";

/** Sous-ensemble des sorties assistants — évite la dépendance circulaire domain ↔ runtime. */
export type ActiviteFiscalInput = {
  siret?: string;
  dateMiseEnService?: string;
  activityType?: "LMNP" | "LMP";
};

export type RevenusFiscalInput = {
  exerciceFiscal: number;
  totalRecettes: number;
  loyersEncaisses?: number;
  recettesPlateforme?: number;
  ajustementsJanDec?: number;
};

export type ChargesFiscalInput = {
  exerciceFiscal: number;
  totalDeductible: number;
  totalPreExploitation: number;
  parCategorie?: Partial<Record<string, number>>;
};

export type FinancementFiscalInput = {
  exerciceFiscal: number;
  totalChargesFinancementExercice: number;
  totalInteretsPreExploitation: number;
};

export type AmortissementFiscalInput = {
  exerciceFiscal: number;
  totalDotations: number;
  status: "validated" | "contested";
};

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export type StockDeficit = {
  millesime: number;
  montant: number;
};

export type FiscalJournalEntry = {
  trf: string;
  label: string;
  value: number | string;
};

/** Entrées consommées — sorties directes des assistants F-009 à F-014. */
export type FiscalEngineInputs = {
  exerciceFiscal: number;
  activite: ActiviteFiscalInput;
  logementAmortissement?: { computedAt: string };
  financementCharges?: FinancementFiscalInput;
  chargesAssistant?: ChargesFiscalInput;
  revenusAssistant?: RevenusFiscalInput;
  amortissementAssistant?: AmortissementFiscalInput;
  /** Stocks N-1 — vides en première année. */
  stockDeficitsAnterieurs?: StockDeficit[];
  stockAmortissementsReportes?: number;
  /** TRF-0027 — perte exceptionnelle composant sorti (0 si non applicable). */
  perteExceptionnelle?: number;
};

export type AggregatedFiscalData = {
  exerciceFiscal: number;
  totalRecettes: number;
  chargesExploitation: number;
  chargesFinancement: number;
  chargesPreExploitation: number;
  totalChargesDeductibles: number;
  amortCalcule: number;
  perteExceptionnelle: number;
};

/** Sortie TRF-0030. */
export type ResultatAvantAmortissement = {
  resultatAvantAmort: number;
};

/** Sortie TRF-0031. */
export type ApplicationAmortissementStocks = {
  resultatFiscal: number;
  amortDeduct: number;
  amortReporte: number;
  amortReportesUtilises: number;
  deficitNouveau: number;
  deficitsImputes: number;
  stockDeficitsMisAJour: StockDeficit[];
  stockAmortissementsReportesMisAJour: number;
  deficitsExpires: StockDeficit[];
};

/** Objet FiscalResult unique — TRF-0032. */
export type FiscalResult = {
  exercice: number;
  recettes: {
    total: number;
    loyersEncaisses?: number;
    recettesPlateforme?: number;
    ajustementsJanDec?: number;
  };
  charges: {
    totalDeductible: number;
    chargesExploitation: number;
    chargesFinancement: number;
    chargesPreExploitation: number;
    detailParCategorie?: Partial<Record<string, number>>;
  };
  resultatAvantAmort: number;
  amortCalcule: number;
  amortDeduct: number;
  amortReporte: number;
  amortReportesUtilises: number;
  resultatFiscal: number;
  deficitNouveau: number;
  deficitsImputes: number;
  perteExceptionnelle: number;
  stocks: {
    deficits: StockDeficit[];
    amortissementsReportes: number;
    deficitsExpires: StockDeficit[];
  };
  trace: {
    ksArtifacts: string[];
    computedAt: string;
    journal: FiscalJournalEntry[];
  };
  status: "computed" | "blocked";
  anomalies: Anomaly[];
};

export type ValidateFiscalInputsOutput = {
  ready: boolean;
  anomalies: Anomaly[];
};

export type ComputeFiscalResultOutput = {
  result?: FiscalResult;
  anomalies: Anomaly[];
};
