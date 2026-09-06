import { round2 } from "../f010/types";
import { gateTotalSurComposantes, type GateTotalComposantesResult } from "./lignes-simples";
import type {
  ConflitVentilation,
  EmpruntsResolution,
  LignePatrimonialeResolution,
  LignesSimplesResolution,
  NatureEconomique,
  PosteEconomiqueInput,
  TiersResolution,
  TresorerieResolution,
  VentilationTiersCases,
  VentilationTiersInputs,
  VentilationTiersResolution,
} from "./types";

/** Natures d'actif (créances / avances versées / CCA). */
const NATURES_ACTIF: ReadonlySet<NatureEconomique> = new Set([
  "LOYER_DU_PAR_LOCATAIRE",
  "ACOMPTE_VERSE_A_FOURNISSEUR",
  "AUTRE_CREANCE_ACTIVITE",
  "CHARGE_CONSTATEE_AVANCE",
]);

/** Natures de passif (dettes hors emprunt / découvert). */
const NATURES_PASSIF: ReadonlySet<NatureEconomique> = new Set([
  "FOURNISSEUR_NON_PAYE",
  "DETTE_FISCALE_OU_SOCIALE",
  "DEPOT_GARANTIE_LOCATAIRE",
  "LOYER_ENCAISSE_D_AVANCE",
  "ACOMPTE_RECU_SUR_COMMANDE",
]);

type CaseVentilableKey = keyof VentilationTiersCases;

const NATURE_VERS_CASE: Partial<Record<NatureEconomique, CaseVentilableKey>> = {
  LOYER_DU_PAR_LOCATAIRE: "clients",
  ACOMPTE_VERSE_A_FOURNISSEUR: "avancesAcomptesVerses",
  AUTRE_CREANCE_ACTIVITE: "autresCreances",
  CHARGE_CONSTATEE_AVANCE: "chargesConstateesAvance",
  FOURNISSEUR_NON_PAYE: "fournisseurs",
  DETTE_FISCALE_OU_SOCIALE: "dettesFiscalesSociales",
  DEPOT_GARANTIE_LOCATAIRE: "autresDettes",
  LOYER_ENCAISSE_D_AVANCE: "produitsConstatesAvance",
  ACOMPTE_RECU_SUR_COMMANDE: "avancesAcomptesRecus",
};

const CASE_LABEL: Record<CaseVentilableKey, string> = {
  avancesAcomptesVerses: "Avances et acomptes versés (case 064)",
  clients: "Clients et comptes rattachés (case 068)",
  autresCreances: "Autres créances (case 072)",
  chargesConstateesAvance: "Charges constatées d'avance (case 092)",
  avancesAcomptesRecus: "Avances et acomptes reçus (case 164)",
  fournisseurs: "Fournisseurs et comptes rattachés (case 166)",
  dettesFiscalesSociales: "Dettes fiscales et sociales (case 172)",
  comptesCourantsAssocies: "Comptes courants d'associés (case 173)",
  produitsConstatesAvance: "Produits constatés d'avance (case 174)",
  autresDettes: "Autres dettes (case 175)",
};

/** Natures refusées — sources canoniques distinctes (jamais ventilation tiers). */
const NATURES_INTERDITES = new Set(["EMPRUNT", "DECOUVERT_BANCAIRE", "DECOUVERT"]);

function inconnu(label: string): LignePatrimonialeResolution {
  return {
    status: "INCONNU",
    raison: `${label} : aucune nature économique classifiée pour cette case — absence ≠ zéro ; non ventilé.`,
  };
}

function declareSum(label: string, montant: number, nbPostes: number): LignePatrimonialeResolution {
  return {
    status: "DECLARE",
    montant,
    raison: `${label} : ${nbPostes} poste(s) économique(s) classifié(s) → ${montant} €.`,
  };
}

function estDeclare(res: LignePatrimonialeResolution): res is { status: "DECLARE"; montant: number; raison: string } {
  return res.status === "DECLARE";
}

/**
 * Résout la ventilation nature économique → cases 2033-A.
 *
 * - Ne projette JAMAIS `tiers.creances` / `tiers.dettes` vers une case.
 * - `NATURE_INCONNUE` reste non ventilée (jamais 072/175 par défaut).
 * - Case 173 = `NON_APPLICABLE` pour EI (doctrine déjà établie).
 * - EMPRUNT / DECOUVERT refusés (source canonique 156).
 */
