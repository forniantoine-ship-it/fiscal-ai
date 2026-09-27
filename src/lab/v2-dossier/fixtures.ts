import type { DemoDocument, DomainId } from "./model";

export const DOCUMENTS: DemoDocument[] = [
  {
    id: "deed", name: "Acte d’acquisition.pdf", category: "Logement", domain: "home",
    found: ["Adresse · Bordeaux", "Prix d’acquisition · 180 000 €", "Date d’acquisition · 15 septembre 2025", "Frais d’acquisition · 12 400 €"],
    contribution: ["Adresse du logement", "Prix d’acquisition", "Date d’acquisition", "Frais d’acquisition"],
    source: "Extrait fictif de l’acte · page 3\nAppartement situé à Bordeaux. Acquisition le 15 septembre 2025. Prix indiqué : 180 000 €. Frais indiqués : 12 400 €.\nLa date de disponibilité à la location n’est pas indiquée.",
  },
  {
    id: "activity", name: "Extrait d’activité.pdf", category: "Activité", domain: "activity",
    found: ["Activité · location meublée", "Exploitant · Antoine Martin"],
    contribution: ["Activité de location meublée", "Identité de l’exploitant"],
    source: "Extrait fictif d’activité\nAntoine Martin · activité de location meublée.\nCes informations ne constituent pas une vérification administrative.",
  },
  {
    id: "offer", name: "Offre de prêt.pdf", category: "Financement", domain: "loan",
    found: ["Capital initial · 140 000 €", "Taux · 3,45 %", "Durée · 20 ans"],
    contribution: ["Origine du financement", "Capital initial", "Taux et durée"],
    source: "Extrait fictif de l’offre de prêt\nCapital initial : 140 000 €. Taux : 3,45 %. Durée : 20 ans.\nL’offre documente ici l’origine du financement ; elle n’est pas remplacée par l’échéancier.",
  },
  {
    id: "schedule", name: "Échéancier bancaire.pdf", category: "Financement", domain: "loan",
    found: ["Échéances de 2026", "Intérêts illustratifs · 2 100 €", "Assurance · 0,25 %"],
    contribution: ["Échéances de l’année", "Intérêts illustratifs", "Assurance"],
    source: "Extrait fictif de l’échéancier\nIntérêts de l’année 2026 : 2 100 €. Assurance : 0,25 %.\nLe montant n’est pas issu d’une analyse bancaire réelle.",
  },
  {
    id: "income", name: "Relevé de gestion.pdf", category: "Loyers et dépenses", domain: "income", usedIn: ["income", "expenses"],
    found: ["Recettes illustratives · 14 400 €", "Autres dépenses · 2 350 €", "Début de location indiqué · 12 janvier 2026"],
    contribution: ["Recettes illustratives", "Autres dépenses"],
    source: "Extrait fictif du relevé de gestion\nRecettes de l’année : 14 400 €. Autres dépenses : 2 350 €. Début de location indiqué : 12 janvier 2026.\nLa date diffère de celle du bail fictif. Aucun relevé réel n’a été transmis.",
  },
  {
    id: "lease", name: "Bail de location.pdf", category: "Loyers", domain: "income",
    found: ["Début du bail indiqué · 10 janvier 2026", "Logement · Bordeaux"],
    contribution: ["Logement concerné"],
    source: "Extrait fictif du bail\nDébut du bail indiqué : 10 janvier 2026. Logement situé à Bordeaux.\nLe relevé de gestion fictif indique une date différente.",
  },
  {
    id: "tax", name: "Avis de taxe foncière.pdf", category: "Dépenses", domain: "expenses",
    found: ["Montant proposé · 1 250 €", "Exercice · 2026"],
    contribution: [],
    source: "Extrait fictif de l’avis 2026\nMontant proposé : 1 250 €.\nLa confirmation du client reste nécessaire avant intégration au résultat illustratif.",
  },
];

export const DOMAIN_LABELS: Record<DomainId, string> = {
  activity: "Activité", home: "Logement", loan: "Financement",
  income: "Loyers", expenses: "Dépenses", amortization: "Amortissements", history: "Historique / reprise",
};

export const ANALYSIS_STEPS = [
  "6 pièces reçues",
  "Activité et logement retrouvés",
  "Financement préparé",
  "Recettes rapprochées · deux dates à vérifier",
  "Prochaines interventions préparées",
] as const;

export const TAX_ANALYSIS_STEPS = [
  "Avis reçu",
  "Montant repéré dans l’avis",
  "Dépenses enrichies d’une proposition",
  "Effet potentiel sur le résultat préparé",
  "Une confirmation reste nécessaire",
] as const;
