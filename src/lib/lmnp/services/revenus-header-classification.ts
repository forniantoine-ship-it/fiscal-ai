import type { RevenueTransactionCategory } from "../types";
import type { RevenueGridColumn } from "./revenus-row-mapping";

export type HeaderTargetGridField =
  | "transactionDate"
  | "monthKey"
  | "loyers"
  | "autresRevenus"
  | "charges"
  | "none";

export type HeaderSemanticCategory =
  | "rent"
  | "platform"
  | "insurance_indemnity"
  | "other_income"
  | "charges"
  | "fee"
  | "deposit"
  | "transfer"
  | "date"
  | "month"
  | "label"
  | "text";

export type RevenueHeaderClassification = {
  rawHeader: string;
  normalizedHeader: string;
  semanticCategory: HeaderSemanticCategory;
  transactionCategory: RevenueTransactionCategory | null;
  targetGridField: HeaderTargetGridField;
  targetGridColumn: RevenueGridColumn | null;
  isMonetary: boolean;
};

const OTHER_INCOME_HEADER_PATTERNS: RegExp[] = [
  /^complements?$/,
  /^complement$/,
  /^compl\.?$/,
  /^compl$/,
  /complement/,
  /complement de loyer/,
  /^annexe$/,
  /annexe/,
  /^autres revenus$/,
  /autres revenus/,
  /revenu annexe/,
  /revenu complementaire/,
  /^caf$/,
  /aide caf/,
  /^allocation$/,
  /allocation/,
  /^participation$/,
  /participation/,
  /^remboursement$/,
  /remboursement/,
];

const RENT_HEADER_PATTERNS: RegExp[] = [
  /^loyers?$/,
  /^loyer hc$/,
  /loyer hc/,
  // Cycle 18 — "loyer" en tête suivi d'un qualificatif ("Loyer encaissé",
  // "Loyers perçus"...) : le motif strictement ancré `/^loyers?$/` rejetait
  // ces variantes réalistes, alors que le système d'en-têtes Excel/CSV
  // (spreadsheet-header-recognition.ts, matchStrategy "startsWith") les
  // reconnaissait déjà — la ligne disparaissait silencieusement sur le
  // chemin PDF/OCR/tableau structuré (makeStructuredLine rejette toute ligne
  // sans catégorie résolue). N'ajoute aucun chevauchement avec GLI/indemnité
  // ci-dessous : "garantie loyers impayés" ne COMMENCE jamais par "loyer".
  /^loyers?\b/,
];

/**
 * Cycle 15A — SAV-REV-01/SAV-REV-03 : plateformes de location (Airbnb, Booking,
 * Abritel/Vrbo). Le montant retenu est celui de la colonne telle quelle (net versé
 * par la plateforme, décision par défaut du KS) — jamais un calcul brut - commission.
 */
const PLATFORM_HEADER_PATTERNS: RegExp[] = [
  /airbnb/,
  /booking/,
  /abritel/,
  /vrbo/,
  /^plateforme$/,
  /plateforme/,
  /virement plateforme/,
  /location touristique/,
  /location saisonniere/,
];

/**
 * Cycle 15A — SAV-REV-04 : indemnité d'assurance loyers impayés (GLI/VISALE) ou
 * règlement de sinistre — recette à l'encaissement, par extension de SAV-028.
 */
const INSURANCE_INDEMNITY_HEADER_PATTERNS: RegExp[] = [
  /^gli$/,
  /\bgli\b/,
  /visale/,
  /indemnite/,
  /assurance loyers? impayes?/,
  // Cycle 18 — synonyme courant de GLI ("Garantie loyers impayés", forme
  // développée, sans le sigle). Sans ce motif, aucun des motifs ci-dessus ne
  // matchait, et DEPOSIT_HEADER_PATTERNS (`/garantie/`, plus bas dans la
  // chaîne if/else) absorbait la colonne comme un dépôt de garantie —
  // excluant à tort une vraie indemnité d'assurance de la recette.
  /garantie loyers? impayes?/,
  /sinistre/,
];

const CHARGE_HEADER_PATTERNS: RegExp[] = [/charges?/, /charge loc/];

const FEE_HEADER_PATTERNS: RegExp[] = [/frais/, /commission/];

const DEPOSIT_HEADER_PATTERNS: RegExp[] = [/depot/, /caution/, /garantie/];

const TRANSFER_HEADER_PATTERNS: RegExp[] = [/virement/, /transfert/];

export function normalizeRevenueHeader(header: string): string {
  return header
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

function matchesAny(normalized: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(normalized));
}

export function logRevenueHeaderClassification(result: RevenueHeaderClassification): void {
  console.log("[revenue-header-classification]", {
    rawHeader: result.rawHeader,
    normalizedHeader: result.normalizedHeader,
    inferredSemanticCategory: result.semanticCategory,
    targetGridField: result.targetGridField,
    targetGridColumn: result.targetGridColumn,
    isMonetary: result.isMonetary,
  });
}

