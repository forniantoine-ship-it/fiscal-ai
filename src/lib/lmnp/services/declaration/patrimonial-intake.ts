import type {
  BilanInputs,
  CompteExploitantInputs,
  LignePatrimonialeInput,
  LignesSimplesInputs,
  RanInputs,
  TiersInputs,
  TresorerieInputs,
} from "@/runtime/capabilities/bilan/types";

/**
 * G1-P0 — construction pure de `BilanInputs` (capabilities/bilan/types.ts,
 * NON modifié) depuis les réponses du questionnaire patrimonial minimal
 * (conception G1-A). Ce module ne contient AUCUNE règle fiscale : il
 * transforme des réponses explicites de l'utilisateur en objets déjà
 * typés côté moteur, jamais l'inverse. Toute question sans réponse laisse
 * le champ correspondant absent de l'objet produit — jamais un défaut
 * silencieux, jamais une valeur inventée.
 *
 * Consommé par `PatrimonialIntakeCard.tsx` (UI) — mais entièrement testable
 * sans React, conformément à la convention de ce projet (aucun test de
 * composant, toute la logique décisionnelle vit dans des modules purs).
 */

export type PatrimonialRoutage = "NATIF" | "REPRISE";

export type OuiNonReponse = "OUI" | "NON";

/**
 * État brut du formulaire. Chaque champ `*Raw` est une CHAÎNE, jamais un
 * nombre déjà converti : `""` signifie explicitement "pas encore répondu",
 * jamais 0 — voir `parseMontantSaisi()`, seul point de conversion autorisé.
 * Chaque champ `undefined` (routage, bankMode, subvention, autresElements)
 * signifie "question pas encore tranchée", jamais une valeur par défaut.
 */
export type PatrimonialIntakeState = {
  /** Q0 — premier exercice de ce dossier (NATIF) ou reprise d'un suivi antérieur (REPRISE). */
  routage?: PatrimonialRoutage;
  /** Q1 — compte dédié (DEDIE) ou non (MIXTE). */
  bankMode?: "DEDIE" | "MIXTE";
  /** Q1, si DEDIE — solde du compte au 31/12. */
  closingCashRaw: string;
  /** Q1, si MIXTE — trésorerie professionnelle identifiable à la clôture (0 = aucune, confirmé). */
  declaredProfessionalCashRaw: string;
  /** Q2 — apports de l'exercice au compte de l'exploitant. */
  apportsRaw: string;
  /** Q2 — prélèvements de l'exercice sur le compte de l'exploitant. */
  prelevementsRaw: string;
  /** Q_OUV, si REPRISE — solde du compte de l'exploitant à la clôture de l'exercice précédent. */
  ouvertureRepriseRaw: string;
  /** Q_OUV, si REPRISE — report à nouveau à reprendre. */
  ranRepriseRaw: string;
  /** Q3 — subvention d'investissement perçue cette année. */
  subvention?: OuiNonReponse;
  /** Q3, si OUI — montant de la subvention. */
  subventionMontantRaw: string;
  /** Q4 — catch-all autres éléments patrimoniaux (immobilisations incorporelles/financières, VMP, avances, créances, CCA). */
  autresElements?: OuiNonReponse;
};

export const EMPTY_PATRIMONIAL_INTAKE_STATE: PatrimonialIntakeState = {
  closingCashRaw: "",
  declaredProfessionalCashRaw: "",
  apportsRaw: "",
  prelevementsRaw: "",
  ouvertureRepriseRaw: "",
  ranRepriseRaw: "",
  subventionMontantRaw: "",
};

/**
 * Convertit une saisie utilisateur en montant explicite.
 *
 * `""` (ou uniquement des espaces) → `undefined` (INCONNU, jamais 0).
 * Une chaîne non numérique → `undefined` également (saisie invalide traitée
 * comme non renseignée, jamais une valeur inventée).
 *
 * INTERDIT partout où une déclaration utilisateur est construite :
 * `Number(raw)` seul, ou `Number(raw) || 0` — `Number("")` vaut `0` en
 * JavaScript, ce qui transformerait silencieusement un champ jamais rempli
 * en déclaration explicite de zéro. Ce point est le seul endroit du module
 * où cette conversion doit avoir lieu.
 */
