import type { FiscalEngineOutput, LiasseEngineOutput } from "@/lib/lmnp/types/domain";
import type { LiasseFromRfs } from "@/runtime/capabilities/rfs/projection/assemble-liasse-from-rfs";
import type { CerfaCase } from "@/runtime/capabilities/f007/types";

function fmtEur(value: number): string {
  return `${Math.round(value).toLocaleString("fr-FR")} €`;
}

function pushFormCases(lines: string[], formLabel: string, millésime: number, cases: CerfaCase[]): void {
  lines.push(`FORMULAIRE ${formLabel} — millésime ${millésime}`);
  lines.push("-".repeat(48));
  for (const c of cases) {
    const value = typeof c.value === "number" ? fmtEur(c.value) : String(c.value);
    lines.push(`${c.caseId}\t${c.label} : ${value}`);
  }
  lines.push("");
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

/**
 * Représentation texte des formulaires complémentaires (2031-bis, 2033-A/B/C)
 * assemblés depuis la RFS (P0-1 — audit 2026-09-02). Pas un rendu CERFA
 * officiel, au même titre que buildLiasseDocumentText() ci-dessus. Le 2031-SD
 * reste exclusivement porté par buildLiasseDocumentText()/liasseResult (F-007)
 * — non dupliqué ici, pour ne jamais présenter deux sources différentes du
 * même formulaire à l'utilisateur.
 */
export function buildLiasseRfsDocumentText(fiscalYear: number, liasseRfs: LiasseFromRfs): string {
  const lines: string[] = [];
  lines.push(`DÉCLARATION LMNP — EXERCICE ${fiscalYear} — FORMULAIRES COMPLÉMENTAIRES`);
  lines.push("=".repeat(48));
  lines.push("");
  pushFormCases(lines, "2031-Bis-SD", liasseRfs.form2031Bis.millésime, liasseRfs.form2031Bis.cases);
  pushFormCases(lines, "2033-A-SD", liasseRfs.form2033A.millésime, liasseRfs.form2033A.cases);
  pushFormCases(lines, "2033-B-SD", liasseRfs.form2033B.millésime, liasseRfs.form2033B.cases);
  pushFormCases(lines, "2033-C-SD", liasseRfs.form2033C.millésime, liasseRfs.form2033C.cases);
  if (liasseRfs.formulairesManquants.length > 0) {
    lines.push(`Formulaires non générés à ce stade : ${liasseRfs.formulairesManquants.join(", ")}`);
    lines.push("");
  }
  lines.push(`Généré le ${new Date(liasseRfs.trace.assembledAt).toLocaleString("fr-FR")}`);
  return lines.join("\n");
}

export function downloadLiasseRfsDocument(fiscalYear: number, liasseRfs: LiasseFromRfs): void {
  const content = buildLiasseRfsDocumentText(fiscalYear, liasseRfs);
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `liasse-lmnp-complementaire-${fiscalYear}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
