import type { JourneyStepId } from "../types";

export interface JourneyStepDefinition {
  id: JourneyStepId;
  title: string;
  description: string;
  /** Route suffix under `/app/exercices/[id]` */
  href: string;
  cta: string;
  aiHint?: string;
}

export const JOURNEY_STEPS: JourneyStepDefinition[] = [
  {
    id: "documents",
    title: "Déposer vos documents",
    description:
      "Téléversez vos PDF — acte notarié, factures, taxe foncière, relevés de loyers… L’IA s’occupe du reste.",
    href: "/documents",
    cta: "Ajouter mes documents",
    aiHint: "L’IA classera et lira chaque document automatiquement.",
  },
  {
    id: "analysis",
    title: "Analyse par l’IA",
    description:
      "Vos documents sont en cours de lecture : classification, extraction des montants et pré-remplissage du dossier.",
    href: "/documents",
    cta: "Voir l’analyse",
    aiHint: "Aucune saisie manuelle — l’IA remplit les champs pour vous.",
  },
  {
    id: "validation",
    title: "Vérifier les montants proposés",
    description:
      "L’IA a pré-rempli votre dossier. Confirmez ou corrigez en un clic — c’est la seule étape où vous intervenez.",
    href: "/validation",
    cta: "Vérifier maintenant",
    aiHint: "Tout est déjà rempli — vous validez seulement.",
  },
  {
    id: "dossier",
    title: "Finaliser votre dossier",
    description:
      "Choisissez votre régime, vérifiez vos loyers et dépenses, puis levez les derniers points à clarifier.",
    href: "/activite",
    cta: "Continuer",
    aiHint: "Les montants viennent de vos documents — rien à recalculer.",
  },
  {
    id: "generate",
    title: "Générer votre déclaration",
    description:
      "Votre dossier est complet. Générez la liasse LMNP prête pour la déclaration.",
    href: "/validation",
    cta: "Générer ma déclaration",
  },
  {
    id: "payment",
    title: "Régler votre dossier",
    description:
      "Dernière étape avant l’envoi : validez votre offre pour débloquer la télétransmission.",
    href: "/paiement",
    cta: "Procéder au paiement",
  },
  {
    id: "transmission",
    title: "Télétransmettre",
    description:
      "Envoyez votre déclaration aux impôts en toute sécurité — nous guidons chaque clic.",
    href: "/teletransmission",
    cta: "Télétransmettre",
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

/** Minimum journey step required to access a route suffix. */
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
