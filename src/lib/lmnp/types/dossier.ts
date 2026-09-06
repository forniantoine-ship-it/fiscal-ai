/**
 * P3-SOCLE-CYCLE-FISCAL — P0-1 — types du cycle fiscal pluriannuel.
 *
 * Ces types formalisent le "niveau Dossier" (données stables, indépendantes
 * de l'exercice) et la clôture d'un `FiscalYear` (source de continuité pour
 * l'exercice suivant) — issus des audits de conception P3-SOCLE-CYCLE-FISCAL
 * (Data Ownership, Design Gate, Mini-audit technique final).
 *
 * Portée strictement limitée au cycle N → N+1 : aucune règle fiscale
 * nouvelle, aucun vrai multi-bien (un `FiscalYear` continue de ne référencer
 * qu'un seul bien en pratique), `stockAmortInitial` non traité.
 */

import type { FiscalEngineOutput, Property } from "./domain";
import type { RanSituation } from "@/runtime/capabilities/bilan/types";

/**
 * Champs d'identité Dossier-level (audit P3-SOCLE-CYCLE-FISCAL, Blocker A) —
 * mutables, indépendants de l'exercice. Un snapshot de l'identité utilisée
 * pour UNE déclaration donnée continue de vivre séparément, dans
 * `DeclarationVersion.rfs.identite` (mécanisme déjà existant, non modifié
 * par ce chantier) — jamais recopié ici.
 */
export interface DossierIdentity {
  siren?: string;
  siret?: string;
  exploitantFirstName?: string;
  exploitantLastName?: string;
  exploitantEmail?: string;
  exploitantTelephone?: string;
  personalAddress?: string;
  personalCity?: string;
  personalPostalCode?: string;
  establishmentAddress?: string;
  establishmentCity?: string;
  establishmentPostalCode?: string;
  activityStartDate?: string;
}

/**
 * Niveau persistant Dossier — porte l'identité courante, les biens (stables,
 * référencés par les exercices via `FiscalYear.propertyIds`), les
 * financements (stables), et la liste des exercices qui lui appartiennent.
 * `id` doit correspondre à `lmnp_dossiers.id` (Supabase) lorsqu'il est
 * disponible et réconciliable — jamais un second identifiant concurrent créé
 * sans tentative de réconciliation (réconciliation faite par
 * `dossier-db.ts`, pas par ce type lui-même).
 */
export interface Dossier extends DossierIdentity {
  id: string;
  properties: Property[];
  financements: FinancementBase[];
  fiscalYearIds: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Base stable F-010 nécessaire au replay de `assemblePlan()` (F-010) pour un
 * exercice quelconque — jamais un output d'exercice réutilisé comme source.
 * Extraite une fois de `LogementAmortissementOutput`, ne change pas d'un
 * exercice à l'autre (sauf nouvelle confirmation explicite de l'Assistant
 * Logement, hors périmètre de ce chantier).
 */
export interface PropertyAmortissementComposant {
  label: string;
  montant: number;
  dureeAnnees: number;
}

export interface PropertyAmortissementBase {
  composants: PropertyAmortissementComposant[];
  valeurTerrain?: number;
  montantMobilier?: number;
  /** Property-level dans sa nature (P3-SOCLE-CYCLE-FISCAL, audit Blocker B) — porté ici tant que le vrai multi-bien n'existe pas ailleurs. */
  dateMiseEnService?: string;
}

/**
 * Base stable F-011 nécessaire au replay de `computeFinancementExercice()`
 * pour un exercice quelconque. Source : `F011LoanDraft` (assistant F-011),
 * seule structure du modèle actuel à porter ces termes bruts de prêt.
 */
export interface FinancementBase {
  pretId: string;
  capitalInitial: number;
  tauxNominal: number;
  dureeMois: number;
  datePremiereMensualite: string;
  assuranceAnnuelle?: number;
  fraisDossier?: number;
  garantieDeductible?: number;
  iraDeductible?: number;
  anneeSouscription?: number;
  /** Non activé (multi-bien différé, D2) — présent uniquement pour ne pas bloquer une évolution future. */
  propertyId?: string;
}

