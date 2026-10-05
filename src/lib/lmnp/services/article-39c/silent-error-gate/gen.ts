import type { Case } from "./fixtures.test";

export const FUZZ_SEED = 20261005;
export const FUZZ_CASES = 600;

/** Génère un dossier DANS le domaine (L > 0). Montants entiers, 1 cas sur 3 avec centimes. */
export function genCase(rnd: () => number): Case {
  const pick = (max: number) => Math.floor(rnd() * (max + 1));
  const cents3 = rnd() < 0.33;
  const m = (max: number) => (cents3 ? pick(max * 100) / 100 : pick(max));
  const some = (p: number, max: number) => (rnd() < p ? m(max) : 0);
  const CO = some(0.3, 3000), AO = some(0.25, 3000), CC = some(0.3, 3000), AC = some(0.25, 3000);
  const E = 5000 + m(25000);
  const L = E + CC - CO + AO - AC;
  const TF = rnd() < 0.1 ? Math.round(L * 1.2) : Math.min(m(Math.max(1, Math.round(L * 0.9))), L * 1.2);
  const COMPTA = some(0.5, 4000);
  const C = Math.max(0, L - TF);
  const r = rnd();
  const dotation = r < 0.15 ? Math.round(C * 100) / 100 : r < 0.25 ? Math.round((C - 0.01) * 100) / 100 : r < 0.35 ? Math.round((C + 0.01) * 100) / 100 : m(7000);
  const ND = some(0.25, 1500);
  const ardOpen = some(0.4, 5000);
  const deficits = rnd() < 0.35 ? Array.from({ length: 1 + pick(1) }, (_, i) => ({ millesime: 2014 + i * 5 + pick(4), montant: Math.max(1, m(5000)) })) : [];
  // millésimes distincts
  const seen = new Set<number>();
  const uniq = deficits.filter((d) => (seen.has(d.millesime) ? false : (seen.add(d.millesime), true)));
  return { E, CO, CC, AO, AC, TF, COMPTA, ND, dotation: Math.max(0, dotation), ardOpen, deficits: uniq };
}

