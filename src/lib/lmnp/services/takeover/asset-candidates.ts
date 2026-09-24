/**
 * Lot 4B — candidates immobilisations historiques.
 *
 * Pas d'ID Fiscal AI stable ici. `sourceAssetRef` = référence documentaire
 * (numéro ligne cabinet, code actif source). Label / index ≠ identité stable.
 * `propertyId` inconnu reste inconnu — aucun fallback properties[0].
 */

import type { OpeningProrataConvention } from "@/lib/lmnp/services/fiscal-year-opening/types";
import type { CandidateValue } from "./candidate-value";

/** Classification documentaire proposée — optionnelle, jamais inventée. */
export type CandidateAssetClassification =
  | "terrain"
  | "batiment"
  | "mobilier"
  | "travaux"
  | "autre";

/** Méthode lue dans le document si présente — pas de défaut linéaire inventé. */
export type CandidateDepreciationMethod = "lineaire" | "degressif" | "autre";

/**
 * Identité locale de la proposition dans le package candidat.
 * Opaque, non stable Fiscal AI — sert uniquement à distinguer les lignes
 * du package (tests, corrections). Ne pas utiliser comme assetId Opening.
 */
export type CandidateAssetKey = string;

export type CandidateHistoricalAsset = {
  /** Clé locale package — ≠ assetId Opening. */
  candidateKey: CandidateAssetKey;
  /**
   * Référence fournie par le document / logiciel source, si présente.
   * Absent si le document ne fournit aucun ID.
   */
  sourceAssetRef?: string;
  label: CandidateValue<string>;
  coutBrut: CandidateValue<number>;
  cumulOuverture: CandidateValue<number>;
  startDate: CandidateValue<string>;
  durationYears: CandidateValue<number>;
  method: CandidateValue<CandidateDepreciationMethod>;
  prorataConvention: CandidateValue<OpeningProrataConvention>;
  classification: CandidateValue<CandidateAssetClassification>;
  /** true = non amortissable (ex. terrain) lorsque le document le dit. */
  nonAmortizable: CandidateValue<boolean>;
  /**
   * Association bien Fiscal AI si déjà connue.
   * Inconnu → status missing / document_absent — jamais properties[0].
   */
  propertyId: CandidateValue<string>;
  /**
   * Compte PCG documentaire (ex. « 21540000 ») lorsqu'il est imprimé
   * sur le registre — jamais inventé. Sert uniquement à une classification
   * déterministe fail-closed.
   */
  pcgAccountCode?: CandidateValue<string>;
};
