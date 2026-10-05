/**
 * INT-2 — un brouillon porte-t-il des qualifications article 39 C (à plat, par bien ou niveau activité) ?
 *
 * Feuille SANS import : seule fonction lue par la frontière de snapshot (version de schéma). Elle ne lit aucune valeur
 * fiscale ; elle ne fait que constater la présence d'une donnée qu'un ancien client ne comprend pas (ADR-012 §2 : le
 * schéma v3 existant protège cette donnée, aucune v4).
 */
export function draftCarriesArticle39cQualifications(
  draft:
    | {
        article39cQualifications?: unknown;
        article39cActivityQualifications?: unknown;
        biens?: Record<string, { article39cQualifications?: unknown }>;
      }
    | undefined,
): boolean {
  if (!draft) return false;
  if (draft.article39cQualifications !== undefined || draft.article39cActivityQualifications !== undefined) return true;
  return Object.values(draft.biens ?? {}).some((bien) => bien.article39cQualifications !== undefined);
}