export function parseMontantSaisi(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * Q4 = NON confirmé — cascade vers les 7 cases Amort.-Prov. concernées
 * (016/042/066/070/074/082/094, cf. audit G1-A §2/§5). Un poste brut absent
 * rend structurellement sa provision sans objet : ce n'est pas une nouvelle
 * règle fiscale, seulement la déduction du même fait confirmé une seule fois.
 */
const LIGNES_SIMPLES_NUL_CONFIRME: LignesSimplesInputs = {
  autresImmobilisationsIncorporellesNet: { status: "NUL_CONFIRME" },
  immobilisationsFinancieresNet: { status: "NUL_CONFIRME" },
  avancesAcomptesVersesAmort: { status: "NUL_CONFIRME" },
  clientsAmortissementsProvisions: { status: "NUL_CONFIRME" },
  autresCreancesAmortissementsProvisions: { status: "NUL_CONFIRME" },
  valeursMobilieresPlacementNet: { status: "NUL_CONFIRME" },
  chargesConstateesAvanceAmort: { status: "NUL_CONFIRME" },
};

/**
 * Q4 = NON confirmé — cascade ÉGALEMENT vers le bucket `tiers` (P0), distinct
 * de `lignesSimples`/`ventilationTiers` ci-dessus : `checkBilanEquilibre()`
 * (via `resolveContributionTiersEquilibre`) exige que CE bucket soit résolu
 * (DECLARE ou NUL_CONFIRME) pour juger le bilan équilibré, indépendamment des
 * cases individuelles 016/042/066/070/074/082/094. Sans cette seconde
 * cascade, « rien de particulier » resterait vrai case par case mais 098/142
 * resteraient bloquées par ce bucket séparé — la même réponse utilisateur
 * doit couvrir les deux représentations que le moteur consomme.
 */
const TIERS_NUL_CONFIRME: TiersInputs = {
  creances: { status: "NUL_CONFIRME" },
  dettes: { status: "NUL_CONFIRME" },
};

/**
 * Construit un `BilanInputs` depuis l'état du formulaire.
 *
 * Retourne `undefined` tant que le routage (Q0, NATIF/REPRISE) n'a pas été
 * explicitement tranché — jamais déduit d'une absence de saisie (contrat
 * G1-A/G1-P0 explicite). Dans ce cas, rien n'est transmis à
 * `assemblePatrimoine()` : c'est rigoureusement équivalent à l'état
 * antérieur à G1 (`bilanPatrimonial` absent du draft).
 */
export function buildBilanPatrimonial(state: PatrimonialIntakeState): BilanInputs | undefined {
  if (state.routage === undefined) return undefined;

  const tresorerie: TresorerieInputs =
    state.bankMode === "DEDIE"
      ? { bankMode: "DEDIE", closingCash: parseMontantSaisi(state.closingCashRaw) }
      : state.bankMode === "MIXTE"
        ? { bankMode: "MIXTE", declaredProfessionalCash: parseMontantSaisi(state.declaredProfessionalCashRaw) }
        : { bankMode: "INCONNU" };

  // Q0 = NATIF : aucune activité antérieure à ce dossier, donc aucun solde
  // d'ouverture possible — 0 n'est pas une saisie mais un fait structurel du
  // dossier (voir G1-A §2-A). Q0 = REPRISE : uniquement ce que Q_OUV a
  // explicitement recueilli, jamais un 0 par défaut.
  const compteExploitant: CompteExploitantInputs = {
    ouverture: state.routage === "NATIF" ? 0 : parseMontantSaisi(state.ouvertureRepriseRaw),
    apports: parseMontantSaisi(state.apportsRaw),
    prelevements: parseMontantSaisi(state.prelevementsRaw),
  };

  const ran: RanInputs =
    state.routage === "NATIF"
      ? { situation: "NATIF" }
      : { situation: "IMPORTE", importedRAN: parseMontantSaisi(state.ranRepriseRaw) };

  const subventionMontant = parseMontantSaisi(state.subventionMontantRaw);
  const subventionsInvestissement: LignePatrimonialeInput | undefined =
    state.subvention === "NON"
      ? { status: "NUL_CONFIRME" }
      : state.subvention === "OUI" && subventionMontant !== undefined
        ? { status: "DECLARE", montant: subventionMontant }
        : undefined;

  // Q4 = OUI : jamais de montant inventé — les postes concernés restent
  // absents (INCONNU) ; l'UI doit afficher un message de collecte différée.
  const lignesSimples: LignesSimplesInputs | undefined =
    state.autresElements === "NON" ? LIGNES_SIMPLES_NUL_CONFIRME : undefined;

  // Voir le commentaire de TIERS_NUL_CONFIRME : même réponse Q4, deuxième
  // représentation exigée par checkBilanEquilibre().
  const tiers: TiersInputs | undefined = state.autresElements === "NON" ? TIERS_NUL_CONFIRME : undefined;

  return {
    tresorerie,
    compteExploitant,
    ran,
    subventionsInvestissement,
    lignesSimples,
    tiers,
  };
}

/**
 * Fonction inverse — reconstruit l'état de formulaire depuis un
 * `BilanInputs` déjà persisté (réhydratation d'un draft existant après
 * navigation). Best-effort et volontairement partiel : ne reconstruit que ce
 * que ce formulaire P0 sait lui-même produire (jamais un `REPRISE_HISTORIQUE`
 * par exemple, situation hors périmètre de cet intake).
 */
export function deriveIntakeStateFromBilanPatrimonial(value: BilanInputs | undefined): PatrimonialIntakeState {
  if (value === undefined) return EMPTY_PATRIMONIAL_INTAKE_STATE;

  const routage: PatrimonialRoutage | undefined =
    value.ran.situation === "NATIF" ? "NATIF" : value.ran.situation === "IMPORTE" ? "REPRISE" : undefined;

  const bankMode: "DEDIE" | "MIXTE" | undefined =
    value.tresorerie.bankMode === "DEDIE" || value.tresorerie.bankMode === "MIXTE" ? value.tresorerie.bankMode : undefined;

  const subvention: OuiNonReponse | undefined =
    value.subventionsInvestissement?.status === "NUL_CONFIRME"
      ? "NON"
      : value.subventionsInvestissement?.status === "DECLARE"
        ? "OUI"
        : undefined;

  const autresElements: OuiNonReponse | undefined =
    value.lignesSimples?.autresImmobilisationsIncorporellesNet?.status === "NUL_CONFIRME" ? "NON" : undefined;

  return {
    routage,
    bankMode,
    closingCashRaw:
      value.tresorerie.bankMode === "DEDIE" && value.tresorerie.closingCash !== undefined
        ? String(value.tresorerie.closingCash)
        : "",
    declaredProfessionalCashRaw:
      value.tresorerie.bankMode === "MIXTE" && value.tresorerie.declaredProfessionalCash !== undefined
        ? String(value.tresorerie.declaredProfessionalCash)
        : "",
    apportsRaw: value.compteExploitant.apports !== undefined ? String(value.compteExploitant.apports) : "",
    prelevementsRaw: value.compteExploitant.prelevements !== undefined ? String(value.compteExploitant.prelevements) : "",
    ouvertureRepriseRaw:
      routage === "REPRISE" && value.compteExploitant.ouverture !== undefined
        ? String(value.compteExploitant.ouverture)
        : "",
    ranRepriseRaw:
      value.ran.situation === "IMPORTE" && value.ran.importedRAN !== undefined ? String(value.ran.importedRAN) : "",
    subvention,
    subventionMontantRaw:
      value.subventionsInvestissement?.status === "DECLARE" ? String(value.subventionsInvestissement.montant) : "",
    autresElements,
  };
}
