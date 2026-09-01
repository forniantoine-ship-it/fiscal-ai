/**
 * Cycle 3 — frontière F-011 ↔ F-012 (RAI-000, AX-009).
 *
 * F-012 n'a qu'un seul champ où l'utilisateur rédige son propre texte libre :
 * "Charges diverses". C'est le seul vecteur réaliste par lequel une charge de
 * financement (assurance emprunteur, capital remboursé) pourrait être saisie
 * une seconde fois dans Charges alors qu'elle est déjà comptée par F-011.
 *
 * - Assurance emprunteur : appartient à F-011 (déjà déductible là-bas). La KS
 *   F-012 demande une "alerte de doublon", pas un blocage — l'utilisateur est
 *   averti, la ligne reste visible (jamais supprimée silencieusement), mais
 *   n'est pas comptée une seconde fois dans le total déductible.
 * - Capital remboursé : AX-009 — "ne réduit jamais le résultat fiscal", sans
 *   condition. Erreur bloquante conforme à la KS F-012 : la ligne n'est pas
 *   acceptée comme charge, avec explication.
 *
 * Détection par mots-clés sur la description, volontairement restreinte à
 * "Charges diverses" (hors périmètre : Travaux, qui a son propre texte libre
 * mais sa propre logique de qualification, non touchée dans ce cycle).
 */

export type FinancementChargesSummary = {
  totalAssurance: number;
  totalCapitalRembourse: number;
};

export type DetectFinancementOverlapInput = {
  description: string;
  montant: number;
  financementCharges?: FinancementChargesSummary;
};

export type FinancementOverlapResult =
  | { kind: "none" }
  | { kind: "assurance_emprunteur"; sameAmount: boolean; message: string }
  | { kind: "capital_pret"; message: string };

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

// "assurance ... emprunt|pret|credit|financement" dans une fenêtre courte —
// couvre "assurance emprunteur", "assurance de prêt", "assurance crédit",
// "assurance liée au financement", sans réagir à "assurance habitation" /
// "assurance logement" seules (aucun de ces mots-clés de prêt).
const ASSURANCE_EMPRUNTEUR_PATTERN = /assurance.{0,40}(emprunt|pret|credit|financement)/;

// "capital" à proximité de "rembours"/"emprunt"/"pret", dans les deux ordres —
// couvre "remboursement du capital", "capital restant dû remboursé", "part de
// capital de l'emprunt", sans réagir à "capital social" seul.
const CAPITAL_PRET_PATTERN = /(capital.{0,30}(rembours|emprunt|pret)|rembours\w*.{0,30}capital)/;

export function detectFinancementOverlap(input: DetectFinancementOverlapInput): FinancementOverlapResult {
  const description = normalize(input.description);

  if (CAPITAL_PRET_PATTERN.test(description)) {
    return {
      kind: "capital_pret",
      message:
        "Le remboursement du capital d'un prêt n'est jamais une charge déductible (AX-009) — c'est un " +
        "remboursement de dette, pas une dépense d'exploitation. Il est déjà pris en compte dans l'Assistant " +
        "Financement. Cette ligne n'a pas été ajoutée à vos charges.",
    };
  }

  if (ASSURANCE_EMPRUNTEUR_PATTERN.test(description)) {
    const known = input.financementCharges?.totalAssurance ?? 0;
    const sameAmount = known > 0 && Math.abs(known - input.montant) < 1;
    return {
      kind: "assurance_emprunteur",
      sameAmount,
      message: sameAmount
        ? "Cette assurance emprunteur correspond au montant déjà déclaré dans l'Assistant Financement — elle " +
          "reste visible dans votre récapitulatif, mais n'est pas recomptée ici pour éviter un doublon."
        : "L'assurance emprunteur est déjà prise en compte dans l'Assistant Financement, pas dans Charges — " +
          "cette ligne reste visible dans votre récapitulatif, mais n'est pas recomptée ici pour éviter un doublon.",
    };
  }

  return { kind: "none" };
}
