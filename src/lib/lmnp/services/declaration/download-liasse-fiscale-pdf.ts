/**
 * Téléchargement de la liasse fiscale (exercice actif ou archivé).
 *
 * MB-MULTI-SERVER-TRUST-2 — le serveur produit la liasse complète (pages documentaires + Cerfa) depuis le dossier persisté ; le
 * navigateur n'envoie aucune RFS et n'assemble aucun octet. Un exercice archivé est régénéré avec la chaîne actuelle (millésime du
 * moteur en vigueur) depuis son snapshot clos : aucun byte Cerfa n'est stocké à la clôture.
 */

import type { FiscalRepresentation } from "@/runtime/capabilities/rfs/types";
import {
  buildCerfaPdfRequestPayload,
  fetchOfficialCerfaPdfBytes,
} from "./download-cerfa-pdf";
import { resolveDeliveryContext } from "@/lib/lmnp/services/payment/entitlement-client";
import { liasseFiscalePdfFileName } from "./merge-liasse-dossier-with-cerfa";

export { assembleLiasseFiscalePdf, type AssembleLiasseFiscalePdfInput } from "./assemble-liasse-fiscale-pdf";

export type DownloadLiasseFiscalePdfInput = {
  /** Indication NON autoritative (choix des formulaires demandés, ex. dispense 2033-A) : jamais envoyée au serveur. */
  rfs: FiscalRepresentation;
  declarationVersionId: string;
  fiscalYear: number;
  dossierId?: string;
  /** Révision du snapshot affiché (confirmée) : le serveur refuse (409) si le dossier a changé depuis. */
  expectedRevision: number;
};

/**
 * MB-MULTI-SERVER-TRUST-2 — la liasse COMPLÈTE (pages documentaires + Cerfa) est produite par le serveur depuis le dossier persisté et
 * sa propre RFS recalculée ; le navigateur ne fait que demander et enregistrer le PDF reçu.
 */
export async function downloadLiasseFiscalePdf(input: DownloadLiasseFiscalePdfInput): Promise<void> {
  const payload = buildCerfaPdfRequestPayload(input.rfs, input.declarationVersionId, { bundle: "liasse_fiscale" });
  // Payment V1 — la route serveur exige identité, propriété et exercice payé ; MB-MULTI-SERVER-TRUST-2 : et la fraîcheur attendue.
  const access = await resolveDeliveryContext(input.fiscalYear, {
    dossierId: input.dossierId,
    expectedRevision: input.expectedRevision,
  });
  const merged = await fetchOfficialCerfaPdfBytes(payload, access);
  const copy = new ArrayBuffer(merged.byteLength);
  new Uint8Array(copy).set(merged);
  const blob = new Blob([copy], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = liasseFiscalePdfFileName(input.fiscalYear);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
