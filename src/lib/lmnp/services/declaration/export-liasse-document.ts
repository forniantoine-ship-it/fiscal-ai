import type { FiscalEngineOutput, LiasseEngineOutput } from "@/lib/lmnp/types/domain";

function fmtEur(value: number): string {
  return `${Math.round(value).toLocaleString("fr-FR")} €`;
}

/**
 * Représentation texte du résultat fiscal et du formulaire 2031-SD généré.
 * Pas un rendu CERFA officiel — cf. limite documentée en fin de Sprint 001.
 */
export function buildLiasseDocumentText(
  fiscalYear: number,
  fiscalResult: FiscalEngineOutput,
  liasseResult: LiasseEngineOutput,
): string {
  const lines: string[] = [];
  lines.push(`DÉCLARATION LMNP — EXERCICE ${fiscalYear}`);
  lines.push("=".repeat(48));
  lines.push("");
  lines.push("RÉSULTAT FISCAL (F-006)");
  lines.push(`Résultat fiscal imposable : ${fmtEur(fiscalResult.resultatFiscal)}`);
  lines.push(`Résultat avant amortissement : ${fmtEur(fiscalResult.resultatAvantAmort)}`);
  lines.push(`Total recettes : ${fmtEur(fiscalResult.totalRecettes)}`);
  lines.push(`Total charges déductibles : ${fmtEur(fiscalResult.totalCharges)}`);
  lines.push(`Amortissement déduit : ${fmtEur(fiscalResult.amortDeduct)}`);
  lines.push(`Amortissement reporté : ${fmtEur(fiscalResult.amortReporte)}`);
  if (fiscalResult.deficitNouveau > 0) {
    lines.push(`Déficit nouveau : ${fmtEur(fiscalResult.deficitNouveau)}`);
  }
  lines.push("");
  lines.push(`FORMULAIRE 2031-SD — millésime ${liasseResult.exercice}`);
  lines.push("-".repeat(48));
  for (const c of liasseResult.cases) {
    const value = typeof c.value === "number" ? fmtEur(c.value) : String(c.value);
    lines.push(`${c.caseId}\t${c.label} : ${value}`);
  }
  if (liasseResult.formulairesManquants.length > 0) {
    lines.push("");
    lines.push(`Formulaires non générés à ce stade : ${liasseResult.formulairesManquants.join(", ")}`);
  }
  lines.push("");
  lines.push(`Généré le ${new Date(liasseResult.generatedAt).toLocaleString("fr-FR")}`);
  return lines.join("\n");
}

export function downloadLiasseDocument(
  fiscalYear: number,
  fiscalResult: FiscalEngineOutput,
  liasseResult: LiasseEngineOutput,
): void {
  const content = buildLiasseDocumentText(fiscalYear, fiscalResult, liasseResult);
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `liasse-lmnp-${fiscalYear}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
