import type { UserConfidenceScore } from "@/lib/lmnp/types";

export const CONFIDENCE_LEVEL_LABELS: Record<UserConfidenceScore["level"], string> = {
  starting: "Démarrage",
  building: "En construction",
  advancing: "Bon chemin",
  almost_ready: "Presque prêt",
  ready: "Prêt à clôturer",
};
