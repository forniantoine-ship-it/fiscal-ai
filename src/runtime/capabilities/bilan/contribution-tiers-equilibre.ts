import { round2 } from "../f010/types";
import type {
  ContributionCoteTiers,
  ContributionTiersEquilibre,
  CouvertureTiersEtat,
  LignePatrimonialeResolution,
  TiersPosteResolution,
  VentilationTiersResolution,
} from "./types";

const TOLERANCE = 0.01;

/**
 * Conflits P1-B.3 qui bloquent l'équilibre (double comptage prouvé ou
 * classification impossible). Emprunt/découvert ↔ bucket : réconciliation
 * stricte dans `reconciliation-emprunts-tiers.ts` (plus informatif soft).
 */
const CONFLITS_BLOQUANTS_EQUILIBRE = new Set([
  "NATURE_INTERDITE",
  "NATURE_INCONNUE_NON_VENTILEE",
  "LIGNE_SIMPLE_ET_VENTILATION",
  "BUCKET_TIERS_ET_VENTILATION",
]);

function montantDeclare(res: LignePatrimonialeResolution): number {
  return res.status === "DECLARE" ? res.montant : 0;
}

/** Σ créances / avances ventilées (064+068+072+092 DECLARE uniquement). */
export function sommeCreancesVentilees(v: VentilationTiersResolution): number {
  return round2(
    montantDeclare(v.cases.avancesAcomptesVerses) +
      montantDeclare(v.cases.clients) +
      montantDeclare(v.cases.autresCreances) +
      montantDeclare(v.cases.chargesConstateesAvance),
  );
}

/** Σ dettes ventilées hors 156 (164+166+172+174+175 ; 173 NA = 0). */
export function sommeDettesVentilees(v: VentilationTiersResolution): number {
  return round2(
    montantDeclare(v.cases.avancesAcomptesRecus) +
      montantDeclare(v.cases.fournisseurs) +
      montantDeclare(v.cases.dettesFiscalesSociales) +
      montantDeclare(v.cases.produitsConstatesAvance) +
      montantDeclare(v.cases.autresDettes),
  );
}

function aDesMontantsVentilesDeclare(somme: number, ventilation: VentilationTiersResolution, cote: "creances" | "dettes"): boolean {
  if (somme > TOLERANCE) return true;
  // Un DECLARE à 0 compte comme présence de ventilation (rare mais explicite).
  if (cote === "creances") {
    return (
      ventilation.cases.avancesAcomptesVerses.status === "DECLARE" ||
      ventilation.cases.clients.status === "DECLARE" ||
      ventilation.cases.autresCreances.status === "DECLARE" ||
      ventilation.cases.chargesConstateesAvance.status === "DECLARE"
    );
  }
  return (
    ventilation.cases.avancesAcomptesRecus.status === "DECLARE" ||
    ventilation.cases.fournisseurs.status === "DECLARE" ||
    ventilation.cases.dettesFiscalesSociales.status === "DECLARE" ||
    ventilation.cases.produitsConstatesAvance.status === "DECLARE" ||
    ventilation.cases.autresDettes.status === "DECLARE"
  );
}

