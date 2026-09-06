import { round2 } from "../f010/types";
import type { TresorerieInputs, TresorerieResolution } from "./types";

const TOLERANCE_RECONCILIATION = 0.01;

/**
 * Correction P0-2 — un découvert bancaire ne rejoint le passif QUE si
 * l'utilisateur en a explicitement reconnu la dette (`decouvertDetteReconnue`)
 * et que ce montant correspond au découvert constaté. Sans cette
 * correspondance, `decouvertDettePassif` reste `undefined` : le découvert
 * existe (`decouvertBancaire`) mais n'a pas de destination passif reconnue —
 * `check-bilan-equilibre.ts` bloque alors la génération (DONNEE_MANQUANTE),
 * jamais un passif inventé ni un découvert silencieusement omis.
 */
function resolveDecouvert(decouvertBancaire: number, detteReconnue: number | undefined): { decouvertDettePassif?: number; raisonSuffixe: string } {
  if (detteReconnue === undefined) {
    return {
      raisonSuffixe:
        " Aucune dette de passif reconnue pour ce découvert — génération bloquée tant qu'il n'est pas explicitement rattaché à un poste de passif (voir §4 du contrat P0).",
    };
  }
  const detteArrondie = round2(detteReconnue);
  if (Math.abs(round2(detteArrondie - decouvertBancaire)) > TOLERANCE_RECONCILIATION) {
    return {
      raisonSuffixe: ` Dette reconnue (${detteArrondie} €) ne correspond pas au découvert constaté (${decouvertBancaire} €) — non porté au passif tant que l'écart n'est pas résolu.`,
    };
  }
  return {
    decouvertDettePassif: decouvertBancaire,
    raisonSuffixe: " Dette de découvert reconnue explicitement par l'utilisateur et portée au passif.",
  };
}

/**
 * Résout l'état de trésorerie professionnelle (cases 084/086) à partir d'une
 * saisie explicite — JAMAIS par différence produits/charges, JAMAIS comme le
 * reste nécessaire pour équilibrer le bilan (voir contrat P0 §2/§23).
 *
 * Trois modes, mutuellement exclusifs :
 *  - DEDIE  : un compte professionnel identifié existe ; on connaît (au
 *             minimum) son solde de clôture, éventuellement son ouverture et
 *             ses flux pour une reconstruction croisée.
 *  - MIXTE  : pas de compte dédié — on demande explicitement si une
 *             trésorerie professionnelle est identifiable à la clôture.
 *             "pas de compte dédié" ne signifie JAMAIS "084 = 0" : seule une
 *             réponse EXPLICITE (même "aucune trésorerie identifiable")
 *             produit une valeur.
 *  - INCONNU: aucune information suffisante — bloque la génération.
 *
 * Un découvert bancaire (`closingCash < 0`) n'est JAMAIS placé en 084
 * négatif : il est isolé dans `decouvertBancaire`, à orienter vers un poste
 * de dette par l'appelant (§4 du contrat).
 */
export function resolveTresorerie(inputs: TresorerieInputs): TresorerieResolution {
  if (inputs.bankMode === "INCONNU") {
    return {
      etat: "TRESORERIE_INCONNUE",
      raison:
        "Aucun mode de trésorerie renseigné (ni compte dédié, ni réponse mixte) — génération de la 2033-A bloquée tant que le dossier n'indique pas explicitement la situation de trésorerie professionnelle.",
    };
  }

  if (inputs.bankMode === "MIXTE") {
    if (inputs.declaredProfessionalCash === undefined) {
      return {
        etat: "TRESORERIE_INCONNUE",
        raison:
          "Compte mixte : la question « existe-t-il une trésorerie professionnelle identifiable à la clôture ? » n'a pas encore de réponse. « Pas de compte dédié » ne signifie jamais « 084 = 0 » — une réponse explicite est requise.",
      };
    }
    if (inputs.declaredProfessionalCash === 0) {
      return {
        etat: "TRESORERIE_NULLE_DECLAREE",
        clotureRetenue: 0,
        raison:
          "Compte mixte : absence de trésorerie professionnelle identifiable CONFIRMÉE EXPLICITEMENT par l'utilisateur — 084 = 086 = 0 est une réponse positive à la question posée, jamais une valeur par défaut.",
      };
    }
    if (inputs.declaredProfessionalCash < 0) {
      const decouvertBancaire = round2(Math.abs(inputs.declaredProfessionalCash));
      const { decouvertDettePassif, raisonSuffixe } = resolveDecouvert(decouvertBancaire, inputs.decouvertDetteReconnue);
      return {
        etat: "TRESORERIE_NULLE_DECLAREE",
        clotureRetenue: 0,
        decouvertBancaire,
        decouvertDettePassif,
        raison: `Compte mixte : la trésorerie professionnelle déclarée est négative (découvert) — jamais placée en 084 négatif, isolée comme découvert bancaire.${raisonSuffixe}`,
      };
    }
    return {
      etat: "TRESORERIE_DECLAREE",
      clotureRetenue: round2(inputs.declaredProfessionalCash),
      raison: "Compte mixte : montant de trésorerie professionnelle déclaré explicitement par l'utilisateur.",
    };
  }

  // DEDIE
  if (inputs.closingCash === undefined) {
    return {
      etat: "TRESORERIE_INCONNUE",
      raison: "Compte dédié annoncé mais aucun solde de clôture renseigné.",
    };
  }

  if (inputs.closingCash < 0) {
    const decouvertBancaire = round2(Math.abs(inputs.closingCash));
    const { decouvertDettePassif, raisonSuffixe } = resolveDecouvert(decouvertBancaire, inputs.decouvertDetteReconnue);
    return {
      etat: "TRESORERIE_NULLE_DECLAREE",
      clotureRetenue: 0,
      decouvertBancaire,
      decouvertDettePassif,
      raison: `Compte dédié : le solde de clôture relevé est négatif (découvert bancaire) — jamais placé en 084 négatif, isolé comme découvert bancaire.${raisonSuffixe}`,
    };
  }

  const peutReconcilier =
    inputs.openingCash !== undefined && inputs.encaissementsConnus !== undefined && inputs.decaissementsConnus !== undefined;

  if (peutReconcilier) {
    const reconstitue = round2((inputs.openingCash as number) + (inputs.encaissementsConnus as number) - (inputs.decaissementsConnus as number));
    const ecart = round2(reconstitue - inputs.closingCash);
    if (Math.abs(ecart) > TOLERANCE_RECONCILIATION) {
      return {
        etat: "TRESORERIE_DIVERGENTE",
        ecart,
        raison: `Écart non expliqué entre le solde de clôture déclaré (${inputs.closingCash} €) et la reconstruction ouverture + encaissements − décaissements (${reconstitue} €) : ${ecart} €. Génération bloquée tant que l'écart n'est pas résolu ou documenté.`,
      };
    }
    return {
      etat: "TRESORERIE_COMPLETE",
      clotureRetenue: round2(inputs.closingCash),
      ecart: 0,
      raison: "Compte dédié : solde de clôture confirmé par reconstruction ouverture + encaissements − décaissements, aucun écart.",
    };
  }

  return {
    etat: "TRESORERIE_DECLAREE",
    clotureRetenue: round2(inputs.closingCash),
    raison: "Compte dédié : solde de clôture déclaré (relevé) ; données de flux insuffisantes pour une reconstruction croisée — retenu tel quel, jamais recalculé.",
  };
}
