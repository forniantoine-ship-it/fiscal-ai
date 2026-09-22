/**
 * Lot 5.2 — copy client pour la reprise externe.
 * Aucun jargon technique (4E, Opening, ARD, CandidateValue…).
 */

import type { OpeningProrataConvention } from "@/lib/lmnp/services/fiscal-year-opening/types";
import type { CandidateAssetClassification } from "@/lib/lmnp/services/takeover/asset-candidates";

export const EXTERNAL_TAKEOVER_COPY = {
  title: "Reprenons votre comptabilité précédente",
  intro:
    "Déposez les documents de votre dernière déclaration. Nous récupérerons automatiquement les informations disponibles et nous vous demanderons uniquement ce qui manque.",
  taxPackage: {
    label: "Dernière liasse fiscale",
    help: "Le PDF contenant notamment les formulaires 2033-A et 2033-C.",
  },
  register: {
    label: "Tableau ou registre des amortissements",
    help: "Le fichier transmis par votre comptable ou votre ancien logiciel, avec vos biens et les amortissements déjà pratiqués.",
  },
  analyzing: "Nous analysons votre ancienne comptabilité…",
  controlsOk: "Les principaux totaux correspondent à votre dernière liasse fiscale.",
  propertyQuestion: "À quel logement correspond cet élément ?",
  prorataQuestion: "Quelle méthode d'amortissement était utilisée ?",
  prorataHelp:
    "Cette information permet de reprendre la même méthode d'amortissement que votre comptabilité précédente.",
  classificationQuestion: "De quel type d'élément s'agit-il ?",
  deficitsQuestion:
    "Restait-il des déficits LMNP à reporter à la fin de votre dernière déclaration ?",
  ardQuestion: "Restait-il des amortissements que vous n'aviez pas encore pu déduire ?",
  yes: "Oui",
  no: "Non",
  millesimeLabel: "Année",
  montantLabel: "Montant (€)",
  addDeficitLine: "Ajouter une autre année",
  confirm: "Enregistrer",
  replaceFile: "Remplacer le fichier",
  retry: "Réessayer",
  extractionFailed: "Nous n'avons pas réussi à lire ce document.",
  manualReview:
    "Nous devons vérifier une information de votre ancienne comptabilité avant de continuer.",
  completedTitle: "Votre comptabilité précédente a bien été reprise.",
  completedBody: "Vous pouvez continuer votre déclaration.",
  progress: {
    documents: "Documents",
    analysis: "Analyse",
    exceptions: "Informations à confirmer",
    takeover: "Reprise",
    received: "reçus",
    done: "terminée",
    remaining: (n: number) => (n === 1 ? "1 restante" : `${n} restantes`),
    waiting: "en attente",
  },
  historicalValue: "Valeur historique",
  priorDepreciation: "Amortissements déjà pratiqués",
  changeAnswer: "Modifier ma réponse",
} as const;

/** Libellés prorata — valeurs domaine exactes. */
export const PRORATA_OPTIONS: {
  value: OpeningProrataConvention;
  label: string;
}[] = [
  { value: "jours_reels", label: "Au prorata des jours réels" },
  { value: "mensuel", label: "Au prorata des mois" },
  { value: "annuel_plein", label: "Année pleine" },
];

/** Libellés classification — valeurs domaine exactes. */
export const CLASSIFICATION_OPTIONS: {
  value: CandidateAssetClassification;
  label: string;
}[] = [
  { value: "batiment", label: "Bien immobilier" },
  { value: "mobilier", label: "Mobilier" },
  { value: "terrain", label: "Terrain" },
  { value: "travaux", label: "Travaux" },
  { value: "autre", label: "Autre" },
];