export function resolveVentilationTiers(inputs?: VentilationTiersInputs): VentilationTiersResolution {
  const sommes: Partial<Record<CaseVentilableKey, { montant: number; count: number }>> = {};
  const montantsNonVentiles: VentilationTiersResolution["montantsNonVentiles"] = [];
  const conflits: ConflitVentilation[] = [];

  for (const poste of inputs?.postes ?? []) {
    const natureBrute = poste.nature as string;
    if (NATURES_INTERDITES.has(natureBrute)) {
      conflits.push({
        code: "NATURE_INTERDITE",
        raison: `Poste « ${poste.libelle ?? natureBrute} » (${poste.montant} €) : nature ${natureBrute} interdite en ventilation tiers — source canonique case 156 (F-011 / trésorerie.découvert), jamais un bucket tiers.`,
      });
      continue;
    }

    if (poste.nature === "NATURE_INCONNUE") {
      const montant = round2(poste.montant);
      montantsNonVentiles.push({
        montant,
        libelle: poste.libelle,
        raison: `Nature économique inconnue (${montant} €) — non ventilée vers aucune case ; jamais transformée en 0 ni en « autre créance/dette » par défaut.`,
      });
      conflits.push({
        code: "NATURE_INCONNUE_NON_VENTILEE",
        raison: `Montant ${montant} € à nature inconnue : bloque une projection Cerfa sûre tant que la classification n'est pas établie.`,
      });
      continue;
    }

    const caseKey = NATURE_VERS_CASE[poste.nature];
    if (!caseKey) {
      conflits.push({
        code: "NATURE_INTERDITE",
        raison: `Nature non reconnue : ${String(poste.nature)}.`,
      });
      continue;
    }

    const montant = round2(poste.montant);
    const prev = sommes[caseKey] ?? { montant: 0, count: 0 };
    sommes[caseKey] = { montant: round2(prev.montant + montant), count: prev.count + 1 };
  }

  const caseOrInconnu = (key: CaseVentilableKey): LignePatrimonialeResolution => {
    const s = sommes[key];
    if (!s) return inconnu(CASE_LABEL[key]);
    return declareSum(CASE_LABEL[key], s.montant, s.count);
  };

  const cases: VentilationTiersCases = {
    avancesAcomptesVerses: caseOrInconnu("avancesAcomptesVerses"),
    clients: caseOrInconnu("clients"),
    autresCreances: caseOrInconnu("autresCreances"),
    chargesConstateesAvance: caseOrInconnu("chargesConstateesAvance"),
    avancesAcomptesRecus: caseOrInconnu("avancesAcomptesRecus"),
    fournisseurs: caseOrInconnu("fournisseurs"),
    dettesFiscalesSociales: caseOrInconnu("dettesFiscalesSociales"),
    // Doctrine EI : comptes courants d'associés hors périmètre — seul NON_APPLICABLE structurel de cette ventilation.
    comptesCourantsAssocies: {
      status: "NON_APPLICABLE",
      montant: 0,
      raison: "Comptes courants d'associés (case 173) : concept sociétaire — NON_APPLICABLE pour une entreprise individuelle LMNP.",
    },
    produitsConstatesAvance: caseOrInconnu("produitsConstatesAvance"),
    autresDettes: caseOrInconnu("autresDettes"),
  };

  return {
    cases,
    montantsNonVentiles,
    conflits,
    projectionFiable: montantsNonVentiles.length === 0 && conflits.length === 0,
  };
}

function ventilationADesCreancesDeclarees(v: VentilationTiersResolution): boolean {
  return (
    estDeclare(v.cases.clients) ||
    estDeclare(v.cases.autresCreances) ||
    estDeclare(v.cases.avancesAcomptesVerses) ||
    estDeclare(v.cases.chargesConstateesAvance)
  );
}

function ventilationADesDettesDeclarees(v: VentilationTiersResolution): boolean {
  return (
    estDeclare(v.cases.fournisseurs) ||
    estDeclare(v.cases.dettesFiscalesSociales) ||
    estDeclare(v.cases.avancesAcomptesRecus) ||
    estDeclare(v.cases.produitsConstatesAvance) ||
    estDeclare(v.cases.autresDettes)
  );
}

