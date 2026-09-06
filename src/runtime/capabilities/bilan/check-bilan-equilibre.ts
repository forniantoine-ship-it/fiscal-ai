import { round2 } from "../f010/types";
import type { BilanEquilibreResult, PatrimonialState } from "./types";

/**
 * Contrôle central, bloquant, avant toute génération 2033-A (contrat P0
 * §16/§17). Aucun poste n'est jamais fabriqué ici pour faire passer
 * l'invariant — ce module ne fait que CONSTATER, jamais ajuster.
 *
 * IMPORTANT — précision géométrique vérifiée sur le Cerfa officiel 2033-A-SD
 * 2026 (audit normatif dédié, mesure directe des positions de case) : la
 * case 112 (« Total général actif ») n'est PAS le total actif NET — c'est le
 * total de la colonne « Amortissements — Provisions » (colonne 2 sur 3 :
 * Brut/Amortissements-Provisions/Net). Aucune case du formulaire ne numérote
 * la colonne Net pour les lignes d'actif ni pour les totaux : le Total Actif
 * Net (comparable au Total Passif, lui-même annoté « NET » sur le
 * formulaire) est une valeur DÉRIVÉE, 110 − 112, sans case propre. L'égalité
 * réellement applicable est donc :
 *
 *     (110 − 112) = 180        [Total Actif NET = Total Passif]
 *
 * jamais « 112 = 180 » seul, qui comparerait un total d'amortissements à un
 * total de passif — deux grandeurs sans lien de nature.
 */
export function checkBilanEquilibre(input: { patrimoine: PatrimonialState }): BilanEquilibreResult {
  const { patrimoine } = input;

  // --- Stock d'ouverture absent (N+1 sans clôture N) --------------------
  if (patrimoine.compteExploitant.ouvertureManquante) {
    return {
      status: "STOCK_OUVERTURE_ABSENT",
      reasons: ["Aucun solde d'ouverture du compte de l'exploitant (120) — la clôture de l'exercice précédent n'a pas encore été reprise pour ce dossier."],
    };
  }

  // --- Données manquantes --------------------------------------------
  if (patrimoine.tresorerie.etat === "TRESORERIE_INCONNUE") {
    return { status: "DONNEE_MANQUANTE", reasons: [patrimoine.tresorerie.raison] };
  }
  // Correction P0-2 : un découvert bancaire constaté sans dette de passif
  // reconnue ne doit jamais disparaître silencieusement du bilan (084=0
  // sans contrepartie). Bloquant, jamais une valeur inventée.
  if (patrimoine.tresorerie.decouvertBancaire !== undefined && patrimoine.tresorerie.decouvertDettePassif === undefined) {
    return { status: "DONNEE_MANQUANTE", reasons: [patrimoine.tresorerie.raison] };
  }
  if (!patrimoine.compteExploitant.disponible) {
    return { status: "DONNEE_MANQUANTE", reasons: [patrimoine.compteExploitant.raison] };
  }
  if (!patrimoine.ran.disponible) {
    return { status: "DONNEE_MANQUANTE", reasons: [patrimoine.ran.raison] };
  }
  if (patrimoine.emprunts.etat === "INCONNU") {
    return { status: "DONNEE_MANQUANTE", reasons: [patrimoine.emprunts.raison] };
  }
  if (!patrimoine.immobilisations.brutFiable) {
    return { status: "DONNEE_MANQUANTE", reasons: [...patrimoine.immobilisations.raisons] };
  }
  // Correction P0-1 : une créance ou une dette de tiers non renseignée
  // (INCONNU) ne devient jamais 0 — elle bloque la génération au même titre
  // que n'importe quelle autre donnée manquante.
  if (patrimoine.tiers.creances.status === "INCONNU") {
    return { status: "DONNEE_MANQUANTE", reasons: [patrimoine.tiers.creances.raison] };
  }
  if (patrimoine.tiers.dettes.status === "INCONNU") {
    return { status: "DONNEE_MANQUANTE", reasons: [patrimoine.tiers.dettes.raison] };
  }

  // --- Divergence de source (deux sources déjà produites qui ne concordent pas) ---
  if (patrimoine.tresorerie.etat === "TRESORERIE_DIVERGENTE") {
    return { status: "DIVERGENCE_SOURCE", reasons: [patrimoine.tresorerie.raison] };
  }
  if (!patrimoine.immobilisations.netFiable) {
    return { status: "DIVERGENCE_SOURCE", reasons: [...patrimoine.immobilisations.raisons] };
  }
  // Correction P0-3 : deux sources de CRD (F-011 et BilanInputs.financements)
  // qui ne concordent pas — jamais choisie arbitrairement l'une contre
  // l'autre, ni moyennée, ni la plus récente retenue par défaut.
  if (patrimoine.emprunts.etat === "DIVERGENT") {
    return { status: "DIVERGENCE_SOURCE", reasons: [patrimoine.emprunts.raison] };
  }

  // --- Toutes les données sont là et fiables : calcul des totaux -------
  // À ce stade, tiers.creances/dettes sont garantis DECLARE ou NUL_CONFIRME
  // (jamais INCONNU, exclu ci-dessus) : `montant` est donc toujours défini,
  // sans qu'aucun `?? 0` ne masque une donnée manquante.
  const creances = patrimoine.tiers.creances.montant;
  const dettes = patrimoine.tiers.dettes.montant;
  const totalActifBrut = round2((patrimoine.immobilisations.brutTotal ?? 0) + (patrimoine.tresorerie.clotureRetenue ?? 0) + creances);
  const totalActifNet = round2((patrimoine.immobilisations.netTotal ?? 0) + (patrimoine.tresorerie.clotureRetenue ?? 0) + creances);
  // 142 = 120 + 134 + 136 (124/126/130/131/132/137/140 non applicables/non modélisés pour une EI, voir audit normatif §4)
  const total142 = round2((patrimoine.compteExploitant.clotureN ?? 0) + (patrimoine.ran.valeur ?? 0) + patrimoine.resultatComptable);
  // 176 = 156 + découvert reconnu au passif + [164/166/172/173/174/175 non modélisés P0]
  const total176 = round2(patrimoine.emprunts.totalCRD + dettes + (patrimoine.tresorerie.decouvertDettePassif ?? 0));
  // 180 = 142 + 154(non applicable EI) + 176
  const totalPassif = round2(total142 + total176);

  const ecart = round2(totalActifNet - totalPassif);
  if (Math.abs(ecart) > 0.01) {
    return {
      status: "DESEQUILIBRE_REEL",
      reasons: [
        `Total actif net (110−112 = ${totalActifNet} €) ≠ total passif (180 = ${totalPassif} €), écart de ${ecart} €. Toutes les données patrimoniales étaient disponibles et fiables : ce déséquilibre est réel et doit être investigué (donnée de saisie erronée probable), jamais corrigé par un ajustement artificiel.`,
      ],
      totalActifBrut,
      totalActifNet,
      totalPassif,
      ecart,
    };
  }

  return { status: "EQUILIBRE", reasons: [], totalActifBrut, totalActifNet, totalPassif, ecart: 0 };
}
