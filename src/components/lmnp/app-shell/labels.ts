import type { FiscalYearStatus, UserConfidenceScore } from "@/lib/lmnp/types";
import { CONFIDENCE_HUMAN, FISCAL_STATUS_HUMAN, PILLAR_HUMAN_LABELS } from "@/lib/lmnp/constants/copilot-copy";

export const CONFIDENCE_LEVEL_LABELS: Record<UserConfidenceScore["level"], string> = {
  starting: CONFIDENCE_HUMAN.starting,
  building: CONFIDENCE_HUMAN.building,
  advancing: CONFIDENCE_HUMAN.advancing,
  almost_ready: CONFIDENCE_HUMAN.almost_ready,
  ready: CONFIDENCE_HUMAN.ready,
};

export const FISCAL_YEAR_STATUS_LABELS: Record<FiscalYearStatus, string> = {
  draft: FISCAL_STATUS_HUMAN.draft,
  collecting_documents: FISCAL_STATUS_HUMAN.collecting_documents,
  analyzing: FISCAL_STATUS_HUMAN.analyzing,
  pending_validation: FISCAL_STATUS_HUMAN.pending_validation,
  ready_to_close: FISCAL_STATUS_HUMAN.ready_to_close,
  closed: FISCAL_STATUS_HUMAN.closed,
};

export const PILLAR_LABELS = PILLAR_HUMAN_LABELS;
