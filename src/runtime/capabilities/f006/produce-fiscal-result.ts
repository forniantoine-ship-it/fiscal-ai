import type { Anomaly } from "../../contracts/Anomaly";
import { aggregateFiscalInputs } from "./aggregate-inputs";
import { applyAmortissementStocks } from "./apply-amortissement-stocks";
import { computeResultatAvantAmort } from "./compute-resultat-avant-amort";
import { validateFiscalInputs } from "./validate-fiscal-inputs";
import type { ComputeFiscalResultOutput, FiscalEngineInputs, FiscalResult } from "./types";

/**
 * Composition explicite F-006 (TRF-0029→TRF-0032, RAI-014) — ADR-003.
 * Consomme les sorties F-009 à F-014 sans recalculer leurs transformations.
 */
export function produceFiscalResult(input: FiscalEngineInputs): ComputeFiscalResultOutput {
  const validation = validateFiscalInputs(input);
  const anomalies: Anomaly[] = [...validation.anomalies];

  if (!validation.ready) {
    return { anomalies };
  }

  const aggregated = aggregateFiscalInputs(input);
  anomalies.push(...aggregated.anomalies);

  if (!aggregated.data || aggregated.anomalies.some((a) => a.severity === "error")) {
    return { anomalies };
  }

  const data = aggregated.data;
  const { resultatAvantAmort } = computeResultatAvantAmort(data);
  const application = applyAmortissementStocks({
    exercice: input.exerciceFiscal,
    resultatAvantAmort,
    amortCalcule: data.amortCalcule,
    stockDeficitsAnterieurs: input.stockDeficitsAnterieurs,
    stockAmortissementsReportes: input.stockAmortissementsReportes,
  });

  const computedAt = new Date().toISOString();
  const journal = [
    { trf: "TRF-0029", label: "Total recettes (F-013)", value: data.totalRecettes },
    {
      trf: "TRF-0020",
      label: "Charges exploitation (F-012)",
      value: data.chargesExploitation,
    },
    {
      trf: "TRF-0020",
      label: "Charges non déductibles (F-012)",
      value: data.totalNonDeductible,
    },
    {
      trf: "TRF-0016",
      label: "Charges financement (F-011)",
      value: data.chargesFinancement,
    },
    {
      trf: "TRF-0025",
      label: "Charges pré-exploitation",
      value: data.chargesPreExploitation,
    },
    { trf: "TRF-0030", label: "Résultat avant amortissement", value: resultatAvantAmort },
    { trf: "TRF-0012", label: "Amortissement calculé (F-014)", value: data.amortCalcule },
    { trf: "TRF-0031", label: "Amortissement déduit", value: application.amortDeduct },
    { trf: "TRF-0031", label: "Amortissement reporté", value: application.amortReporte },
    { trf: "TRF-0031", label: "Déficits imputés", value: application.deficitsImputes },
    { trf: "TRF-0032", label: "Résultat fiscal", value: application.resultatFiscal },
  ];

  const result: FiscalResult = {
    exercice: input.exerciceFiscal,
    recettes: {
      total: data.totalRecettes,
      loyersEncaisses: input.revenusAssistant?.loyersEncaisses,
      recettesPlateforme: input.revenusAssistant?.recettesPlateforme,
      // Cycle 16 — champ manquant : indemnitesAssurance (GLI/VISALE, SAV-REV-04)
      // était déjà comptée dans `total` (data.totalRecettes vient de
      // revenusAssistant.totalRecettes, déjà correct) mais absente de la
      // ventilation détaillée — aucun consommateur actuel ne la lisait encore,
      // mais le contrat de données était incomplet.
      indemnitesAssurance: input.revenusAssistant?.indemnitesAssurance,
      ajustementsJanDec: input.revenusAssistant?.ajustementsJanDec,
    },
    charges: {
      totalDeductible: data.totalChargesDeductibles,
      chargesExploitation: data.chargesExploitation,
      chargesFinancement: data.chargesFinancement,
      chargesPreExploitation: data.chargesPreExploitation,
      totalNonDeductible: data.totalNonDeductible,
      detailParCategorie: input.chargesAssistant?.parCategorie,
    },
    resultatAvantAmort,
    amortCalcule: data.amortCalcule,
    amortDeduct: application.amortDeduct,
    amortReporte: application.amortReporte,
    amortReportesUtilises: application.amortReportesUtilises,
    resultatFiscal: application.resultatFiscal,
    deficitNouveau: application.deficitNouveau,
    deficitsImputes: application.deficitsImputes,
    perteExceptionnelle: data.perteExceptionnelle,
    stocks: {
      deficits: application.stockDeficitsMisAJour,
      amortissementsReportes: application.stockAmortissementsReportesMisAJour,
      deficitsExpires: application.deficitsExpires,
    },
    trace: {
      ksArtifacts: [
        "TRF-0029",
        "TRF-0020",
        "TRF-0016",
        "TRF-0025",
        "TRF-0030",
        "TRF-0031",
        "TRF-0032",
        "RAI-014",
        "AX-015",
        "AX-016",
        "AX-017",
        "SAV-027",
      ],
      computedAt,
      journal,
    },
    status: "computed",
    anomalies,
  };

  return { result, anomalies };
}
