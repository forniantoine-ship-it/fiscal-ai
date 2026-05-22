export type DeclarationStepId =
  | "documents"
  | "siren"
  | "exploitant"
  | "logement"
  | "amortissement"
  | "recettes"
  | "charges-exploitation"
  | "charges-financieres"
  | "usages-personnels"
  | "bareme-carburant"
  | "statut-lmnp"
  | "regime-social"
  | "tva"
  | "paiement"
  | "signature"
  | "teletransmission";

export interface DeclarationStepDef {
  id: DeclarationStepId;
  title: string;
  subtitle: string;
  /** Route path after /app/exercices/[id] */
  path: string;
}

export const DECLARATION_FLOW: DeclarationStepDef[] = [
  {
    id: "documents",
    title: "Vos documents",
    subtitle: "Déposez vos pièces — l’IA extrait les montants en silence.",
    path: "/documents",
  },
  {
    id: "siren",
    title: "SIREN",
    subtitle: "Identifiez votre activité LMNP.",
    path: "/etape/siren",
  },
  {
    id: "exploitant",
    title: "Exploitant",
    subtitle: "Vos informations personnelles pour la liasse.",
    path: "/etape/exploitant",
  },
  {
    id: "logement",
    title: "Logement",
    subtitle: "Le bien loué en meublé.",
    path: "/etape/logement",
  },
  {
    id: "amortissement",
    title: "Amortissement",
    subtitle: "L’IA calcule les amortissements à partir de vos pièces.",
    path: "/immobilisations",
  },
  {
    id: "recettes",
    title: "Recettes",
    subtitle: "Loyers et revenus locatifs.",
    path: "/recettes",
  },
  {
    id: "charges-exploitation",
    title: "Charges d’exploitation",
    subtitle: "Charges courantes du bien.",
    path: "/depenses",
  },
  {
    id: "charges-financieres",
    title: "Charges financières",
    subtitle: "Intérêts d’emprunt et frais bancaires.",
    path: "/emprunts",
  },
  {
    id: "usages-personnels",
    title: "Usages personnels",
    subtitle: "Quote-part d’usage privé, le cas échéant.",
    path: "/etape/usages-personnels",
  },
  {
    id: "bareme-carburant",
    title: "Barème carburant",
    subtitle: "Indemnités kilométriques si applicable.",
    path: "/etape/bareme-carburant",
  },
  {
    id: "statut-lmnp",
    title: "Statut LMNP / LMP",
    subtitle: "Confirmez votre statut fiscal.",
    path: "/activite",
  },
  {
    id: "regime-social",
    title: "Régime social",
    subtitle: "Cotisations et régime applicable.",
    path: "/etape/regime-social",
  },
  {
    id: "tva",
    title: "TVA",
    subtitle: "Franchise ou assujettissement.",
    path: "/etape/tva",
  },
  {
    id: "paiement",
    title: "Paiement",
    subtitle: "Finalisez votre dossier.",
    path: "/paiement",
  },
  {
    id: "signature",
    title: "Signature électronique",
    subtitle: "Signez votre liasse en toute sécurité.",
    path: "/etape/signature",
  },
  {
    id: "teletransmission",
    title: "Télétransmission",
    subtitle: "Envoi à l’administration.",
    path: "/teletransmission",
  },
];

export const DECLARATION_STEP_ORDER = DECLARATION_FLOW.map((s) => s.id);

export function declarationStepIndex(id: DeclarationStepId): number {
  return DECLARATION_STEP_ORDER.indexOf(id);
}

export function getDeclarationStep(id: DeclarationStepId): DeclarationStepDef {
  const step = DECLARATION_FLOW.find((s) => s.id === id);
  if (!step) throw new Error(`Unknown declaration step: ${id}`);
  return step;
}

export function nextDeclarationStepId(id: DeclarationStepId): DeclarationStepId | null {
  const idx = declarationStepIndex(id);
  if (idx < 0 || idx >= DECLARATION_STEP_ORDER.length - 1) return null;
  return DECLARATION_STEP_ORDER[idx + 1];
}

export function prevDeclarationStepId(id: DeclarationStepId): DeclarationStepId | null {
  const idx = declarationStepIndex(id);
  if (idx <= 0) return null;
  return DECLARATION_STEP_ORDER[idx - 1];
}

export function declarationStepHref(fiscalYearId: string, id: DeclarationStepId): string {
  const step = getDeclarationStep(id);
  return `/app/exercices/${fiscalYearId}${step.path}`;
}
