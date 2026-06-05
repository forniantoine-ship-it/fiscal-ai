/**
 * Invalid corpus detection tests.
 * Run: npm run test:document-text-extraction
 */
import { detectInvalidCorpus, sanitizeCorpusText } from "./invalid-corpus-detection";
import { isEffectivelyEmpty, isSemanticRecoveryEligible } from "./semantic-text-recovery";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const visionRefusal =
  "I'm unable to extract text from this image. The document may be blank or too low resolution.";

assert(detectInvalidCorpus(visionRefusal).invalidCorpusDetected, "vision refusal detected");
assert(
  detectInvalidCorpus(visionRefusal).rejectionReason === "vision_model_refusal_unable_to_extract",
  "vision refusal reason",
);
assert(sanitizeCorpusText(visionRefusal, "vision_ocr") === "", "sanitized to empty");
assert(isEffectivelyEmpty(visionRefusal), "refusal is effectively empty");
assert(
  !isSemanticRecoveryEligible(visionRefusal, "acte-vente.pdf"),
  "semantic recovery blocked for refusal",
);

assert(detectInvalidCorpus("OCR failed: timeout").invalidCorpusDetected, "ocr failed message");
assert(
  detectInvalidCorpus("No readable text found in document.").invalidCorpusDetected,
  "no readable text placeholder",
);
assert(
  detectInvalidCorpus("Impossible d'extraire le texte de ce document.").invalidCorpusDetected,
  "french extraction failure",
);

const validActeSnippet = `
ACTE DE VENTE
Le vendeur déclare céder le bien situé au 12 rue de la République
Prix de vente : 72500 euros
`.trim();

assert(!detectInvalidCorpus(validActeSnippet).invalidCorpusDetected, "valid acte text accepted");
assert(
  sanitizeCorpusText(validActeSnippet, "vision_ocr") === validActeSnippet,
  "valid text unchanged",
);
assert(
  isSemanticRecoveryEligible(validActeSnippet.repeat(2), "acte-vente.pdf"),
  "valid partial acte still eligible",
);

console.log("[test:document-text-extraction] invalid corpus assertions passed");