/**
 * Détecte les doubles comptages entre :
 * - buckets P0 `tiers.*` et ventilation classifiée (uniquement si montants divergent) ;
 * - lignes simples P1-B.2 et même case ventilée ;
 * - sources canoniques emprunt (156) / découvert (156) vs buckets opaques.
 *
 * P1-B.4 : bucket DECLARE == Σ ventilation n'est PAS un conflit — c'est une
 * couverture complète (une seule contribution à l'équilibre). Le conflit
 * `BUCKET_TIERS_ET_VENTILATION` ne reste que pour divergence / partielle
 * signalée ici ; le détail de couverture vit dans
 * `contribution-tiers-equilibre.ts`.
 *
 * Ne modifie aucune valeur : ajoute des conflits explicites.
 */
export function detecterConflitsDoubleComptage(input: {
  ventilation: VentilationTiersResolution;
  tiers: TiersResolution;
  /** Conservé pour signature stable ; réconciliation emprunt → `reconciliation-emprunts-tiers.ts`. */
  emprunts: EmpruntsResolution;
  /** Conservé pour signature stable ; réconciliation découvert → `reconciliation-emprunts-tiers.ts`. */
  tresorerie: TresorerieResolution;
  lignesSimples?: LignesSimplesResolution;
}): ConflitVentilation[] {
  void input.emprunts;
  void input.tresorerie;
  const conflits: ConflitVentilation[] = [...input.ventilation.conflits];

  const sommeCreances = round2(
    (estDeclare(input.ventilation.cases.avancesAcomptesVerses) ? input.ventilation.cases.avancesAcomptesVerses.montant : 0) +
      (estDeclare(input.ventilation.cases.clients) ? input.ventilation.cases.clients.montant : 0) +
      (estDeclare(input.ventilation.cases.autresCreances) ? input.ventilation.cases.autresCreances.montant : 0) +
      (estDeclare(input.ventilation.cases.chargesConstateesAvance) ? input.ventilation.cases.chargesConstateesAvance.montant : 0),
  );
  const sommeDettes = round2(
    (estDeclare(input.ventilation.cases.avancesAcomptesRecus) ? input.ventilation.cases.avancesAcomptesRecus.montant : 0) +
      (estDeclare(input.ventilation.cases.fournisseurs) ? input.ventilation.cases.fournisseurs.montant : 0) +
      (estDeclare(input.ventilation.cases.dettesFiscalesSociales) ? input.ventilation.cases.dettesFiscalesSociales.montant : 0) +
      (estDeclare(input.ventilation.cases.produitsConstatesAvance) ? input.ventilation.cases.produitsConstatesAvance.montant : 0) +
      (estDeclare(input.ventilation.cases.autresDettes) ? input.ventilation.cases.autresDettes.montant : 0),
  );

  if (ventilationADesCreancesDeclarees(input.ventilation) && input.tiers.creances.status === "DECLARE") {
    if (Math.abs(round2(sommeCreances - input.tiers.creances.montant)) > 0.01) {
      conflits.push({
        code: "BUCKET_TIERS_ET_VENTILATION",
        raison: `tiers.creances DECLARE (${input.tiers.creances.montant} €) diverge de la Σ ventilation créances (${sommeCreances} €) — jamais bucket+ventilation ; couverture partielle ou supérieure à résoudre.`,
      });
    }
  }

  if (ventilationADesCreancesDeclarees(input.ventilation) && input.tiers.creances.status === "NUL_CONFIRME" && sommeCreances > 0.01) {
    conflits.push({
      code: "BUCKET_TIERS_ET_VENTILATION",
      raison: `tiers.creances NUL_CONFIRME incompatible avec ventilation créances DECLARE (${sommeCreances} €).`,
    });
  }

  if (ventilationADesDettesDeclarees(input.ventilation) && input.tiers.dettes.status === "DECLARE") {
    if (Math.abs(round2(sommeDettes - input.tiers.dettes.montant)) > 0.01) {
      conflits.push({
        code: "BUCKET_TIERS_ET_VENTILATION",
        raison: `tiers.dettes DECLARE (${input.tiers.dettes.montant} €) diverge de la Σ ventilation dettes (${sommeDettes} €) — jamais bucket+ventilation.`,
      });
    }
  }

  if (ventilationADesDettesDeclarees(input.ventilation) && input.tiers.dettes.status === "NUL_CONFIRME" && sommeDettes > 0.01) {
    conflits.push({
      code: "BUCKET_TIERS_ET_VENTILATION",
      raison: `tiers.dettes NUL_CONFIRME incompatible avec ventilation dettes DECLARE (${sommeDettes} €).`,
    });
  }

  // Emprunt / découvert ↔ bucket : réconciliation stricte dans
  // `reconciliation-emprunts-tiers.ts` (plus un conflit soft informatif).

  if (input.lignesSimples) {
    const paires: Array<{
      simple: LignePatrimonialeResolution;
      ventile: LignePatrimonialeResolution;
      caseId: string;
    }> = [
      { simple: input.lignesSimples.avancesAcomptesVerses, ventile: input.ventilation.cases.avancesAcomptesVerses, caseId: "064" },
      { simple: input.lignesSimples.chargesConstateesAvance, ventile: input.ventilation.cases.chargesConstateesAvance, caseId: "092" },
      { simple: input.lignesSimples.produitsConstatesAvance, ventile: input.ventilation.cases.produitsConstatesAvance, caseId: "174" },
      { simple: input.lignesSimples.autresDettes, ventile: input.ventilation.cases.autresDettes, caseId: "175" },
    ];
    for (const { simple, ventile, caseId } of paires) {
      if (!estDeclare(simple) || !estDeclare(ventile)) continue;
      const montantSimple = simple.montant;
      const montantVentile = ventile.montant;
      if (Math.abs(round2(montantSimple - montantVentile)) > 0.01) {
        conflits.push({
          code: "LIGNE_SIMPLE_ET_VENTILATION",
          raison: `Case ${caseId} : lignesSimples DECLARE (${montantSimple} €) et ventilation DECLARE (${montantVentile} €) divergent — une seule source canonique par case, jamais de somme silencieuse.`,
        });
      }
    }
  }

  return conflits;
}

