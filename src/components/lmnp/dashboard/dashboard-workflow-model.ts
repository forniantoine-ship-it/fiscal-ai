import { FIELD_REGISTRY } from "@/lib/lmnp/types/field-keys";
import type { DeclarationProgress } from "@/lib/lmnp/engine/declaration-progress";
import { documentJourneyRoute, LMNP_ROUTES } from "@/lib/lmnp/routes";
import type {
  DeclarationDraft,
  LmnpDocument,
  LmnpWorkspace,
  ValidationItem,
} from "@/lib/lmnp/types";

export type DashboardWorkspace = LmnpWorkspace & {
  declarationDraft: DeclarationDraft;
  declaration: DeclarationProgress;
};

export type DashboardWorkflowStepId =
  | "dashboard"
  | "activite"
  | "logement"
  | "credit"
  | "amortissement"
  | "revenus"
  | "charges"
  | "validation";

export type WorkflowStepStatus = "completed" | "current" | "upcoming";

export type WorkflowStepView = {
  id: DashboardWorkflowStepId;
  label: string;
  href: string;
  uploadHref: string;
  status: WorkflowStepStatus;
  requestedDocument: string;
  documentPrompt: string;
  aiExtracts: string[];
  documentDetected: string | null;
  extractionState: string;
  correctionState: string;
  validationState: string;
  correctionsRemaining: number;
  validationBadge: "validated" | "pending" | "none";
};

type StepDefinition = {
  id: DashboardWorkflowStepId;
  label: string;
  href: string;
  uploadHref: string;
  requestedDocument: string;
  documentPrompt: string;
  aiExtracts: string[];
  matchDocument: (doc: LmnpDocument) => boolean;
  isComplete: (workspace: DashboardWorkspace) => boolean;
  matchValidation: (item: ValidationItem) => boolean;
};

