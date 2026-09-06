import { round2 } from "../f010/types";
import type { RanSituation } from "./types";

/**
 * Règle de continuité N → N+1 pour le compte de l'exploitant (contrat P0
 * §10), pour une entreprise individuelle (convention C1) :
 *
 *     120_ouverture(N+1) = 120_clôture(N) + résultat_comptable(N)
 *
 * Le résultat de l'exercice (136) n'est JAMAIS ajouté à 120 PENDANT
 * l'exercice N (voir `compte-exploitant.ts`) — il ne rejoint 120 qu'À
 * L'OUVERTURE de l'exercice suivant, ici. C'est la convention retenue pour
 * une EI : le "compte de l'exploitant" absorbe directement le résultat
 * (notice 2033-NOT-SD 2026, case 120 : "le compte de l'exploitant tient
 * lieu de compte capital") — contrairement à une société, où le résultat
 * irait au report à nouveau (134) après affectation par l'assemblée.
 *
 * Le report à nouveau (134) N'EST JAMAIS mis à jour automatiquement ici :
 * pour une EI (C1), il reste à 0 ; pour un dossier historique (C2/C3), sa
 * valeur est conservée telle quelle, jamais recalculée par un mécanisme
 * généralisé (contrat P0 §9, interdiction explicite de
 * "RAN N+1 = RAN N + résultat N" comme règle générale de l'EI).
 *
 * NE FAIT AUCUNE PERSISTANCE : cette fonction est une règle pure,
 * démontrant l'architecture attendue. Le câblage dans
 * `fiscal-year-cycle.ts`/`FiscalYearClosure` (stockage réel de la clôture
 * patrimoniale et reprise par le draft N+1) est explicitement hors
 * périmètre de ce P0 — voir le rapport d'implémentation, limites.
 */
export function resolveOuvertureCompteExploitantNPlusUn(input: {
  cloture120N: number;
  resultatComptableN: number;
}): number {
  return round2(input.cloture120N + input.resultatComptableN);
}

/**
 * Le report à nouveau (134) traverse N → N+1 sans aucune transformation —
 * ni recalculé à partir du résultat, ni du déficit fiscal, ni de l'ARD.
 * Fonction identité volontairement explicite (jamais implicite) pour que
 * l'absence de règle soit un choix visible dans le code, pas un oubli.
 */
export function reporterRanNPlusUn(input: { situationN: RanSituation; valeurN?: number }): {
  situationNPlusUn: RanSituation;
  valeurNPlusUn?: number;
} {
  return { situationNPlusUn: input.situationN, valeurNPlusUn: input.valeurN };
}
