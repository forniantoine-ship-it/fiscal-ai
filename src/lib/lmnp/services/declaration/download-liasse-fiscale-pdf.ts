/**
 * Téléchargement de la liasse fiscale (exercice actif ou archivé) :
 *   pages documentaires + Cerfa officiels produits par la route existante.
 *
 * L'appelant fournit rfs / extras / declarationVersionId / année — jamais une
 * lecture implicite du workspace. Un exercice archivé régénère les Cerfa avec
 * la chaîne actuelle à partir du RFS historique (millésime du moteur en
 * vigueur) : aucun byte Cerfa n'est stocké à la clôture.
 *
 * Le navigateur n'appelle jamais un mapper Cerfa. Les bytes Cerfa viennent
 * exclusivement de `fetchOfficialCerfaPdfBytes` → POST /api/lmnp/declaration/cerfa-pdf.
 */

import type { FiscalRepresentation } from "@/runtime/capabilities/rfs/types";
import { buildLiasseDossierDocument, type LiasseDossierExtras } from "./build-liasse-dossier-document";
import {
  buildCerfaPdfRequestPayload,
  fetchOfficialCerfaPdfBytes,
} from "./download-cerfa-pdf";
import { resolveDeliveryContext } from "@/lib/lmnp/services/payment/entitlement-client";
import { liasseFiscalePdfFileName, mergeLiasseDossierWithCerfa } from "./merge-liasse-dossier-with-cerfa";
import { renderLiasseDossierPdf } from "./render-liasse-dossier-pdf";

export type AssembleLiasseFiscalePdfInput = {
  rfs: FiscalRepresentation;
  extras?: LiasseDossierExtras;
  cerfaPdfBytes: Uint8Array;
};

/**
 * Chaîne testable sans DOM : builder → renderer documentaire → fusion avec
 * un PDF Cerfa déjà obtenu. Aucune génération Cerfa ici.
 */
export async function assembleLiasseFiscalePdf(input: AssembleLiasseFiscalePdfInput): Promise<Uint8Array> {
  const document = buildLiasseDossierDocument(input.rfs, input.extras);
  const documentaryPdfBytes = renderLiasseDossierPdf(document);
  return mergeLiasseDossierWithCerfa(documentaryPdfBytes, input.cerfaPdfBytes);
}

export type DownloadLiasseFiscalePdfInput = {
  rfs: FiscalRepresentation;
  extras?: LiasseDossierExtras;
  declarationVersionId: string;
  fiscalYear: number;
};

export async function downloadLiasseFiscalePdf(input: DownloadLiasseFiscalePdfInput): Promise<void> {
  const payload = buildCerfaPdfRequestPayload(input.rfs, input.declarationVersionId);
  // Payment V1 — la route serveur exige identité, propriété et exercice payé.
  const access = await resolveDeliveryContext(input.fiscalYear);
  const cerfaPdfBytes = await fetchOfficialCerfaPdfBytes(payload, access);
  const merged = await assembleLiasseFiscalePdf({
    rfs: input.rfs,
    extras: input.extras,
    cerfaPdfBytes,
  });
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
