import {
  collapseForLabelMatch,
  normalizeForLabelMatch,
} from "@/lib/documents/extractors/inpi-ocr-normalize";
import { isAddressGroundedInText } from "./grounding-text-matchers";
import type { DocumentFact } from "./document-fact";
import type { FactType } from "./fact-type-registry";

/**
 * Semantic resolution for Activité address facts.
 *
 * Principle: a document address must never change semantic type implicitly.
 * Identical values across headquarters / personal / establishment / property
 * remain distinct until an explicit proof or user confirmation exists.
 *
 * Future: AddressLink / AddressEquivalence (user-confirmed only) — not implemented.
 */

export const PERSONAL_ADDRESS_LABEL_PATTERNS = [
  /adresse\s+personnelle/i,
  /domicile\s+personnel/i,
  /domicile\s+de\s+l['']entrepreneur/i,
  /adresse\s+du\s+domicile(?:\s+personnel)?/i,
  /r[eé]sidence\s+personnelle/i,
  /adresse\s+de\s+correspondance/i,
  /adresse\s+du\s+d[eé]clarant(?:\s+signataire)?/i,
  /adresse\s+du\s+signataire/i,
] as const;

export const ESTABLISHMENT_ADDRESS_LABEL_PATTERNS = [
  /adresse\s+de\s+l['']entreprise/i,
  /adresse\s+de\s+l['']établissement(?:\s+principal)?/i,
  /adresse\s+de\s+l['']etablissement(?:\s+principal)?/i,
  /adresse\s+de\s+l['']établissement\s*\(\s*si\s+diff[eé]rente\s*\)/i,
  /adresse\s+de\s+l['']etablissement\s*\(\s*si\s+differente\s*\)/i,
] as const;

const HEADQUARTERS_LABEL_PATTERN = /adresse\s+du\s+si[eè]ge/i;

const GENERIC_ADDRESS_LABEL_PATTERN = /^adresse\s*:/i;

function collapseSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function hasExplicitPersonalAddressLabel(rawText: string): boolean {
  return PERSONAL_ADDRESS_LABEL_PATTERNS.some((pattern) => pattern.test(rawText));
}

export function hasExplicitEstablishmentAddressLabel(rawText: string): boolean {
  return ESTABLISHMENT_ADDRESS_LABEL_PATTERNS.some((pattern) => pattern.test(rawText));
}

export function hasExplicitHeadquartersAddressLabel(rawText: string): boolean {
  return HEADQUARTERS_LABEL_PATTERN.test(rawText);
}

export function isGenericAmbiguousAddressLabel(line: string): boolean {
  const trimmed = collapseSpaces(line);
  return GENERIC_ADDRESS_LABEL_PATTERN.test(trimmed) && !hasExplicitPersonalAddressLabel(trimmed);
}

/**
 * Finds an OCR snippet that ties an address value to an explicit semantic label.
 * Returns the full labelled line when found; undefined for ambiguous/generic labels.
 */
export function findAddressSemanticEvidence(
  rawText: string,
  address: string,
  labelPatterns: readonly RegExp[],
): string | undefined {
  const trimmedAddress = address.trim();
  if (!trimmedAddress || !rawText.trim()) return undefined;

  const lines = rawText.split(/\r?\n/);

  for (const line of lines) {
    const collapsedLine = collapseSpaces(line);
    if (!collapsedLine) continue;

    const matchingPattern = labelPatterns.find((pattern) => pattern.test(collapsedLine));
    if (!matchingPattern) continue;
    if (isGenericAmbiguousAddressLabel(collapsedLine)) continue;

    if (isAddressGroundedInText(trimmedAddress, collapsedLine)) {
      return collapsedLine;
    }
  }

  for (const pattern of labelPatterns) {
    const labelSource = pattern.source.replace(/^\^/, "").replace(/\$$/, "");
    const regex = new RegExp(`(${labelSource})\\s*[:\\-]?\\s*([^\\n]+)`, "i");
    const match = rawText.match(regex);
    if (!match?.[1] || !match[2]) continue;

    const snippet = collapseSpaces(`${match[1]} : ${match[2]}`);
    if (isGenericAmbiguousAddressLabel(snippet)) continue;
    if (isAddressGroundedInText(trimmedAddress, match[2])) {
      return snippet;
    }
  }

  return undefined;
}

export function findPersonalAddressSemanticEvidence(
  rawText: string,
  address: string,
): string | undefined {
  return findAddressSemanticEvidence(rawText, address, PERSONAL_ADDRESS_LABEL_PATTERNS);
}

export function findEstablishmentAddressSemanticEvidence(
  rawText: string,
  address: string,
): string | undefined {
  return findAddressSemanticEvidence(rawText, address, ESTABLISHMENT_ADDRESS_LABEL_PATTERNS);
}

export function hasExplicitEstablishmentAddressEvidence(fact: DocumentFact): boolean {
  const snippet = fact.evidence?.snippet?.trim();
  if (!snippet) return false;
  return ESTABLISHMENT_ADDRESS_LABEL_PATTERNS.some((pattern) => pattern.test(snippet));
}

export function hasExplicitPersonalAddressEvidence(fact: DocumentFact): boolean {
  const snippet = fact.evidence?.snippet?.trim();
  if (!snippet) return false;
  return PERSONAL_ADDRESS_LABEL_PATTERNS.some((pattern) => pattern.test(snippet));
}

/**
 * Maps legacy GPT `adresseEntrepreneur` to a FactType only when OCR labels are explicit.
 * Never maps to `address.headquarters` — siège is extracted deterministically from INPI.
 */
export function resolveGptEntrepreneurAddressFactType(
  rawText: string,
  address?: string,
): Extract<FactType, "address.personal"> | null {
  if (!address?.trim()) return null;
  if (hasExplicitPersonalAddressLabel(rawText)) {
    return "address.personal";
  }
  return null;
}

export function normalizedAddressComparable(value: string): string {
  return collapseForLabelMatch(normalizeForLabelMatch(value));
}
