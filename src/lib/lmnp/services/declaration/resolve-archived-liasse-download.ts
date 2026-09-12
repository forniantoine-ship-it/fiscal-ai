/**
 * Téléchargement de la liasse fiscale d'un exercice archivé.
 *
 * Lecture exclusive du record historique : jamais le workspace actif,
 * jamais Dossier.properties / Dossier.financements, jamais un ID inventé.
 *
 * Les Cerfa ne sont pas des bytes figés à la clôture. S'ils sont produits,
 * c'est une régénération par la chaîne Cerfa actuelle à partir du RFS
 * historique (millésime du moteur en vigueur, inchangé ici).
 */

import type { DeclarationDraft, FiscalYear } from "@/lib/lmnp/types/domain";
import { latestClosure } from "@/lib/lmnp/services/dossier/fiscal-year-cycle";
import { collectLiasseDossierExtras } from "./collect-liasse-dossier-extras";
import type { DownloadLiasseFiscalePdfInput } from "./download-liasse-fiscale-pdf";

export type ArchivedLiasseDownloadRecord = Pick<FiscalYear, "year" | "stocksOuverture" | "closures"> & {
  declarationDraft?: DeclarationDraft | null;
};

export type ArchivedLiasseDownloadUnavailableReason = "missing_rfs" | "missing_version_id";

export type ArchivedLiasseDownloadResult =
  | { status: "ready"; input: DownloadLiasseFiscalePdfInput }
  | { status: "unavailable"; reason: ArchivedLiasseDownloadUnavailableReason };

function nonEmptyId(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * ID Cerfa présent dans l'archive uniquement :
 * 1. `declarationDraft.declaration.currentVersionId`
 * 2. sinon `latestClosure(record).sourceDeclarationVersionId`
 */
export function resolveArchivedDeclarationVersionId(
  record: ArchivedLiasseDownloadRecord,
): string | undefined {
  return (
    nonEmptyId(record.declarationDraft?.declaration?.currentVersionId) ??
    nonEmptyId(latestClosure(record)?.sourceDeclarationVersionId)
  );
}

export function resolveArchivedLiasseDownload(
  record: ArchivedLiasseDownloadRecord,
): ArchivedLiasseDownloadResult {
  const archivedDraft = record.declarationDraft ?? undefined;
  const rfs = archivedDraft?.rfs;
  if (!rfs) {
    return { status: "unavailable", reason: "missing_rfs" };
  }

  const declarationVersionId = resolveArchivedDeclarationVersionId(record);
  if (!declarationVersionId) {
    return { status: "unavailable", reason: "missing_version_id" };
  }

  return {
    status: "ready",
    input: {
      rfs,
      extras: collectLiasseDossierExtras({
        declarationDraft: archivedDraft,
        fiscalYear: record,
      }),
      declarationVersionId,
      fiscalYear: record.year,
    },
  };
}
