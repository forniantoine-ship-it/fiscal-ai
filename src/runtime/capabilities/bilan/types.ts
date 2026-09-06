/**
 * Types de domaine — Socle patrimonial P0 (2033-A).
 *
 * Principe directeur, identique à celui de la RFS (`rfs/types.ts`) : ce
 * module ne recalcule JAMAIS une vérité fiscale déjà produite par F-006. Il
 * consomme `FiscalResult`/`ImmobilisationsRfs`/`PretFinancementExercice[]`
 * tels quels et n'introduit QUE des données patrimoniales qui n'ont
 * structurellement aucune existence côté fiscal : trésorerie, compte de
 * l'exploitant (capital individuel), report à nouveau, tiers.
 *
 * Aucun poste ne doit jamais être déduit par différence pour équilibrer un
 * total — voir `check-bilan-equilibre.ts`. Une donnée absente reste
 * `undefined`/un statut explicite, jamais une valeur de repli à 0 ou un
 * calcul de "reste".
 */

// ---------------------------------------------------------------------------
// Trésorerie (084/086)
// ---------------------------------------------------------------------------

export type TresorerieMode = "DEDIE" | "MIXTE" | "INCONNU";

export type TresorerieEtat =
  | "TRESORERIE_COMPLETE"
  | "TRESORERIE_DECLAREE"
  | "TRESORERIE_RECONSTITUEE"
  | "TRESORERIE_DIVERGENTE"
  | "TRESORERIE_NULLE_DECLAREE"
  | "TRESORERIE_INCONNUE";

export type TresorerieInputs = {
  bankMode: TresorerieMode;
  /** DEDIE uniquement — solde d'ouverture du compte professionnel. */
  openingCash?: number;
  /** DEDIE uniquement — solde de clôture relevé (peut être négatif = découvert). */
  closingCash?: number;
  /** MIXTE uniquement — réponse explicite à « trésorerie professionnelle identifiable à la clôture ? » (0 = réponse "non", pas une valeur par défaut). */
  declaredProfessionalCash?: number;
  /** DEDIE uniquement — encaissements connus sur l'exercice, pour reconstruction croisée. */
  encaissementsConnus?: number;
  /** DEDIE uniquement — décaissements connus sur l'exercice, pour reconstruction croisée. */
  decaissementsConnus?: number;
  /**
   * Montant de dette explicitement reconnu par l'utilisateur comme
   * contrepartie passif d'un découvert bancaire (closingCash/declaredProfessionalCash
   * négatif) — correction P0-2. Un découvert ne rejoint JAMAIS le passif par
   * déduction automatique : sans cette déclaration explicite, ou si elle ne
   * correspond pas au découvert constaté, la génération reste bloquée (voir
   * `TresorerieResolution.decouvertDettePassif`).
   */
  decouvertDetteReconnue?: number;
  source?: string;
};

export type TresorerieResolution = {
  etat: TresorerieEtat;
  /**
   * Valeur retenue pour 084/086 — TOUJOURS ≥ 0 (jamais un découvert projeté
   * en négatif ici, voir `decouvertBancaire`). `undefined` si aucune valeur
   * fiable n'est disponible (INCONNUE ou DIVERGENTE).
   */
  clotureRetenue?: number;
  /** Montant du découvert bancaire si `closingCash` déclaré est négatif — jamais placé en 084, à orienter vers un poste de dette (voir §4 du contrat). */
  decouvertBancaire?: number;
  /**
   * Montant de découvert effectivement rattaché à une dette de passif —
   * correction P0-2. Défini UNIQUEMENT quand `decouvertBancaire` est présent
   * ET que `TresorerieInputs.decouvertDetteReconnue` le confirme (à la
   * tolérance de réconciliation près). `undefined` alors même que
   * `decouvertBancaire` est défini signale un découvert orphelin — voir
   * `check-bilan-equilibre.ts`, qui bloque la génération dans ce cas :
   * jamais un découvert n'est silencieusement omis du passif.
   */
  decouvertDettePassif?: number;
  /** Écart mesuré entre reconstruction et solde déclaré (DEDIE, TRESORERIE_DIVERGENTE/COMPLETE). */
  ecart?: number;
  raison: string;
};

// ---------------------------------------------------------------------------
// Compte de l'exploitant / capital individuel (120)
// ---------------------------------------------------------------------------

export type CompteExploitantInputs = {
  /** 120 à l'ouverture de l'exercice N (= 120 de clôture N-1, repris tel quel). */
  ouverture?: number;
  apports?: number;
  prelevements?: number;
};

export type CompteExploitantResolution = {
  disponible: boolean;
  /** 120_clôture = 120_ouverture + apports_N − prélèvements_N — JAMAIS + résultat N (voir §6 du contrat P0). */
  clotureN?: number;
  /** `true` spécifiquement quand le solde d'ouverture (= clôture N-1) manque — distingue "N+1 sans clôture N reprise" (STOCK_OUVERTURE_ABSENT) d'une simple donnée de flux manquante (DONNEE_MANQUANTE). */
  ouvertureManquante: boolean;
  raison: string;
};

// ---------------------------------------------------------------------------
// Report à nouveau (134)
// ---------------------------------------------------------------------------

/** C1 = dossier Fiscal AI natif ; C2 = dossier historique importé ; C3 = reprise historique explicite. */
export type RanSituation = "NATIF" | "IMPORTE" | "REPRISE_HISTORIQUE";

export type RanInputs = {
  situation: RanSituation;
  /** Obligatoire pour IMPORTE/REPRISE_HISTORIQUE — jamais déduit du résultat fiscal ni de l'ARD. */
  importedRAN?: number;
  source?: string;
};

