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
 * P1 — statut de la démarche INPI (immatriculation SIREN/SIRET), propriété
 * du Dossier — jamais une propriété d'exercice (`FiscalYear`/`DeclarationDraft`) :
 * une activité enregistrée le reste quel que soit l'exercice fiscal en
 * cours. Volontairement distinct de `DeclarationDraft.inpiConfirmedAt`
 * (complétude de l'étape Activité du tunnel fiscal, jamais renommé ni
 * détourné — un dossier peut avoir `inpiConfirmedAt` réglé sans aucun SIREN,
 * cf. F-009). `"regularization_required"` et `"modification_in_progress"`
 * couvrent les formalités de correction/modification, dont le régime de
 * signature diffère de celui d'une création (cf. audit du parcours INPI
 * officiel) — volontairement distincts de `"in_progress"`.
 */
export type InpiStatus =
  | "not_started"
  | "preparing"
  | "in_progress"
  | "modification_in_progress"
  | "submitted"
  | "regularization_required"
  | "registered";

/**
 * P1 — distingue « le client déclare que c'est fait » de « un document
 * (Kbis/extrait RNE) confirme l'enregistrement ». `"document_extracted"`
 * n'est branché à aucune extraction automatique dans ce socle — le champ
 * existe pour ne pas avoir à faire migrer les statuts déjà persistés
 * lorsqu'une extraction RNE/Kbis sera ajoutée dans un chantier ultérieur.
 */
export type InpiStatusSource = "declared" | "document_extracted";

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
  /**
   * P1 — `undefined` = aucun statut historique connu (dossier antérieur à ce
   * chantier, ou jamais renseigné) — JAMAIS interprété comme « le client n'a
   * jamais fait sa démarche ». `"not_started"` est une valeur explicitement
   * déclarée (réponse du client à la question légère), distincte de
   * l'absence de statut. Voir `resolveInpiValidationState()` pour la
   * dérivation de l'état affiché à partir de cette distinction.
   */
  inpiStatus?: InpiStatus;
  inpiStatusSource?: InpiStatusSource;
  inpiStatusUpdatedAt?: string;
}

/**
 * Base stable F-010 nécessaire au replay de `assemblePlan()` (F-010) pour un
 * exercice quelconque — jamais un output d'exercice réutilisé comme source.
 * Extraite une fois de `LogementAmortissementOutput`, ne change pas d'un
 * exercice à l'autre (sauf nouvelle confirmation explicite de l'Assistant
 * Logement, hors périmètre de ce chantier).
 */
export interface PropertyAmortissementComposant {
  /**
   * P0-B/D — identité stable, présente UNIQUEMENT pour les composants
   * d'origine F-012 (`origin` renseigné) : condition nécessaire à la reprise
   * N → N+1 sans recréation. Absente pour les lignes F-010 historiques
   * (bâti/mobilier), dont l'ordre de tableau reste inchangé — aucune
   * régression sur le comportement F-010 existant.
   */
  id?: string;
  label: string;
  montant: number;
  dureeAnnees: number;
  /**
   * P0-B — origine du composant : absente pour le bâti/mobilier F-010
   * (implicite), toujours renseignée pour un composant F-012 (travaux ou
   * appel gros travaux copropriété) — nécessaire pour ne jamais le
   * recréer comme une nouvelle dépense F-012 en N+1.
   */
  origin?: "f012_travaux" | "f012_copro";
  /** Métadonnée F-012 conservée pour traçabilité — non consommée par le moteur fiscal. */
  nature?: "amélioration" | "construction" | "renouvellement";
  /**
   * P0-A/P0-B — date propre de mise en service du composant (F-012),
   * jamais la date du bien. Absente pour les lignes F-010, qui continuent
   * d'utiliser `PropertyAmortissementBase.dateMiseEnService`.
   */
  dateDebut?: string;
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
  /** Lot 4 — caractéristique contractuelle durable (requis pour rejouer computeFinancementExercice). */
  typePret: import("@/runtime/capabilities/f011/types").TypePret;
  capitalInitial: number;
  tauxNominal: number;
  dureeMois: number;
  datePremiereMensualite: string;
  assuranceAnnuelle?: number;
  /** Lot 4 — nature d'assurance contractuelle durable. */
  assuranceType?: "bancaire" | "externe";
  /** Lot 4 — nature de garantie contractuelle durable (classification fiscale figée F011/F012). */
  typeGarantie?: "caution" | "hypotheque_ippd" | "aucune" | "autre";
  /**
   * One-offs éventuels, uniquement déductibles l'année de souscription
   * (`anneeSouscription === exercice`). Absents / sans millésime → jamais
   * réinjectés comme charges N+1 (UNKNOWN ≠ ZERO de déduction).
   */
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
/**
 * Lot 5 — snapshot comptable des immobilisations à la clôture (brut / cumul /
 * VNC). Distinct du stock fiscal d'amortissements non déduits
 * (`FiscalResult.stocks.amortissementsReportes`).
 */
export type ImmobilisationComptableActif = {
  id: string;
  propertyId?: string;
  label: string;
  categorie: "terrain" | "composant" | "travaux";
  coutBrut: number;
  amortissementCumule: number;
  vnc: number;
  provenance: "historique" | "acquisition_exercice";
  origin?: "f012_travaux" | "f012_copro";
  dateDebut?: string;
};

export type ImmobilisationsComptablesSnapshot = {
  brutCloture: number;
  amortissementsCumulesCloture: number;
  vncCloture: number;
  actifs: ImmobilisationComptableActif[];
};

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
  /**
   * Lot 5 — continuité comptable immobilisations → ouverture N+1.
   * Absent si le registre n'était pas fiable à la clôture (UNKNOWN ≠ ZERO).
   */
  immobilisationsComptables?: ImmobilisationsComptablesSnapshot;
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