/**
 * Applique les conflits de double comptage sur une résolution déjà calculée
 * (met à jour `conflits` + `projectionFiable`).
 */
export function appliquerConflitsVentilation(
  ventilation: VentilationTiersResolution,
  extras: ConflitVentilation[],
): VentilationTiersResolution {
  // Évite de dupliquer les conflits déjà portés par resolveVentilationTiers.
  const existants = new Set(ventilation.conflits.map((c) => c.code + c.raison));
  const ajoutes = extras.filter((c) => !existants.has(c.code + c.raison));
  const conflits = [...ventilation.conflits, ...ajoutes];
  return {
    ...ventilation,
    conflits,
    projectionFiable: ventilation.montantsNonVentiles.length === 0 && conflits.length === 0,
  };
}

const TOLERANCE_LIGNE_SIMPLE_VENTILATION = 0.01;

/**
 * G2 — réconciliation `lignesSimples` ↔ `ventilationTiers` pour la
 * publication d'une case individuelle (064/092/174/175). Reprend
 * exactement la doctrine déjà établie par `gateTotal096AvecVentilation` /
 * `gateTotal176AvecVentilation` (ventilation prioritaire si DECLARE, repli
 * sur `lignesSimples` sinon) — étendue ici à une case publiée seule plutôt
 * qu'à un total agrégé, sans changer la règle elle-même.
 *
 * Deux DECLARE qui divergent ne sont JAMAIS sommés ni arbitrés : la case
 * reste `INCONNU` (bloquée), une seule source canonique par case (même
 * principe que `detecterConflitsDoubleComptage`, code `LIGNE_SIMPLE_ET_VENTILATION`).
 *
 * Limite connue, volontairement non traitée ici (hors périmètre G2) : si
 * `ventilee` est DECLARE et `ligneSimple` est `NUL_CONFIRME` (absence
 * confirmée), la ventilation reste prioritaire sans détection de
 * contradiction — même limite déjà présente dans
 * `detecterConflitsDoubleComptage`, qui ne compare que deux DECLARE.
 */
