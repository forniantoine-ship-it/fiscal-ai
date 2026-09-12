import type {
  BilanInputs,
  CompteExploitantInputs,
  LignePatrimonialeInput,
  LignesSimplesInputs,
  RanInputs,
  RanSituation,
  TiersInputs,
  TresorerieInputs,
} from "@/runtime/capabilities/bilan/types";
import { parseMontantSaisi } from "./parse-montant-saisi";
import {
  EMPTY_VENTILATION_TIERS_INTAKE_STATE,
  buildVentilationTiersInputs,
  deriveVentilationTiersIntakeState,
  type VentilationTiersIntakeState,
} from "./ventilation-tiers-intake";

/** Ré-export historique — voir `parse-montant-saisi.ts` pour l'implémentation et la raison de l'extraction (B-FAMILY-3). */
export { parseMontantSaisi } from "./parse-montant-saisi";

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
 * G1-P1 — continuité patrimoniale N→N+1, lue depuis
 * `FiscalYear.patrimoineOuverture` (résolue une seule fois à la création de
 * CET exercice par `resolvePatrimoineOuvertureNPlusUn()`, jamais recalculée
 * ici). Sa seule présence dispense l'utilisateur de Q0/Q_OUV : l'ouverture du
 * compte exploitant et le RAN sont alors `DERIVE`, jamais un `DECLARE`
 * utilisateur — voir `buildBilanPatrimonial()`.
 */
export type PatrimoineContinuite = {
  sourceClosureId: string;
  ouvertureCompteExploitant: number;
  ran: { situation: RanSituation; valeur?: number };
};

/**
 * État brut du formulaire. Chaque champ `*Raw` est une CHAÎNE, jamais un
 * nombre déjà converti : `""` signifie explicitement "pas encore répondu",
 * jamais 0 — voir `parseMontantSaisi()`, seul point de conversion autorisé.
 * Chaque champ `undefined` (routage, bankMode, subvention, autresElements)
 * signifie "question pas encore tranchée", jamais une valeur par défaut.
 */
export type PatrimonialIntakeState = {
  /**
   * G1-P1 — continuité N→N+1 disponible (voir `PatrimoineContinuite`).
   * Quand définie, `routage`/`ouvertureRepriseRaw`/`ranRepriseRaw` ci-dessous
   * ne sont plus consultés par `buildBilanPatrimonial()` : l'ouverture du
   * compte exploitant et le RAN sont construits directement depuis cette
   * continuité. Jamais construite par ce module lui-même — fournie par
   * l'appelant (`PatrimonialIntakeCard.tsx`) depuis `FiscalYear.patrimoineOuverture`.
   */
  continuite?: PatrimoineContinuite;
  /** Q0 — premier exercice de ce dossier (NATIF) ou reprise d'un suivi antérieur (REPRISE). Non consultée si `continuite` est définie. */
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
  /** P1-B1 — case 064, acompte versé à un fournisseur non soldé au 31/12. */
  avancesAcomptesVerses?: OuiNonReponse;
  /** P1-B1, si OUI — montant de l'acompte versé (case 064). */
  avancesAcomptesVersesMontantRaw: string;
  /** P1-B2 — case 014, logiciel/droit au bail/autre élément incorporel acquis pour l'activité. */
  autresImmobilisationsIncorporellesBrut?: OuiNonReponse;
  /** P1-B2, si OUI — montant de l'élément incorporel (case 014). */
  autresImmobilisationsIncorporellesBrutMontantRaw: string;
  /** P1-B2 — case 040, dépôt de garantie versé ou titres/cautions liés à l'activité (hors placements financiers, cf. 080). */
  immobilisationsFinancieresBrut?: OuiNonReponse;
  /** P1-B2, si OUI — montant du dépôt/de la caution (case 040). */
  immobilisationsFinancieresBrutMontantRaw: string;
  /** P1-B1 — case 080, titres/placements détenus au titre de l'activité. */
  valeursMobilieresPlacementBrut?: OuiNonReponse;
  /** P1-B1, si OUI — montant des titres/placements (case 080). */
  valeursMobilieresPlacementBrutMontantRaw: string;
  /** P1-B1 — case 092, charge payée d'avance concernant l'exercice suivant. */
  chargesConstateesAvance?: OuiNonReponse;
  /** P1-B1, si OUI — montant de la charge constatée d'avance (case 092). */
  chargesConstateesAvanceMontantRaw: string;
  /** P1-B1 — case 174, loyer encaissé d'avance concernant l'exercice suivant. */
  produitsConstatesAvance?: OuiNonReponse;
  /** P1-B1, si OUI — montant du produit constaté d'avance (case 174). */
  produitsConstatesAvanceMontantRaw: string;
  /** P1-B1 — case 175, dépôt de garantie locataire ou autre dette envers un tiers. */
  autresDettes?: OuiNonReponse;
  /** P1-B1, si OUI — montant de l'autre dette (case 175). */
  autresDettesMontantRaw: string;
  /**
   * B-FAMILY-3 — état de collecte des 5 natures famille B (068/072/164/166/172),
   * géré par `ventilation-tiers-intake.ts`/`VentilationTiersIntakeCard`.
   * Toujours présent (jamais optionnel) : un état vide (`EMPTY_VENTILATION_TIERS_INTAKE_STATE`)
   * ne construit aucune donnée (voir `buildVentilationTiersInputs`), exactement
   * comme les autres champs `Raw` vides de cet état.
   */
  ventilationTiersIntake: VentilationTiersIntakeState;
};

