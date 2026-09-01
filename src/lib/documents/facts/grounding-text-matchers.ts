import {
  collapseForLabelMatch,
  normalizeForLabelMatch,
} from "@/lib/documents/extractors/inpi-ocr-normalize";
import { parseFrenchAddress } from "@/lib/lmnp/services/parse-french-address";

const SIRET_PATTERN = /\b(\d{3}[\s.]?\d{3}[\s.]?\d{3}[\s.]?\d{5})\b/;
const SIREN_PATTERN = /\b(\d{3}[\s.]?\d{3}[\s.]?\d{3})\b/;

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function collapseSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizedText(rawText: string): string {
  return normalizeForLabelMatch(rawText);
}

function collapsedText(rawText: string): string {
  return collapseForLabelMatch(rawText);
}

function isDigitSequenceInText(digits: string, rawText: string): boolean {
  if (digits.length < 9) return false;
  if (digitsOnly(rawText).includes(digits)) return true;

  const pattern = digits
    .split("")
    .map((digit) => digit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("[\\s.\\-/]*");
  return new RegExp(pattern).test(rawText);
}

export function isEmailGroundedInText(email: string, rawText: string): boolean {
  const normalizedEmail = collapseSpaces(email).toLowerCase().replace(/\s/g, "");
  if (!normalizedEmail.includes("@")) return false;
  const haystack = rawText.toLowerCase().replace(/\s/g, "");
  return haystack.includes(normalizedEmail);
}

export function normalizePhoneDigits(value: string): string {
  let digits = digitsOnly(value);
  if (digits.startsWith("0033") && digits.length >= 12) {
    digits = `0${digits.slice(4)}`;
  } else if (digits.startsWith("33") && digits.length >= 11) {
    digits = `0${digits.slice(2)}`;
  }
  return digits;
}

export function isPhoneGroundedInText(telephone: string, rawText: string): boolean {
  const digits = normalizePhoneDigits(telephone);
  if (digits.length < 9) return false;
  if (isDigitSequenceInText(digits, rawText)) return true;
  if (digits.startsWith("0") && isDigitSequenceInText(digits.slice(1), rawText)) return true;
  return false;
}

export function isSirenGroundedInText(siren: string, rawText: string): boolean {
  const digits = digitsOnly(siren).slice(0, 9);
  if (digits.length !== 9) return false;
  return isDigitSequenceInText(digits, rawText);
}

export function isExplicitSirenInText(siren: string, rawText: string): boolean {
  const digits = digitsOnly(siren).slice(0, 9);
  if (digits.length !== 9) return false;

  const spaced = `${digits.slice(0, 3)}[\\s.]?${digits.slice(3, 6)}[\\s.]?${digits.slice(6, 9)}`;
  const labelled = new RegExp(`siren\\s*[:.]?\\s*${spaced}`, "i");
  if (labelled.test(rawText)) return true;

  const standalone = new RegExp(`(?:^|[^\\d])${spaced}(?!\\d)`, "m");
  if (!standalone.test(rawText)) return false;

  const siret = findSiretInText(rawText);
  if (siret?.startsWith(digits) && !/siren/i.test(rawText)) {
    return false;
  }

  return true;
}

export function findSiretInText(rawText: string): string | undefined {
  const match = rawText.match(SIRET_PATTERN);
  if (!match?.[1]) return undefined;
  const digits = digitsOnly(match[1]);
  return digits.length === 14 ? digits : undefined;
}

export function findSirenInText(rawText: string): string | undefined {
  for (const match of rawText.matchAll(new RegExp(SIREN_PATTERN, "g"))) {
    const digits = digitsOnly(match[1] ?? "");
    if (digits.length === 9) return digits;
  }
  return undefined;
}

export function isNameGroundedInText(name: string, rawText: string): boolean {
  const tokens = normalizedText(name)
    .split(/[\s\-']+/)
    .filter((token) => token.length >= 2);
  if (tokens.length === 0) return false;

  const haystack = normalizedText(rawText);
  return tokens.every((token) => haystack.includes(token));
}

export function isAddressGroundedInText(address: string, rawText: string): boolean {
  const trimmed = collapseSpaces(address);
  if (!trimmed) return false;

  const parsed = parseFrenchAddress(trimmed);
  const haystack = normalizedText(rawText);
  const collapsedHaystack = collapsedText(rawText);

  const streetTokens = normalizedText(parsed.address ?? trimmed)
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !/^\d+$/.test(token));

  if (streetTokens.some((token) => haystack.includes(token))) {
    if (parsed.postalCode && !rawText.includes(parsed.postalCode)) return false;
    return true;
  }

  const collapsedAddress = collapseForLabelMatch(trimmed);
  if (collapsedAddress.length >= 12 && collapsedHaystack.includes(collapsedAddress)) {
    return true;
  }

  return false;
}

export function findSiretEvidenceSnippet(rawText: string, siret: string): string | undefined {
  const match = rawText.match(SIRET_PATTERN);
  if (match?.[0]) return match[0].trim();
  return `SIRET ${siret}`;
}
