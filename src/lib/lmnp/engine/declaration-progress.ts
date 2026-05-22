import {
  DECLARATION_FLOW,
  DECLARATION_STEP_ORDER,
  type DeclarationStepId,
  declarationStepHref,
  declarationStepIndex,
} from "../constants/declaration-flow";
import type { DeclarationDraft } from "../types";
import type { PersistedWorkspace } from "../store/persistence";

export type DeclarationStepStatus = "completed" | "current" | "upcoming";

export interface DeclarationStepView {
  id: DeclarationStepId;
  title: string;
  status: DeclarationStepStatus;
  href: string;
}

export interface DeclarationProgress {
  steps: DeclarationStepView[];
  currentStepId: DeclarationStepId;
  percentComplete: number;
  nextAction: {
    label: string;
    href: string;
    headline: string;
  };
  insights: string[];
  recentDocuments: { id: string; fileName: string; status: string }[];
}

function isStepComplete(id: DeclarationStepId, ws: PersistedWorkspace): boolean {
  const draft = ws.declarationDraft ?? { completedSteps: [] };
  if (draft.completedSteps.includes(id)) return true;

  const { fiscalYear, documents, properties, validationItems } = ws;
  const pending = validationItems.filter((v) => v.status === "pending").length;

  switch (id) {
    case "documents":
      return documents.length > 0;
    case "siren":
      return Boolean(draft.siren?.trim());
    case "exploitant":
      return Boolean(draft.exploitantFirstName?.trim() && draft.exploitantLastName?.trim());
    case "logement":
      return properties.some((p) => p.address.trim() && p.city.trim());
    case "amortissement":
      return (
        draft.completedSteps.includes("amortissement") ||
        ws.ledgerEntries.some((e) => e.domain === "amortization")
      );
    case "recettes":
      return ws.ledgerEntries.some((e) => e.domain === "income");
    case "charges-exploitation":
      return ws.ledgerEntries.some((e) => e.domain === "expense");
    case "charges-financieres":
      return ws.ledgerEntries.some((e) => e.domain === "loan");
    case "usages-personnels":
      return draft.usagesPersonnelsConfirmed === true;
    case "bareme-carburant":
      return draft.baremeCarburantConfirmed === true;
    case "statut-lmnp":
      return Boolean(fiscalYear.regimeConfirmedAt);
    case "regime-social":
      return Boolean(draft.regimeSocial?.trim());
    case "tva":
      return Boolean(draft.tvaRegime?.trim());
    case "paiement":
      return Boolean(fiscalYear.paidAt);
    case "signature":
      return Boolean(draft.signedAt);
    case "teletransmission":
      return Boolean(fiscalYear.transmittedAt);
    default:
      return false;
  }
}

function resolveCurrentStepId(ws: PersistedWorkspace): DeclarationStepId {
  for (const id of DECLARATION_STEP_ORDER) {
    if (!isStepComplete(id, ws)) return id;
  }
  return "teletransmission";
}

function buildInsights(ws: PersistedWorkspace): string[] {
  const insights: string[] = [];
  const analyzing = ws.documents.some(
    (d) => d.status === "uploaded" || d.status === "processing",
  );
  if (analyzing) return insights;

  const pending = ws.validationItems.filter((v) => v.status === "pending").length;
  if (pending > 0) insights.push(`${pending} montant${pending > 1 ? "s" : ""} à confirmer`);

  const loan = ws.documents.find(
    (d) => d.documentType === "loan_interest_certificate" || d.category === "emprunt",
  );
  if (loan) insights.push("Crédit immobilier détecté");

  const analyzed = ws.documents.filter((d) => d.status === "analyzed").length;
  if (analyzed > 0 && pending === 0) {
    insights.push(`${analyzed} document${analyzed > 1 ? "s" : ""} analysé${analyzed > 1 ? "s" : ""}`);
  }

  return insights.slice(0, 2);
}

function buildHeadline(currentId: DeclarationStepId, ws: PersistedWorkspace): string {
  const step = DECLARATION_FLOW.find((s) => s.id === currentId)!;
  const pending = ws.validationItems.filter((v) => v.status === "pending").length;

  if (currentId === "documents" && ws.documents.length === 0) {
    return "Déposez vos documents pour commencer";
  }
  if (pending > 0) {
    return `${pending} élément${pending > 1 ? "s" : ""} à confirmer`;
  }
  if (ws.fiscalYear.transmittedAt) return "Déclaration transmise";
  if (ws.fiscalYear.paidAt) return "Signez et transmettez";
  return step.title;
}

export function resolveDeclarationProgress(ws: PersistedWorkspace): DeclarationProgress {
  const currentStepId = resolveCurrentStepId(ws);
  const currentIdx = declarationStepIndex(currentStepId);
  const completedCount = DECLARATION_STEP_ORDER.filter((id) =>
    isStepComplete(id, ws),
  ).length;
  const percentComplete = Math.round((completedCount / DECLARATION_STEP_ORDER.length) * 100);

  const steps: DeclarationStepView[] = DECLARATION_FLOW.map((def) => {
    const idx = declarationStepIndex(def.id);
    let status: DeclarationStepStatus;
    if (isStepComplete(def.id, ws)) status = "completed";
    else if (def.id === currentStepId) status = "current";
    else if (idx < currentIdx) status = "completed";
    else status = "upcoming";

    return {
      id: def.id,
      title: def.title,
      status,
      href: declarationStepHref(ws.fiscalYear.id, def.id),
    };
  });

  const currentDef = DECLARATION_FLOW.find((s) => s.id === currentStepId)!;
  const pending = ws.validationItems.filter((v) => v.status === "pending").length;

  let label = "Continuer";
  let href = declarationStepHref(ws.fiscalYear.id, currentStepId);
  if (currentStepId === "documents") label = "Déposer des documents";
  else if (pending > 0) {
    label = "Confirmer";
    href = `/app/exercices/${ws.fiscalYear.id}/validation`;
  } else if (currentStepId === "paiement") label = "Payer";
  else if (currentStepId === "teletransmission") label = "Transmettre";

  const recentDocuments = [...ws.documents]
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
    .slice(0, 3)
    .map((d) => ({ id: d.id, fileName: d.fileName, status: d.status }));

  return {
    steps,
    currentStepId,
    percentComplete,
    nextAction: {
      label,
      href,
      headline:
        pending > 0
          ? `${pending} montant${pending > 1 ? "s" : ""} à confirmer`
          : currentDef.subtitle,
    },
    insights: buildInsights(ws),
    recentDocuments,
  };
}
