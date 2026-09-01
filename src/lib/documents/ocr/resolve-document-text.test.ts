/**
 * Correctif — refus explicite du modèle vision ("I'm unable to extract
 * text...") : ce n'est jamais une mesure de qualité d'image, donc jamais un
 * signal de document illisible. Ces tests couvrent uniquement le mécanisme
 * de retry (`requestVisionTextWithRefusalRetry`), avec un client vision
 * injecté (jamais de vrai réseau/API) — la détection elle-même
 * (`detectInvalidCorpus`) reste couverte par `invalid-corpus-detection.test.ts`.
 * Run: npx tsx src/lib/documents/ocr/resolve-document-text.test.ts
 */
import {
  isModelRefusalReason,
  requestVisionTextWithRefusalRetry,
} from "./resolve-document-text";
import { VisionOcrError, type VisionOcrPromptVariant } from "./vision-ocr";
import type { RasterPageImage } from "./pdf-to-images";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const IMAGES: RasterPageImage[] = [{ mimeType: "image/png", base64: "AAAA", pageNumber: 1 }];

const VISION_REFUSAL =
  "I'm unable to extract text from the document as it appears to be an image. If you have a text version or need assistance with something else, feel free to ask.";

const VALID_CORPUS = `
TABLEAU D'AMORTISSEMENT
Capital emprunté : 131 482,00 EUR
Taux nominal : 3,84 %
Durée : 317 mois
`.trim();

type Call = { images: RasterPageImage[]; options?: { fileName?: string; promptVariant?: VisionOcrPromptVariant } };

function fakeRequester(responses: (string | Error)[]): {
  requester: typeof import("./vision-ocr").requestVisionOcrText;
  calls: Call[];
} {
  const calls: Call[] = [];
  let index = 0;
  const requester = async (images: RasterPageImage[], options?: Call["options"]) => {
    calls.push({ images, options });
    const response = responses[Math.min(index, responses.length - 1)];
    index += 1;
    if (response instanceof Error) throw response;
    return response;
  };
  return { requester, calls };
}

async function run(): Promise<void> {
  // A — refus vision → retry déclenché avec le prompt adapté.
  {
    const { requester, calls } = fakeRequester([VISION_REFUSAL, VALID_CORPUS]);
    const result = await requestVisionTextWithRefusalRetry(IMAGES, { fileName: "doc.pdf" }, requester);
    assert(calls.length === 2, "A — un refus doit déclencher exactement un second appel");
    assert(calls[1]!.options?.promptVariant === "retry_after_refusal", "A — le retry utilise le prompt adapté");
    assert(result === VALID_CORPUS, "A — le résultat final est celui du retry");
  }

  // B — retry réussi : le texte valide du second appel est bien retourné.
  {
    const { requester } = fakeRequester([VISION_REFUSAL, VALID_CORPUS]);
    const result = await requestVisionTextWithRefusalRetry(IMAGES, {}, requester);
    assert(result === VALID_CORPUS, "B — retry réussi retourne le texte valide, jamais le refus");
  }

  // C — refus répété (deux fois) → échec normal, jamais de texte inventé.
  {
    const { requester, calls } = fakeRequester([VISION_REFUSAL, VISION_REFUSAL]);
    const result = await requestVisionTextWithRefusalRetry(IMAGES, {}, requester);
    assert(calls.length === 2, "C — un seul retry tenté, jamais une boucle");
    assert(result === VISION_REFUSAL, "C — le refus d'origine est retourné tel quel, pour rejet en aval inchangé");
  }

  // C bis — le retry échoue avec une erreur réseau/API : pas de deuxième filet, refus d'origine retourné.
  {
    const { requester, calls } = fakeRequester([VISION_REFUSAL, new VisionOcrError("boom", 500)]);
    const result = await requestVisionTextWithRefusalRetry(IMAGES, {}, requester);
    assert(calls.length === 2, "C bis — le retry est bien tenté même s'il échoue ensuite");
    assert(result === VISION_REFUSAL, "C bis — échec du retry lui-même : refus d'origine conservé, rien d'inventé");
  }

  // D — vrai document illisible (texte vide, aucun motif de refus) : jamais de retry.
  {
    const { requester, calls } = fakeRequester(["", "ne doit jamais être appelé"]);
    const result = await requestVisionTextWithRefusalRetry(IMAGES, {}, requester);
    assert(calls.length === 1, "D — un document réellement illisible ne déclenche aucun retry");
    assert(result === "", "D — texte vide retourné tel quel, comportement inchangé pour un vrai échec OCR");
  }

  // E — corpus OCR normal : aucun retry, comportement inchangé.
  {
    const { requester, calls } = fakeRequester([VALID_CORPUS, "ne doit jamais être appelé"]);
    const result = await requestVisionTextWithRefusalRetry(IMAGES, {}, requester);
    assert(calls.length === 1, "E — un corpus normal ne déclenche jamais de second appel");
    assert(result === VALID_CORPUS, "E — texte valide retourné tel quel");
  }

  // F — isModelRefusalReason : seules les familles de refus déclenchent un retry,
  // jamais les erreurs de configuration/traces techniques (hors périmètre du modèle).
  assert(isModelRefusalReason("vision_model_refusal_unable_to_extract"), "F — refus reconnu");
  assert(isModelRefusalReason("short_model_refusal"), "F — refus court reconnu");
  assert(!isModelRefusalReason("provider_configuration_error"), "F — erreur de config jamais un refus modèle");
  assert(!isModelRefusalReason("javascript_exception_trace"), "F — trace technique jamais un refus modèle");
  assert(!isModelRefusalReason(null), "F — absence de motif jamais un refus modèle");

  // G — correctif EP-VEZON : "I'm sorry, but I can't assist with that." reconnu
  // comme refus (6/7 de la demande du correctif).
  assert(isModelRefusalReason("model_refusal_cannot_assist"), "G — nouveau motif de refus reconnu");

  // H — le retry lui-même refuse avec cette formulation (cas réel observé sur
  // EP-VEZON page 3) : un seul retry tenté, jamais une boucle, le refus du
  // retry est retourné tel quel — jamais inventé, jamais un second appel.
  {
    const retryRefusal = "I'm sorry, but I can't assist with that.";
    const { requester, calls } = fakeRequester([VISION_REFUSAL, retryRefusal]);
    const result = await requestVisionTextWithRefusalRetry(IMAGES, {}, requester);
    assert(calls.length === 2, "H — un seul retry tenté même si celui-ci refuse aussi");
    assert(
      calls[1]!.options?.promptVariant === "retry_after_refusal",
      "H — le retry utilise bien le prompt adapté",
    );
    assert(result === retryRefusal, "H — le refus du retry est retourné tel quel, jamais un 3e appel");
  }

  console.log("[test:resolve-document-text] refusal retry assertions passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
