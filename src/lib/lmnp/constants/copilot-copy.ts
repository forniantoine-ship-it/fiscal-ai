import type { DocumentType } from "../types";
import type { DocumentChecklistItem } from "../services/document-checklist";

/** Documents que l’on mentionne au particulier (pas de jargon comptable). */
export const EXPECTED_DOCUMENT_NAMES = [
  "Acte notarié",
  "Facture de meubles",
  "Taxe foncière",
  "Crédit immobilier",
  "Assurance habitation",
  "Relevés de loyers",
  "Factures de travaux",
] as const;

export const TAB_COPY = {
  activite: {
    title: "Mon bien",
    description: "Où se situe votre logement et quel régime fiscal vous choisissez.",
    sidebar: "Mon bien",
  },
  recettes: {
    title: "Mes loyers",
    description: "Ce que vous avez encaissé — l’IA remplit ces lignes depuis vos relevés et votre bail.",
    sidebar: "Mes loyers",
  },
  depenses: {
    title: "Mes dépenses",
    description: "Taxe foncière, assurance, travaux… Tout ce que vous pouvez déduire de vos loyers.",
    sidebar: "Mes dépenses",
  },
  immobilisations: {
    title: "Mon mobilier & bien",
    description: "Factures de meubles et acte notarié — l’amortissement est calculé pour vous.",
    sidebar: "Mobilier & bien",
  },
  emprunts: {
    title: "Mon crédit",
    description: "Intérêts de votre prêt immobilier (pas le capital remboursé).",
    sidebar: "Mon crédit",
  },
} as const;

export const PILLAR_HUMAN_LABELS = {
  documents: "Vos documents",
  validations: "Montants à valider",
  coherence: "Points à clarifier",
  tabs: "Votre déclaration",
} as const;

export const FISCAL_STATUS_HUMAN: Record<string, string> = {
  draft: "On démarre ensemble",
  collecting_documents: "Ajoutez vos documents",
  analyzing: "L’IA lit vos documents",
  pending_validation: "Vérifiez les montants proposés",
  ready_to_close: "Votre dossier est prêt",
  closed: "Déclaration terminée",
};

export const CONFIDENCE_HUMAN: Record<string, string> = {
  starting: "Première étape",
  building: "Bien lancé",
  advancing: "Vous avancez bien",
  almost_ready: "Presque terminé",
  ready: "Prêt pour la déclaration",
};

export function humanDocumentLabel(
  documentType: DocumentType,
  fileName?: string,
): string {
  const fromType = DOCUMENT_TYPE_HUMAN_LABEL[documentType];
  if (fromType && documentType !== "unknown") return fromType;
  return fileName ?? "Document";
}

export const DOCUMENT_TYPE_HUMAN_LABEL: Partial<Record<DocumentType, string>> = {
  notary_deed: "Acte notarié",
  furniture_invoice: "Facture de meubles",
  property_tax: "Taxe foncière",
  loan_interest_certificate: "Crédit immobilier",
  loan_schedule: "Tableau de crédit",
  insurance_invoice: "Assurance habitation",
  rent_bank_statement: "Relevés de loyers",
  rent_receipt: "Quittance de loyer",
  lease_contract: "Bail / contrat de location",
  works_invoice: "Factures de travaux",
  condo_charges: "Charges de copropriété",
  bank_statement: "Relevé bancaire",
};

export interface CopilotGuideStep {
  step: number;
  title: string;
  description: string;
  href: string;
  cta: string;
  done: boolean;
  active: boolean;
}

export function buildCopilotGuideSteps(params: {
  base: string;
  documentCount: number;
  analyzedCount: number;
  pendingValidationCount: number;
  missingDocumentCount: number;
  canClose: boolean;
}): CopilotGuideStep[] {
  const {
    base,
    documentCount,
    analyzedCount,
    pendingValidationCount,
    missingDocumentCount,
    canClose,
  } = params;

  const hasDocs = documentCount > 0;
  const hasAnalysis = analyzedCount > 0;
  const needsReview = pendingValidationCount > 0;

  const step1Done = hasDocs;
  const step2Done = hasAnalysis && !needsReview && missingDocumentCount === 0;
  const step3Done = canClose;

  const activeStep = !step1Done ? 1 : needsReview || missingDocumentCount > 0 ? 2 : step3Done ? 3 : 2;

  return [
    {
      step: 1,
      title: "Ajoutez vos documents principaux",
      description:
        "Déposez vos PDF (acte, factures, taxe foncière, relevés de loyers…). L’IA les classe et lit les montants pour vous.",
      href: `${base}/documents`,
      cta: "Ajouter mes documents",
      done: step1Done,
      active: activeStep === 1,
    },
    {
      step: 2,
      title: "Vérifiez ce que l’IA a pré-rempli",
      description: needsReview
        ? `${pendingValidationCount} montant${pendingValidationCount > 1 ? "s" : ""} à confirmer — un clic suffit dans Mes loyers ou Mes dépenses.`
        : missingDocumentCount > 0
          ? `Il manque encore ${missingDocumentCount} document${missingDocumentCount > 1 ? "s" : ""} pour compléter le dossier.`
          : "Parcourez vos loyers, dépenses et crédit : tout est déjà rangé par l’IA.",
      href: needsReview ? `${base}/recettes` : `${base}/documents`,
      cta: needsReview ? "Vérifier mes montants" : "Voir mon dossier",
      done: step2Done,
      active: activeStep === 2,
    },
    {
      step: 3,
      title: "Finalisez votre déclaration",
      description: canClose
        ? "Votre dossier est complet — vous pouvez préparer la déclaration en toute sérénité."
        : "Encore quelques points à valider, puis votre LMNP sera prêt.",
      href: `${base}/recettes`,
      cta: "Voir le récapitulatif",
      done: step3Done,
      active: activeStep === 3,
    },
  ];
}

export function buildCopilotFeedMessages(params: {
  documents: { documentType: DocumentType; fileName: string; status: string }[];
  checklist: DocumentChecklistItem[];
  pendingValidationCount: number;
  canClose: boolean;
}): string[] {
  const messages: string[] = [];

  for (const doc of params.documents.filter((d) => d.status === "analyzed")) {
    const label = humanDocumentLabel(doc.documentType, doc.fileName);
    messages.push(`Votre ${label.toLowerCase()} a bien été analysée.`);
  }

  for (const item of params.checklist.filter((i) => i.status === "missing")) {
    messages.push(`Il manque encore : ${item.label.toLowerCase()}.`);
  }

  if (params.pendingValidationCount > 0) {
    messages.push(
      `${params.pendingValidationCount} montant${params.pendingValidationCount > 1 ? "s" : ""} attend${params.pendingValidationCount > 1 ? "ent" : ""} votre confirmation.`,
    );
  }

  if (params.canClose) {
    messages.push("Votre dossier est presque prêt — bravo, vous y êtes !");
  }

  return messages.slice(0, 4);
}