export const EMPTY_PATRIMONIAL_INTAKE_STATE: PatrimonialIntakeState = {
  closingCashRaw: "",
  declaredProfessionalCashRaw: "",
  apportsRaw: "",
  prelevementsRaw: "",
  ouvertureRepriseRaw: "",
  ranRepriseRaw: "",
  subventionMontantRaw: "",
  avancesAcomptesVersesMontantRaw: "",
  autresImmobilisationsIncorporellesBrutMontantRaw: "",
  immobilisationsFinancieresBrutMontantRaw: "",
  valeursMobilieresPlacementBrutMontantRaw: "",
  chargesConstateesAvanceMontantRaw: "",
  produitsConstatesAvanceMontantRaw: "",
  autresDettesMontantRaw: "",
  ventilationTiersIntake: EMPTY_VENTILATION_TIERS_INTAKE_STATE,
};

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
 * P1-B1 — traduit une réponse Oui/Non + montant brut en `LignePatrimonialeInput`,
 * même doctrine que Q3 (subvention) : NON → NUL_CONFIRME (absence confirmée,
 * jamais un défaut silencieux) ; OUI + montant saisi → DECLARE ; OUI sans
 * montant encore saisi, ou question jamais tranchée → `undefined` (la case
 * reste INCONNU côté moteur, jamais un montant inventé).
 */
function resolveLignePatrimonialeReponse(reponse: OuiNonReponse | undefined, montantRaw: string): LignePatrimonialeInput | undefined {
  if (reponse === "NON") return { status: "NUL_CONFIRME" };
  if (reponse === "OUI") {
    const montant = parseMontantSaisi(montantRaw);
    return montant !== undefined ? { status: "DECLARE", montant } : undefined;
  }
  return undefined;
}

/**
 * Construit un `BilanInputs` depuis l'état du formulaire.
 *
 * Retourne `undefined` tant que ni la continuité N→N+1 (`state.continuite`)
 * ni le routage (Q0, NATIF/REPRISE) n'ont été établis — jamais déduit d'une
 * absence de saisie (contrat G1-A/G1-P0 explicite). Dans ce cas, rien n'est
 * transmis à `assemblePatrimoine()` : c'est rigoureusement équivalent à
 * l'état antérieur à G1 (`bilanPatrimonial` absent du draft).
 */
