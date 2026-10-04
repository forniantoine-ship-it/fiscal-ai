/**
 * Assemblage PUR de la liasse fiscale : pages documentaires (depuis la RFS) fusionnées avec un PDF Cerfa déjà obtenu.
 * Sans DOM, sans client navigateur : exécutable côté serveur. MB-MULTI-SERVER-TRUST-2 — la route de livraison l'appelle avec la RFS
 * RECALCULÉE par le serveur ; le navigateur ne produit plus aucun octet de la liasse.
 */
import type { FiscalRepresentation } from "@/runtime/capabilities/rfs/types";
import { buildLiasseDossierDocument, type LiasseDossierExtras } from "./build-liasse-dossier-document";
import { mergeLiasseDossierWithCerfa } from "./merge-liasse-dossier-with-cerfa";
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

