/**
 * Anomalie détectée par une capability (gardes de Transformation, TRF-0014).
 * Type partagé — réutilisable par tout Assistant produisant des vérifications.
 */
export type AnomalySeverity = "fatal" | "error" | "warning";

export interface Anomaly {
  severity: AnomalySeverity;
  message: string;
  /** Composant / champ concerné, si applicable. */
  field?: string;
}