export type RanResolution = {
  disponible: boolean;
  valeur?: number;
  raison: string;
};

// ---------------------------------------------------------------------------
// Tiers (créances/dettes) — correction P0-1 : NO SILENT ZERO.
// ---------------------------------------------------------------------------

/**
 * Statut explicite d'un poste de tiers (créances OU dettes), jamais un
 * nombre brut coalescé à 0 : une absence de saisie (`INCONNU`) est
 * structurellement distincte d'un montant confirmé nul (`NUL_CONFIRME`) —
 * confondre les deux transformerait silencieusement une donnée manquante en
 * information positive ("aucun tiers"), ce que le contrat P0 interdit.
 */
export type TiersPosteInput = { status: "DECLARE"; montant: number } | { status: "NUL_CONFIRME" } | { status: "INCONNU" };

export type TiersInputs = {
  /** Absent ⇔ `{ status: "INCONNU" }` — jamais interprété comme 0. */
  creances?: TiersPosteInput;
  dettes?: TiersPosteInput;
};

export type TiersPosteResolution =
  | { status: "DECLARE" | "NUL_CONFIRME"; montant: number; raison: string }
  | { status: "INCONNU"; raison: string };

export type TiersResolution = {
  creances: TiersPosteResolution;
  dettes: TiersPosteResolution;
};

// ---------------------------------------------------------------------------
// Financements — complément patrimonial à F-011 (jamais un recalcul de F-011)
// ---------------------------------------------------------------------------

export type FinancementBilanInputs = {
  ouvertureCRD?: number;
  nouveauxDeblocages?: number;
  principalRembourse?: number;
  /**
   * Source déclarative secondaire du CRD de clôture — jamais choisie
   * arbitrairement au-dessus ou en-dessous de `Σ rfs.emprunts[].capitalRestantDu31_12`
   * (F-011). Correction P0-3 : quand les deux sources sont présentes, elles
   * doivent concorder (à la tolérance de réconciliation près) ou la
   * résolution devient `DIVERGENT` (voir `EmpruntsResolution`) — ni l'une ni
   * l'autre n'est alors publiée. Si seule cette source est présente, elle
   * est retenue telle quelle, jamais recalculée.
   */
  clotureCRD?: number;
  source?: string;
};

// ---------------------------------------------------------------------------
// Emprunts — résolution de la source canonique du CRD de clôture (156/176)
// ---------------------------------------------------------------------------

export type EmpruntsEtat = "DISPONIBLE" | "DIVERGENT" | "INCONNU";

export type EmpruntsResolution =
  | { etat: "DISPONIBLE"; totalCRD: number; source: string }
  | { etat: "DIVERGENT"; raison: string }
  | { etat: "INCONNU"; raison: string };

// ---------------------------------------------------------------------------
// Bilan Inputs — collecte humaine minimale nécessaire au P0
// ---------------------------------------------------------------------------

export type BilanInputs = {
  tresorerie: TresorerieInputs;
  compteExploitant: CompteExploitantInputs;
  ran: RanInputs;
  tiers?: TiersInputs;
  financements?: FinancementBilanInputs;
};

// ---------------------------------------------------------------------------
// Immobilisations patrimoniales unifiées (F-010 + F-012, jamais F-014 recalculé)
// ---------------------------------------------------------------------------

export type CategorieImmobilisation = "terrain" | "composant" | "travaux";

export type ActifImmobilise = {
  id: string;
  categorie: CategorieImmobilisation;
  label: string;
  coutBrut: number;
  dateEntree?: string;
  dureeAnnees?: number;
  /** `undefined` si non calculable de façon fiable avec les données exposées aujourd'hui (voir composants F-012). */
  amortissementCumule?: number;
  vnc?: number;
  source: string;
};

export type RegistrePatrimonialImmobilisations = {
  actifs: ActifImmobilise[];
  /** Toujours calculable dès que le plan F-010 et `valeurTerrain` existent — une somme de valeurs déjà connues, jamais une donnée manquante remplacée par 0. */
  brutTotal?: number;
  /** `undefined` si au moins un actif a un cumulé inconnu (composants F-012 sans détail cumulé exposé) ou si une divergence F-010/F-014 inexpliquée subsiste. */
  cumuleTotal?: number;
  netTotal?: number;
  brutFiable: boolean;
  netFiable: boolean;
  raisons: string[];
};

// ---------------------------------------------------------------------------
// État patrimonial assemblé
// ---------------------------------------------------------------------------

export type PatrimonialState = {
  exercice: number;
  /** Résultat COMPTABLE — jamais le résultat fiscal F-006. Voir `resultat-comptable.ts`. */
  resultatComptable: number;
  immobilisations: RegistrePatrimonialImmobilisations;
  tresorerie: TresorerieResolution;
  compteExploitant: CompteExploitantResolution;
  ran: RanResolution;
  /** Correction P0-3 : toujours résolu (jamais `undefined`) — `etat` porte l'information de fiabilité, jamais son absence. */
  emprunts: EmpruntsResolution;
  /** Correction P0-1 : toujours résolu (jamais `undefined`) — voir `TiersResolution`. */
  tiers: TiersResolution;
};

// ---------------------------------------------------------------------------
// Équilibre du bilan
// ---------------------------------------------------------------------------

export type BilanEquilibreStatus =
  | "EQUILIBRE"
  | "DONNEE_MANQUANTE"
  | "STOCK_OUVERTURE_ABSENT"
  | "DIVERGENCE_SOURCE"
  | "DESEQUILIBRE_REEL";

export type BilanEquilibreResult = {
  status: BilanEquilibreStatus;
  reasons: string[];
  totalActifBrut?: number;
  totalActifNet?: number;
  totalPassif?: number;
  ecart?: number;
};
