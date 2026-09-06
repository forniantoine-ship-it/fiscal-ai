import { round2 } from "../f010/types";
import type {
  EmpruntsResolution,
  ReconciliationDecouvertTiersResolution,
  ReconciliationEmpruntsTiersResolution,
  TiersPosteResolution,
  TresorerieResolution,
} from "./types";

const TOLERANCE = 0.01;

/**
 * Réconciliation stricte emprunt canonique (F-011 → case 156) ↔ bucket
 * `tiers.dettes`.
 *
 * INTERDIT : déduire « séparés » parce que les montants diffèrent.
 * Seule une déclaration explicite (`EMPRUNT_SEPARE_…` / `EMPRUNT_INCLUS_…`)
 * tranche. Sinon → `EMPRUNT_PRESENCE_BUCKET_NON_RECONCILIEE` (blocage).
 *
 * `tiers.dettes` NUL_CONFIRME : le bucket est vide → l'emprunt ne peut pas y
 * être inclus → traité comme séparé (confirmation d'absence, pas une
 * déduction de montants).
 */
export function resolveReconciliationEmpruntsTiers(
  emprunts: EmpruntsResolution,
  dettes: TiersPosteResolution,
  declaration?: "EMPRUNT_SEPARE_ET_EXCLU_DU_BUCKET" | "EMPRUNT_INCLUS_DANS_BUCKET",
): ReconciliationEmpruntsTiersResolution {
  const crd = emprunts.etat === "DISPONIBLE" ? emprunts.totalCRD : undefined;
  const hasEmpruntCanonique = crd !== undefined && crd > TOLERANCE;

  if (!hasEmpruntCanonique) {
    return {
      etat: "AUCUN_EMPRUNT_CANONIQUE",
      contributionEmpruntEquilibre: crd !== undefined ? crd : 0,
      raison: "Aucun emprunt canonique (F-011 / CRD) à réconcilier avec tiers.dettes.",
      bloquant: false,
    };
  }

  const montantEmprunt = crd as number;

  // Bucket INCONNU : on ne invente pas 0 ; la contribution tiers bloque déjà.
  // La réconciliation signale non-arbitrable si on ne peut pas situer l'emprunt.
  if (dettes.status === "INCONNU") {
    return {
      etat: "EMPRUNT_PRESENCE_BUCKET_NON_RECONCILIEE",
      contributionEmpruntEquilibre: undefined,
      raison: `EMPRUNT_PRESENCE_BUCKET_NON_RECONCILIEE : emprunt canonique ${montantEmprunt} € présent et tiers.dettes INCONNU — impossible de savoir si le bucket (absent) inclurait l'emprunt ; INCONNU ≠ 0.`,
      bloquant: true,
    };
  }

  if (dettes.status === "NUL_CONFIRME") {
    return {
      etat: "EMPRUNT_SEPARE_ET_EXCLU_DU_BUCKET",
      contributionEmpruntEquilibre: montantEmprunt,
      raison: `Emprunt canonique ${montantEmprunt} € ; tiers.dettes NUL_CONFIRME (bucket vide) — emprunt nécessairement exclu du bucket, contribution 156 = ${montantEmprunt} €.`,
      bloquant: false,
    };
  }

  // dettes DECLARE
  if (declaration === "EMPRUNT_SEPARE_ET_EXCLU_DU_BUCKET") {
    return {
      etat: "EMPRUNT_SEPARE_ET_EXCLU_DU_BUCKET",
      contributionEmpruntEquilibre: montantEmprunt,
      raison: `Réconciliation explicite : emprunt ${montantEmprunt} € exclu de tiers.dettes (${dettes.montant} €) — contribution équilibre = bucket + emprunt (une fois chacun).`,
      bloquant: false,
    };
  }

  if (declaration === "EMPRUNT_INCLUS_DANS_BUCKET") {
    // Cohérence minimale : un bucket qui « inclut » l'emprunt ne peut pas être
    // strictement inférieur au CRD. Ce n'est PAS une déduction de séparation.
    if (round2(dettes.montant + TOLERANCE) < montantEmprunt) {
      return {
        etat: "EMPRUNT_PRESENCE_BUCKET_NON_RECONCILIEE",
        contributionEmpruntEquilibre: undefined,
        raison: `EMPRUNT_INCLUS_DANS_BUCKET déclaré mais tiers.dettes (${dettes.montant} €) < emprunt canonique (${montantEmprunt} €) — inclusion impossible ; blocage.`,
        bloquant: true,
      };
    }
    return {
      etat: "EMPRUNT_INCLUS_DANS_BUCKET",
      contributionEmpruntEquilibre: 0,
      raison: `Réconciliation explicite : emprunt ${montantEmprunt} € déjà inclus dans tiers.dettes (${dettes.montant} €) — pas de +${montantEmprunt} € supplémentaire à l'équilibre (case 156 reste alimentée par F-011).`,
      bloquant: false,
    };
  }

  // Aucune déclaration — INTERDIT de trancher via montants.
  return {
    etat: "EMPRUNT_PRESENCE_BUCKET_NON_RECONCILIEE",
    contributionEmpruntEquilibre: undefined,
    raison: `EMPRUNT_PRESENCE_BUCKET_NON_RECONCILIEE : emprunt canonique ${montantEmprunt} € et tiers.dettes DECLARE (${dettes.montant} €) sans réconciliation explicite. Une différence de montants ne prouve PAS que les sources sont séparées — blocage.`,
    bloquant: true,
  };
}