export function resolveCaseAvecVentilationPrioritaire(
  caseId: string,
  ligneSimple: LignePatrimonialeResolution,
  ventilee: LignePatrimonialeResolution,
): LignePatrimonialeResolution {
  if (ventilee.status === "DECLARE" && ligneSimple.status === "DECLARE") {
    const delta = round2(ventilee.montant - ligneSimple.montant);
    if (Math.abs(delta) > TOLERANCE_LIGNE_SIMPLE_VENTILATION) {
      return {
        status: "INCONNU",
        raison: `Case ${caseId} : lignesSimples DECLARE (${ligneSimple.montant} €) et ventilation DECLARE (${ventilee.montant} €) divergent — une seule source canonique par case, jamais de somme silencieuse ni de choix arbitraire. Publication bloquée tant que l'écart n'est pas résolu.`,
      };
    }
  }
  if (ventilee.status === "DECLARE") {
    return ventilee;
  }
  return ligneSimple;
}

/** Gate 096 élargi P1-B.3 : composantes ventilées 064/068/072/080/092 (+ stocks hors jalon). */
export function gateTotal096AvecVentilation(
  lignesSimples: LignesSimplesResolution,
  ventilation: VentilationTiersResolution,
): GateTotalComposantesResult {
  // 064/092 : préférence ventilation si DECLARE, sinon lignesSimples.
  const case064 = estDeclare(ventilation.cases.avancesAcomptesVerses)
    ? ventilation.cases.avancesAcomptesVerses
    : lignesSimples.avancesAcomptesVerses;
  const case092 = estDeclare(ventilation.cases.chargesConstateesAvance)
    ? ventilation.cases.chargesConstateesAvance
    : lignesSimples.chargesConstateesAvance;

  return gateTotalSurComposantes("096", "Total II — Actif circulant (brut)", [
    { caseId: "064", resolution: case064 },
    { caseId: "068", resolution: ventilation.cases.clients },
    { caseId: "072", resolution: ventilation.cases.autresCreances },
    { caseId: "080", resolution: lignesSimples.valeursMobilieresPlacementBrut },
    { caseId: "092", resolution: case092 },
  ]);
}

/** Gate 176 élargi P1-B.3 : 164/166/172/173/174/175 (+ 156 hors gate composantes). */
export function gateTotal176AvecVentilation(
  lignesSimples: LignesSimplesResolution,
  ventilation: VentilationTiersResolution,
): GateTotalComposantesResult {
  const case174 = estDeclare(ventilation.cases.produitsConstatesAvance)
    ? ventilation.cases.produitsConstatesAvance
    : lignesSimples.produitsConstatesAvance;
  const case175 = estDeclare(ventilation.cases.autresDettes)
    ? ventilation.cases.autresDettes
    : lignesSimples.autresDettes;

  return gateTotalSurComposantes("176", "Total III — Dettes", [
    { caseId: "164", resolution: ventilation.cases.avancesAcomptesRecus },
    { caseId: "166", resolution: ventilation.cases.fournisseurs },
    { caseId: "172", resolution: ventilation.cases.dettesFiscalesSociales },
    { caseId: "173", resolution: ventilation.cases.comptesCourantsAssocies },
    { caseId: "174", resolution: case174 },
    { caseId: "175", resolution: case175 },
  ]);
}

/** Helpers exportés pour tests / UX future. */
export function natureEstActif(nature: NatureEconomique): boolean {
  return NATURES_ACTIF.has(nature);
}

export function natureEstPassif(nature: NatureEconomique): boolean {
  return NATURES_PASSIF.has(nature);
}

export function caseCerfaPourNature(nature: NatureEconomique): string | undefined {
  const map: Partial<Record<NatureEconomique, string>> = {
    LOYER_DU_PAR_LOCATAIRE: "068",
    ACOMPTE_VERSE_A_FOURNISSEUR: "064",
    AUTRE_CREANCE_ACTIVITE: "072",
    CHARGE_CONSTATEE_AVANCE: "092",
    FOURNISSEUR_NON_PAYE: "166",
    DETTE_FISCALE_OU_SOCIALE: "172",
    DEPOT_GARANTIE_LOCATAIRE: "175",
    LOYER_ENCAISSE_D_AVANCE: "174",
    ACOMPTE_RECU_SUR_COMMANDE: "164",
  };
  return map[nature];
}

/** Ré-export utile pour construire un poste de test. */
export type { PosteEconomiqueInput };
