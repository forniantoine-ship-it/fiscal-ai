import type { DeclarationDraft } from "@/lib/lmnp/types/domain";
import type { FiscalResult } from "@/runtime/capabilities/f006/types";
import type { IdentiteDeclarante } from "@/runtime/capabilities/f007/types";

/** Adapte le brouillon dossier vers ENT-013 — aucune décision métier. */
export function identiteFromDeclarationDraft(
  draft: DeclarationDraft | undefined,
  exercice: number,
): IdentiteDeclarante {
  const firstName = draft?.exploitantFirstName?.trim() ?? "";
  const lastName = draft?.exploitantLastName?.trim() ?? "";
  const denomination =
    [firstName, lastName].filter(Boolean).join(" ") || draft?.siren || undefined;

  const adresseParts = [
    draft?.establishmentAddress ?? draft?.personalAddress ?? draft?.entrepreneurAddress,
    draft?.establishmentPostalCode ?? draft?.personalPostalCode ?? draft?.entrepreneurPostalCode,
    draft?.establishmentCity ?? draft?.personalCity ?? draft?.entrepreneurCity,
  ].filter(Boolean);

  return {
    siren: draft?.siren,
    siret: draft?.siret,
    denomination,
    adresseEntreprise: adresseParts.join(", ") || undefined,
    exerciceDebut: `01/01/${exercice}`,
    exerciceFin: `31/12/${exercice}`,
    email: draft?.exploitantEmail,
    telephone: draft?.exploitantTelephone,
    // Aucune source fiable de SIE compétent dans le dossier — jamais déduit du
    // code postal (hypothèse fragile). Voir le commentaire sur le champ.
    sieCompetent: undefined,
  };
}

/** Reconstruit un FiscalResult runtime depuis la sortie persistée F-006. */
export function fiscalResultFromDraft(
  draft: DeclarationDraft | undefined,
): FiscalResult | undefined {
  const stored = draft?.fiscalResult;
  if (!stored) return undefined;

  return {
    exercice: stored.exercice,
    recettes: {
      total: stored.totalRecettes,
      loyersEncaisses: draft?.revenusAssistant?.loyersEncaisses,
      recettesPlateforme: draft?.revenusAssistant?.recettesPlateforme,
      ajustementsJanDec: draft?.revenusAssistant?.ajustementsJanDec,
    },
    charges: {
      totalDeductible: stored.totalCharges,
      chargesExploitation: draft?.chargesAssistant?.totalDeductible ?? stored.totalCharges,
      chargesFinancement: draft?.financementCharges?.totalChargesFinancementExercice ?? 0,
      chargesPreExploitation: draft?.chargesAssistant?.totalPreExploitation ?? 0,
      totalNonDeductible: draft?.chargesAssistant?.totalNonDeductible ?? 0,
      detailParCategorie: draft?.chargesAssistant?.parCategorie,
    },
    resultatAvantAmort: stored.resultatAvantAmort,
    amortCalcule: draft?.amortissementAssistant?.totalDotations ?? stored.amortDeduct + stored.amortReporte,
    amortDeduct: stored.amortDeduct,
    amortReporte: stored.amortReporte,
    amortReportesUtilises: 0,
    resultatFiscal: stored.resultatFiscal,
    deficitNouveau: stored.deficitNouveau,
    deficitsImputes: 0,
    perteExceptionnelle: 0,
    stocks: {
      deficits: stored.stocks.deficits,
      amortissementsReportes: stored.stocks.amortissementsReportes,
      deficitsExpires: stored.stocks.deficitsExpires ?? [],
    },
    trace: stored.trace,
    status: "computed",
    anomalies: [],
  };
}
