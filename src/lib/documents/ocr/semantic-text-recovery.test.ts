/**
 * Semantic text recovery eligibility tests.
 * Run: npm run test:document-text-extraction
 */
import {
  isEffectivelyEmpty,
  isNarrativeLegalDocumentHint,
  isSemanticRecoveryEligible,
  PARTIAL_TEXT_MIN_LENGTH,
} from "@/lib/documents/ocr/semantic-text-recovery";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

assert(isNarrativeLegalDocumentHint("acte-vente-paris.pdf"), "acte filename");
assert(isNarrativeLegalDocumentHint("compromis-achat.pdf"), "compromis filename");
assert(isNarrativeLegalDocumentHint("attestation-vente.pdf"), "attestation filename");
assert(isNarrativeLegalDocumentHint("diagnostic-dpe.pdf"), "diagnostic filename");
assert(!isNarrativeLegalDocumentHint("releve-bancaire.pdf"), "non logement filename");

const partialActeText = `
  ACTE DE VENTE
  Notaire Me Dupont
  Commune de Lyon
  Le vendeur declare ceder le bien situe
  au 12 rue de la Republique
`.repeat(2);

assert(
  isSemanticRecoveryEligible(partialActeText, "acte-vente.pdf"),
  "partial acte text eligible for semantic recovery",
);

const tooShort = "acte vente";
assert(!isSemanticRecoveryEligible(tooShort, "acte.pdf"), "too short rejected");
assert(isEffectivelyEmpty(tooShort), "too short is effectively empty");
assert(!isEffectivelyEmpty("x".repeat(PARTIAL_TEXT_MIN_LENGTH)), "partial length not empty");

const lowQualityNonNarrative = "123456789012345678901234567890123456789012345678901234567890";
assert(
  !isSemanticRecoveryEligible(lowQualityNonNarrative, "unknown.bin"),
  "non-narrative low alpha rejected",
);

console.log("[test:document-text-extraction] all assertions passed");
