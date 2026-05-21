import {
  JOURNEY_STEPS,
  ROUTE_MIN_STEP,
  getJourneyStepDef,
  journeyStepIndex,
} from "../constants/journey-steps";
import type {
  JourneyStepId,
  JourneyStepStatus,
  JourneyStepView,
  LmnpJourney,
  NextAction,
} from "../types";
import type { EngineContext } from "./context";
import { getApplicableRequirements } from "./context";

export interface JourneyFlags {
  uploadDone: boolean;
  analysisDone: boolean;
  validationDone: boolean;
  dossierDone: boolean;
  generateDone: boolean;
  paymentDone: boolean;
  transmissionDone: boolean;
}

export function computeJourneyFlags(ctx: EngineContext): JourneyFlags {
  const hasDocuments = ctx.documents.length > 0;
  const isAnalyzing = ctx.documents.some(
    (d) => d.status === "uploaded" || d.status === "processing",
  );
  const hasAnalyzed = ctx.documents.some((d) => d.status === "analyzed");
  const pendingCount = ctx.validationItems.filter((v) => v.status === "pending").length;
  const blockingCount = ctx.alerts.filter((a) => a.severity === "blocking").length;

  const uploadDone = hasDocuments;
  const analysisDone =
    hasDocuments && !isAnalyzing && (hasAnalyzed || ctx.documents.every((d) => d.status === "failed"));
  const validationDone = analysisDone && pendingCount === 0 && hasAnalyzed;
  const dossierDone =
    validationDone &&
    blockingCount === 0 &&
    pendingCount === 0 &&
    Boolean(ctx.fiscalYear.regimeConfirmedAt) &&
    !hasMissingRequiredDocs(ctx);

  return {
    uploadDone,
    analysisDone,
    validationDone,
    dossierDone,
    generateDone: Boolean(ctx.fiscalYear.declarationGeneratedAt),
    paymentDone: Boolean(ctx.fiscalYear.paidAt),
    transmissionDone: Boolean(ctx.fiscalYear.transmittedAt),
  };
}

function hasMissingRequiredDocs(ctx: EngineContext): boolean {
  return getApplicableRequirements(ctx).some((req) => {
    if (req.level === "recommended") return false;
    return !ctx.documents.some(
      (d) => d.documentType === req.documentType && d.status === "analyzed",
    );
  });
}

function isStepDone(id: JourneyStepId, flags: JourneyFlags): boolean {
  switch (id) {
    case "documents":
      return flags.uploadDone;
    case "analysis":
      return flags.analysisDone;
    case "validation":
      return flags.validationDone;
    case "dossier":
      return flags.dossierDone;
    case "generate":
      return flags.generateDone;
    case "payment":
      return flags.paymentDone;
    case "transmission":
      return flags.transmissionDone;
    default:
      return false;
  }
}

function isStepUnlocked(id: JourneyStepId, flags: JourneyFlags): boolean {
  const idx = journeyStepIndex(id);
  if (idx <= 0) return true;
  const prevId = JOURNEY_STEPS[idx - 1].id;
  return isStepDone(prevId, flags) || isStepDone(id, flags);
}

export function resolveCurrentStepId(flags: JourneyFlags): JourneyStepId {
  if (flags.transmissionDone) return "transmission";
  if (flags.paymentDone) return "transmission";
  if (flags.generateDone) return "payment";
  if (flags.dossierDone) return "generate";
  if (flags.validationDone) return "dossier";
  if (flags.analysisDone) return "validation";
  if (flags.uploadDone) return "analysis";
  return "documents";
}

export function resolveJourney(ctx: EngineContext): LmnpJourney {
  const base = `/app/exercices/${ctx.fiscalYear.id}`;
  const flags = computeJourneyFlags(ctx);
  const currentStepId = resolveCurrentStepId(flags);
  const completedCount = JOURNEY_STEPS.filter((s) => isStepDone(s.id, flags)).length;
  const isComplete = flags.transmissionDone;

  const steps: JourneyStepView[] = JOURNEY_STEPS.map((def, index) => {
    let status: JourneyStepStatus;
    if (isStepDone(def.id, flags)) {
      status = "completed";
    } else if (def.id === currentStepId) {
      status = "active";
    } else if (!isStepUnlocked(def.id, flags)) {
      status = "locked";
    } else {
      status = "locked";
    }

    return {
      id: def.id,
      title: def.title,
      description: def.description,
      href: `${base}${def.href}`,
      cta: def.cta,
      aiHint: def.aiHint,
      status,
      stepNumber: index + 1,
    };
  });

  return {
    steps,
    currentStepId,
    currentStepIndex: journeyStepIndex(currentStepId) + 1,
    totalSteps: JOURNEY_STEPS.length,
    percentComplete: isComplete
      ? 100
      : Math.round((completedCount / JOURNEY_STEPS.length) * 100),
    isComplete,
  };
}

