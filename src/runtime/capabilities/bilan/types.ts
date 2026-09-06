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
  /**
   * Case 086 — provision ou amortissement sur disponibilités (colonne
   * Amortissements-Provisions), distinct de `closingCash` / `declaredProfessionalCash`
   * (084 brut). P1-PDF-02-F4-B : absent ⇔ INCONNU — jamais déduit de 084.
   * DECLARE / NUL_CONFIRME explicites uniquement.
   */
  provisionsAmortissements?: LignePatrimonialeInput;
  source?: string;
};

export type TresorerieResolution = {
  etat: TresorerieEtat;
  /**
   * Valeur retenue pour 084 (brut) — TOUJOURS ≥ 0 (jamais un découvert projeté
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
  /**
   * Réconciliation explicite emprunt canonique (F-011 / case 156) ↔ `dettes`.
   * Absent ⇒ `EMPRUNT_PRESENCE_BUCKET_NON_RECONCILIEE` dès que les deux
   * coexistent (bucket DECLARE + CRD > 0). Ne JAMAIS déduire depuis une
   * comparaison de montants.
   */
  reconciliationEmprunts?: "EMPRUNT_SEPARE_ET_EXCLU_DU_BUCKET" | "EMPRUNT_INCLUS_DANS_BUCKET";
  /**
   * Réconciliation explicite découvert canonique (trésorerie → 156) ↔ `dettes`.
   * Même doctrine que les emprunts : absence = non réconcilié = blocage.
   */
  reconciliationDecouvert?: "DECOUVERT_SEPARE_ET_EXCLU_DU_BUCKET" | "DECOUVERT_INCLUS_DANS_BUCKET";
};

export type TiersPosteResolution =
  | { status: "DECLARE" | "NUL_CONFIRME"; montant: number; raison: string }
  | { status: "INCONNU"; raison: string };

export type TiersResolution = {
  creances: TiersPosteResolution;
  dettes: TiersPosteResolution;
};

// ---------------------------------------------------------------------------
// Ligne patrimoniale générique (correction P1-A) — abstraction à 4 états,
// réutilisable au-delà des tiers : DECLARE / NUL_CONFIRME / NON_APPLICABLE /
// INCONNU. Volontairement SÉPARÉE de `TiersPosteInput`/`TiersPosteResolution`
// (3 états, pas de `NON_APPLICABLE` pertinent pour un tiers) — ce n'est pas
// un remplacement ni une migration de l'architecture tiers, seulement un
// sur-ensemble pour les lignes Cerfa qui, elles, peuvent être structurellement
// hors périmètre selon le dossier. Premier consommateur : case 137
// (subventions d'investissement) — voir `subventions-investissement.ts`.
//
// `NON_APPLICABLE` reste distinct de `NUL_CONFIRME` : le premier signifie
// « cette ligne ne concerne pas ce dossier/régime », le second « l'utilisateur
// a confirmé l'absence pour ce dossier précis » — deux faits différents,
// jamais fusionnés dans une même trace. Absence de saisie (`undefined`) ⇒
// TOUJOURS `INCONNU`, jamais l'un des deux autres statuts par défaut.
// ---------------------------------------------------------------------------

export type LignePatrimonialeInput =
  | { status: "DECLARE"; montant: number }
  | { status: "NUL_CONFIRME" }
  | { status: "NON_APPLICABLE" }
  | { status: "INCONNU" };

export type LignePatrimonialeResolution =
  | { status: "DECLARE" | "NUL_CONFIRME" | "NON_APPLICABLE"; montant: number; raison: string }
  | { status: "INCONNU"; raison: string };

// ---------------------------------------------------------------------------
// Ventilation économique des tiers (P1-B.3) — nature → case Cerfa
// ---------------------------------------------------------------------------

/**
 * Nature économique compréhensible par un non-comptable (ou détectable depuis
 * des documents). Ce n'est PAS un numéro de case Cerfa : le client décrit la
 * réalité, Fiscal AI classe ensuite. EMPRUNT et DECOUVERT bancaire sont
 * volontairement ABSENTS : sources canoniques F-011 / trésorerie → case 156,
 * jamais un poste de ventilation tiers (anti-double-comptage).
 */
export type NatureEconomique =
  | "LOYER_DU_PAR_LOCATAIRE" // → 068
  | "ACOMPTE_VERSE_A_FOURNISSEUR" // → 064
  | "AUTRE_CREANCE_ACTIVITE" // → 072
  | "CHARGE_CONSTATEE_AVANCE" // → 092
  | "FOURNISSEUR_NON_PAYE" // → 166
  | "DETTE_FISCALE_OU_SOCIALE" // → 172
  | "DEPOT_GARANTIE_LOCATAIRE" // → 175
  | "LOYER_ENCAISSE_D_AVANCE" // → 174
  | "ACOMPTE_RECU_SUR_COMMANDE" // → 164
  | "NATURE_INCONNUE"; // → non ventilé, jamais 0 silencieux

