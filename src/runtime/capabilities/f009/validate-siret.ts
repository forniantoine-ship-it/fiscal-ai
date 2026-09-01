import { normalizeSiret } from "@/lib/documents/extractors/inpi-extraction.helpers";

export type ValidateSiretInput = {
  siret: string;
};

export type ValidateSiretOutput = {
  valid: boolean;
  normalized?: string;
  error?: string;
};

function passesLuhnCheck(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    const positionFromRight = digits.length - 1 - i;
    let digit = Number(digits[positionFromRight]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

export function validateSiret(input: ValidateSiretInput): ValidateSiretOutput {
  const normalized = normalizeSiret(input.siret);
  if (normalized.length !== 14) {
    return {
      valid: false,
      error: "Le SIRET doit contenir 14 chiffres.",
    };
  }
  if (!passesLuhnCheck(normalized)) {
    return {
      valid: false,
      normalized,
      error: "Ce numéro SIRET ne semble pas valide. Vérifiez les chiffres saisis.",
    };
  }
  return { valid: true, normalized };
}
