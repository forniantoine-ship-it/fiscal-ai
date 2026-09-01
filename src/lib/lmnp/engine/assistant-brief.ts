import { AI_DETECTED_SUCCESS } from "../constants/ai-activity-copy";
import { humanDocumentLabel } from "../constants/copilot-copy";
import type { AssistantBrief, AssistantInsight, Extraction } from "../types";
import type { EngineContext } from "./context";
import { getApplicableRequirements } from "./context";
import { computeJourneyFlags, type JourneyFlags } from "./journey";
import type { LmnpJourney } from "../types";
import { FIELD_REGISTRY, type FieldKey } from "../types/field-keys";

const TAB_SHORT: Record<string, string> = {
  recettes: "loyers",
  depenses: "dépenses",
  immobilisations: "mobilier",
  emprunts: "crédit",
  activite: "régime",
};

export function buildAssistantBrief(
  ctx: EngineContext,
  journey: LmnpJourney,
  extractions: Extraction[],
): AssistantBrief {
  const flags = computeJourneyFlags(ctx);
  return {
    headline: buildHeadline(ctx, journey, flags),
    insights: buildInsights(ctx, flags, extractions),
  };
}

/** Max 2 signaux — jamais redondant avec le titre. */
function buildInsights(
  ctx: EngineContext,
  flags: JourneyFlags,
  extractions: Extraction[],
): AssistantInsight[] {
  const isAnalyzing = ctx.documents.some(
    (d) => d.status === "uploaded" || d.status === "processing",
  );
  if (isAnalyzing) return [];

  const pending = ctx.validationItems.filter((v) => v.status === "pending").length;
  if (pending > 0) return [];

  const out: AssistantInsight[] = [];

  const openIssues = ctx.alerts.filter(
    (a) => a.status === "open" && a.severity !== "info",
  ).length;
  if (openIssues > 0) {
    out.push({
      id: "issues",
      tone: "pending",
      text: `${openIssues} incohérence${openIssues > 1 ? "s" : ""}`,
    });
  }

  const analyzed = ctx.documents.filter((d) => d.status === "analyzed");
  if (analyzed.length > 1) {
    out.push({
      id: "docs",
      tone: "success",
      text: `${analyzed.length} documents détectés`,
    });
  } else if (analyzed.length === 1) {
    const doc = analyzed[0];
    out.push({
      id: "doc",
      tone: "success",
      text:
        AI_DETECTED_SUCCESS[doc.documentType] ??
        `${humanDocumentLabel(doc.documentType, doc.fileName)} identifié`,
    });
  }

  if (extractions.length > 0 && flags.analysisDone && out.length < 2) {
    const hasPrefill = out.some((i) => i.id === "prefill");
    if (!hasPrefill) {
      out.push({ id: "prefill", tone: "success", text: "Montants pré-remplis" });
    }
  }

  return out.slice(0, 2);
}

function buildHeadline(
  ctx: EngineContext,
  journey: LmnpJourney,
  flags: JourneyFlags,
): string {
  const pending = ctx.validationItems.filter((v) => v.status === "pending").length;

  if (journey.isComplete) return "Déclaration transmise";

  if (flags.generateDone && !flags.paymentDone) return "Liasse prête";

  if (flags.dossierDone && !flags.generateDone) return "Générer la déclaration";

  if (flags.validationDone && !flags.dossierDone) {
    if (!ctx.fiscalYear.regimeConfirmedAt) return "Choisir le régime";
    const missing = getApplicableRequirements(ctx).find(
      (req) =>
        req.level !== "recommended" &&
        !ctx.documents.some(
          (d) => d.documentType === req.documentType && d.status === "analyzed",
        ),
    );
    if (missing) {
      const label = missing.label.split("/")[0].trim().toLowerCase();
      return `Ajouter : ${label}`;
    }
    const tab = pickNextDossierTab(ctx);
    return `Étape suivante : ${tab}`;
  }

  if (flags.analysisDone && !flags.validationDone) {
    return pending > 0 ? `${pending} à confirmer` : "Vérifier les montants";
  }

  if (flags.uploadDone && !flags.analysisDone) return "Analyse en cours";

  return "Déposer vos documents";
}

function pickNextDossierTab(ctx: EngineContext): string {
  const tabOrder = ["recettes", "depenses", "immobilisations", "emprunts"] as const;
  for (const tab of tabOrder) {
    const hasPending = ctx.validationItems.some(
      (v) => v.status === "pending" && FIELD_REGISTRY[v.fieldKey]?.tab === tab,
    );
    const hasLedger = ctx.ledgerEntries.some(
      (e) => e.status === "active" && FIELD_REGISTRY[e.fieldKey as FieldKey]?.tab === tab,
    );
    if (hasPending || hasLedger) return TAB_SHORT[tab] ?? tab;
  }
  return "régime";
}
