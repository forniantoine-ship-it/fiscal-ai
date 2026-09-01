import type { CerfaCase } from "./types";

/**
 * TRF-0033 / 2031-SD — cadre régime d'imposition.
 * Constante de périmètre produit (LMNP réel simplifié) — pas un calcul.
 */
export function map2031RegimeCases(): CerfaCase[] {
  return [
    {
      caseId: "D_REGIME_REEL_SIMPLIFIE",
      label: "Régime réel simplifié",
      value: true,
      trace: {
        source: "scope",
        path: "lmnp.reel_simplifie",
        ksArtifacts: ["ADR-004", "TRF-0033"],
      },
    },
  ];
}
