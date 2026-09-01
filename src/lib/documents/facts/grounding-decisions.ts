import {
  findEstablishmentAddressSemanticEvidence,
  findPersonalAddressSemanticEvidence,
} from "./activite-address-semantics";
import {
  findSiretInText,
  isAddressGroundedInText,
  isEmailGroundedInText,
  isExplicitSirenInText,
  isNameGroundedInText,
  isPhoneGroundedInText,
} from "./grounding-text-matchers";

export type GroundingOutcome = "accepted" | "rejected" | "proposed";

export type GroundingDecision = {
  outcome: GroundingOutcome;
  value?: string;
  rejectedValue?: string;
  reason: string;
  evidence?: string;
};

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function accept(value: string, reason: string, evidence?: string): GroundingDecision {
  return { outcome: "accepted", value, reason, evidence };
}

function reject(rejectedValue: string, reason: string): GroundingDecision {
  return { outcome: "rejected", rejectedValue, reason };
}

export function groundGptEmail(email: string | undefined, rawText: string): GroundingDecision | null {
  const trimmed = email?.trim();
  if (!trimmed) return null;
  return isEmailGroundedInText(trimmed, rawText)
    ? accept(trimmed, "email_present_in_ocr", trimmed)
    : reject(trimmed, "email_not_found_in_ocr");
}

export function groundGptTelephone(
  telephone: string | undefined,
  rawText: string,
): GroundingDecision | null {
  const trimmed = telephone?.trim();
  if (!trimmed) return null;
  return isPhoneGroundedInText(trimmed, rawText)
    ? accept(trimmed, "telephone_present_in_ocr", trimmed)
    : reject(trimmed, "telephone_not_found_in_ocr");
}

export function groundGptName(
  name: string | undefined,
  rawText: string,
  kind: "nom" | "prenom",
): GroundingDecision | null {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  return isNameGroundedInText(trimmed, rawText)
    ? accept(trimmed, `${kind}_present_in_ocr`, trimmed)
    : reject(trimmed, `${kind}_not_found_in_ocr`);
}

export function groundGptSiren(
  siren: string | undefined,
  rawText: string,
): GroundingDecision | null {
  const trimmed = siren?.trim();
  if (!trimmed) return null;

  const digits = digitsOnly(trimmed).slice(0, 9);
  if (digits.length === 9 && isExplicitSirenInText(digits, rawText)) {
    return accept(digits, "siren_present_in_ocr", digits);
  }

  return reject(trimmed, "siren_not_found_in_ocr");
}

export function groundGptAddress(
  address: string | undefined,
  rawText: string,
  kind: "adresseEntrepreneur" | "adresseEtablissement",
): GroundingDecision | null {
  const trimmed = address?.trim();
  if (!trimmed) return null;

  if (!isAddressGroundedInText(trimmed, rawText)) {
    return reject(trimmed, `${kind}_not_found_in_ocr`);
  }

  const semanticEvidence =
    kind === "adresseEtablissement"
      ? findEstablishmentAddressSemanticEvidence(rawText, trimmed)
      : findPersonalAddressSemanticEvidence(rawText, trimmed);

  return accept(trimmed, `${kind}_present_in_ocr`, semanticEvidence ?? trimmed);
}

export function groundSiretFromOcr(rawText: string): GroundingDecision | null {
  const siret = findSiretInText(rawText);
  if (!siret) return null;
  return accept(siret, "siret_present_in_ocr", `SIRET ${siret}`);
}

export function applyGroundingDecision<T extends { outcome: GroundingOutcome; value?: string; evidence?: string; rejectedValue?: string }>(
  decision: T,
): {
  status: "extracted" | "proposed" | "missing";
  value?: string;
  fieldSource?: "extracted" | "derived";
  evidence?: string;
  rejectedValue?: string;
  origin: "document" | "deduction";
  derivationRule?: string;
} {
  if (decision.outcome === "accepted") {
    return {
      status: "extracted",
      value: decision.value,
      fieldSource: "extracted",
      evidence: decision.evidence,
      origin: "document",
    };
  }

  if (decision.outcome === "proposed") {
    return {
      status: "proposed",
      value: decision.value,
      fieldSource: "derived",
      evidence: decision.evidence,
      origin: "deduction",
      derivationRule: "siren_from_siret",
    };
  }

  return {
    status: "missing",
    rejectedValue: decision.rejectedValue,
    origin: "document",
  };
}
