import type { NextAction, UserConfidenceScore } from "../types";
import { FIELD_REGISTRY, type FieldKey } from "../types/field-keys";
import { LMNP_ROUTES, lmnpTabRoute, toFlatLmnpRoute } from "../routes";
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
  const canClose =
    ctx.alerts.filter((a) => a.severity === "blocking").length === 0 &&
    ctx.validationItems.filter((v) => v.status === "pending").length === 0 &&
    Boolean(ctx.fiscalYear.regimeConfirmedAt);

  const blocking = ctx.alerts.find((a) => a.severity === "blocking");
  if (blocking?.primaryActionHref) {
    return {
      title: blocking.title,
      description: blocking.message,
      href: toFlatLmnpRoute(blocking.primaryActionHref),
      cta: "Corriger maintenant",
      estimatedMinutes: 5,
    };
  }

  const isAnalyzing = ctx.documents.some(
    (d) => d.status === "processing" || d.status === "uploaded",
  );
  if (isAnalyzing) {
    return {
      title: "L’IA analyse vos documents",
      description: "Classification et extraction des montants en cours — cela ne prend que quelques instants.",
      href: LMNP_ROUTES.documents,
      cta: "Voir l’avancement",
    };
  }

  const pending = ctx.validationItems.filter((v) => v.status === "pending");
  if (pending.length > 0) {
    const tabHref = pickTabForPendingValidation(ctx);
    return {
      title: "Vérifiez les informations détectées par l’IA",
      description:
        "L’IA a pré-rempli vos montants — confirmez-les en un clic dans Mes loyers ou Mes dépenses.",
      href: tabHref,
      cta: "Vérifier maintenant",
      estimatedMinutes: Math.ceil(pending.length * 1.5),
    };
  }

  if (ctx.documents.length === 0) {
    return {
      title: "Commencez par ajouter vos documents principaux",
      description:
        "Déposez simplement vos PDF. L’IA analyse et classe automatiquement votre dossier.",
      href: LMNP_ROUTES.documents,
      cta: "Ajouter mes documents",
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
    const label = missing[0].label.replace(/\s*\(.*\)\s*$/, "").toLowerCase();
    return {
      title: `Il manque encore votre ${label}`,
      description: "Ajoutez ce document pour compléter sereinement votre dossier.",
      href: LMNP_ROUTES.documents,
      cta: "Ajouter un document",
      estimatedMinutes: 5,
    };
  }

  if (canClose) {
    return {
      title: "Votre déclaration est prête",
      description: "Tous les éléments sont en place — vous pouvez générer votre déclaration LMNP.",
      href: LMNP_ROUTES.declarations,
      cta: "Générer ma déclaration",
    };
  }

  return {
    title: "Votre dossier avance bien",
    description: "Consultez Mes loyers et Mes dépenses pour vérifier que tout correspond à votre situation.",
    href: LMNP_ROUTES.revenus,
    cta: "Voir mon dossier",
  };
}

function pickTabForPendingValidation(ctx: EngineContext): string {
  const tabOrder = ["recettes", "depenses", "immobilisations", "emprunts"] as const;

  for (const tab of tabOrder) {
    const hasPending = ctx.validationItems.some(
      (v) => v.status === "pending" && FIELD_TAB[v.fieldKey] === tab,
    );
    if (hasPending) return lmnpTabRoute(tab);
  }

  return LMNP_ROUTES.revenus;
}
