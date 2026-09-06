import { resolveLignePatrimoniale } from "./ligne-patrimoniale";
import type { LignePatrimonialeInput, LignePatrimonialeResolution } from "./types";

/**
 * Résout la case 137 (Subventions d'investissement) — correction P1-A.
 *
 * Réception de l'audit P0 (§10) : 142 traitait 137 comme structurellement
 * `non_applicable` au même titre que 124/126/130/131/132/140 (concepts
 * sociétaires) — c'est inexact. Une subvention d'investissement reste
 * juridiquement possible pour une entreprise individuelle ; sa rareté en
 * pratique n'est jamais une justification pour l'écrire à 0 sans
 * confirmation (même principe que tiers/découvert/CRD au P0).
 */
export function resolveSubventionsInvestissement(input?: LignePatrimonialeInput): LignePatrimonialeResolution {
  return resolveLignePatrimoniale(input, "Subventions d'investissement (case 137)");
}
