import type { DeclarationDraft } from "@/lib/lmnp/types/domain";
import type { FiscalResult } from "@/runtime/capabilities/f006/types";
import type { IdentiteDeclarante } from "@/runtime/capabilities/f007/types";

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Parse strict d'une date "AAAA-MM-JJ" — jamais via `Date` (une date ISO
 * "date-only" relue avec des getters locaux peut décaler le jour selon le
 * fuseau). `undefined` si la chaîne n'est pas une date calendaire valide.
 */
function parseIsoDate(value: string): { year: number; month: number; day: number } | undefined {
  const match = ISO_DATE_RE.exec(value.trim());
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return undefined;
  const maxDay = month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1];
  if (day < 1 || day > maxDay) return undefined;
  return { year, month, day };
}

/**
 * A_EXERCICE_DEBUT (2031-SD) — `activityStartDate` (F-009, déclarée
 * RNE/INPI) est retenue par Fiscal AI comme représentation opérationnelle du
 * commencement des opérations pour ce calcul — pas une équivalence
 * juridique générale entre les deux notions dans tous les cas.
 * `dateMiseEnService` n'est jamais utilisée ici : elle reste la première
 * location effective (prorata d'amortissement, pré-exploitation).
 *
 * Absente ou invalide → `undefined`, jamais une date fabriquée. Ne bloque
 * pas la génération et ne crée pas d'anomalie — géré ailleurs si nécessaire.
 */
function resolveExerciceDebut(
  activityStartDate: string | undefined,
  exercice: number,
): string | undefined {
  if (!activityStartDate) return undefined;
  const parsed = parseIsoDate(activityStartDate);
  if (!parsed) return undefined;
  if (parsed.year < exercice) return `01/01/${exercice}`;
  if (parsed.year > exercice) return undefined;
  const dd = String(parsed.day).padStart(2, "0");
  const mm = String(parsed.month).padStart(2, "0");
  return `${dd}/${mm}/${parsed.year}`;
}

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
    exerciceDebut: resolveExerciceDebut(draft?.activityStartDate, exercice),
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
      indemnitesAssurance: draft?.revenusAssistant?.indemnitesAssurance,
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