export function journeyAllowsRoute(routeSuffix: string, journey: LmnpJourney): boolean {
  const normalized = routeSuffix.replace(/^\//, "").split("/")[0] ?? "";
  if (normalized === "" || normalized === "documents") return true;

  const minStepId = ROUTE_MIN_STEP[normalized] ?? "documents";
  const minIdx = journeyStepIndex(minStepId);
  const currentIdx = journeyStepIndex(journey.currentStepId);
  const stepAtMin = journey.steps.find((s) => s.id === minStepId);

  if (stepAtMin?.status === "completed") return true;
  return currentIdx >= minIdx && stepAtMin?.status !== "locked";
}

/** Next action aligned with the active journey step. */
export function pickJourneyAction(ctx: EngineContext, journey: LmnpJourney): NextAction {
  const base = `/app/exercices/${ctx.fiscalYear.id}`;
  const flags = computeJourneyFlags(ctx);
  const blocking = ctx.alerts.find((a) => a.severity === "blocking");

  if (blocking?.primaryActionHref && journey.currentStepId === "dossier") {
    return {
      title: blocking.title,
      description: blocking.message,
      href: blocking.primaryActionHref,
      cta: "Corriger",
    };
  }

  const active = journey.steps.find((s) => s.id === journey.currentStepId);
  const def = getJourneyStepDef(journey.currentStepId);

  if (journey.currentStepId === "documents" && !flags.uploadDone) {
    return {
      title: def.title,
      description: def.description,
      href: `${base}${def.href}`,
      cta: def.cta,
      estimatedMinutes: 10,
    };
  }

  if (journey.currentStepId === "analysis") {
    return {
      title: "L’IA analyse vos documents",
      description: def.description,
      href: `${base}/documents`,
      cta: "Voir l’avancement",
    };
  }

  if (journey.currentStepId === "validation") {
    const pending = ctx.validationItems.filter((v) => v.status === "pending").length;
    return {
      title: "Vérifiez ce que l’IA a détecté",
      description:
        pending > 0
          ? `${pending} montant${pending > 1 ? "s" : ""} à confirmer — un clic suffit.`
          : def.description,
      href: `${base}/validation`,
      cta: def.cta,
      estimatedMinutes: pending > 0 ? Math.ceil(pending * 1.5) : undefined,
    };
  }

  if (journey.currentStepId === "dossier") {
    if (!ctx.fiscalYear.regimeConfirmedAt) {
      return {
        title: "Choisissez votre régime fiscal",
        description: "Une question simple — nous adaptons tout le dossier pour vous.",
        href: `${base}/activite`,
        cta: "Continuer",
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
        title: `Il manque encore : ${label}`,
        description: "Ajoutez ce document pour débloquer la déclaration.",
        href: `${base}/documents`,
        cta: "Ajouter un document",
      };
    }
    return {
      title: def.title,
      description: def.description,
      href: active?.href ?? `${base}/activite`,
      cta: def.cta,
    };
  }

  if (journey.currentStepId === "generate") {
    return {
      title: def.title,
      description: def.description,
      href: `${base}/validation`,
      cta: def.cta,
    };
  }

  if (journey.currentStepId === "payment") {
    return {
      title: def.title,
      description: def.description,
      href: `${base}/paiement`,
      cta: def.cta,
    };
  }

  if (journey.currentStepId === "transmission") {
    return {
      title: def.title,
      description: def.description,
      href: `${base}/teletransmission`,
      cta: def.cta,
    };
  }

  if (journey.isComplete) {
    return {
      title: "Déclaration transmise",
      description: "Votre dossier LMNP est terminé. Bravo !",
      href: `${base}`,
      cta: "Voir le récapitulatif",
    };
  }

  return {
    title: def.title,
    description: def.description,
    href: active?.href ?? `${base}${def.href}`,
    cta: def.cta,
  };
}
