import type { JourneyStepId } from "../types";

export interface JourneyStepDefinition {
  id: JourneyStepId;
  title: string;
  description: string;
  href: string;
  cta: string;
}

export const JOURNEY_STEPS: JourneyStepDefinition[] = [
  {
    id: "documents",
    title: "Documents",
    description: "",
    href: "/documents",
    cta: "Déposer",
  },
  {
    id: "analysis",
    title: "Analyse",
    description: "",
    href: "/documents",
    cta: "Voir",
  },
  {
    id: "validation",
    title: "Validation",
    description: "",
    href: "/validation",
    cta: "Valider",
  },
  {
    id: "dossier",
    title: "Dossier",
    description: "",
    href: "/activite",
    cta: "Continuer",
  },
  {
    id: "generate",
    title: "Déclaration",
    description: "",
    href: "/validation",
    cta: "Générer",
  },
  {
    id: "payment",
    title: "Paiement",
    description: "",
    href: "/paiement",
    cta: "Payer",
  },
  {
    id: "transmission",
    title: "Transmission",
    description: "",
    href: "/teletransmission",
    cta: "Transmettre",
  },
];

export const JOURNEY_STEP_ORDER: JourneyStepId[] = JOURNEY_STEPS.map((s) => s.id);

export function journeyStepIndex(id: JourneyStepId): number {
  return JOURNEY_STEP_ORDER.indexOf(id);
}

export function getJourneyStepDef(id: JourneyStepId): JourneyStepDefinition {
  const def = JOURNEY_STEPS.find((s) => s.id === id);
  if (!def) throw new Error(`Unknown journey step: ${id}`);
  return def;
}

export const ROUTE_MIN_STEP: Record<string, JourneyStepId> = {
  "": "documents",
  documents: "documents",
  validation: "validation",
  alertes: "dossier",
  activite: "dossier",
  recettes: "dossier",
  depenses: "dossier",
  immobilisations: "dossier",
  emprunts: "dossier",
  paiement: "payment",
  teletransmission: "transmission",
};
