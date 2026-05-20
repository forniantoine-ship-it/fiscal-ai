import type { FiscalYearStatus, UserConfidenceScore } from "@/lib/lmnp/types";

export const CONFIDENCE_LEVEL_LABELS: Record<UserConfidenceScore["level"], string> = {
  starting: "Démarrage",
  building: "En construction",
  advancing: "Bon chemin",
  almost_ready: "Presque prêt",
  ready: "Prêt à clôturer",
};

export const FISCAL_YEAR_STATUS_LABELS: Record<FiscalYearStatus, string> = {
  draft: "Brouillon",
  collecting_documents: "Collecte en cours",
  analyzing: "Analyse IA",
  pending_validation: "Validation en cours",
  ready_to_close: "Prêt à clôturer",
  closed: "Clôturé",
};

export const PILLAR_LABELS = {
  documents: "Documents",
  validations: "Validations",
  coherence: "Cohérence",
  tabs: "Onglets métier",
} as const;
