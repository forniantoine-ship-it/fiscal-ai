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

// Correctif EP-VEZON (Cycle OCR) — refus observé sur le retry après un
// premier refus, jamais reconnu jusqu'ici : "I'm sorry, but I can't assist
// with that." (1) le refus déjà connu reste détecté ; (2) cette formulation
// précise est désormais détectée ; (3) des variantes proches, explicitement
// orientées refus, le sont aussi ; (4) un texte OCR court mais réel n'est
// jamais confondu avec un refus ; (5) une erreur d'infrastructure garde sa
// propre catégorie, jamais classée comme un refus modèle.

// 1 — refus déjà détecté (observé tel quel sur EP-VEZON page 3).
const epVezonPage3Refusal =
  "I'm unable to extract text from the document as it appears to be an image with significant visual obstructions. If you have a different document or a clearer version, please provide that, and I'll assist.";
assert(detectInvalidCorpus(epVezonPage3Refusal).invalidCorpusDetected, "1 — refus page 3 EP-VEZON toujours détecté");

// 2 — la formulation exacte observée sur le retry.
const retryRefusal = "I'm sorry, but I can't assist with that.";
assert(detectInvalidCorpus(retryRefusal).invalidCorpusDetected, "2 — refus retry détecté");
assert(
  detectInvalidCorpus(retryRefusal).rejectionReason === "model_refusal_cannot_assist",
  "2 — motif du refus retry correctement catégorisé",
);

// 3 — variantes proches, toujours un refus explicite d'assister.
assert(
  detectInvalidCorpus("I am sorry, but I cannot help with that.").invalidCorpusDetected,
  "3 — variante 'I am sorry ... cannot help' détectée",
);
assert(
  detectInvalidCorpus("I'm sorry, I can't assist you with that request.").invalidCorpusDetected,
  "3 — variante sans 'but' détectée",
);

// 4 — texte OCR court mais réel, jamais confondu avec un refus.
assert(
  !detectInvalidCorpus("TOTAL TTC : 1 250,00 EUR").invalidCorpusDetected,
  "4 — total court mais valide non détecté comme refus",
);
assert(
  !detectInvalidCorpus("Je suis désolé du retard, voir le courrier ci-joint.").invalidCorpusDetected,
  "4 — 'désolé' dans un contexte non-refus non détecté",
);

// 5 — erreur d'infrastructure : catégorisée, mais jamais comme un refus modèle.
assert(
  detectInvalidCorpus("OPENAI_API_KEY non configurée.").rejectionReason === "provider_configuration_error",
  "5 — erreur de configuration reste dans sa propre catégorie",
);

console.log("[test:document-text-extraction] invalid corpus assertions passed");
