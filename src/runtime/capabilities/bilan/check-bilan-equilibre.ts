import { round2 } from "../f010/types";
import { resolveContributionTiersEquilibre } from "./contribution-tiers-equilibre";
import { montantCapitauxPropresPatrimoniaux } from "./total-capitaux-propres";
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
 *
 * P1-B.4 : contribution tiers unique (bucket ↔ ventilation) + réconciliation
 * stricte emprunt/découvert ↔ tiers.dettes. Jamais de double comptage.
 *
 * Correction R-01 : les capitaux propres du passif vérifié viennent de
 * `montantCapitauxPropresPatrimoniaux` (120+134+136+137) — même source que
 * la case 142. Jamais d'EQUILIBRE avec 137 ignoré.
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

  // P1-B.4 : buckets P0 conservés, mais la contribution équilibre est résolue
  // contre la ventilation (couverture complète / partielle / incohérente).
  const contributionTiers = resolveContributionTiersEquilibre(patrimoine.tiers, patrimoine.ventilationTiers);
  if (!contributionTiers.utilisablePourEquilibre) {
    const hasDivergence = contributionTiers.creances.etat === "VENTILATION_SUPERIEURE" || contributionTiers.dettes.etat === "VENTILATION_SUPERIEURE";
    const hasConflitSource = patrimoine.ventilationTiers.conflits.some(
      (c) => c.code === "LIGNE_SIMPLE_ET_VENTILATION" || c.code === "NATURE_INTERDITE",
    );
    return {
      status: hasDivergence || hasConflitSource ? "DIVERGENCE_SOURCE" : "DONNEE_MANQUANTE",
      reasons: contributionTiers.raisonsBlocage.length > 0 ? contributionTiers.raisonsBlocage : ["Contribution tiers non utilisable pour l'équilibre."],
    };
  }

  // P1-B.4 strict : réconciliation emprunt / découvert ↔ bucket dettes.
  if (patrimoine.reconciliationEmpruntsTiers.bloquant) {
    return {
      status: "DIVERGENCE_SOURCE",
      reasons: [patrimoine.reconciliationEmpruntsTiers.raison],
    };
  }
  if (patrimoine.reconciliationDecouvertTiers.bloquant) {
    return {
      status: "DIVERGENCE_SOURCE",
      reasons: [patrimoine.reconciliationDecouvertTiers.raison],
    };
  }

  // --- Divergence de source (deux sources déjà produites qui ne concordent pas) ---
  if (patrimoine.tresorerie.etat === "TRESORERIE_DIVERGENTE") {
    return { status: "DIVERGENCE_SOURCE", reasons: [patrimoine.tresorerie.raison] };
  }
  if (!patrimoine.immobilisations.netFiable) {
    return { status: "DIVERGENCE_SOURCE", reasons: [...patrimoine.immobilisations.raisons] };
  }
  if (patrimoine.emprunts.etat === "DIVERGENT") {
    return { status: "DIVERGENCE_SOURCE", reasons: [patrimoine.emprunts.raison] };
  }

  // --- Capitaux propres (R-01) : même formule que 142, avant tout EQUILIBRE ---
  const capitauxPropres = montantCapitauxPropresPatrimoniaux(patrimoine);
  if (capitauxPropres.status === "INCONNU") {
    return { status: "DONNEE_MANQUANTE", reasons: [capitauxPropres.raison] };
  }

  // --- Totaux : une contribution dettes + emprunt/découvert selon réconciliation ---
  const creances = contributionTiers.creances.montantRetenu as number;
  const dettes = contributionTiers.dettes.montantRetenu as number;
  const empruntEquilibre = patrimoine.reconciliationEmpruntsTiers.contributionEmpruntEquilibre ?? 0;
  const decouvertEquilibre = patrimoine.reconciliationDecouvertTiers.contributionDecouvertEquilibre ?? 0;

  const totalActifBrut = round2((patrimoine.immobilisations.brutTotal ?? 0) + (patrimoine.tresorerie.clotureRetenue ?? 0) + creances);
  const totalActifNet = round2((patrimoine.immobilisations.netTotal ?? 0) + (patrimoine.tresorerie.clotureRetenue ?? 0) + creances);
  const total142 = capitauxPropres.montant;
  // 176 : dettes (hors double) + emprunt réconcilié + découvert réconcilié
  const total176 = round2(empruntEquilibre + dettes + decouvertEquilibre);
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