/** Poste économique unitaire — entrée de ventilation, pas une case Cerfa. */
export type PosteEconomiqueInput = {
  id?: string;
  montant: number;
  nature: NatureEconomique;
  /** Libellé client (ex. « Loyer de décembre encore dû ») — trace UX future. */
  libelle?: string;
  source?: string;
};

export type VentilationTiersInputs = {
  /** Liste de faits économiques classifiés. Absent / [] ≠ confirmation de zéro. */
  postes?: PosteEconomiqueInput[];
};

export type ConflitVentilation = {
  code:
    | "NATURE_INCONNUE_NON_VENTILEE"
    | "BUCKET_TIERS_ET_VENTILATION"
    | "LIGNE_SIMPLE_ET_VENTILATION"
    | "SOURCE_CANONIQUE_EMPRUNT"
    | "SOURCE_CANONIQUE_DECOUVERT"
    | "NATURE_INTERDITE";
  raison: string;
};

export type VentilationTiersCases = {
  /** 064 — Avances et acomptes versés. */
  avancesAcomptesVerses: LignePatrimonialeResolution;
  /** 068 — Clients et comptes rattachés. */
  clients: LignePatrimonialeResolution;
  /** 072 — Autres créances. */
  autresCreances: LignePatrimonialeResolution;
  /** 092 — Charges constatées d'avance. */
  chargesConstateesAvance: LignePatrimonialeResolution;
  /** 164 — Avances et acomptes reçus. */
  avancesAcomptesRecus: LignePatrimonialeResolution;
  /** 166 — Fournisseurs et comptes rattachés. */
  fournisseurs: LignePatrimonialeResolution;
  /** 172 — Dettes fiscales et sociales. */
  dettesFiscalesSociales: LignePatrimonialeResolution;
  /** 173 — Comptes courants d'associés (NON_APPLICABLE EI selon doctrine). */
  comptesCourantsAssocies: LignePatrimonialeResolution;
  /** 174 — Produits constatés d'avance. */
  produitsConstatesAvance: LignePatrimonialeResolution;
  /** 175 — Autres dettes (ex. dépôts de garantie). */
  autresDettes: LignePatrimonialeResolution;
};