/**
 * Même doctrine pour le découvert bancaire (source canonique trésorerie → 156).
 */
export function resolveReconciliationDecouvertTiers(
  tresorerie: TresorerieResolution,
  dettes: TiersPosteResolution,
  declaration?: "DECOUVERT_SEPARE_ET_EXCLU_DU_BUCKET" | "DECOUVERT_INCLUS_DANS_BUCKET",
): ReconciliationDecouvertTiersResolution {
  const decouvert = tresorerie.decouvertDettePassif;
  const hasDecouvert = decouvert !== undefined && decouvert > TOLERANCE;

  if (!hasDecouvert) {
    return {
      etat: "AUCUN_DECOUVERT_CANONIQUE",
      contributionDecouvertEquilibre: 0,
      raison: "Aucun découvert canonique porté au passif à réconcilier avec tiers.dettes.",
      bloquant: false,
    };
  }

  const montantDecouvert = decouvert as number;

  if (dettes.status === "INCONNU") {
    return {
      etat: "DECOUVERT_PRESENCE_BUCKET_NON_RECONCILIEE",
      contributionDecouvertEquilibre: undefined,
      raison: `DECOUVERT_PRESENCE_BUCKET_NON_RECONCILIEE : découvert ${montantDecouvert} € et tiers.dettes INCONNU — INCONNU ≠ 0 ; blocage.`,
      bloquant: true,
    };
  }

  if (dettes.status === "NUL_CONFIRME") {
    return {
      etat: "DECOUVERT_SEPARE_ET_EXCLU_DU_BUCKET",
      contributionDecouvertEquilibre: montantDecouvert,
      raison: `Découvert ${montantDecouvert} € ; tiers.dettes NUL_CONFIRME — découvert exclu du bucket.`,
      bloquant: false,
    };
  }

  if (declaration === "DECOUVERT_SEPARE_ET_EXCLU_DU_BUCKET") {
    return {
      etat: "DECOUVERT_SEPARE_ET_EXCLU_DU_BUCKET",
      contributionDecouvertEquilibre: montantDecouvert,
      raison: `Réconciliation explicite : découvert ${montantDecouvert} € exclu de tiers.dettes (${dettes.montant} €).`,
      bloquant: false,
    };
  }

  if (declaration === "DECOUVERT_INCLUS_DANS_BUCKET") {
    if (round2(dettes.montant + TOLERANCE) < montantDecouvert) {
      return {
        etat: "DECOUVERT_PRESENCE_BUCKET_NON_RECONCILIEE",
        contributionDecouvertEquilibre: undefined,
        raison: `DECOUVERT_INCLUS_DANS_BUCKET déclaré mais tiers.dettes (${dettes.montant} €) < découvert (${montantDecouvert} €) — inclusion impossible.`,
        bloquant: true,
      };
    }
    return {
      etat: "DECOUVERT_INCLUS_DANS_BUCKET",
      contributionDecouvertEquilibre: 0,
      raison: `Réconciliation explicite : découvert ${montantDecouvert} € déjà inclus dans tiers.dettes — pas de second ajout.`,
      bloquant: false,
    };
  }

  return {
    etat: "DECOUVERT_PRESENCE_BUCKET_NON_RECONCILIEE",
    contributionDecouvertEquilibre: undefined,
    raison: `DECOUVERT_PRESENCE_BUCKET_NON_RECONCILIEE : découvert ${montantDecouvert} € et tiers.dettes DECLARE (${dettes.montant} €) sans réconciliation explicite — blocage.`,
    bloquant: true,
  };
}

