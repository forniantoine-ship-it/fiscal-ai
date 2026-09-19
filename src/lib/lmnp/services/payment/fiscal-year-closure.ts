/**
 * Payment V1 — un exercice civil N ne peut être finalisé (payé) qu'à partir du
 * 1er janvier N+1 (heure de Paris) : tant qu'il n'est pas terminé, ses revenus et
 * charges ne sont pas arrêtés. Le dossier reste préparable ; seule la finalisation
 * est refusée.
 *
 * Module PUR, sans import : partagé par les handlers serveur (autorité) et par
 * l'overlay de paiement (simple aide à l'affichage, jamais une garantie).
 * L'horloge est injectable pour les tests.
 *
 * Volontairement indépendant de l'année de déclaration et du millésime Cerfa :
 * aucune convention exercice ↔ millésime n'est encodée ici.
 */

export const FISCAL_YEAR_NOT_CLOSED_CODE = "fiscal_year_not_closed";

const PARIS_YEAR = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric" });

/** Année civile courante à Paris (le 31/12 à 23h59 Paris reste dans l'année N, quel que soit le fuseau du serveur). */
function parisCalendarYear(now: Date): number {
  return Number(PARIS_YEAR.format(now));
}

/** `true` dès le 1er janvier N+1 (Paris) ; `false` pour l'année en cours et les années futures. */
export function isFiscalYearClosed(fiscalYear: number, now: Date = new Date()): boolean {
  return fiscalYear < parisCalendarYear(now);
}

/** Message pédagogique (affiché tel quel au client) : ce qui se passe, quand, et que rien n'est facturé. */
export function fiscalYearNotClosedMessage(fiscalYear: number): string {
  return `Votre exercice ${fiscalYear} n'est pas encore terminé : il pourra être finalisé à partir du 1er janvier ${fiscalYear + 1}. En attendant, vous pouvez continuer à préparer votre dossier — rien n'est facturé.`;
}
