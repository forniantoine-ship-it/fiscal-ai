/**
 * Interface de versioning — prépare le rattachement du PDF à une
 * `DeclarationVersion` (src/lib/lmnp/types/domain.ts) SANS modifier ce type
 * ni le système de dossier global (hors périmètre strict de cette mission).
 *
 * `GeneratedLiassePdf.declarationVersionId` référence
 * `DeclarationVersion.id` par convention (clé étrangère logique) — brancher
 * ce type sur `DeclarationVersion` lui-même (ajouter un champ
 * `generatedLiassePdfRef` sur `DeclarationVersion`) est un chantier séparé,
 * documenté comme limite restante dans le rapport final de cette mission,
 * volontairement non fait ici pour ne pas toucher au "système global de
 * dossier".
 *
 * Règle non négociable (section 13/14 de la mission) : un PDF déjà généré
 * n'est JAMAIS modifié en place. Une correction produit un nouveau
 * `GeneratedLiassePdf`, avec un nouvel `id`, rattaché à une NOUVELLE
 * `DeclarationVersion` — jamais un patch du précédent.
 *
 * Le statut EDI est un événement séparé, réservé, non renseigné tant que le
 * partenaire n'est pas branché (section 14) : "PDF généré" ne veut JAMAIS
 * dire "EDI envoyé" ni "EDI accepté" — un lecteur de ce type ne doit jamais
 * pouvoir confondre les deux sans lire explicitement `ediStatus`.
 */
import type { CerfaFormId, Millesime, RenderManifestEntry } from "./types";

export type EdiStatus = "not_submitted" | "submitted" | "accepted" | "rejected";

export type GeneratedLiassePdf = {
  readonly id: string;
  /** Référence logique vers `DeclarationVersion.id` — jamais recalculée, jamais réutilisée pour une autre génération. */
  readonly declarationVersionId: string;
  readonly millesime: Millesime;
  readonly forms: readonly CerfaFormId[];
  readonly generatedAt: string;
  /** Horodatage de validation explicite du client — jamais déduit d'une navigation ou d'un simple affichage. */
  validatedAt?: string;
  /** Réservé — jamais renseigné avant le branchement réel du partenaire EDI (hors périmètre de cette mission). */
  ediStatus: EdiStatus;
  ediSubmittedAt?: string;
  ediStatusAt?: string;
  ediInterchangeId?: string;
  /** Pour audit — jamais utilisé pour reconstituer le PDF, uniquement pour vérifier après coup ce qui a été écrit. */
  readonly renderManifest: readonly RenderManifestEntry[];
};

export function createGeneratedLiassePdf(input: {
  id: string;
  declarationVersionId: string;
  millesime: Millesime;
  forms: readonly CerfaFormId[];
  generatedAt: string;
  renderManifest: readonly RenderManifestEntry[];
}): GeneratedLiassePdf {
  return {
    ...input,
    ediStatus: "not_submitted",
  };
}
