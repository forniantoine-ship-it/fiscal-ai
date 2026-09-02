/**
 * Types de domaine F-007 — Liasse Engine (TRF-0033 partiel / 2031-SD uniquement — ADR-004).
 */

import type { Anomaly } from "../../contracts/Anomaly";
import type { FiscalResult } from "../f006/types";

/** ENT-013 — Identité déclarante (hors FiscalResult). */
export type IdentiteDeclarante = {
  siren?: string;
  siret?: string;
  denomination?: string;
  adresseEntreprise?: string;
  adresseDeclarant?: string;
  villeEntreprise?: string;
  codePostalEntreprise?: string;
  exerciceDebut?: string;
  exerciceFin?: string;
  email?: string;
  telephone?: string;
  /**
   * Service des Impôts des Entreprises compétent. Aucune source fiable
   * (annuaire SIE par code postal/commune, ou donnée transmise par le SIE au
   * démarrage de l'activité) n'existe aujourd'hui dans le dossier ni ailleurs
   * dans le code — volontairement laissé `undefined` par
   * `identiteFromDeclarationDraft()` plutôt que déduit du code postal, qui
   * serait une hypothèse fragile (le ressort d'un SIE ne suit pas un
   * découpage postal simple). À renseigner uniquement quand une source fiable
   * sera disponible.
   */
  sieCompetent?: string;
};

export type CerfaCaseValue = number | string | boolean;

/** Traçabilité obligatoire — ADR-004 règle 5. */
export type CaseTrace = {
  source: "FiscalResult" | "IdentiteDeclarante" | "scope";
  path: string;
  ksArtifacts: string[];
};

export type CerfaCase = {
  caseId: string;
  label: string;
  value: CerfaCaseValue;
  trace: CaseTrace;
};

/** Représentation documentaire d'un formulaire — pas de logique fiscale. */
export type Form2031SD = {
  formId: "2031-SD";
  millésime: number;
  cases: CerfaCase[];
};

/** SAV-029 — composition attendue (ADR-004, document KS à créer). */
export const LIASSE_LMNP_REEL_SIMPLIFIE_ATTENDUE = [
  "2031-SD",
  "2033-A-SD",
  "2033-B-SD",
  "2033-C-SD",
] as const;

export type LiasseRepresentation = {
  exercice: number;
  /** Périmètre ADR-004 : seul 2031-SD est généré à ce stade. */
  formulairesGeneres: Form2031SD[];
  formulairesAttendus: readonly string[];
  formulairesManquants: string[];
  trace: {
    ksArtifacts: string[];
    generatedAt: string;
    sourceFiscalResultAt: string;
  };
  status: "partial" | "blocked";
  anomalies: Anomaly[];
};

export type LiasseEngineInputs = {
  fiscalResult: FiscalResult;
  identite: IdentiteDeclarante;
};

export type ValidateLiasseInputsOutput = {
  ready: boolean;
  anomalies: Anomaly[];
};

export type MapForm2031Output = {
  form: Form2031SD;
  anomalies: Anomaly[];
};

export type ProduceLiasseOutput = {
  liasse?: LiasseRepresentation;
  anomalies: Anomaly[];
};

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