const STEP_DEFINITIONS: StepDefinition[] = [
  {
    id: "dashboard",
    label: "Tableau de bord",
    href: LMNP_ROUTES.dashboard,
    uploadHref: LMNP_ROUTES.documents,
    requestedDocument: "Vue d'ensemble",
    documentPrompt: "Suivez l'avancement de votre dossier LMNP.",
    aiExtracts: ["Progression", "Prochaine pièce"],
    matchDocument: () => false,
    isComplete: () => true,
    matchValidation: () => false,
  },
  {
    id: "activite",
    label: "Activité LMNP",
    href: documentJourneyRoute("inpi"),
    uploadHref: documentJourneyRoute("inpi"),
    requestedDocument: "Extrait INPI / Kbis",
    documentPrompt: "Ajoutez votre extrait INPI ou Kbis.",
    aiExtracts: ["SIREN", "Raison sociale", "Régime"],
    matchDocument: (doc) => /inpi|kbis|siren|siret|rcs|extrait/i.test(doc.fileName),
    isComplete: (ws) =>
      Boolean(ws.declarationDraft?.siren?.trim()) ||
      ws.documents.some((doc) => /inpi|kbis|siren|siret|rcs|extrait/i.test(doc.fileName) && doc.status === "analyzed"),
    matchValidation: (item) => FIELD_REGISTRY[item.fieldKey]?.tab === "activite",
  },
  {
    id: "logement",
    label: "Logement",
    href: documentJourneyRoute("logement"),
    uploadHref: documentJourneyRoute("logement"),
    requestedDocument: "Acte notarié",
    documentPrompt: "Ajoutez votre acte notarié.",
    aiExtracts: ["Adresse", "Surface", "Date d'acquisition"],
    matchDocument: (doc) =>
      doc.documentType === "notary_deed" || /acte|notaire|acquisition/i.test(doc.fileName),
    isComplete: (ws) => Boolean(ws.declarationDraft?.logementConfirmedAt),
    matchValidation: (item) =>
      item.fieldKey === "property.address" || item.fieldKey === "property.label",
  },
  {
    id: "credit",
    label: "Crédit",
    href: LMNP_ROUTES.depenses,
    uploadHref: documentJourneyRoute("credit-immobilier"),
    requestedDocument: "Tableau d'amortissement",
    documentPrompt: "Déposez votre tableau d'amortissement.",
    aiExtracts: ["Mensualité", "Durée", "Taux", "Intérêts"],
    matchDocument: (doc) =>
      doc.category === "emprunt" ||
      doc.documentType === "loan_interest_certificate" ||
      doc.documentType === "loan_schedule",
    isComplete: (ws) =>
      ws.documents.some(
        (doc) =>
          (doc.category === "emprunt" ||
            doc.documentType === "loan_interest_certificate" ||
            doc.documentType === "loan_schedule") &&
          doc.status === "analyzed",
      ) || ws.ledgerEntries.some((entry) => entry.domain === "loan"),
    matchValidation: (item) => FIELD_REGISTRY[item.fieldKey]?.tab === "emprunts",
  },
  {
    id: "amortissement",
    label: "Amortissement",
    href: LMNP_ROUTES.amortissements,
    uploadHref: documentJourneyRoute("factures-travaux"),
    requestedDocument: "Factures travaux / mobilier",
    documentPrompt: "Ajoutez vos factures de travaux ou de mobilier.",
    aiExtracts: ["Mobilier", "Travaux", "Amortissement annuel"],
    matchDocument: (doc) =>
      doc.category === "amortissement" ||
      doc.documentType === "furniture_invoice" ||
      doc.documentType === "works_invoice",
    isComplete: (ws) =>
      ws.documents.some(
        (doc) =>
          (doc.category === "amortissement" ||
            doc.documentType === "furniture_invoice" ||
            doc.documentType === "works_invoice") &&
          doc.status === "analyzed",
      ) || ws.ledgerEntries.some((entry) => entry.domain === "amortization"),
    matchValidation: (item) => FIELD_REGISTRY[item.fieldKey]?.tab === "immobilisations",
  },
  {
    id: "revenus",
    label: "Revenus",
    href: LMNP_ROUTES.revenus,
    uploadHref: documentJourneyRoute("bail"),
    requestedDocument: "Baux + Loyers",
    documentPrompt: "Ajoutez vos loyers et baux.",
    aiExtracts: ["Loyers annuels", "Bail", "Charges refacturées"],
    matchDocument: (doc) =>
      doc.category === "bail" ||
      doc.documentType === "lease_contract" ||
      doc.documentType === "rent_receipt" ||
      doc.documentType === "rent_bank_statement",
    isComplete: (ws) =>
      ws.documents.some(
        (doc) =>
          (doc.category === "bail" ||
            doc.documentType === "lease_contract" ||
            doc.documentType === "rent_receipt" ||
            doc.documentType === "rent_bank_statement") &&
          doc.status === "analyzed",
      ) || ws.ledgerEntries.some((entry) => entry.domain === "income"),
    matchValidation: (item) => FIELD_REGISTRY[item.fieldKey]?.tab === "recettes",
  },
  {
    id: "charges",
    label: "Charges",
    href: LMNP_ROUTES.depenses,
    uploadHref: documentJourneyRoute("taxe-fonciere"),
    requestedDocument: "Factures + Charges",
    documentPrompt: "Ajoutez taxe foncière, assurance et charges.",
    aiExtracts: ["Taxe foncière", "Assurance", "Copropriété"],
    matchDocument: (doc) =>
      doc.category === "charges" ||
      doc.documentType === "property_tax" ||
      doc.documentType === "insurance_invoice" ||
      doc.documentType === "condo_charges",
    isComplete: (ws) =>
      ws.documents.some(
        (doc) =>
          (doc.category === "charges" ||
            doc.documentType === "property_tax" ||
            doc.documentType === "insurance_invoice" ||
            doc.documentType === "condo_charges") &&
          doc.status === "analyzed",
      ) || ws.ledgerEntries.some((entry) => entry.domain === "expense"),
    matchValidation: (item) => FIELD_REGISTRY[item.fieldKey]?.tab === "depenses",
  },
  {
    id: "validation",
    label: "Validation",
    href: LMNP_ROUTES.declarations,
    uploadHref: LMNP_ROUTES.declarations,
    requestedDocument: "Prêt pour validation finale",
    documentPrompt: "Confirmez ou corrigez les montants extraits par l'IA.",
    aiExtracts: ["Montants détectés", "Cohérence", "Liasse prête"],
    matchDocument: () => false,
    isComplete: (ws) =>
      ws.pendingValidationCount === 0 &&
      ws.documents.some((doc) => doc.status === "analyzed") &&
      Boolean(ws.fiscalYear.transmittedAt),
    matchValidation: () => true,
  },
];

function extractionState(doc: LmnpDocument | undefined): string {
  if (!doc) return "Extraction en attente";
  if (doc.status === "uploaded") return "Extraction en attente";
  if (doc.status === "processing") return "Extraction en cours";
  if (doc.status === "failed") return "À corriger";
  return "Extraction terminée";
}

