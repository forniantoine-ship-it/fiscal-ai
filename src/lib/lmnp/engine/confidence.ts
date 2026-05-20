import type { NextAction, UserConfidenceScore } from "../types";
import { FIELD_REGISTRY, type FieldKey } from "../types/field-keys";
import type { EngineContext } from "./context";
import { getApplicableRequirements, getRequiredFields, hasActiveLedgerForField } from "./context";

const FIELD_TAB: Record<FieldKey, string> = Object.fromEntries(
  (Object.keys(FIELD_REGISTRY) as FieldKey[]).map((k) => [k, FIELD_REGISTRY[k].tab]),
) as Record<FieldKey, string>;

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
    const tabHref = pickTabForPendingValidation(ctx, base);
    return {
      title: `${pending.length} montant${pending.length > 1 ? "s" : ""} à valider`,
      description:
        "L’IA a tout pré-rempli — ouvrez Mes loyers ou Mes dépenses et confirmez en un clic.",
      href: tabHref,
      estimatedMinutes: Math.ceil(pending.length * 1.5),
    };
  }

  if (ctx.documents.length === 0) {
    return {
      title: "Commencez par vos documents",
      description:
        "Déposez vos PDF : acte notarié, factures, taxe foncière, relevés de loyers… L’IA fait le reste.",
      href: `${base}/documents`,
      estimatedMinutes: 10,
    };
  }

  const missing = getApplicableRequirements(ctx).filter((req) => {
    if (req.level === "recommended") return false;
    return !ctx.documents.some(
      (d) => d.documentType === req.documentType && d.status === "analyzed",
    );
  });

  if (missing.length > 0) {
    return {
      title: `Il manque encore : ${missing[0].label.toLowerCase()}`,
      description: "Ajoutez-le pour que votre dossier soit complet.",
      href: `${base}/documents`,
      estimatedMinutes: 5,
    };
  }

  return {
    title: "Votre dossier avance bien",
    description: "Parcourez vos loyers, dépenses et crédit pour vérifier que tout est correct.",
    href: `${base}/recettes`,
  };
}

function pickTabForPendingValidation(ctx: EngineContext, base: string): string {
  const tabOrder = ["recettes", "depenses", "immobilisations", "emprunts"] as const;
  const tabPaths = {
    recettes: `${base}/recettes`,
    depenses: `${base}/depenses`,
    immobilisations: `${base}/immobilisations`,
    emprunts: `${base}/emprunts`,
  };

  for (const tab of tabOrder) {
    const hasPending = ctx.validationItems.some(
      (v) => v.status === "pending" && FIELD_TAB[v.fieldKey] === tab,
    );
    if (hasPending) return tabPaths[tab];
  }

  return `${base}/recettes`;
}
