/**
 * Lot 5.5-A — wrapper client (fetch) implémentant TaxPackageLiasseVisionRequester.
 * Pattern aligné request-depreciation-register-vision.ts : aucune clé OpenAI
 * ici, aucun import du module serveur — uniquement un appel HTTP vers la
 * route API dédiée. Sûr à importer depuis un composant "use client".
 */

import type { TaxPackageLiasseVisionRequester } from "./extract-tax-package-liasse-observations";

export class TaxPackageLiasseVisionError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "TaxPackageLiasseVisionError";
  }
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: mimeType });
}

/**
 * Requester Vision côté client pour la liasse N-1 (extraction structurée des
 * cases) — un appel HTTP par groupe (formType, page). Échec réseau/HTTP/JSON
 * invalide → lève (fail closed) ; extractTaxPackageLiasseObservations
 * propage cette erreur jusqu'à extractScannedTaxPackageControlFactsFromPdf,
 * qui la capte et renvoie status "rejected" (reason "VISION_FAILED") —
 * jamais une case inventée.
 */
export const requestTaxPackageLiasseVisionCases: TaxPackageLiasseVisionRequester = async (input) => {
  const formData = new FormData();
  formData.append("formType", input.formType);
  formData.append("sourceCases", JSON.stringify(input.sourceCases));
  if (input.pageNumber !== undefined) {
    formData.append("pageNumber", String(input.pageNumber));
  }
  if (input.pageTextHint) {
    formData.append("pageTextHint", input.pageTextHint);
  }
  if (input.pageImage) {
    formData.append(
      "image",
      base64ToBlob(input.pageImage.base64, input.pageImage.mimeType),
      `page-${input.pageNumber ?? "0"}.${input.pageImage.mimeType === "image/png" ? "png" : "jpg"}`,
    );
  }

  const response = await fetch("/api/lmnp/takeover/tax-package-liasse-vision", {
    method: "POST",
    body: formData,
  });

  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
    formType?: string;
    cases?: unknown;
  };

  if (!response.ok) {
    throw new TaxPackageLiasseVisionError(
      body.error ?? `Vision liasse N-1 échouée (${response.status})`,
      response.status,
    );
  }

  if (typeof body.formType !== "string" || !Array.isArray(body.cases)) {
    throw new TaxPackageLiasseVisionError("Réponse vision liasse N-1 invalide.", 502);
  }

  return {
    formType: body.formType as "2033A" | "2033C" | "unknown",
    cases: body.cases as never,
  };
};