export function buildBilanPatrimonial(state: PatrimonialIntakeState): BilanInputs | undefined {
  if (state.continuite === undefined && state.routage === undefined) return undefined;

  const tresorerie: TresorerieInputs =
    state.bankMode === "DEDIE"
      ? { bankMode: "DEDIE", closingCash: parseMontantSaisi(state.closingCashRaw) }
      : state.bankMode === "MIXTE"
        ? { bankMode: "MIXTE", declaredProfessionalCash: parseMontantSaisi(state.declaredProfessionalCashRaw) }
        : { bankMode: "INCONNU" };

  // G1-P1 — continuité disponible : l'ouverture du compte exploitant et le
  // RAN sont DÉRIVÉS de la clôture précédente (resolvePatrimoineOuvertureNPlusUn(),
  // déjà exécutée à la création de l'exercice) — jamais recalculés ici,
  // jamais présentés comme une saisie utilisateur. Sans continuité : Q0 =
  // NATIF ⇒ aucune activité antérieure, donc 0 (fait structurel du dossier,
  // voir G1-A §2-A) ; Q0 = REPRISE ⇒ uniquement ce que Q_OUV a explicitement
  // recueilli, jamais un 0 par défaut.
  const compteExploitant: CompteExploitantInputs = {
    ouverture:
      state.continuite !== undefined
        ? state.continuite.ouvertureCompteExploitant
        : state.routage === "NATIF"
          ? 0
          : parseMontantSaisi(state.ouvertureRepriseRaw),
    apports: parseMontantSaisi(state.apportsRaw),
    prelevements: parseMontantSaisi(state.prelevementsRaw),
  };

  const ran: RanInputs =
    state.continuite !== undefined
      ? { situation: state.continuite.ran.situation, importedRAN: state.continuite.ran.valeur }
      : state.routage === "NATIF"
        ? { situation: "NATIF" }
        : { situation: "IMPORTE", importedRAN: parseMontantSaisi(state.ranRepriseRaw) };

  const subventionMontant = parseMontantSaisi(state.subventionMontantRaw);
  const subventionsInvestissement: LignePatrimonialeInput | undefined =
    state.subvention === "NON"
      ? { status: "NUL_CONFIRME" }
      : state.subvention === "OUI" && subventionMontant !== undefined
        ? { status: "DECLARE", montant: subventionMontant }
        : undefined;

  // P1-B1/P1-B2 — les 7 questions dédiées (014/040/064/080/092/174/175) sont
  // indépendantes de Q4 : chacune ne renseigne QUE sa propre clé de
  // `LignesSimplesInputs`, jamais les 6 autres. `resolveLignePatrimonialeReponse()`
  // reproduit exactement la doctrine déjà éprouvée par Q3 (subvention) : NON
  // confirmé → NUL_CONFIRME ; OUI + montant → DECLARE ; OUI sans montant
  // encore saisi, ou question jamais tranchée → absente (INCONNU), jamais un
  // 0 inventé.
  const lignesSimplesReponsesDediees: LignesSimplesInputs = {};
  const avancesAcomptesVerses = resolveLignePatrimonialeReponse(state.avancesAcomptesVerses, state.avancesAcomptesVersesMontantRaw);
  if (avancesAcomptesVerses !== undefined) lignesSimplesReponsesDediees.avancesAcomptesVerses = avancesAcomptesVerses;
  const autresImmobilisationsIncorporellesBrut = resolveLignePatrimonialeReponse(
    state.autresImmobilisationsIncorporellesBrut,
    state.autresImmobilisationsIncorporellesBrutMontantRaw,
  );
  if (autresImmobilisationsIncorporellesBrut !== undefined) {
    lignesSimplesReponsesDediees.autresImmobilisationsIncorporellesBrut = autresImmobilisationsIncorporellesBrut;
  }
  const immobilisationsFinancieresBrut = resolveLignePatrimonialeReponse(
    state.immobilisationsFinancieresBrut,
    state.immobilisationsFinancieresBrutMontantRaw,
  );
  if (immobilisationsFinancieresBrut !== undefined) {
    lignesSimplesReponsesDediees.immobilisationsFinancieresBrut = immobilisationsFinancieresBrut;
  }
  const valeursMobilieresPlacementBrut = resolveLignePatrimonialeReponse(
    state.valeursMobilieresPlacementBrut,
    state.valeursMobilieresPlacementBrutMontantRaw,
  );
  if (valeursMobilieresPlacementBrut !== undefined) lignesSimplesReponsesDediees.valeursMobilieresPlacementBrut = valeursMobilieresPlacementBrut;
  const chargesConstateesAvance = resolveLignePatrimonialeReponse(state.chargesConstateesAvance, state.chargesConstateesAvanceMontantRaw);
  if (chargesConstateesAvance !== undefined) lignesSimplesReponsesDediees.chargesConstateesAvance = chargesConstateesAvance;
  const produitsConstatesAvance = resolveLignePatrimonialeReponse(state.produitsConstatesAvance, state.produitsConstatesAvanceMontantRaw);
  if (produitsConstatesAvance !== undefined) lignesSimplesReponsesDediees.produitsConstatesAvance = produitsConstatesAvance;
  const autresDettes = resolveLignePatrimonialeReponse(state.autresDettes, state.autresDettesMontantRaw);
  if (autresDettes !== undefined) lignesSimplesReponsesDediees.autresDettes = autresDettes;

  // Q4 = OUI : jamais de montant inventé — les postes concernés restent
  // absents (INCONNU) ; l'UI doit afficher un message de collecte différée.
  const lignesSimplesFusionnees: LignesSimplesInputs = {
    ...(state.autresElements === "NON" ? LIGNES_SIMPLES_NUL_CONFIRME : {}),
    ...lignesSimplesReponsesDediees,
  };
  const lignesSimples: LignesSimplesInputs | undefined =
    Object.keys(lignesSimplesFusionnees).length > 0 ? lignesSimplesFusionnees : undefined;

  // Voir le commentaire de TIERS_NUL_CONFIRME : même réponse Q4, deuxième
  // représentation exigée par checkBilanEquilibre().
  const tiers: TiersInputs | undefined = state.autresElements === "NON" ? TIERS_NUL_CONFIRME : undefined;

  // B-FAMILY-3 — famille B (068/072/164/166/172), entièrement indépendante
  // de Q4/lignesSimples/tiers ci-dessus : sa propre transformation pure vit
  // dans `ventilation-tiers-intake.ts` (jamais dupliquée ici). Clé omise
  // (jamais `ventilationTiers: undefined`) quand rien n'a été renseigné —
  // préserve exactement la forme historique de l'objet retourné (voir les
  // tests `patrimonial-intake.test.ts` existants, non modifiés).
  const ventilationTiers = buildVentilationTiersInputs(state.ventilationTiersIntake);

  return {
    tresorerie,
    compteExploitant,
    ran,
    subventionsInvestissement,
    lignesSimples,
    tiers,
    ...(ventilationTiers !== undefined ? { ventilationTiers } : {}),
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

  // P1-B1/P1-B2 — reconstruction des 7 réponses dédiées (014/040/064/080/092/174/175),
  // chacune lue depuis sa propre clé `lignesSimples`, indépendamment des
  // 6 autres et de Q4 (`autresElements` ci-dessus, qui ne couvre jamais ces
  // 7 clés — cf. `LIGNES_SIMPLES_NUL_CONFIRME`).
  const avancesAcomptesVerses = deriveOuiNonReponse(value.lignesSimples?.avancesAcomptesVerses);
  const autresImmobilisationsIncorporellesBrut = deriveOuiNonReponse(
    value.lignesSimples?.autresImmobilisationsIncorporellesBrut,
  );
  const immobilisationsFinancieresBrut = deriveOuiNonReponse(value.lignesSimples?.immobilisationsFinancieresBrut);
  const valeursMobilieresPlacementBrut = deriveOuiNonReponse(value.lignesSimples?.valeursMobilieresPlacementBrut);
  const chargesConstateesAvance = deriveOuiNonReponse(value.lignesSimples?.chargesConstateesAvance);
  const produitsConstatesAvance = deriveOuiNonReponse(value.lignesSimples?.produitsConstatesAvance);
  const autresDettes = deriveOuiNonReponse(value.lignesSimples?.autresDettes);

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
    avancesAcomptesVerses,
    avancesAcomptesVersesMontantRaw: deriveMontantRaw(value.lignesSimples?.avancesAcomptesVerses),
    autresImmobilisationsIncorporellesBrut,
    autresImmobilisationsIncorporellesBrutMontantRaw: deriveMontantRaw(
      value.lignesSimples?.autresImmobilisationsIncorporellesBrut,
    ),
    immobilisationsFinancieresBrut,
    immobilisationsFinancieresBrutMontantRaw: deriveMontantRaw(value.lignesSimples?.immobilisationsFinancieresBrut),
    valeursMobilieresPlacementBrut,
    valeursMobilieresPlacementBrutMontantRaw: deriveMontantRaw(value.lignesSimples?.valeursMobilieresPlacementBrut),
    chargesConstateesAvance,
    chargesConstateesAvanceMontantRaw: deriveMontantRaw(value.lignesSimples?.chargesConstateesAvance),
    produitsConstatesAvance,
    produitsConstatesAvanceMontantRaw: deriveMontantRaw(value.lignesSimples?.produitsConstatesAvance),
    autresDettes,
    autresDettesMontantRaw: deriveMontantRaw(value.lignesSimples?.autresDettes),
    ventilationTiersIntake: deriveVentilationTiersIntakeState(value.ventilationTiers),
  };
}

/** P1-B1 — même doctrine que `subvention`/`autresElements` ci-dessus, factorisée pour les 5 champs dédiés. */
function deriveOuiNonReponse(resolution: LignePatrimonialeInput | undefined): OuiNonReponse | undefined {
  if (resolution?.status === "NUL_CONFIRME") return "NON";
  if (resolution?.status === "DECLARE") return "OUI";
  return undefined;
}

function deriveMontantRaw(resolution: LignePatrimonialeInput | undefined): string {
  return resolution?.status === "DECLARE" ? String(resolution.montant) : "";
}
