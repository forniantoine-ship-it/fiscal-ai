/**
 * Lot 5.5-A — wrapper client (fetch) implémentant TaxPackageLiassePageClassifier.
 * Pattern aligné request-depreciation-register-vision.ts / request-tax-package-liasse-vision.ts.
 * Sûr à importer depuis un composant "use client".
 */

import type { TaxPackageLiassePageClassifier } from "./classify-tax-package-liasse-page";

export class TaxPackageLiassePageClassifyError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "TaxPackageLiassePageClassifyError";
  }
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: mimeType });
}

/**
 * Échec réseau/HTTP/JSON invalide → lève. extractScannedTaxPackageControlFactsFromPdf
 * capte cette erreur PAR PAGE et dégrade la classification de cette page en
 * "unknown" (formType null) — jamais un formulaire forcé, jamais un blocage
 * de tout le document pour une seule page en échec.
 */
export const requestTaxPackageLiassePageClassification: TaxPackageLiassePageClassifier = async ({
  pageImage,
}) => {
  const formData = new FormData();
  formData.append("pageNumber", String(pageImage.pageNumber));
  formData.append(
    "image",
    base64ToBlob(pageImage.base64, pageImage.mimeType),
    `page-${pageImage.pageNumber}.${pageImage.mimeType === "image/png" ? "png" : "jpg"}`,
  );

  const response = await fetch("/api/lmnp/takeover/tax-package-liasse-page-classify", {
    method: "POST",
    body: formData,
  });

  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
    pageNumber?: number;
    formType?: string | null;
    formYear?: number | null;
  };

  if (!response.ok) {
    throw new TaxPackageLiassePageClassifyError(
      body.error ?? `Classification page liasse échouée (${response.status})`,
      response.status,
    );
  }

  if (typeof body.pageNumber !== "number") {
    throw new TaxPackageLiassePageClassifyError("Réponse classification page liasse invalide.", 502);
  }

  return {
    pageNumber: body.pageNumber,
    formType: (body.formType ?? null) as "2033A" | "2033C" | null,
    formYear: body.formYear ?? null,
  };
};