function validationBadge(items: ValidationItem[]): WorkflowStepView["validationBadge"] {
  const pending = items.filter((item) => item.status === "pending").length;
  if (pending > 0) return "pending";
  if (items.some((item) => item.status === "approved" || item.status === "corrected")) {
    return "validated";
  }
  return "none";
}

function correctionState(pending: number): string {
  if (pending > 0) return `${pending} à corriger`;
  return "Aucune";
}

function validationState(badge: WorkflowStepView["validationBadge"], status: WorkflowStepStatus): string {
  if (badge === "pending") return "À corriger";
  if (badge === "validated" || status === "completed") return "Validé";
  return "En attente";
}

function resolveFocusStepId(workspace: DashboardWorkspace): DashboardWorkflowStepId {
  for (const def of STEP_DEFINITIONS) {
    if (def.id === "dashboard" || def.id === "validation") continue;
    const pending = workspace.validationItems.filter(
      (item) => def.matchValidation(item) && item.status === "pending",
    ).length;
    if (pending > 0) return def.id;
  }

  for (const def of STEP_DEFINITIONS) {
    if (def.id === "dashboard" || def.id === "validation") continue;
    if (!def.isComplete(workspace)) return def.id;
  }

  if (workspace.pendingValidationCount > 0) return "validation";
  return "validation";
}

export function resolveDashboardWorkflow(workspace: DashboardWorkspace): WorkflowStepView[] {
  const focusStepId = resolveFocusStepId(workspace);
  const journeyStarted = workspace.documents.length > 0 || Boolean(workspace.declarationDraft?.journeyStartedAt);

  return STEP_DEFINITIONS.map((def) => {
    const matchedDocs = workspace.documents.filter(def.matchDocument);
    const primaryDoc = matchedDocs.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))[0];
    const stepValidations = workspace.validationItems.filter(def.matchValidation);
    const pending = stepValidations.filter((item) => item.status === "pending").length;
    const badge = validationBadge(stepValidations);

    let status: WorkflowStepStatus = "upcoming";
    if (def.id === "dashboard") {
      status = !journeyStarted ? "current" : "completed";
    } else if (def.isComplete(workspace)) {
      status = "completed";
    } else if (def.id === focusStepId) {
      status = "current";
    }

    return {
      id: def.id,
      label: def.label,
      href: def.href,
      uploadHref: def.uploadHref,
      status,
      requestedDocument: def.requestedDocument,
      documentPrompt: def.documentPrompt,
      aiExtracts: def.aiExtracts,
      documentDetected: primaryDoc?.fileName ?? null,
      extractionState: extractionState(primaryDoc),
      correctionState: correctionState(pending),
      validationState: validationState(badge, status),
      correctionsRemaining: pending,
      validationBadge: badge,
    };
  });
}

export function resolveActiveWorkflowStep(workspace: DashboardWorkspace): WorkflowStepView {
  const steps = resolveDashboardWorkflow(workspace);
  return (
    steps.find((step) => step.status === "current" && step.id !== "dashboard") ??
    steps.find((step) => step.id === "activite") ??
    steps[steps.length - 1]
  );
}

export function resolveDocumentWorkflowStep(
  doc: LmnpDocument,
  workspace: DashboardWorkspace,
): string {
  const match = STEP_DEFINITIONS.find(
    (def) => def.id !== "dashboard" && def.id !== "validation" && def.matchDocument(doc),
  );
  if (match) return match.label;

  if (workspace.validationItems.some((item) => item.documentId === doc.id)) {
    return "Validation";
  }

  return "Documents";
}

export function resolveDocumentFieldLabels(docId: string, workspace: DashboardWorkspace): string[] {
  return workspace.extractions
    .filter((extraction) => extraction.documentId === docId)
    .slice(0, 4)
    .map((extraction) => FIELD_REGISTRY[extraction.fieldKey]?.label ?? extraction.displayLabel ?? extraction.fieldKey);
}

export function resolveDocumentAiStatus(doc: LmnpDocument): string {
  return extractionState(doc);
}

export function resolveDocumentValidationState(items: ValidationItem[]): string {
  const pending = items.filter((item) => item.status === "pending").length;
  if (pending > 0) return "À corriger";
  if (items.some((item) => item.status === "approved" || item.status === "corrected")) {
    return "Validé";
  }
  return "En attente";
}

export function resolveDocumentCorrectionState(items: ValidationItem[]): string {
  const pending = items.filter((item) => item.status === "pending").length;
  if (pending > 0) return `${pending} à corriger`;
  return "Aucune";
}