export type VentilationTiersResolution = {
  cases: VentilationTiersCases;
  /** Montants à nature inconnue : jamais projetés vers une case, jamais 0. */
  montantsNonVentiles: Array<{ montant: number; libelle?: string; raison: string }>;
  conflits: ConflitVentilation[];
  /**
   * `false` dès qu'un montant non ventilé ou un conflit de double comptage
   * empêche une projection Cerfa sûre des composantes concernées.
   */
  projectionFiable: boolean;
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

/**
 * Familles patrimoniales « simples » P1-B.2 — représentation typée à 4 états
 * via `LignePatrimonialeInput`. Toutes ces lignes PEUVENT exister en LMNP ;
 * aucune n'est structurellement `NON_APPLICABLE` par régime. Absent ⇔
 * `INCONNU` (jamais 0 silencieux). Aucune question client systématique
 * n'est induite par ces champs : la collecte intelligente est hors jalon.
 *
 * Cases brut : 014, 040, 064, 080, 092.
 * Cases colonne Amortissements-Provisions (P1-PDF-02-B) : 016, 042, 082 —
 * propriétés `*Net` ci-dessous (suffixe historique trompeur : ce ne sont PAS
 * des valeurs nettes comptables Brut−Amort, mais le montant explicite de la
 * colonne Amort du Cerfa lorsque DECLARE/NUL_CONFIRME).
 * Cases passif : 174, 175.
 *
 * F4-B — colonnes Amort circulant : champs `LignePatrimonialeInput` dédiés
 * (cases 066, 070, 074, 094). Absent ⇔ INCONNU. Ne jamais dériver du brut
 * voisin (064/068/072/092) ni de la ventilation `LOYER_DU` → 068.
 */
export type LignesSimplesInputs = {
  /** Case 014 — Autres immobilisations incorporelles (brut). */
  autresImmobilisationsIncorporellesBrut?: LignePatrimonialeInput;
  /**
   * Case 016 — Autres immobilisations incorporelles (colonne
   * Amortissements-Provisions). Suffixe `Net` = héritage de nommage uniquement.
   */
  autresImmobilisationsIncorporellesNet?: LignePatrimonialeInput;
  /** Case 040 — Immobilisations financières (brut). */
  immobilisationsFinancieresBrut?: LignePatrimonialeInput;
  /**
   * Case 042 — Immobilisations financières (colonne Amortissements-Provisions).
   * Suffixe `Net` = héritage de nommage uniquement.
   */
  immobilisationsFinancieresNet?: LignePatrimonialeInput;
  /** Case 064 — Avances et acomptes versés sur commandes (brut). */
  avancesAcomptesVerses?: LignePatrimonialeInput;
  /**
   * Case 066 — Avances et acomptes versés (colonne Amortissements-Provisions).
   * Distinct de `avancesAcomptesVerses` (064 brut).
   */
  avancesAcomptesVersesAmort?: LignePatrimonialeInput;
  /**
   * Case 070 — Clients et comptes rattachés (colonne Amortissements-Provisions).
   * Distinct de la ventilation `LOYER_DU_PAR_LOCATAIRE` → 068 (brut).
   */
  clientsAmortissementsProvisions?: LignePatrimonialeInput;
  /**
   * Case 074 — Autres créances (colonne Amortissements-Provisions).
   * Distinct de `ventilationTiers.autresCreances` → 072 (brut).
   */
  autresCreancesAmortissementsProvisions?: LignePatrimonialeInput;
  /** Case 080 — Valeurs mobilières de placement (brut). */
  valeursMobilieresPlacementBrut?: LignePatrimonialeInput;
  /**
   * Case 082 — Valeurs mobilières de placement (colonne
   * Amortissements-Provisions). Suffixe `Net` = héritage de nommage uniquement.
   */
  valeursMobilieresPlacementNet?: LignePatrimonialeInput;
  /** Case 092 — Charges constatées d'avance (brut). */
  chargesConstateesAvance?: LignePatrimonialeInput;
  /**
   * Case 094 — Charges constatées d'avance (colonne Amortissements-Provisions).
   * Distinct de `chargesConstateesAvance` (092 brut).
   */
  chargesConstateesAvanceAmort?: LignePatrimonialeInput;
  /** Case 174 — Produits constatés d'avance. */
  produitsConstatesAvance?: LignePatrimonialeInput;
  /**
   * Case 175 — Autres dettes (ex. dépôts de garantie). Distinct de
   * `tiers.dettes` (agrégat P0 pour l'équilibre) : représentation Cerfa
   * case-level, jamais fusionnée silencieusement.
   */
  autresDettes?: LignePatrimonialeInput;
};

export type LignesSimplesResolution = {
  autresImmobilisationsIncorporellesBrut: LignePatrimonialeResolution;
  autresImmobilisationsIncorporellesNet: LignePatrimonialeResolution;
  immobilisationsFinancieresBrut: LignePatrimonialeResolution;
  immobilisationsFinancieresNet: LignePatrimonialeResolution;
  avancesAcomptesVerses: LignePatrimonialeResolution;
  avancesAcomptesVersesAmort: LignePatrimonialeResolution;
  clientsAmortissementsProvisions: LignePatrimonialeResolution;
  autresCreancesAmortissementsProvisions: LignePatrimonialeResolution;
  valeursMobilieresPlacementBrut: LignePatrimonialeResolution;
  valeursMobilieresPlacementNet: LignePatrimonialeResolution;
  chargesConstateesAvance: LignePatrimonialeResolution;
  chargesConstateesAvanceAmort: LignePatrimonialeResolution;
  produitsConstatesAvance: LignePatrimonialeResolution;
  autresDettes: LignePatrimonialeResolution;
};

export type BilanInputs = {
  tresorerie: TresorerieInputs;
  compteExploitant: CompteExploitantInputs;
  ran: RanInputs;
  tiers?: TiersInputs;
  financements?: FinancementBilanInputs;
  /**
   * Case 137 (Subventions d'investissement) — correction P1-A. Absent ⇔
   * `{ status: "INCONNU" }` — jamais interprété comme une absence confirmée.
   */
  subventionsInvestissement?: LignePatrimonialeInput;
  /**
   * Lignes patrimoniales simples P1-B.2. Absent ⇔ chaque ligne résolue en
   * `INCONNU` — jamais un zéro silencieux ni un `NON_APPLICABLE` inventé.
   */
  lignesSimples?: LignesSimplesInputs;
  /**
   * Ventilation économique des tiers P1-B.3 — postes classifiés par nature
   * (pas par case Cerfa). Absent ⇔ toutes les cases ventilables restent
   * `INCONNU` (sauf 173 NON_APPLICABLE EI). Ne remplace pas `tiers` P0.
   */
  ventilationTiers?: VentilationTiersInputs;
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
  /** Correction P1-A : toujours résolu (jamais `undefined`) — voir `subventions-investissement.ts`. Gate la publication de la case 142 (voir `total-capitaux-propres.ts`). */
  subventionsInvestissement: LignePatrimonialeResolution;
  /**
   * P1-B.2 : toujours résolu (jamais `undefined`) — voir `lignes-simples.ts`.
   * Chaque ligne absente de `BilanInputs.lignesSimples` reste `INCONNU`.
   * Ne débloque pas automatiquement les totaux Cerfa 044/096/176/180 : une
   * composante inconnue parmi celles listées pour un total le bloque.
   */
  lignesSimples: LignesSimplesResolution;
  /**
   * P1-PDF-02-F4-B — case 086 (Disponibilités, colonne Amortissements-Provisions).
   * Résolu depuis `BilanInputs.tresorerie.provisionsAmortissements` — jamais
   * depuis `tresorerie.clotureRetenue` (084).
   */
  disponibilitesAmortissementsProvisions: LignePatrimonialeResolution;
  /**
   * P1-B.3 : toujours résolu — ventilation nature → case. Les buckets
   * `tiers.creances` / `tiers.dettes` ne sont jamais projetés ici.
   */
  ventilationTiers: VentilationTiersResolution;
  /**
   * P1-B.4 strict : réconciliation emprunt canonique ↔ `tiers.dettes`.
   * Toujours résolu — `bloquant` si coexistence non réconciliée.
   */
  reconciliationEmpruntsTiers: ReconciliationEmpruntsTiersResolution;
  /**
   * P1-B.4 strict : réconciliation découvert canonique ↔ `tiers.dettes`.
   */
  reconciliationDecouvertTiers: ReconciliationDecouvertTiersResolution;
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

// ---------------------------------------------------------------------------
// Contribution tiers à l'équilibre (P1-B.4) — une réalité → une contribution
// ---------------------------------------------------------------------------

/**
 * Couverture bucket P0 ↔ ventilation P1-B.3 pour un côté (créances OU dettes).
 * La ventilation représente UNIQUEMENT les montants classifiés (pas le bucket
 * entier). Un reste bucket − Σ ventilée est INCONNU, jamais 0 silencieux.
 */
export type CouvertureTiersEtat =
  | "BUCKET_SEUL"
  | "VENTILATION_COMPLETE"
  | "VENTILATION_PARTIELLE"
  | "VENTILATION_SUPERIEURE"
  | "INCOHERENTE"
  | "NON_ARBITRABLE";

export type ContributionCoteTiers = {
  etat: CouvertureTiersEtat;
  /** Défini uniquement si le côté est utilisable pour l'équilibre. */
  montantRetenu?: number;
  /** bucket − Σ ventilée lorsque partiel ; sinon 0 si complet. */
  resteNonVentile?: number;
  sommeVentilee: number;
  source: "BUCKET" | "VENTILATION" | "AUCUNE";
  raison: string;
};

export type ContributionTiersEquilibre = {
  creances: ContributionCoteTiers;
  dettes: ContributionCoteTiers;
  /** `false` ⇒ `checkBilanEquilibre` doit bloquer (jamais additionner bucket + ventilation). */
  utilisablePourEquilibre: boolean;
  raisonsBlocage: string[];
};

// ---------------------------------------------------------------------------
// Réconciliation emprunts / découvert ↔ tiers.dettes (P1-B.4 strict)
// ---------------------------------------------------------------------------

/**
 * Statut de réconciliation entre la source canonique des emprunts (F-011 →
 * case 156) et le bucket opaque `tiers.dettes`. Absence d'information
 * explicite ≠ « séparés » : c'est `EMPRUNT_PRESENCE_BUCKET_NON_RECONCILIEE`.
 */
export type ReconciliationEmpruntsTiersEtat =
  | "EMPRUNT_SEPARE_ET_EXCLU_DU_BUCKET"
  | "EMPRUNT_INCLUS_DANS_BUCKET"
  | "EMPRUNT_PRESENCE_BUCKET_NON_RECONCILIEE"
  | "AUCUN_EMPRUNT_CANONIQUE";

export type ReconciliationEmpruntsTiersResolution = {
  etat: ReconciliationEmpruntsTiersEtat;
  /**
   * Montant d'emprunt à ajouter dans le total passif d'équilibre EN PLUS de
   * la contribution `tiers.dettes`. `0` si inclus dans le bucket ; `undefined`
   * si non réconcilié (blocage).
   */
  contributionEmpruntEquilibre?: number;
  raison: string;
  bloquant: boolean;
};

export type ReconciliationDecouvertTiersEtat =
  | "DECOUVERT_SEPARE_ET_EXCLU_DU_BUCKET"
  | "DECOUVERT_INCLUS_DANS_BUCKET"
  | "DECOUVERT_PRESENCE_BUCKET_NON_RECONCILIEE"
  | "AUCUN_DECOUVERT_CANONIQUE";

export type ReconciliationDecouvertTiersResolution = {
  etat: ReconciliationDecouvertTiersEtat;
  contributionDecouvertEquilibre?: number;
  raison: string;
  bloquant: boolean;
};
