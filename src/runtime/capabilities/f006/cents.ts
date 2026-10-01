/**
 * R2C.1 — sommes de montants en CENTIMES ENTIERS (consolidation multi-bien).
 *
 * Même convention d'arrondi que `round2` (F-006) : chaque terme est d'abord ramené au centime, puis la somme est exacte
 * en entiers — jamais l'accumulation flottante (1000.1 + 2000.2 ≠ 3000.3 en flottant). Un seul terme = identité stricte :
 * aucun aller-retour euros → centimes → euros qui changerait la représentation d'un montant mono.
 */
export function toCents(euros: number): number {
  return Math.round((euros + Number.EPSILON) * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

export function sumEuros(values: readonly number[]): number {
  if (values.length === 1) return values[0]!;
  return fromCents(values.reduce((total, value) => total + toCents(value), 0));
}