/**
 * Correction R-02 — cohérence GLOBALE des inclusions dans `tiers.dettes`.
 *
 * Les resolvers unitaires vérifient chacun `bucket ≥ dette_i`. Ils n'empêchent
 * pas EMPRUNT_INCLUS + DECOUVERT_INCLUS avec un bucket qui ne couvre que l'un
 * des deux (ex. CRD 100k + découvert 5k, bucket 100k).
 *
 * Doctrine : Σ des dettes canoniques déclarées INCLUS ≤ bucket DECLARE.
 * Le montant ne tranche jamais SEPARE vs INCLUS — il ne fait que vérifier la
 * cohérence d'une inclusion déjà déclarée.
 *
 * Multi-emprunts : `montantEmpruntCanonique` est déjà Σ CRD (F-011).
 */
export function appliquerCoherenceInclusionConjointe(
  emprunts: ReconciliationEmpruntsTiersResolution,
  decouvert: ReconciliationDecouvertTiersResolution,
  dettes: TiersPosteResolution,
  montantEmpruntCanonique: number,
  montantDecouvertCanonique: number,
): {
  reconciliationEmpruntsTiers: ReconciliationEmpruntsTiersResolution;
  reconciliationDecouvertTiers: ReconciliationDecouvertTiersResolution;
} {
  if (emprunts.bloquant || decouvert.bloquant) {
    return { reconciliationEmpruntsTiers: emprunts, reconciliationDecouvertTiers: decouvert };
  }

  const empruntInclus = emprunts.etat === "EMPRUNT_INCLUS_DANS_BUCKET";
  const decouvertInclus = decouvert.etat === "DECOUVERT_INCLUS_DANS_BUCKET";
  if (!empruntInclus && !decouvertInclus) {
    return { reconciliationEmpruntsTiers: emprunts, reconciliationDecouvertTiers: decouvert };
  }

  // Inclusion conjointe (ou unitaire) ne se vérifie que sur un bucket DECLARE.
  // NUL_CONFIRME / INCONNU : les resolvers unitaires ont déjà tranché.
  if (dettes.status !== "DECLARE") {
    return { reconciliationEmpruntsTiers: emprunts, reconciliationDecouvertTiers: decouvert };
  }

  const partEmprunt = empruntInclus ? montantEmpruntCanonique : 0;
  const partDecouvert = decouvertInclus ? montantDecouvertCanonique : 0;
  const sommeIncluse = round2(partEmprunt + partDecouvert);

  if (round2(dettes.montant + TOLERANCE) >= sommeIncluse) {
    return { reconciliationEmpruntsTiers: emprunts, reconciliationDecouvertTiers: decouvert };
  }

  const raison =
    `EMPRUNT_DECOUVERT_INCLUS_SUPERIEURS_AU_BUCKET : somme des dettes canoniques déclarées INCLUS (${sommeIncluse} €` +
    ` = emprunt ${partEmprunt} € + découvert ${partDecouvert} €) > tiers.dettes (${dettes.montant} €)` +
    ` — inclusion conjointe impossible ; une comparaison séparée par dette est insuffisante ; blocage.`;

  return {
    reconciliationEmpruntsTiers: empruntInclus
      ? {
          etat: "EMPRUNT_PRESENCE_BUCKET_NON_RECONCILIEE",
          contributionEmpruntEquilibre: undefined,
          raison,
          bloquant: true,
        }
      : emprunts,
    reconciliationDecouvertTiers: decouvertInclus
      ? {
          etat: "DECOUVERT_PRESENCE_BUCKET_NON_RECONCILIEE",
          contributionDecouvertEquilibre: undefined,
          raison,
          bloquant: true,
        }
      : decouvert,
  };
}
