import type { FiscalResult } from "../f006/types";
import { round2 } from "../f006/types";

/**
 * Source UNIQUE du résultat comptable — consommée à l'identique par la case
 * 136 (2033-A) et la case 310 (2033-B). Avant ce module, la même formule
 * était codée indépendamment dans `map-2033a.ts` et `map-2033b.ts` (risque
 * de divergence silencieuse si l'une était corrigée sans l'autre — trouvaille
 * de l'audit normatif précédent, §5/§7).
 *
 * Formule INCHANGÉE (transport pur, aucune règle fiscale nouvelle) :
 * résultat comptable = résultat avant amortissement − amortissement calculé
 * de l'exercice − charges comptabilisées mais non déductibles.
 *
 * Ne jamais confondre avec `FiscalResult.resultatFiscal` (F-006,
 * `applyAmortissementStocks`, TRF-0031) : ce dernier a déjà subi l'imputation
 * des déficits antérieurs et la limitation d'amortissement (SAV-027) — le
 * résultat comptable n'en tient jamais compte, par construction. Voir
 * `bilan-resultat-comptable.test.ts` pour la preuve de non-régression sur
 * les deux mappers.
 */
export function resultatComptable(fr: FiscalResult): number {
  return round2(fr.resultatAvantAmort - fr.amortCalcule - fr.charges.totalNonDeductible);
}
