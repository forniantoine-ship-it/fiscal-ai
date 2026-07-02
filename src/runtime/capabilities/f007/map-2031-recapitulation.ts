import type { FiscalResult } from "../f006/types";
import type { CerfaCase } from "./types";
import { round2 } from "./types";

/**
 * TRF-0033 / 2031-SD — section C Récapitulation des éléments d'imposition.
 * Report direct depuis FiscalResult (TRF-0032) — aucun recalcul fiscal.
 */
export function map2031RecapitulationCases(fiscalResult: FiscalResult): CerfaCase[] {
  const cases: CerfaCase[] = [];
  const frTrace = {
    source: "FiscalResult" as const,
    ksArtifacts: ["TRF-0032", "TRF-0033"],
  };

  cases.push({
    caseId: "AB",
    label: "Production vendue (services) — loyers encaissés",
    value: round2(fiscalResult.recettes.total),
    trace: { ...frTrace, path: "recettes.total", ksArtifacts: ["TRF-0029", "TRF-0032", "TRF-0033"] },
  });

  if (fiscalResult.resultatFiscal > 0) {
    cases.push({
      caseId: "C_L1_COL1",
      label: "Résultat fiscal — Bénéfice (col. 1)",
      value: round2(fiscalResult.resultatFiscal),
      trace: { ...frTrace, path: "resultatFiscal", ksArtifacts: ["TRF-0032", "TRF-0033"] },
    });
  }

  if (fiscalResult.deficitNouveau > 0) {
    cases.push({
      caseId: "C_L1_COL2",
      label: "Résultat fiscal — Déficit (col. 2)",
      value: round2(fiscalResult.deficitNouveau),
      trace: { ...frTrace, path: "deficitNouveau", ksArtifacts: ["TRF-0031", "TRF-0032", "TRF-0033"] },
    });
  }

  if (fiscalResult.resultatFiscal > 0) {
    cases.push({
      caseId: "I_7A",
      label: "BIC non professionnels — Bénéfice (case 7a)",
      value: round2(fiscalResult.resultatFiscal),
      trace: { ...frTrace, path: "resultatFiscal", ksArtifacts: ["TRF-0032", "TRF-0033"] },
    });
  }

  if (fiscalResult.deficitNouveau > 0) {
    cases.push({
      caseId: "I_7B",
      label: "BIC non professionnels — Déficit (case 7b)",
      value: round2(fiscalResult.deficitNouveau),
      trace: { ...frTrace, path: "deficitNouveau", ksArtifacts: ["TRF-0031", "TRF-0032", "TRF-0033"] },
    });
  }

  return cases;
}
