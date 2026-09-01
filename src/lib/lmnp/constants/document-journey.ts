import type { DocumentCategory } from "../types";

export type DocumentJourneyStepId =
  | "inpi"
  | "logement"
  | "credit-immobilier"
  | "bail"
  | "taxe-fonciere"
  | "assurance"
  | "factures-travaux";

export interface DocumentJourneyStepDef {
  id: DocumentJourneyStepId;
  /** Titre de l’écran — une seule pièce demandée */
  screenTitle: string;
  explanation: string;
  ctaLabel: string;
  uploadHint: string;
  category: DocumentCategory;
  fileNamePattern: RegExp;
  optional?: boolean;
}

export const DOCUMENT_JOURNEY_STEPS: DocumentJourneyStepDef[] = [
  {
    id: "inpi",
    screenTitle: "Commençons par votre document INPI.",
    explanation:
      "Ce document permet à l’IA de créer automatiquement votre dossier fiscal LMNP.",
    ctaLabel: "Importer le document INPI",
    uploadHint: "PDF ou image — extrait Kbis, avis INPI ou récapitulatif SIREN",
    category: "autre",
    fileNamePattern: /inpi|kbis|siren|siret|rcs|extrait/i,
  },
  {
    id: "logement",
    screenTitle: "Votre acte notarié.",
    explanation:
      "L'IA détecte automatiquement les informations du logement à partir de votre acte d'acquisition.",
    ctaLabel: "Importer l'acte notarié",
    uploadHint: "Acte notarié, compromis ou pièce d'acquisition — PDF ou image",
    category: "autre",
    fileNamePattern: /acte|notaire|acquisition|vente|logement/i,
  },
  {
    id: "credit-immobilier",
    screenTitle: "Votre attestation de crédit immobilier.",
    explanation: "L’IA repère les intérêts d’emprunt pour pré-remplir votre dossier.",
    ctaLabel: "Importer l’attestation",
    uploadHint: "Attestation ou tableau d’amortissement de prêt",
    category: "emprunt",
    fileNamePattern: /emprunt|pret|credit|interet|banque/i,
  },
  {
    id: "bail",
    screenTitle: "Votre bail de location meublée.",
    explanation: "Contrat de location — l’IA en extrait les informations utiles.",
    ctaLabel: "Importer le bail",
    uploadHint: "Contrat de bail ou avenant",
    category: "bail",
    fileNamePattern: /bail|loyer|location/i,
  },
  {
    id: "taxe-fonciere",
    screenTitle: "Votre taxe foncière.",
    explanation: "L’avis de taxe foncière complète les charges de votre bien.",
    ctaLabel: "Importer la taxe foncière",
    uploadHint: "Avis de taxe foncière",
    category: "autre",
    fileNamePattern: /taxe[\s_-]?fonci/i,
  },
  {
    id: "assurance",
    screenTitle: "Votre assurance du logement.",
    explanation: "Facture ou attestation PNO / assurance habitation.",
    ctaLabel: "Importer l’assurance",
    uploadHint: "Facture ou attestation d’assurance",
    category: "charges",
    fileNamePattern: /assurance|pno|gli/i,
  },
  {
    id: "factures-travaux",
    screenTitle: "Vos factures de travaux ou d’ameublement.",
    explanation: "Travaux déductibles, mobilier — une pièce à la fois.",
    ctaLabel: "Importer la facture",
    uploadHint: "Facture travaux, mobilier ou équipement",
    category: "charges",
    fileNamePattern: /travaux|mobilier|meuble|facture/i,
    optional: true,
  },
];

export const DOCUMENT_JOURNEY_ORDER = DOCUMENT_JOURNEY_STEPS.map((s) => s.id);

export function getDocumentJourneyStep(id: DocumentJourneyStepId): DocumentJourneyStepDef {
  const step = DOCUMENT_JOURNEY_STEPS.find((s) => s.id === id);
  if (!step) throw new Error(`Unknown document journey step: ${id}`);
  return step;
}

export function nextDocumentStepId(id: DocumentJourneyStepId): DocumentJourneyStepId | null {
  const idx = DOCUMENT_JOURNEY_ORDER.indexOf(id);
  if (idx < 0 || idx >= DOCUMENT_JOURNEY_ORDER.length - 1) return null;
  return DOCUMENT_JOURNEY_ORDER[idx + 1];
}

export function documentJourneyStepHref(_fiscalYearId: string, id: DocumentJourneyStepId): string {
  return `/documents?step=${encodeURIComponent(id)}`;
}