function resoudreCote(
  label: string,
  bucket: TiersPosteResolution,
  sommeVentilee: number,
  ventilationPresente: boolean,
  montantsNonVentilesSurCote: number,
): ContributionCoteTiers {
  // Nature inconnue côté postes : jamais une couverture complète.
  if (montantsNonVentilesSurCote > TOLERANCE) {
    return {
      etat: "INCOHERENTE",
      sommeVentilee,
      source: "AUCUNE",
      resteNonVentile: undefined,
      raison: `${label} : montant(s) à nature inconnue (${montantsNonVentilesSurCote} €) — non classifiés, jamais 0 ni dumpés en « autre » ; équilibre bloqué.`,
    };
  }

  if (!ventilationPresente) {
    // --- A : aucune ventilation → bucket P0 ---
    if (bucket.status === "INCONNU") {
      return {
        etat: "NON_ARBITRABLE",
        sommeVentilee: 0,
        source: "AUCUNE",
        raison: `${label} : bucket INCONNU et aucune ventilation — absence ≠ zéro.`,
      };
    }
    return {
      etat: "BUCKET_SEUL",
      montantRetenu: bucket.montant,
      resteNonVentile: 0,
      sommeVentilee: 0,
      source: "BUCKET",
      raison: `${label} : aucune ventilation classifiée — contribution = bucket P0 (${bucket.montant} €, statut ${bucket.status}).`,
    };
  }

  // Ventilation présente (au moins un DECLARE).
  if (bucket.status === "INCONNU") {
    // --- H : bucket INCONNU + ventilation connue → non arbitrable ---
    return {
      etat: "NON_ARBITRABLE",
      sommeVentilee,
      source: "AUCUNE",
      raison: `${label} : ventilation DECLARE (${sommeVentilee} €) mais bucket INCONNU — impossible de savoir si la ventilation est complète ; pas de faux zéro sur le reste.`,
    };
  }

  if (bucket.status === "NUL_CONFIRME") {
    if (sommeVentilee > TOLERANCE) {
      // --- F : NUL_CONFIRME + ventilation DECLARE ---
      return {
        etat: "INCOHERENTE",
        sommeVentilee,
        source: "AUCUNE",
        raison: `${label} : bucket NUL_CONFIRME (0) incompatible avec ventilation DECLARE (${sommeVentilee} €).`,
      };
    }
    // Ventilation DECLARE à 0 + NUL → cohérent, contribution 0.
    return {
      etat: "VENTILATION_COMPLETE",
      montantRetenu: 0,
      resteNonVentile: 0,
      sommeVentilee: 0,
      source: "VENTILATION",
      raison: `${label} : bucket nul confirmé et ventilation nulle — contribution 0.`,
    };
  }

  // bucket DECLARE
  const bucketMontant = bucket.montant;
  const delta = round2(sommeVentilee - bucketMontant);

  if (Math.abs(delta) <= TOLERANCE) {
    // --- B : complète et cohérente ---
    return {
      etat: "VENTILATION_COMPLETE",
      montantRetenu: sommeVentilee,
      resteNonVentile: 0,
      sommeVentilee,
      source: "VENTILATION",
      raison: `${label} : ventilation complète et cohérente avec le bucket (${sommeVentilee} €) — une seule contribution, pas bucket+ventilation.`,
    };
  }

  if (delta < -TOLERANCE) {
    // --- C : partielle ---
    const reste = round2(bucketMontant - sommeVentilee);
    return {
      etat: "VENTILATION_PARTIELLE",
      sommeVentilee,
      resteNonVentile: reste,
      source: "AUCUNE",
      raison: `${label} : ventilation partielle (${sommeVentilee} €) sur bucket ${bucketMontant} € — reste non ventilé ${reste} € = INCONNU, jamais additionné ni zéro. Équilibre bloqué.`,
    };
  }

  // --- D : ventilation > bucket ---
  return {
    etat: "VENTILATION_SUPERIEURE",
    sommeVentilee,
    resteNonVentile: undefined,
    source: "AUCUNE",
    raison: `${label} : ventilation (${sommeVentilee} €) > bucket (${bucketMontant} €) — incohérence, aucune soustraction automatique.`,
  };
}

/**
 * Résout la contribution unique créances/dettes à l'équilibre patrimonial.
 *
 * Doctrine P1-B.4 :
 * - P1-B.3 = montants classifiés seulement (pas l'intégralité implicite du bucket) ;
 * - jamais bucket + ventilation ;
 * - partielle / supérieure / incohérente / non arbitrable → blocage ;
 * - buckets P0 conservés quand aucune ventilation DECLARE.
 */
export function resolveContributionTiersEquilibre(
  tiers: { creances: TiersPosteResolution; dettes: TiersPosteResolution },
  ventilation: VentilationTiersResolution,
): ContributionTiersEquilibre {
  const sommeCreances = sommeCreancesVentilees(ventilation);
  const sommeDettes = sommeDettesVentilees(ventilation);
  const ventCreances = aDesMontantsVentilesDeclare(sommeCreances, ventilation, "creances");
  const ventDettes = aDesMontantsVentilesDeclare(sommeDettes, ventilation, "dettes");

  // montantsNonVentiles : non affectés à un côté créance/dette — bloquent les deux
  // si présents (nature inconnue globale).
  const nonVentiles = round2(ventilation.montantsNonVentiles.reduce((a, m) => a + m.montant, 0));

  const creances = resoudreCote("Créances", tiers.creances, sommeCreances, ventCreances, nonVentiles);
  const dettes = resoudreCote("Dettes", tiers.dettes, sommeDettes, ventDettes, nonVentiles);

  const raisonsBlocage: string[] = [];

  for (const conflit of ventilation.conflits) {
    if (CONFLITS_BLOQUANTS_EQUILIBRE.has(conflit.code)) {
      raisonsBlocage.push(conflit.raison);
    }
  }

  const etatsBloquants: CouvertureTiersEtat[] = [
    "VENTILATION_PARTIELLE",
    "VENTILATION_SUPERIEURE",
    "INCOHERENTE",
    "NON_ARBITRABLE",
  ];

  if (etatsBloquants.includes(creances.etat)) raisonsBlocage.push(creances.raison);
  if (etatsBloquants.includes(dettes.etat)) raisonsBlocage.push(dettes.raison);

  if (creances.montantRetenu === undefined && !etatsBloquants.includes(creances.etat) && creances.etat !== "BUCKET_SEUL" && creances.etat !== "VENTILATION_COMPLETE") {
    raisonsBlocage.push(creances.raison);
  }
  if (dettes.montantRetenu === undefined && !etatsBloquants.includes(dettes.etat) && dettes.etat !== "BUCKET_SEUL" && dettes.etat !== "VENTILATION_COMPLETE") {
    raisonsBlocage.push(dettes.raison);
  }

  const utilisablePourEquilibre =
    raisonsBlocage.length === 0 && creances.montantRetenu !== undefined && dettes.montantRetenu !== undefined;

  return { creances, dettes, utilisablePourEquilibre, raisonsBlocage };
}
