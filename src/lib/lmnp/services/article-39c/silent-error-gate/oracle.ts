/**
 * FISCAL-SILENT-ERROR-GATE-1 — ORACLE INDEPENDANT (test uniquement).
 *
 * Réécrit à la main, en centimes entiers, les formules du Knowledge approuvé (SAV-034, SAV-030, SAV-031, SAV-032 v1.1).
 * N'importe AUCUN module productif : ni moteur 39 C, ni F006, ni mappers. Toute valeur attendue d'un test du gate vient d'ici
 * ou d'un chiffre écrit à la main dans le test.
 */
export type OracleInput = {
  /** Encaissements E, créances ouverture/clôture CO/CC, avances ouverture/clôture AO/AC (centimes). */
  E: number; CO: number; CC: number; AO: number; AC: number;
  /** Charges afférentes aux biens loués (B), charges d'activité (ACTIVITY), charges non déductibles (ND), autres produits. */
  B: number; ACTIVITY: number; ND?: number; OTHER_PRODUCT?: number;
  /** Dotation courante, stock ARD d'ouverture, déficits LMNP antérieurs (millésime, montant) — centimes. */
  dotation: number; ardOpen: number; deficits?: { millesime: number; montant: number }[];
  year: number;
};

export type OracleOutput = {
  L: number; C: number; avant: number; D: number; ARDn: number; H: number; apres: number; ardClose: number;
  deficitNouveau: number; imputes: number; resultat: number; deficitsClose: { millesime: number; montant: number }[];
  l312: number; l314: number; l318: number; l330: number; l350: number; c7a: number; c7b: number;
};

export const oracle = (i: OracleInput): OracleOutput => {
  const ND = i.ND ?? 0;
  const OP = i.OTHER_PRODUCT ?? 0;
  const L = i.E + i.CC - i.CO + i.AO - i.AC; // SAV-034
  const C = Math.max(0, L - i.B); // SAV-030 : jamais clampée sur le résultat global, jamais d'ACTIVITY ni d'OTHER_PRODUCT
  const avant = L + OP - i.B - i.ACTIVITY - 0; // résultat global avant amortissement (ND est hors résultat fiscal : réintégré en 330)
  const D = Math.min(i.dotation, C);
  const ARDn = i.dotation - D;
  const H = Math.min(i.ardOpen, C - D);
  const apres = avant - D - H;
  const ardClose = i.ardOpen - H + ARDn;
  const deficitNouveau = Math.max(-apres, 0);
  let room = Math.max(apres, 0);
  let imputes = 0;
  const left: { millesime: number; montant: number }[] = [];
  // CGI art. 156 I 1° ter : déficit du millésime M imputable sur les bénéfices des dix exercices suivants (M+1 … M+10) ; au-delà, périmé.
  for (const d of [...(i.deficits ?? [])].filter((x) => i.year - x.millesime <= 10).sort((a, b) => a.millesime - b.millesime)) {
    const take = Math.min(d.montant, room);
    room -= take;
    imputes += take;
    if (d.montant - take > 0) left.push({ millesime: d.millesime, montant: d.montant - take });
  }
  if (deficitNouveau > 0) left.push({ millesime: i.year, montant: deficitNouveau });
  const resultat = Math.max(apres, 0) - imputes;
  const comptable = avant - i.dotation - ND; // 312 − 314
  return {
    L, C, avant, D, ARDn, H, apres, ardClose, deficitNouveau, imputes, resultat, deficitsClose: left,
    l312: Math.max(comptable, 0), l314: Math.max(-comptable, 0), l318: ARDn,
    l330: Math.max(-apres, 0) + ND, l350: Math.max(apres, 0) + H,
    c7a: Math.max(apres, 0), c7b: Math.max(-apres, 0),
  };
};

/** Identité de bouclage SAV-032 : (312 − 314) + 318 + 330 − 350 = 0. */
export const closes2033B = (o: OracleOutput): boolean => o.l312 - o.l314 + o.l318 + o.l330 - o.l350 === 0;

/** PRNG déterministe (mulberry32) : seed fixe, reproductible. */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
