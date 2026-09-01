import type { Anomaly } from "../../contracts/Anomaly";
import type { Localisation } from "./bareme-terrain";
import { lookupBareme } from "./bareme-terrain";
import type { TypeBien } from "./types";

/**
 * JUG-002 + SAV-003 — Suggestion du ratio terrain/bâti quand l'acte ne le mentionne pas.
 * La suggestion est proposée à l'utilisateur, qui peut l'accepter ou saisir sa valeur.
 */
export type SuggestRatioTerrainInput = {
  typeBien: TypeBien;
  localisation: Localisation;
};

export type SuggestRatioTerrainOutput = {
  ratioSuggere: number;
  min: number;
  max: number;
};

export function suggestRatioTerrain(input: SuggestRatioTerrainInput): SuggestRatioTerrainOutput {
  const bareme = lookupBareme(input.typeBien, input.localisation);
  return { ratioSuggere: bareme.suggestion, min: bareme.min, max: bareme.max };
}

/**
 * JUG-002 — Validation par fourchette du ratio terrain saisi.
 * Un ratio hors fourchette déclenche un avertissement, jamais un blocage.
 */
export type ValidateRatioTerrainInput = {
  typeBien: TypeBien;
  localisation: Localisation;
  ratioTerrain: number;
};

export type ValidateRatioTerrainOutput = {
  inFourchette: boolean;
  anomalies: Anomaly[];
};

export function validateRatioTerrain(input: ValidateRatioTerrainInput): ValidateRatioTerrainOutput {
  const bareme = lookupBareme(input.typeBien, input.localisation);
  const inFourchette =
    input.ratioTerrain >= bareme.min && input.ratioTerrain <= bareme.max;
  const anomalies: Anomaly[] = [];
  if (!inFourchette) {
    anomalies.push({
      severity: "warning",
      message: `Le ratio terrain (${Math.round(input.ratioTerrain * 100)} %) est hors de la fourchette usuelle (${Math.round(
        bareme.min * 100,
      )} % à ${Math.round(bareme.max * 100)} %). Vous pouvez confirmer si vous avez une justification.`,
      field: "ratioTerrain",
    });
  }
  return { inFourchette, anomalies };
}
