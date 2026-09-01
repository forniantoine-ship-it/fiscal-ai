import { normalizeOcrText } from "@/lib/documents/normalizers";
import { resolveDocumentTextOrThrow } from "@/lib/documents/ocr";
import { requestLogementGptExtraction } from "@/lib/lmnp/services/logement-gpt-extract-client";

import { acteExtractionToF010Prefill, type F010ActePrefill } from "./acte-to-assistant";

/**
 * Étape 4 — Extraction client de l'acte notarié pour F-010.
 * Réutilise le pipeline documentaire existant (OCR + extraction GPT), puis
 * mappe le résultat vers les entrées de l'Assistant Logement.
 */
export async function extractActeForF010(file: File): Promise<F010ActePrefill> {
  const ocr = await resolveDocumentTextOrThrow(file);
  const rawText = normalizeOcrText(ocr.rawText);
  const result = await requestLogementGptExtraction({ rawText, fileName: file.name });
  return acteExtractionToF010Prefill(result.extraction);
}
