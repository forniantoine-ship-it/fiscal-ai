/**
 * Lot 5.4-B — wrapper client (fetch) implémentant DepreciationRegisterVisionRequester.
 * Pattern aligné requestVisionOcrText (vision-ocr.ts) : aucune clé OpenAI
 * ici, aucun import du module serveur — uniquement un appel HTTP vers la
 * route API dédiée. Sûr à importer depuis un composant "use client".
 */

import type {
  DepreciationRegisterVisionPageInput,
  DepreciationRegisterVisionPageResult,
  DepreciationRegisterVisionRequester,
} from "./depreciation-register-pdf-row";

export class DepreciationRegisterVisionError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "DepreciationRegisterVisionError";
  }
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: mimeType });
}

/**
 * Requester Vision côté client — un appel HTTP par page.
 * Échec réseau/HTTP/JSON invalide → lève (fail closed) ; l'extracteur 5.4-A
 * capte cette erreur par page et pousse un diagnostic VISION_FAILED, sans
 * jamais promouvoir de ligne inventée.
 */
export const requestDepreciationRegisterVisionRows: DepreciationRegisterVisionRequester = async (
  input: DepreciationRegisterVisionPageInput,
): Promise<DepreciationRegisterVisionPageResult> => {
  const formData = new FormData();
  formData.append("documentId", input.documentId);
  formData.append("pageNumber", String(input.pageNumber));
  if (input.pageTextHint) {
    formData.append("pageTextHint", input.pageTextHint);
  }
  formData.append(
    "image",
    base64ToBlob(input.pageImage.base64, input.pageImage.mimeType),
    `page-${input.pageNumber}.${input.pageImage.mimeType === "image/png" ? "png" : "jpg"}`,
  );

  const response = await fetch("/api/lmnp/takeover/depreciation-register-vision", {
    method: "POST",
    body: formData,
  });

  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
    rows?: DepreciationRegisterVisionPageResult["rows"];
  };

  if (!response.ok) {
    throw new DepreciationRegisterVisionError(
      body.error ?? `Vision registre d'amortissements échouée (${response.status})`,
      response.status,
    );
  }

  if (!Array.isArray(body.rows)) {
    throw new DepreciationRegisterVisionError("Réponse vision registre d'amortissements invalide.", 502);
  }

  return { rows: body.rows };
};