export function classifyRevenueHeader(rawHeader: string): RevenueHeaderClassification {
  const normalizedHeader = normalizeRevenueHeader(rawHeader);

  let semanticCategory: HeaderSemanticCategory = "text";
  let transactionCategory: RevenueTransactionCategory | null = null;
  let targetGridField: HeaderTargetGridField = "none";
  let targetGridColumn: RevenueGridColumn | null = null;
  let isMonetary = false;

  if (normalizedHeader === "mois") {
    semanticCategory = "month";
    targetGridField = "monthKey";
  } else if (normalizedHeader === "date" || normalizedHeader.startsWith("date ")) {
    semanticCategory = "date";
    targetGridField = "transactionDate";
  } else if (matchesAny(normalizedHeader, RENT_HEADER_PATTERNS)) {
    semanticCategory = "rent";
    transactionCategory = "rent";
    targetGridField = "loyers";
    targetGridColumn = "loyers";
    isMonetary = true;
  } else if (matchesAny(normalizedHeader, PLATFORM_HEADER_PATTERNS)) {
    semanticCategory = "platform";
    transactionCategory = "platform_payout";
    targetGridField = "autresRevenus";
    targetGridColumn = "autresRevenus";
    isMonetary = true;
  } else if (matchesAny(normalizedHeader, INSURANCE_INDEMNITY_HEADER_PATTERNS)) {
    semanticCategory = "insurance_indemnity";
    transactionCategory = "insurance_indemnity";
    targetGridField = "autresRevenus";
    targetGridColumn = "autresRevenus";
    isMonetary = true;
  } else if (matchesAny(normalizedHeader, OTHER_INCOME_HEADER_PATTERNS)) {
    semanticCategory = "other_income";
    transactionCategory = "additional_income";
    targetGridField = "autresRevenus";
    targetGridColumn = "autresRevenus";
    isMonetary = true;
  } else if (matchesAny(normalizedHeader, CHARGE_HEADER_PATTERNS)) {
    semanticCategory = "charges";
    transactionCategory = "charges";
    targetGridField = "charges";
    targetGridColumn = "charges";
    isMonetary = true;
  } else if (matchesAny(normalizedHeader, FEE_HEADER_PATTERNS)) {
    semanticCategory = "fee";
    transactionCategory = "fee";
    targetGridField = "charges";
    targetGridColumn = "charges";
    isMonetary = true;
  } else if (matchesAny(normalizedHeader, DEPOSIT_HEADER_PATTERNS)) {
    semanticCategory = "deposit";
    transactionCategory = "deposit";
  } else if (matchesAny(normalizedHeader, TRANSFER_HEADER_PATTERNS)) {
    semanticCategory = "transfer";
    transactionCategory = "internal_transfer";
  } else if (normalizedHeader.includes("libelle") || normalizedHeader.includes("label")) {
    semanticCategory = "label";
  }

  const result: RevenueHeaderClassification = {
    rawHeader,
    normalizedHeader,
    semanticCategory,
    transactionCategory,
    targetGridField,
    targetGridColumn,
    isMonetary,
  };

  return result;
}

export function isProtectedMonetaryHeader(rawHeader: string): boolean {
  const classification = classifyRevenueHeader(rawHeader);
  return (
    classification.isMonetary &&
    (classification.semanticCategory === "rent" ||
      classification.semanticCategory === "other_income" ||
      classification.semanticCategory === "platform" ||
      classification.semanticCategory === "insurance_indemnity")
  );
}

export function isOtherIncomeHeader(rawHeader: string): boolean {
  return classifyRevenueHeader(rawHeader).semanticCategory === "other_income";
}

export function isRentHeader(rawHeader: string): boolean {
  return classifyRevenueHeader(rawHeader).semanticCategory === "rent";
}

export function canonicalMonetaryHeaderLabel(rawHeader: string): string {
  const classification = classifyRevenueHeader(rawHeader);
  if (classification.semanticCategory === "rent") return "Loyer";
  if (classification.semanticCategory === "platform") return "Revenus plateforme";
  if (classification.semanticCategory === "insurance_indemnity") return "Indemnité assurance";
  if (classification.semanticCategory === "other_income") return "Complément";
  if (classification.semanticCategory === "charges") return "Charges";
  if (classification.semanticCategory === "fee") return "Frais";
  return rawHeader.trim();
}

export function headerMatchesOtherIncomeSynonym(text: string): boolean {
  const normalized = normalizeRevenueHeader(text);
  return matchesAny(normalized, OTHER_INCOME_HEADER_PATTERNS);
}

export function headerMatchesRentSynonym(text: string): boolean {
  const normalized = normalizeRevenueHeader(text);
  return matchesAny(normalized, RENT_HEADER_PATTERNS);
}

export function tableHasStructuredRevenueHeaders(text: string): boolean {
  const sample = text.slice(0, 4000).toLowerCase();
  const hasRent = headerMatchesRentSynonym(sample) || /\bloyers?\b/.test(sample);
  const hasOtherIncome =
    headerMatchesOtherIncomeSynonym(sample) || /compl[eé]?\.?/i.test(sample);
  return hasRent && hasOtherIncome;
}

export function categoryFromColumnHeader(header: string): RevenueTransactionCategory | null {
  return classifyRevenueHeader(header).transactionCategory;
}
