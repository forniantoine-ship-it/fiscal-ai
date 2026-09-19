/**
 * Payment V1 — téléchargement de l'aide 2042-C-PRO : le PDF est produit par le
 * SERVEUR (`/api/lmnp/declaration/aide-2042-pdf`), derrière la même chaîne que le
 * Cerfa : authentification → propriété → exercice payé → déclarabilité.
 * Le navigateur n'a plus de rendu local de ce document.
 */
import type { FiscalRepresentation } from "@/runtime/capabilities/rfs/types";
import { resolveDeliveryContext, type DeliveryAccessContext } from "@/lib/lmnp/services/payment/entitlement-client";
import { describeCerfaPdfErrorBody, type CerfaPdfDownloadError } from "./download-cerfa-pdf";

export const AIDE_2042_PDF_ROUTE = "/api/lmnp/declaration/aide-2042-pdf";

export async function fetchAide2042PdfBytes(
  input: { rfs: FiscalRepresentation; activityStartDate?: string },
  access: DeliveryAccessContext,
): Promise<Uint8Array> {
  let response: Response;
  try {
    response = await fetch(AIDE_2042_PDF_ROUTE, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rfs: input.rfs, activityStartDate: input.activityStartDate, ...access }),
    });
  } catch {
    throw { message: "L'aide 2042-C-PRO n'a pas pu être générée (connexion impossible)." } satisfies CerfaPdfDownloadError;
  }
  if (!response.ok) {
    let message: string | undefined;
    try {
      message = describeCerfaPdfErrorBody(await response.json());
    } catch {
      message = undefined;
    }
    throw {
      message: message ?? "L'aide 2042-C-PRO n'a pas pu être générée. Réessayez dans quelques instants.",
    } satisfies CerfaPdfDownloadError;
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

export function aide2042PdfFileName(fiscalYear: number): string {
  return `aide-declaration-2042-c-pro-${fiscalYear}.pdf`;
}

/** Déclenche le téléchargement navigateur du PDF reçu du serveur. */
export async function downloadAide2042Pdf(input: {
  rfs: FiscalRepresentation;
  activityStartDate?: string;
  fiscalYear: number;
}): Promise<void> {
  const access = await resolveDeliveryContext(input.fiscalYear);
  const bytes = await fetchAide2042PdfBytes(input, access);
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  const url = URL.createObjectURL(new Blob([copy], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = aide2042PdfFileName(input.fiscalYear);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