/**
 * Snapshot immuable produit à la clôture d'un `FiscalYear` — seule source de
 * continuité fiscale légitime pour l'exercice suivant. Jamais réécrite en
 * place : une correction produit une NOUVELLE entrée dans `FiscalYear.closures[]`,
 * jamais un remplacement (D1 — correction autorisée mais versionnée).
 */
export interface FiscalYearClosure {
  id: string;
  fiscalYearId: string;
  /**
   * Redondant avec `FiscalYear.dossierId` (jamais la source de vérité pour
   * `resolveStocksOuverture()`, qui compare toujours les `FiscalYear`
   * eux-mêmes) — utile pour l'audit direct d'une closure isolée. `undefined`
   * pour une closure produite avant que le Dossier existe encore (migration
   * paresseuse, P0-1) : jamais un identifiant inventé pour combler l'absence.
   */
  dossierId?: string;
  sourceDeclarationVersionId?: string;
  stocks: FiscalEngineOutput["stocks"];
  computedAt: string;
  closedAt: string;
  /**
   * G1-P1 — continuité patrimoniale (compte exploitant / RAN). Bloc
   * ENTIÈREMENT optionnel : absent pour toute closure produite avant ce
   * chantier, ou pour un exercice dont l'intake patrimonial (G1-P0) n'a
   * jamais été renseigné — jamais un bloc partiel ni des valeurs inventées.
   *
   * `compteExploitantAvantAffectationResultat` = exactement
   * `PatrimonialState.compteExploitant.clotureN` (= ouverture + apports −
   * prélèvements de CET exercice) — n'inclut JAMAIS le résultat comptable de
   * l'exercice. Le nom évite délibérément le mot seul "clôture", trompeur en
   * comptabilité générale (où une clôture de compte inclut habituellement le
   * résultat de la période) — ce n'est PAS le cas ici, par convention EI du
   * contrat P0 (le résultat ne rejoint le compte de l'exploitant qu'à
   * l'ouverture de l'exercice SUIVANT).
   *
   * `resultatComptableExercice` = `PatrimonialState.resultatComptable`,
   * conservé SÉPARÉMENT : `resolveOuvertureCompteExploitantNPlusUn()` a
   * besoin des deux valeurs pour calculer l'ouverture N+1
   * (cloture120N + resultatComptableN) — ne jamais réutiliser
   * `compteExploitantAvantAffectationResultat` seul comme ouverture N+1.
   *
   * `ranSituation` provient de `BilanInputs.ran.situation` (l'entrée brute,
   * pas la résolution — `RanResolution` ne porte pas ce champ) : c'est une
   * métadonnée de provenance du dossier (NATIF/IMPORTE/REPRISE_HISTORIQUE),
   * pas "quel numéro d'exercice". `ranValeur` est la valeur résolue
   * (`PatrimonialState.ran.valeur`, 0 pour NATIF, montant importé sinon).
   */
  patrimoine?: {
    compteExploitantAvantAffectationResultat: number;
    resultatComptableExercice: number;
    ranSituation: RanSituation;
    ranValeur?: number;
  };
}

/**
 * Résultat de la résolution des stocks d'ouverture de N+1 — jamais un simple
 * `FiscalResult["stocks"] | undefined` : l'indisponibilité doit être un état
 * explicite et tracé (raison), jamais une valeur inventée (0, estimation, ou
 * un exercice de repli).
 */
export type StocksOuvertureResult =
  | {
      status: "available";
      sourceClosureId: string;
      stocks: FiscalEngineOutput["stocks"];
    }
  | {
      status: "unavailable";
      reason: string;
    };

/**
 * G1-P1 — miroir exact de `StocksOuvertureResult` pour la continuité
 * patrimoniale. Même doctrine : indisponibilité = état explicite et tracé,
 * jamais une valeur inventée (0, estimation, ou repli sur un autre exercice).
 */
export type PatrimoineOuvertureResult =
  | {
      status: "available";
      sourceClosureId: string;
      ouvertureCompteExploitant: number;
      ran: { situation: RanSituation; valeur?: number };
    }
  | {
      status: "unavailable";
      reason: string;
    };
