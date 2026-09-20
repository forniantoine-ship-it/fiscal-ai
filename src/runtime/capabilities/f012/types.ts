/**
 * Types de domaine partagés par les capabilities F-012 (Assistant Charges).
 * Alignés sur F-012 et TRF-0015 à TRF-0021, TRF-0025, TRF-0026, TRF-0028.
 */

import type { FieldSource } from "../../contracts/FieldSource";

export type ChargeDeductibilite = "deductible" | "non_deductible" | "amortissement";

export type ChargeCategorie =
  | "taxe_fonciere"
  | "assurance_pno"
  | "assurance_gli"
  | "copropriete"
  | "honoraires_gestion"
  | "travaux"
  | "honoraires_comptable"
  | "frais_bancaires"
  | "divers";

export type CoproLigneType =
  | "provisions"
  | "regularisation"
  | "fonds_travaux"
  | "appel_gros_travaux";

export interface LigneCharge {
  id: string;
  description: string;
  montant: number;
  categorie: ChargeCategorie;
  deductibilite: ChargeDeductibilite;
  montantDeductible: number;
  montantPreExploitation: number;
  montantAmortissable: number;
  source: FieldSource;
  regleAppliquee?: string;
  /**
   * Double comptage F-011 / F-012 — cette ligne désigne une dépense DÉJÀ comptée ailleurs (assurance emprunteur :
   * `chargesFinancement`, F-011). Elle reste visible mais n'alimente AUCUN total F-012 (ni `totalDeductible`, ni
   * `totalNonDeductible`, ni `totalPreExploitation`, ni ventilations) : sa contribution économique est unique, celle
   * de F-011. `totalNonDeductible` ne porte que des dépenses DISTINCTES comptabilisées mais non déductibles.
   */
  exclusionReason?: "f011_overlap";
}

export interface ComposantNouveau {
  /**
   * P0-B/D — identité stable, jamais régénérée : dérivée de l'id de la
   * Charge d'origine (F-012), jamais d'un index de tableau ni d'un id
   * aléatoire recalculé à chaque compute. Condition nécessaire à la reprise
   * N → N+1 (le composant doit rester le même objet identifiable).
   */
  id: string;
  label: string;
  montant: number;
  dureeAnnees: number;
  dotationAnnuelle: number;
  nature: "amélioration" | "construction" | "renouvellement";
  dateDebut: string;
  /** P0-B — origine du composant, conservée pour traçabilité et pour la reprise N+1. */
  origin: "f012_travaux" | "f012_copro";
}

export interface ChargesExerciceResult {
  exerciceFiscal: number;
  lignes: LigneCharge[];
  parCategorie: Partial<Record<ChargeCategorie, number>>;
  totalDeductible: number;
  totalNonDeductible: number;
  totalAmortissable: number;
  totalPreExploitation: number;
  /**
   * Informatif uniquement : montant des lignes `f011_overlap` (dépenses déjà comptées par F-011). N'entre dans
   * aucun total, aucun résultat, aucune case : un doublon ne doit jamais modifier deux fois le résultat.
   */
  totalDejaComptabiliseF011?: number;
  /**
   * Recouvrement F-011 / F-012 de l'assurance emprunteur (voir `assurance-recouvrement.ts`) — présent dès qu'au moins
   * une ligne candidate existe. `reference` = assurance de l'année établie par F-011 (exercice + pré-exploitation) ;
   * `recouvert` = part neutralisée dans F-012 (= part de `totalDejaComptabiliseF011`) ; `reliquat` = part que F-011
   * n'établit pas, traitée normalement par F-012. `recouvert + reliquat` = total des lignes candidates assurance.
   */
  recouvrementAssuranceF011?: {
    reference: number;
    periodeCompatible: boolean;
    recouvert: number;
    reliquat: number;
  };
  /**
   * Recouvrement F-011 / F-012 des frais de dossier (enveloppe séparée de l'assurance) — même contrat que
   * `recouvrementAssuranceF011`, sur `fraisDossierDeductibles` F-011.
   */
  recouvrementFraisDossierF011?: {
    reference: number;
    periodeCompatible: boolean;
    recouvert: number;
    reliquat: number;
  };
  /**
   * A1 — ventilation de `totalPreExploitation` par catégorie (Σ = totalPreExploitation,
   * à l'arrondi près) : chaque `LigneCharge.montantPreExploitation` est rattachée à
   * sa `categorie`. Sert à alimenter les cases 242/244 de la 2033-B avec la quote-part
   * de pré-exploitation de chaque nature (taxe foncière → impôts et taxes ; autres
   * catégories → autres charges externes). Optionnel : absent des sorties persistées
   * avant A1 (jamais reconstitué après coup).
   */
  parCategoriePreExploitation?: Partial<Record<ChargeCategorie, number>>;
  /**
   * A1 — ventilation de `totalNonDeductible` par catégorie (Σ = totalNonDeductible).
   * `totalNonDeductible` est hétérogène (fonds de travaux ALUR → copropriété ;
   * lignes « divers » déjà comptées par F-011) : sans cette ventilation, on ne peut
   * pas attribuer ces charges à une case sans deviner leur nature.
   */
  parCategorieNonDeductible?: Partial<Record<ChargeCategorie, number>>;
  composantsNouveaux: ComposantNouveau[];
}

export type NatureIntervention = "entretien" | "amélioration" | "construction" | "renouvellement";

export type TravauxQualificationChoix =
  | "reparation_identique"
  | "amelioration"
  | "mixte"
  | "incertain";

export interface ProfilCharges {
  copropriete: boolean;
  agence: boolean;
  travaux: boolean;
  vacance: boolean;
  comptable: boolean;
}

export type F012CategoryId =
  | "taxe_fonciere"
  | "assurance_pno"
  | "assurance_gli"
  | "copropriete"
  | "honoraires_gestion"
  | "travaux"
  | "honoraires_comptable"
  | "frais_bancaires"
  | "divers";

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
