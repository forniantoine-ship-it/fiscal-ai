import type { NextAction, UserConfidenceScore } from "../types";
import type { EngineContext } from "./context";
import { getApplicableRequirements, getRequiredFields, hasActiveLedgerForField } from "./context";

export function getConfidenceBand(score: number): "high" | "medium" | "low" {
  if (score >= 95) return "high";
  if (score >= 85) return "medium";
  return "low";
}

export function computeUserConfidence(
  ctx: EngineContext,
  canClose: boolean,
): UserConfidenceScore {
  const requirements = getApplicableRequirements(ctx).filter(
    (r) => r.level === "required" || (r.level === "conditional" && r.condition === "has_loan"),
  );
  const docsSatisfied = requirements.filter((req) =>
    ctx.documents.some((d) => d.documentType === req.documentType && d.status === "analyzed"),
  ).length;
  const documentsPillar =
    requirements.length === 0 ? 100 : Math.round((docsSatisfied / requirements.length) * 100);

  const requiredItems = ctx.validationItems.filter((v) => v.isRequired);
  const requiredDone = requiredItems.filter(
    (v) => v.status === "approved" || v.status === "corrected",
  ).length;
  const validationsPillar =
    requiredItems.length === 0
      ? 100
      : Math.round((requiredDone / requiredItems.length) * 100);

  const openWarnings = ctx.alerts.filter((a) => a.severity !== "info").length;
  const coherencePillar = Math.max(0, 100 - openWarnings * 12);

  const requiredFields = getRequiredFields(ctx);
  const fieldsDone = requiredFields.filter((f) => hasActiveLedgerForField(ctx, f)).length;
  const tabsPillar =
    requiredFields.length === 0 ? 100 : Math.round((fieldsDone / requiredFields.length) * 100);

  let score = Math.round(
    documentsPillar * 0.25 +
      validationsPillar * 0.35 +
      coherencePillar * 0.2 +
      tabsPillar * 0.2,
  );

  if (!canClose) score = Math.min(score, 89);

  const level = scoreToLevel(score, canClose);
  const next = pickNextAction(ctx);

  return {
    score,
    level,
    pillars: {
      documents: documentsPillar,
      validations: validationsPillar,
      coherence: coherencePillar,
      tabs: tabsPillar,
    },
    nextActionLabel: next.title,
    nextActionHref: next.href,
  };
}

function scoreToLevel(
  score: number,
  canClose: boolean,
): UserConfidenceScore["level"] {
  if (canClose && score >= 90) return "ready";
  if (score >= 75) return "almost_ready";
  if (score >= 50) return "advancing";
  if (score >= 25) return "building";
  return "starting";
}

export function pickNextAction(ctx: EngineContext): NextAction {
  const base = `/app/exercices/${ctx.fiscalYear.id}`;
  const blocking = ctx.alerts.find((a) => a.severity === "blocking");
  if (blocking?.primaryActionHref) {
    return {
      title: blocking.title,
      description: blocking.message,
      href: blocking.primaryActionHref,
      estimatedMinutes: 5,
    };
  }

  const pending = ctx.validationItems.filter((v) => v.status === "pending");
  if (pending.length > 0) {
    return {
      title: `Confirmer ${pending.length} montant${pending.length > 1 ? "s" : ""}`,
      description: "L'IA a pré-rempli ces lignes — un rapide coup d'œil suffit.",
      href: `${base}/validation`,
      estimatedMinutes: Math.ceil(pending.length * 1.5),
    };
  }

  if (ctx.documents.length === 0) {
    return {
      title: "Ajouter vos documents",
      description: "Bail, relevés de loyers, factures de charges…",
      href: `${base}/documents`,
      estimatedMinutes: 10,
    };
  }

  return {
    title: "Compléter votre dossier",
    description: "Parcourez les onglets pour vérifier vos montants.",
    href: `${base}/recettes`,
  };
}
