import type { Anomaly } from "../../contracts/Anomaly";
import { assembleForm2031SD } from "./assemble-form-2031";
import { validateLiasseInputs } from "./validate-liasse-inputs";
import type { LiasseEngineInputs, LiasseRepresentation, ProduceLiasseOutput } from "./types";
import { LIASSE_LMNP_REEL_SIMPLIFIE_ATTENDUE } from "./types";

/**
 * Composition explicite F-007 (TRF-0033 partiel, ADR-004).
 * Transforme un FiscalResult validé en représentation documentaire — 2031-SD uniquement.
 */
export function produceLiasse(input: LiasseEngineInputs): ProduceLiasseOutput {
  const validation = validateLiasseInputs(input);
  const anomalies: Anomaly[] = [...validation.anomalies];

  if (!validation.ready) {
    return { anomalies };
  }

  const { form } = assembleForm2031SD(input.fiscalResult, input.identite);
  const generatedAt = new Date().toISOString();
  const formulairesGeneres = [form];
  const formulairesManquants = LIASSE_LMNP_REEL_SIMPLIFIE_ATTENDUE.filter(
    (id) => id !== "2031-SD",
  );

  const liasse: LiasseRepresentation = {
    exercice: input.fiscalResult.exercice,
    formulairesGeneres,
    formulairesAttendus: LIASSE_LMNP_REEL_SIMPLIFIE_ATTENDUE,
    formulairesManquants: [...formulairesManquants],
    trace: {
      ksArtifacts: [
        "TRF-0033",
        "TRF-0032",
        "ENT-013",
        "ADR-004",
        ...input.fiscalResult.trace.ksArtifacts,
      ],
      generatedAt,
      sourceFiscalResultAt: input.fiscalResult.trace.computedAt,
    },
    status: "partial",
    anomalies,
  };

  return { liasse, anomalies };
}
